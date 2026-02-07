/**
 * Browser-compatible ShieldedPoolClient.
 *
 * Orchestrates deposits, private transfers, and withdrawals using:
 *   - ethers v6 for on-chain interaction (via MetaMask)
 *   - Client SDK crypto/merkle (browser-safe)
 *   - HTTP proxy for proof generation
 *   - Web Crypto API for randomness
 */

import { Contract, type Signer, type TransactionReceipt, type BrowserProvider } from 'ethers';
import {
  computeCommitment,
  computeNullifier,
  derivePubkey,
  bytesToHex,
  hexToBytes,
  randomBytes,
} from './browser-crypto';
import { ClientMerkleTree, verifyMerkleProof } from '../../../client/src/merkle.js';
import { encryptNote, decryptNote, deriveViewingKeypair } from '../../../client/src/encryption.js';
import { proveTransfer, proveWithdraw } from './browser-prover';
import { config } from '../config';
import type { Note, NoteWithIndex, MerkleProofStep } from '../../../client/src/types.js';

// ─── Contract ABIs ──────────────────────────────────────────────────────────

const SHIELDED_POOL_ABI = [
  'function deposit(bytes32 commitment, uint256 amount, bytes encryptedData) external',
  'function privateTransfer(bytes proof, bytes publicValues, bytes encryptedOutput1, bytes encryptedOutput2) external',
  'function withdraw(bytes proof, bytes publicValues, bytes encryptedChange) external',
  'function getLastRoot() view returns (bytes32)',
  'function isKnownRoot(bytes32 root) view returns (bool)',
  'function isSpent(bytes32 nullifier) view returns (bool)',
  'function getLeafCount() view returns (uint32)',
  'event Deposit(bytes32 indexed commitment, uint256 amount, uint32 leafIndex, uint256 timestamp)',
  'event PrivateTransfer(bytes32 indexed nullifier1, bytes32 indexed nullifier2, bytes32 newCommitment1, bytes32 newCommitment2, uint256 timestamp)',
  'event Withdrawal(bytes32 indexed nullifier, address indexed recipient, uint256 amount, uint256 timestamp)',
  'event EncryptedNote(bytes32 indexed commitment, bytes encryptedData)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

// ─── Browser Wallet (replaces Node.js ShieldedWallet) ───────────────────────

export class BrowserShieldedWallet {
  private spendingKey: Uint8Array;
  public pubkey: Uint8Array;
  private viewingKeypair: { secretKey: Uint8Array; publicKey: Uint8Array };
  private notes: Map<string, NoteWithIndex>; // commitment hex -> note
  private spentNullifiers: Set<string>;

  constructor(spendingKey?: Uint8Array) {
    this.spendingKey = spendingKey ?? randomBytes(32);
    this.pubkey = derivePubkey(this.spendingKey);
    this.viewingKeypair = deriveViewingKeypair(this.spendingKey);
    this.notes = new Map();
    this.spentNullifiers = new Set();
  }

  getSpendingKey(): Uint8Array {
    return this.spendingKey;
  }

  getViewingPublicKey(): Uint8Array {
    return this.viewingKeypair.publicKey;
  }

  getViewingSecretKey(): Uint8Array {
    return this.viewingKeypair.secretKey;
  }

  createNote(amount: bigint): Note {
    const blinding = randomBytes(32);
    return {
      amount,
      pubkey: new Uint8Array(this.pubkey),
      blinding,
    };
  }

  addNote(note: Note, leafIndex: number): NoteWithIndex {
    const commitment = computeCommitment(note.amount, note.pubkey, note.blinding);
    const nullifier = computeNullifier(commitment, this.spendingKey);
    const noteWithIndex: NoteWithIndex = {
      ...note,
      commitment,
      leafIndex,
      nullifier,
    };
    this.notes.set(bytesToHex(commitment), noteWithIndex);
    return noteWithIndex;
  }

  /** Check if a note with this commitment already exists in the wallet. */
  hasCommitment(commitmentHex: string): boolean {
    return this.notes.has(commitmentHex);
  }

  markSpent(nullifier: Uint8Array): void {
    this.spentNullifiers.add(bytesToHex(nullifier));
  }

  getSpendableNotes(): NoteWithIndex[] {
    return Array.from(this.notes.values()).filter((note) => {
      if (!note.nullifier) return false;
      return !this.spentNullifiers.has(bytesToHex(note.nullifier));
    });
  }

  getAllNotes(): NoteWithIndex[] {
    return Array.from(this.notes.values());
  }

  isNoteSpent(note: NoteWithIndex): boolean {
    if (!note.nullifier) return false;
    return this.spentNullifiers.has(bytesToHex(note.nullifier));
  }

  getBalance(): bigint {
    return this.getSpendableNotes().reduce((sum, note) => sum + note.amount, 0n);
  }

  /** Select notes to cover amount. Returns 1 or 2 inputs. */
  selectNotes(amount: bigint): { inputs: NoteWithIndex[]; change: bigint } {
    const spendable = this.getSpendableNotes().sort(
      (a, b) => Number(b.amount - a.amount)
    );

    const selected: NoteWithIndex[] = [];
    let total = 0n;

    for (const note of spendable) {
      if (total >= amount) break;
      selected.push(note);
      total += note.amount;
      if (selected.length >= 2) break;
    }

    if (total < amount) {
      throw new Error(`Insufficient balance: have ${total}, need ${amount}`);
    }

    return { inputs: selected, change: total - amount };
  }

  /** Serialize for localStorage persistence */
  toJSON(): string {
    return JSON.stringify({
      spendingKey: bytesToHex(this.spendingKey),
      notes: Array.from(this.notes.entries()).map(([key, note]) => ({
        key,
        amount: note.amount.toString(),
        pubkey: bytesToHex(note.pubkey),
        blinding: bytesToHex(note.blinding),
        commitment: bytesToHex(note.commitment),
        leafIndex: note.leafIndex,
        nullifier: note.nullifier ? bytesToHex(note.nullifier) : null,
      })),
      spentNullifiers: Array.from(this.spentNullifiers),
    });
  }

  /** Restore from localStorage */
  static fromJSON(json: string): BrowserShieldedWallet {
    const data = JSON.parse(json);
    const wallet = new BrowserShieldedWallet(hexToBytes(data.spendingKey));

    for (const entry of data.notes) {
      const note: Note = {
        amount: BigInt(entry.amount),
        pubkey: hexToBytes(entry.pubkey),
        blinding: hexToBytes(entry.blinding),
      };
      wallet.addNote(note, entry.leafIndex);
    }

    for (const nullHex of data.spentNullifiers) {
      wallet.spentNullifiers.add(nullHex);
    }

    return wallet;
  }
}

// ─── Pool Client ────────────────────────────────────────────────────────────

export type TxStage =
  | 'idle'
  | 'approving'
  | 'depositing'
  | 'proving'
  | 'submitting'
  | 'confirming'
  | 'done'
  | 'error';

export interface TxProgress {
  stage: TxStage;
  message: string;
  txHash?: string;
  error?: string;
}

export class BrowserPoolClient {
  pool: Contract;
  token: Contract;
  tree: ClientMerkleTree;
  wallet: BrowserShieldedWallet;
  private signer: Signer;

  constructor(wallet: BrowserShieldedWallet, signer: Signer) {
    this.pool = new Contract(config.poolAddress, SHIELDED_POOL_ABI, signer);
    this.token = new Contract(config.tokenAddress, ERC20_ABI, signer);
    this.tree = new ClientMerkleTree(config.treeLevels);
    this.wallet = wallet;
    this.signer = signer;
  }

  /**
   * Sync local Merkle tree from on-chain events AND scan for incoming notes.
   *
   * 1. Rebuilds the tree from Deposit, PrivateTransfer, and Withdrawal events
   * 2. Scans EncryptedNote events — tries to decrypt each one with the wallet's
   *    viewing key. If decryption succeeds and the note's pubkey matches ours,
   *    the note is added to the wallet (this is how incoming transfers are detected).
   */
  async sync(onProgress?: (msg: string) => void): Promise<void> {
    const fromBlock = config.deployBlock;
    onProgress?.('Fetching on-chain events...');

    // Get all events
    const depositFilter = this.pool.filters.Deposit();
    const depositEvents = await this.pool.queryFilter(depositFilter, fromBlock);

    const transferFilter = this.pool.filters.PrivateTransfer();
    const transferEvents = await this.pool.queryFilter(transferFilter, fromBlock);

    const withdrawFilter = this.pool.filters.Withdrawal();
    const withdrawEvents = await this.pool.queryFilter(withdrawFilter, fromBlock);

    onProgress?.(`Found ${depositEvents.length} deposits, ${transferEvents.length} transfers, ${withdrawEvents.length} withdrawals`);

    // ── Rebuild Merkle tree ─────────────────────────────────────────────

    interface Insertion {
      block: number;
      logIndex: number;
      commitments: Uint8Array[];
    }

    const insertions: Insertion[] = [];

    // Deposits: 1 commitment each
    for (const event of depositEvents) {
      const ev = event as any;
      insertions.push({
        block: ev.blockNumber,
        logIndex: ev.index,
        commitments: [hexToBytes(ev.args[0])],
      });
    }

    // Private transfers: 2 commitments each
    for (const event of transferEvents) {
      const ev = event as any;
      insertions.push({
        block: ev.blockNumber,
        logIndex: ev.index,
        commitments: [hexToBytes(ev.args[2]), hexToBytes(ev.args[3])],
      });
    }

    // Withdrawals: change commitment from tx calldata
    for (const event of withdrawEvents) {
      const ev = event as any;
      try {
        const tx = await ev.getTransaction();
        const input = tx.data;
        if (input && input.length > 10 + 64 * 3) {
          const data = hexToBytes(input.slice(10)); // remove 0x + 4-byte selector
          const pvOffset = Number(BigInt('0x' + bytesToHex(data.slice(32, 64)).slice(2)));
          if (pvOffset + 32 <= data.length) {
            const pvLen = Number(BigInt('0x' + bytesToHex(data.slice(pvOffset, pvOffset + 32)).slice(2)));
            const pvStart = pvOffset + 32;
            if (pvLen >= 160 && pvStart + 160 <= data.length) {
              const changeComm = data.slice(pvStart + 128, pvStart + 160);
              const isZero = changeComm.every((b: number) => b === 0);
              if (!isZero) {
                insertions.push({
                  block: ev.blockNumber,
                  logIndex: ev.index,
                  commitments: [changeComm],
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to decode withdrawal tx calldata:', err);
      }
    }

    // Sort by block then log index and rebuild tree
    insertions.sort((a, b) => {
      if (a.block !== b.block) return a.block - b.block;
      return a.logIndex - b.logIndex;
    });

    this.tree = new ClientMerkleTree(config.treeLevels);
    for (const ins of insertions) {
      for (const comm of ins.commitments) {
        this.tree.insert(comm);
      }
    }

    console.log(`[sync] Tree rebuilt: ${this.tree.nextIndex} leaves`);

    // ── Scan for incoming notes ─────────────────────────────────────────
    // Try to decrypt every EncryptedNote event with our viewing key.
    // If decryption succeeds, the note was encrypted for us.

    onProgress?.('Scanning for incoming notes...');

    const encFilter = this.pool.filters.EncryptedNote();
    const encEvents = await this.pool.queryFilter(encFilter, fromBlock);

    const viewingSecret = this.wallet.getViewingSecretKey();
    let newNotesFound = 0;

    for (const event of encEvents) {
      const ev = event as any;
      const commitmentHex = ev.args[0] as string;
      const encryptedData = ev.args[1] as string;

      // Skip if we already know about this note
      if (this.wallet.hasCommitment(commitmentHex)) continue;

      // Try to decrypt
      try {
        const encBytes = hexToBytes(encryptedData);
        const note = decryptNote(encBytes, viewingSecret);
        if (!note) continue; // decryption failed — not for us

        // Decryption succeeded! Verify the commitment matches
        const expectedCommitment = computeCommitment(note.amount, note.pubkey, note.blinding);
        const expectedHex = bytesToHex(expectedCommitment);

        if (expectedHex.toLowerCase() !== commitmentHex.toLowerCase()) {
          console.warn('[sync] Decrypted note commitment mismatch, skipping');
          continue;
        }

        // Find the leaf index for this commitment in the tree
        const leafIndex = this.tree.leaves.findIndex(
          (leaf) => bytesToHex(leaf).toLowerCase() === commitmentHex.toLowerCase()
        );
        if (leafIndex === -1) {
          console.warn('[sync] Decrypted note not found in tree, skipping');
          continue;
        }

        this.wallet.addNote(note, leafIndex);
        newNotesFound++;
        console.log(`[sync] Found incoming note: amount=${note.amount}, leafIndex=${leafIndex}`);
      } catch (err) {
        // Decryption failed — this note wasn't encrypted for us, skip silently
      }
    }

    // ── Mark spent nullifiers ───────────────────────────────────────────
    // Check if any of our notes' nullifiers have been spent on-chain
    for (const note of this.wallet.getAllNotes()) {
      if (note.nullifier && !this.wallet.isNoteSpent(note)) {
        try {
          const isSpent = await this.pool.isSpent(bytesToHex(note.nullifier));
          if (isSpent) {
            this.wallet.markSpent(note.nullifier);
            console.log(`[sync] Marked nullifier as spent for leafIndex=${note.leafIndex}`);
          }
        } catch {
          // ignore errors checking spent status
        }
      }
    }

    onProgress?.(`Sync complete: ${this.tree.nextIndex} leaves, ${newNotesFound} new notes found`);
  }

  /**
   * Get the public token balance of an address.
   */
  async getPublicBalance(address: string): Promise<bigint> {
    return this.token.balanceOf(address);
  }

  /**
   * Get token symbol
   */
  async getTokenSymbol(): Promise<string> {
    try {
      return await this.token.symbol();
    } catch {
      return 'USDT';
    }
  }

  /**
   * Get token decimals
   */
  async getTokenDecimals(): Promise<number> {
    try {
      return Number(await this.token.decimals());
    } catch {
      return 6;
    }
  }

  /**
   * Deposit tokens into the shielded pool.
   */
  async deposit(
    amount: bigint,
    onProgress?: (progress: TxProgress) => void
  ): Promise<TransactionReceipt> {
    try {
      // 1. Create note
      const note = this.wallet.createNote(amount);
      const commitment = computeCommitment(note.amount, note.pubkey, note.blinding);

      // 2. Encrypt note for self (so we can recover it via sync/scanning)
      const encryptedData = encryptNote(note, this.wallet.getViewingPublicKey());

      // 3. Approve
      onProgress?.({ stage: 'approving', message: 'Approving token spend...' });
      const poolAddress = await this.pool.getAddress();
      const tx1 = await this.token.approve(poolAddress, amount);
      await tx1.wait();

      // 4. Deposit
      onProgress?.({ stage: 'depositing', message: 'Depositing into shielded pool...' });
      const tx2 = await this.pool.deposit(
        bytesToHex(commitment),
        amount,
        bytesToHex(encryptedData)
      );

      onProgress?.({ stage: 'confirming', message: 'Waiting for confirmation...', txHash: tx2.hash });
      const receipt = await tx2.wait();

      // 5. Re-sync tree + scan for notes
      await this.sync();

      // Parse leafIndex from the Deposit event in the receipt
      const depositLog = receipt.logs.find((log: any) => {
        try {
          return this.pool.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === 'Deposit';
        } catch { return false; }
      });
      let leafIndex: number;
      if (depositLog) {
        const parsed = this.pool.interface.parseLog({ topics: depositLog.topics as string[], data: depositLog.data });
        leafIndex = Number(parsed!.args[2]); // leafIndex is the 3rd arg (uint32)
      } else {
        leafIndex = this.tree.nextIndex - 1;
      }

      // addNote might skip if sync already found it via EncryptedNote scan
      if (!this.wallet.hasCommitment(bytesToHex(commitment))) {
        this.wallet.addNote(note, leafIndex);
      }

      onProgress?.({ stage: 'done', message: 'Deposit complete!', txHash: receipt.hash });
      return receipt;
    } catch (err: any) {
      onProgress?.({ stage: 'error', message: err.message, error: err.message });
      throw err;
    }
  }

  /**
   * Private transfer within the pool.
   *
   * 2-in-2-out circuit: requires exactly 2 input notes.
   * The recipient must provide their viewing public key so we can encrypt the note for them.
   */
  async privateTransfer(
    recipientPubkey: Uint8Array,
    amount: bigint,
    recipientViewingPubkey: Uint8Array,
    onProgress?: (progress: TxProgress) => void
  ): Promise<TransactionReceipt> {
    try {
      // 0. Sync tree to get accurate root before generating proof
      onProgress?.({ stage: 'approving', message: 'Syncing Merkle tree...' });
      await this.sync();

      // 1. Select input notes (need exactly 2 for 2-in-2-out circuit)
      const { inputs, change } = this.wallet.selectNotes(amount);
      if (inputs.length < 2) {
        throw new Error(
          'Private transfer requires at least 2 shielded notes. ' +
          'You can: (1) make two separate deposits, or (2) use Withdraw to move funds out with a single note.'
        );
      }

      // 2. Create output notes
      const recipientNote: Note = {
        amount,
        pubkey: recipientPubkey,
        blinding: randomBytes(32),
      };
      const changeNote = this.wallet.createNote(change);

      // 3. Get Merkle proofs + local verification
      const root = this.tree.getRoot();
      const proof0 = this.tree.getProof(inputs[0].leafIndex);
      const proof1 = this.tree.getProof(inputs[1].leafIndex);

      // Verify locally before sending to prover
      for (let i = 0; i < inputs.length; i++) {
        const comm = computeCommitment(inputs[i].amount, inputs[i].pubkey, inputs[i].blinding);
        const treeLeaf = this.tree.leaves[inputs[i].leafIndex];
        const match = treeLeaf && bytesToHex(comm) === bytesToHex(treeLeaf);
        console.log(`[transfer] Input ${i}: leafIndex=${inputs[i].leafIndex}, amount=${inputs[i].amount}, commitMatch=${match}`);
        if (!match) {
          throw new Error(`Input note ${i} commitment doesn't match tree leaf at index ${inputs[i].leafIndex}`);
        }
      }

      // 4. Generate proof via proxy
      onProgress?.({ stage: 'proving', message: 'Generating ZK proof... (this may take a few minutes)' });
      const proofResult = await proveTransfer({
        inputNotes: inputs,
        inputSpendingKeys: [this.wallet.getSpendingKey(), this.wallet.getSpendingKey()],
        inputMerkleProofs: [proof0, proof1],
        outputNotes: [recipientNote, changeNote],
        root,
      });

      // 5. Encrypt output notes
      //    - enc1: recipient's note encrypted with their viewing pubkey (so they can scan and find it)
      //    - enc2: our change note encrypted with our viewing pubkey
      const enc1 = encryptNote(recipientNote, recipientViewingPubkey);
      const enc2 = encryptNote(changeNote, this.wallet.getViewingPublicKey());

      // 6. Submit on-chain
      onProgress?.({ stage: 'submitting', message: 'Submitting transaction...' });
      const tx = await this.pool.privateTransfer(
        proofResult.proof,
        proofResult.publicValues,
        bytesToHex(enc1),
        bytesToHex(enc2)
      );

      onProgress?.({ stage: 'confirming', message: 'Waiting for confirmation...', txHash: tx.hash });
      const receipt = await tx.wait();

      // 7. Update local state
      for (const input of inputs) {
        if (input.nullifier) this.wallet.markSpent(input.nullifier);
      }

      // Re-sync to pick up new tree state + the change note via scanning
      await this.sync();

      onProgress?.({ stage: 'done', message: 'Transfer complete!', txHash: receipt.hash });
      return receipt;
    } catch (err: any) {
      onProgress?.({ stage: 'error', message: err.message, error: err.message });
      throw err;
    }
  }

  /**
   * Withdraw tokens from the shielded pool to a public address.
   */
  async withdraw(
    amount: bigint,
    recipient: string,
    onProgress?: (progress: TxProgress) => void
  ): Promise<TransactionReceipt> {
    try {
      // 0. Sync tree to get accurate root before generating proof
      onProgress?.({ stage: 'approving', message: 'Syncing Merkle tree...' });
      await this.sync();

      // 1. Find a note that covers the amount
      const spendable = this.wallet.getSpendableNotes();
      const inputNote = spendable.find((n) => n.amount >= amount);
      if (!inputNote) {
        throw new Error(`No single note covers ${amount}. Available notes: ${spendable.map(n => n.amount.toString()).join(', ')}`);
      }

      // 2. Create change note if partial
      const changeAmount = inputNote.amount - amount;
      const changeNote = changeAmount > 0n ? this.wallet.createNote(changeAmount) : undefined;

      // 3. Get Merkle proof + local verification
      const root = this.tree.getRoot();
      const merkleProof = this.tree.getProof(inputNote.leafIndex);

      const localCommitment = computeCommitment(inputNote.amount, inputNote.pubkey, inputNote.blinding);
      const treeLeaf = this.tree.leaves[inputNote.leafIndex];
      const commitMatch = treeLeaf ? bytesToHex(localCommitment) === bytesToHex(treeLeaf) : false;
      console.log('[withdraw] Debug:', {
        treeLeaves: this.tree.nextIndex,
        leafIndex: inputNote.leafIndex,
        commitMatch,
        noteCommitment: bytesToHex(localCommitment),
        treeLeaf: treeLeaf ? bytesToHex(treeLeaf) : 'MISSING',
      });

      const proofValid = verifyMerkleProof(localCommitment, merkleProof, root);
      console.log('[withdraw] Local Merkle proof valid:', proofValid);

      if (!proofValid) {
        throw new Error(
          `Merkle proof verification failed locally. ` +
          `leafIndex=${inputNote.leafIndex}, treeLeaves=${this.tree.nextIndex}, commitMatch=${commitMatch}`
        );
      }

      // 4. Generate proof via proxy
      onProgress?.({ stage: 'proving', message: 'Generating ZK proof... (this may take a few minutes)' });
      const proofResult = await proveWithdraw({
        inputNote,
        spendingKey: this.wallet.getSpendingKey(),
        merkleProof,
        root,
        recipient,
        withdrawAmount: amount,
        changeNote: changeNote || null,
      });

      // 5. Encrypt change note for self
      const encChange = changeNote
        ? encryptNote(changeNote, this.wallet.getViewingPublicKey())
        : new Uint8Array(0);

      // 6. Submit on-chain
      onProgress?.({ stage: 'submitting', message: 'Submitting transaction...' });
      const tx = await this.pool.withdraw(
        proofResult.proof,
        proofResult.publicValues,
        bytesToHex(encChange)
      );

      onProgress?.({ stage: 'confirming', message: 'Waiting for confirmation...', txHash: tx.hash });
      const receipt = await tx.wait();

      // 7. Update local state
      if (inputNote.nullifier) this.wallet.markSpent(inputNote.nullifier);

      // Re-sync to pick up change note via scanning
      await this.sync();

      onProgress?.({ stage: 'done', message: 'Withdrawal complete!', txHash: receipt.hash });
      return receipt;
    } catch (err: any) {
      onProgress?.({ stage: 'error', message: err.message, error: err.message });
      throw err;
    }
  }
}

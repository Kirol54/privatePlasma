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
import { ClientMerkleTree } from '../../../client/src/merkle.js';
import { encryptNote, deriveViewingKeypair } from '../../../client/src/encryption.js';
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
  private notes: Map<string, NoteWithIndex>; // commitment hex -> note
  private spentNullifiers: Set<string>;

  constructor(spendingKey?: Uint8Array) {
    this.spendingKey = spendingKey ?? randomBytes(32);
    this.pubkey = derivePubkey(this.spendingKey);
    this.notes = new Map();
    this.spentNullifiers = new Set();
  }

  getSpendingKey(): Uint8Array {
    return this.spendingKey;
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

  /** Select notes to cover amount. Always returns 2 inputs for 2-in-2-out. */
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

    // Pad to exactly 2 inputs with a zero-amount dummy note
    while (selected.length < 2) {
      // Create a dummy note with 0 amount that's in the tree
      // For simplicity, reuse the first note with 0 amount as a dummy
      const dummy = { ...selected[0], amount: 0n };
      selected.push(dummy);
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
   * Sync local Merkle tree from on-chain events.
   */
  async sync(onProgress?: (msg: string) => void): Promise<void> {
    const fromBlock = config.deployBlock;
    onProgress?.('Fetching deposit events...');

    // Get all events
    const depositFilter = this.pool.filters.Deposit();
    const depositEvents = await this.pool.queryFilter(depositFilter, fromBlock);

    const transferFilter = this.pool.filters.PrivateTransfer();
    const transferEvents = await this.pool.queryFilter(transferFilter, fromBlock);

    const withdrawFilter = this.pool.filters.Withdrawal();
    const withdrawEvents = await this.pool.queryFilter(withdrawFilter, fromBlock);

    onProgress?.(`Found ${depositEvents.length} deposits, ${transferEvents.length} transfers, ${withdrawEvents.length} withdrawals`);

    // Collect all insertions
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
    // Note: Withdrawal events don't include changeCommitment,
    // so we need to decode it from the transaction calldata.
    // For simplicity in the browser, we'll get tx data for each withdrawal.
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

    // Sort by block then log index
    insertions.sort((a, b) => {
      if (a.block !== b.block) return a.block - b.block;
      return a.logIndex - b.logIndex;
    });

    // Rebuild tree
    this.tree = new ClientMerkleTree(config.treeLevels);
    for (const ins of insertions) {
      for (const comm of ins.commitments) {
        this.tree.insert(comm);
      }
    }

    onProgress?.(`Tree rebuilt: ${this.tree.nextIndex} leaves`);
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

      // 2. Encrypt note for self
      const viewingKeypair = deriveViewingKeypair(this.wallet.getSpendingKey());
      const encryptedData = encryptNote(note, viewingKeypair.publicKey);

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

      // 5. Track locally
      const leafIndex = this.tree.insert(commitment);
      this.wallet.addNote(note, leafIndex);

      onProgress?.({ stage: 'done', message: 'Deposit complete!', txHash: receipt.hash });
      return receipt;
    } catch (err: any) {
      onProgress?.({ stage: 'error', message: err.message, error: err.message });
      throw err;
    }
  }

  /**
   * Private transfer within the pool.
   */
  async privateTransfer(
    recipientPubkey: Uint8Array,
    amount: bigint,
    onProgress?: (progress: TxProgress) => void
  ): Promise<TransactionReceipt> {
    try {
      // 1. Select input notes
      const { inputs, change } = this.wallet.selectNotes(amount);

      // 2. Create output notes
      const recipientNote: Note = {
        amount,
        pubkey: recipientPubkey,
        blinding: randomBytes(32),
      };
      const changeNote = this.wallet.createNote(change);

      // 3. Get Merkle proofs
      const root = this.tree.getRoot();
      const proof0 = this.tree.getProof(inputs[0].leafIndex);
      const proof1 = this.tree.getProof(inputs[1].leafIndex);

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
      const viewingKeypair = deriveViewingKeypair(this.wallet.getSpendingKey());
      const enc1 = new Uint8Array(0); // We don't know recipient's viewing key
      const enc2 = encryptNote(changeNote, viewingKeypair.publicKey);

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
      const outComm1 = computeCommitment(recipientNote.amount, recipientNote.pubkey, recipientNote.blinding);
      const outComm2 = computeCommitment(changeNote.amount, changeNote.pubkey, changeNote.blinding);
      this.tree.insert(outComm1);
      const changeIndex = this.tree.insert(outComm2);
      this.wallet.addNote(changeNote, changeIndex);

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
      // 1. Find a note that covers the amount
      const spendable = this.wallet.getSpendableNotes();
      const inputNote = spendable.find((n) => n.amount >= amount);
      if (!inputNote) {
        throw new Error(`No single note covers ${amount}. Available notes: ${spendable.map(n => n.amount.toString()).join(', ')}`);
      }

      // 2. Create change note if partial
      const changeAmount = inputNote.amount - amount;
      const changeNote = changeAmount > 0n ? this.wallet.createNote(changeAmount) : undefined;

      // 3. Get Merkle proof
      const root = this.tree.getRoot();
      const merkleProof = this.tree.getProof(inputNote.leafIndex);

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

      // 5. Encrypt change
      const viewingKeypair = deriveViewingKeypair(this.wallet.getSpendingKey());
      const encChange = changeNote
        ? encryptNote(changeNote, viewingKeypair.publicKey)
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
      if (changeNote) {
        const changeComm = computeCommitment(changeNote.amount, changeNote.pubkey, changeNote.blinding);
        const changeIndex = this.tree.insert(changeComm);
        this.wallet.addNote(changeNote, changeIndex);
      }

      onProgress?.({ stage: 'done', message: 'Withdrawal complete!', txHash: receipt.hash });
      return receipt;
    } catch (err: any) {
      onProgress?.({ stage: 'error', message: err.message, error: err.message });
      throw err;
    }
  }
}

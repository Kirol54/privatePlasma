/**
 * ShieldedPoolClient: high-level interface for interacting with the shielded pool.
 *
 * Orchestrates deposits, private transfers, and withdrawals by combining
 * the wallet, Merkle tree, prover, and contract interaction.
 */

import { Contract, type Signer, type TransactionReceipt } from "ethers";
import { randomBytes } from "crypto";
import { computeCommitment, bytesToHex, hexToBytes } from "./crypto.js";
import { ClientMerkleTree } from "./merkle.js";
import { ShieldedWallet } from "./wallet.js";
import { Prover, type ProverOptions } from "./prover.js";
import { encryptNote, deriveViewingKeypair } from "./encryption.js";
import type { Note, NoteWithIndex } from "./types.js";

const SHIELDED_POOL_ABI = [
  "function deposit(bytes32 commitment, uint256 amount, bytes encryptedData) external",
  "function privateTransfer(bytes proof, bytes publicValues, bytes encryptedOutput1, bytes encryptedOutput2) external",
  "function withdraw(bytes proof, bytes publicValues, bytes encryptedChange) external",
  "function getLastRoot() view returns (bytes32)",
  "function isKnownRoot(bytes32 root) view returns (bool)",
  "function isSpent(bytes32 nullifier) view returns (bool)",
  "function getEncryptedNote(uint256 leafIndex) view returns (bytes)",
  "function nextIndex() view returns (uint32)",
  "event Deposit(bytes32 indexed commitment, uint256 amount, uint32 leafIndex, uint256 timestamp)",
  "event PrivateTransfer(bytes32 indexed nullifier1, bytes32 indexed nullifier2, bytes32 newCommitment1, bytes32 newCommitment2, uint256 timestamp)",
  "event Withdrawal(bytes32 indexed nullifier, address indexed recipient, uint256 amount, uint256 timestamp)",
  "event EncryptedNote(bytes32 indexed commitment, bytes encryptedData)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

export interface PoolClientOptions {
  poolAddress: string;
  tokenAddress: string;
  signer: Signer;
  treeLevels?: number;
  proverOptions?: ProverOptions;
}

export class ShieldedPoolClient {
  private pool: Contract;
  private token: Contract;
  private tree: ClientMerkleTree;
  private wallet: ShieldedWallet;
  private prover: Prover;
  private treeLevels: number;
  /** Dummy zero-value note for 2-in-2-out padding */
  private dummyNote?: NoteWithIndex;

  constructor(
    wallet: ShieldedWallet,
    options: PoolClientOptions
  ) {
    this.pool = new Contract(options.poolAddress, SHIELDED_POOL_ABI, options.signer);
    this.token = new Contract(options.tokenAddress, ERC20_ABI, options.signer);
    this.treeLevels = options.treeLevels ?? 20;
    this.tree = new ClientMerkleTree(this.treeLevels);
    this.wallet = wallet;
    this.prover = new Prover(options.proverOptions);
  }

  /** Get the local Merkle tree (for testing/debugging). */
  getTree(): ClientMerkleTree {
    return this.tree;
  }

  /** Get the wallet instance. */
  getWallet(): ShieldedWallet {
    return this.wallet;
  }

  /**
   * Deposit tokens into the shielded pool.
   * This is a public action — no ZK proof needed.
   */
  async deposit(amount: bigint): Promise<TransactionReceipt> {
    // 1. Create a note owned by this wallet
    const note = this.wallet.createNote(amount);
    const commitment = computeCommitment(note.amount, note.pubkey, note.blinding);

    // 2. Encrypt note for self (viewing key)
    const viewingKeypair = deriveViewingKeypair(this.wallet.getSpendingKey());
    const encryptedData = encryptNote(note, viewingKeypair.publicKey);

    // 3. Approve token spending
    const poolAddress = await this.pool.getAddress();
    const tx1 = await this.token.approve(poolAddress, amount);
    await tx1.wait();

    // 4. Call ShieldedPool.deposit(commitment, amount, encryptedData)
    const tx2 = await this.pool.deposit(
      bytesToHex(commitment),
      amount,
      bytesToHex(encryptedData)
    );
    const receipt = await tx2.wait();

    // 5. Track in local tree and wallet
    const leafIndex = this.tree.insert(commitment);
    this.wallet.addNote(note, leafIndex);

    return receipt;
  }

  /**
   * Execute a private transfer within the pool.
   * 2-in-2-out: consumes up to 2 of your notes, creates 1 for recipient + 1 change.
   */
  async privateTransfer(
    recipientPubkey: Uint8Array,
    amount: bigint,
    recipientViewingPubkey?: Uint8Array
  ): Promise<TransactionReceipt> {
    // 1. Select input notes
    const { inputs, change } = this.wallet.selectNotes(amount, this.dummyNote);

    // 2. Create output notes
    const recipientNote: Note = {
      amount,
      pubkey: recipientPubkey,
      blinding: new Uint8Array(randomBytes(32)),
    };
    const changeNote = this.wallet.createNote(change);

    // 3. Get Merkle proofs
    const root = this.tree.getRoot();
    const proof0 = this.tree.getProof(inputs[0].leafIndex);
    const proof1 = this.tree.getProof(inputs[1].leafIndex);

    // 4. Generate proof
    const proofResult = await this.prover.proveTransfer({
      inputNotes: inputs,
      inputSpendingKeys: [
        this.wallet.getSpendingKey(),
        this.wallet.getSpendingKey(),
      ],
      inputMerkleProofs: [proof0, proof1],
      outputNotes: [recipientNote, changeNote],
      root,
    });

    // 5. Encrypt output notes
    const viewingKeypair = deriveViewingKeypair(this.wallet.getSpendingKey());
    const enc1 = recipientViewingPubkey
      ? encryptNote(recipientNote, recipientViewingPubkey)
      : new Uint8Array(0);
    const enc2 = encryptNote(changeNote, viewingKeypair.publicKey);

    // 6. Submit on-chain
    const tx = await this.pool.privateTransfer(
      bytesToHex(proofResult.proof),
      bytesToHex(proofResult.publicValues),
      bytesToHex(enc1),
      bytesToHex(enc2)
    );
    const receipt = await tx.wait();

    // 7. Update local state
    for (const input of inputs) {
      if (input.nullifier) this.wallet.markSpent(input.nullifier);
    }
    // Track new commitments in tree
    const outComm1 = computeCommitment(
      recipientNote.amount,
      recipientNote.pubkey,
      recipientNote.blinding
    );
    const outComm2 = computeCommitment(
      changeNote.amount,
      changeNote.pubkey,
      changeNote.blinding
    );
    this.tree.insert(outComm1);
    const changeIndex = this.tree.insert(outComm2);
    this.wallet.addNote(changeNote, changeIndex);

    return receipt;
  }

  /**
   * Withdraw tokens from the shielded pool to a public address.
   */
  async withdraw(
    amount: bigint,
    recipient: string
  ): Promise<TransactionReceipt> {
    // 1. Select an input note that covers the amount
    const spendable = this.wallet.getSpendableNotes();
    const inputNote = spendable.find((n) => n.amount >= amount);
    if (!inputNote) {
      throw new Error(`No single note covers ${amount}. Use transfer to consolidate first.`);
    }

    // 2. Create change note if partial withdrawal
    const changeAmount = inputNote.amount - amount;
    const changeNote = changeAmount > 0n ? this.wallet.createNote(changeAmount) : undefined;

    // 3. Get Merkle proof
    const root = this.tree.getRoot();
    const merkleProof = this.tree.getProof(inputNote.leafIndex);

    // 4. Generate proof
    const proofResult = await this.prover.proveWithdraw({
      inputNote,
      spendingKey: this.wallet.getSpendingKey(),
      merkleProof,
      root,
      recipient,
      withdrawAmount: amount,
      changeNote,
    });

    // 5. Encrypt change note
    const viewingKeypair = deriveViewingKeypair(this.wallet.getSpendingKey());
    const encChange = changeNote
      ? encryptNote(changeNote, viewingKeypair.publicKey)
      : new Uint8Array(0);

    // 6. Submit on-chain
    const tx = await this.pool.withdraw(
      bytesToHex(proofResult.proof),
      bytesToHex(proofResult.publicValues),
      bytesToHex(encChange)
    );
    const receipt = await tx.wait();

    // 7. Update local state
    if (inputNote.nullifier) this.wallet.markSpent(inputNote.nullifier);
    if (changeNote) {
      const changeComm = computeCommitment(
        changeNote.amount,
        changeNote.pubkey,
        changeNote.blinding
      );
      const changeIndex = this.tree.insert(changeComm);
      this.wallet.addNote(changeNote, changeIndex);
    }

    return receipt;
  }

  /**
   * Sync local Merkle tree by replaying on-chain events.
   * Call this on startup to catch up with any deposits/transfers that happened.
   */
  async sync(fromBlock: number = 0): Promise<void> {
    // Get Deposit events
    const depositFilter = this.pool.filters.Deposit();
    const depositEvents = await this.pool.queryFilter(depositFilter, fromBlock);

    // Get PrivateTransfer events
    const transferFilter = this.pool.filters.PrivateTransfer();
    const transferEvents = await this.pool.queryFilter(transferFilter, fromBlock);

    // Sort all events by block number and log index
    const allEvents = [...depositEvents, ...transferEvents].sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      return a.index - b.index;
    });

    for (const event of allEvents) {
      const ev = event as any;
      if (ev.fragment?.name === "Deposit") {
        const commitment = hexToBytes(ev.args[0]);
        this.tree.insert(commitment);
      } else if (ev.fragment?.name === "PrivateTransfer") {
        const comm1 = hexToBytes(ev.args[2]);
        const comm2 = hexToBytes(ev.args[3]);
        this.tree.insert(comm1);
        this.tree.insert(comm2);
      }
    }
  }
}

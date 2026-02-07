/**
 * Core types for the Shielded Pool client.
 */

/** A shielded note representing ownership of tokens. */
export interface Note {
  amount: bigint;
  pubkey: Uint8Array; // 32 bytes
  blinding: Uint8Array; // 32 bytes
}

/** A note with its position in the Merkle tree. */
export interface NoteWithIndex extends Note {
  commitment: Uint8Array; // 32 bytes
  leafIndex: number;
  nullifier?: Uint8Array; // computed when spending key is known
}

/** A single step in a Merkle proof. */
export interface MerkleProofStep {
  is_left: boolean; // true if current node is left child (index even)
  sibling: Uint8Array; // 32 bytes
}

/** Inputs for generating a transfer proof. */
export interface TransferRequest {
  inputNotes: NoteWithIndex[];
  inputSpendingKeys: Uint8Array[];
  inputMerkleProofs: MerkleProofStep[][];
  outputNotes: Note[];
  root: Uint8Array;
}

/** Inputs for generating a withdraw proof. */
export interface WithdrawRequest {
  inputNote: NoteWithIndex;
  spendingKey: Uint8Array;
  merkleProof: MerkleProofStep[];
  root: Uint8Array;
  recipient: string; // 0x-prefixed Ethereum address
  withdrawAmount: bigint;
  changeNote?: Note;
}

/** Result of proof generation. */
export interface ProofResult {
  proof: Uint8Array;
  publicValues: Uint8Array;
  vkey: string;
}

/**
 * Plasma Shielded Pool Client SDK
 *
 * Privacy-preserving USDT transfers on Plasma using SP1 ZK proofs.
 */

// Types
export type {
  Note,
  NoteWithIndex,
  MerkleProofStep,
  TransferRequest,
  WithdrawRequest,
  ProofResult,
} from "./types.js";

// Crypto primitives
export {
  keccak256,
  computeCommitment,
  computeNullifier,
  derivePubkey,
  hashPair,
  hexToBytes,
  bytesToHex,
} from "./crypto.js";

// Merkle tree
export {
  ClientMerkleTree,
  computeZeros,
  verifyMerkleProof,
} from "./merkle.js";

// Wallet / key management
export { ShieldedWallet } from "./wallet.js";

// Encryption
export { encryptNote, decryptNote, deriveViewingKeypair } from "./encryption.js";

// Prover
export { Prover } from "./prover.js";
export type { ProverOptions } from "./prover.js";

// Pool client
export { ShieldedPoolClient } from "./pool.js";
export type { PoolClientOptions } from "./pool.js";

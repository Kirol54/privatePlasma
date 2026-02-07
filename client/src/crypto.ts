/**
 * Cryptographic primitives for the Shielded Pool.
 * All functions must produce identical outputs to lib/src/lib.rs.
 */

import { keccak256 as ethersKeccak256 } from "ethers";

// ============================================================================
//                          HELPERS
// ============================================================================

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// ============================================================================
//                          KECCAK256
// ============================================================================

/**
 * Compute keccak256 hash. Matches Solidity's keccak256() and Rust's tiny_keccak::Keccak::v256().
 */
export function keccak256(data: Uint8Array): Uint8Array {
  return hexToBytes(ethersKeccak256(data));
}

// ============================================================================
//                      NOTE COMMITMENT
// ============================================================================

/**
 * Compute note commitment.
 * commitment = keccak256(amount_be_8bytes || pubkey_32bytes || blinding_32bytes)
 * Total preimage: 72 bytes.
 *
 * Must match lib.rs Note::commitment().
 */
export function computeCommitment(
  amount: bigint,
  pubkey: Uint8Array,
  blinding: Uint8Array
): Uint8Array {
  const preimage = new Uint8Array(72);
  // amount as big-endian 8 bytes
  const view = new DataView(preimage.buffer);
  view.setBigUint64(0, amount, false); // false = big-endian
  preimage.set(pubkey, 8);
  preimage.set(blinding, 40);
  return keccak256(preimage);
}

// ============================================================================
//                          NULLIFIER
// ============================================================================

/**
 * Compute nullifier for a note.
 * nullifier = keccak256(commitment_32bytes || spending_key_32bytes)
 * Total preimage: 64 bytes.
 *
 * Must match lib.rs compute_nullifier().
 */
export function computeNullifier(
  commitment: Uint8Array,
  spendingKey: Uint8Array
): Uint8Array {
  const preimage = new Uint8Array(64);
  preimage.set(commitment, 0);
  preimage.set(spendingKey, 32);
  return keccak256(preimage);
}

// ============================================================================
//                      KEY DERIVATION
// ============================================================================

/**
 * Derive public key from spending key.
 * pubkey = keccak256(spending_key)
 *
 * Must match lib.rs derive_pubkey().
 */
export function derivePubkey(spendingKey: Uint8Array): Uint8Array {
  return keccak256(spendingKey);
}

/**
 * Hash a pair of 32-byte nodes.
 * Matches Solidity: keccak256(abi.encodePacked(left, right))
 */
export function hashPair(left: Uint8Array, right: Uint8Array): Uint8Array {
  const data = new Uint8Array(64);
  data.set(left, 0);
  data.set(right, 32);
  return keccak256(data);
}

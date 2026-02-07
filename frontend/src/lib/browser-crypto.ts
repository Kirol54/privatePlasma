/**
 * Browser-safe crypto primitives.
 *
 * Re-exports everything from the client SDK's crypto.ts (which uses ethers keccak256,
 * already browser-safe) and provides a browser-compatible randomBytes function
 * using the Web Crypto API instead of Node's crypto.randomBytes.
 */

// Re-export all browser-safe crypto from the client SDK
export {
  keccak256,
  computeCommitment,
  computeNullifier,
  derivePubkey,
  hashPair,
  hexToBytes,
  bytesToHex,
} from '../../../client/src/crypto.js';

/**
 * Generate cryptographically secure random bytes using the Web Crypto API.
 * Drop-in replacement for Node's crypto.randomBytes().
 */
export function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

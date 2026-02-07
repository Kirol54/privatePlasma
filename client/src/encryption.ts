/**
 * Note encryption for selective disclosure.
 *
 * Uses NaCl box (x25519 + XSalsa20-Poly1305) from tweetnacl.
 * The viewing key is derived from the spending key using a domain separator.
 *
 * Encrypted note format: [ephemeral_pubkey(32) || nonce(24) || ciphertext]
 */

import nacl from "tweetnacl";
import { keccak256, hexToBytes, bytesToHex } from "./crypto.js";
import type { Note } from "./types.js";

/**
 * Derive a viewing keypair from a spending key.
 * The viewing secret = keccak256("viewing" || spending_key), truncated to 32 bytes.
 * The viewing public key = nacl.box.keyPair.fromSecretKey(viewing_secret).publicKey.
 */
export function deriveViewingKeypair(spendingKey: Uint8Array): {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
} {
  // Domain-separated derivation
  const preimage = new Uint8Array(7 + 32); // "viewing" + spending_key
  preimage.set(new TextEncoder().encode("viewing"), 0);
  preimage.set(spendingKey, 7);
  const secretKey = keccak256(preimage);
  const keypair = nacl.box.keyPair.fromSecretKey(secretKey);
  return { secretKey, publicKey: keypair.publicKey };
}

/**
 * Encrypt note data for a recipient's viewing key.
 * Returns: ephemeral_pubkey(32) || nonce(24) || ciphertext
 */
export function encryptNote(
  note: Note,
  recipientViewingPubkey: Uint8Array
): Uint8Array {
  // Serialize note to JSON bytes
  const noteData = JSON.stringify({
    amount: note.amount.toString(),
    pubkey: bytesToHex(note.pubkey),
    blinding: bytesToHex(note.blinding),
  });
  const plaintext = new TextEncoder().encode(noteData);

  // Generate ephemeral keypair for this encryption
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  // Encrypt
  const ciphertext = nacl.box(
    plaintext,
    nonce,
    recipientViewingPubkey,
    ephemeral.secretKey
  );

  if (!ciphertext) {
    throw new Error("Encryption failed");
  }

  // Pack: ephemeral_pubkey(32) || nonce(24) || ciphertext
  const result = new Uint8Array(32 + 24 + ciphertext.length);
  result.set(ephemeral.publicKey, 0);
  result.set(nonce, 32);
  result.set(ciphertext, 56);
  return result;
}

/**
 * Decrypt note data using the recipient's viewing secret key.
 * Input: ephemeral_pubkey(32) || nonce(24) || ciphertext
 */
export function decryptNote(
  encrypted: Uint8Array,
  viewingSecretKey: Uint8Array
): Note | null {
  if (encrypted.length < 56) return null;

  const ephemeralPubkey = encrypted.slice(0, 32);
  const nonce = encrypted.slice(32, 56);
  const ciphertext = encrypted.slice(56);

  const plaintext = nacl.box.open(
    ciphertext,
    nonce,
    ephemeralPubkey,
    viewingSecretKey
  );

  if (!plaintext) return null;

  try {
    const noteData = JSON.parse(new TextDecoder().decode(plaintext));
    return {
      amount: BigInt(noteData.amount),
      pubkey: hexToBytes(noteData.pubkey),
      blinding: hexToBytes(noteData.blinding),
    };
  } catch {
    return null;
  }
}

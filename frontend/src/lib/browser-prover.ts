/**
 * Browser-compatible prover that calls the proxy server.
 *
 * Replaces the Node.js subprocess-based Prover with HTTP calls
 * to the proof generation proxy.
 */

// import { config } from '../config'; // config is no longer used directly for proxyUrl
import { getProxyUrl } from './settings';
import { bytesToHex } from './browser-crypto';
import type { MerkleProofStep } from '../../../client/src/types.js';

export interface ProofResult {
  proof: string;   // hex-encoded
  publicValues: string; // hex-encoded
  vkey: string;
}

interface TransferInputNote {
  amount: bigint;
  pubkey: Uint8Array;
  blinding: Uint8Array;
  commitment: Uint8Array;
  leafIndex: number;
}

export interface BrowserTransferRequest {
  inputNotes: TransferInputNote[];
  inputSpendingKeys: Uint8Array[];
  inputMerkleProofs: MerkleProofStep[][];
  outputNotes: { amount: bigint; pubkey: Uint8Array; blinding: Uint8Array }[];
  root: Uint8Array;
}

export interface BrowserWithdrawRequest {
  inputNote: TransferInputNote;
  spendingKey: Uint8Array;
  merkleProof: MerkleProofStep[];
  root: Uint8Array;
  recipient: string;
  withdrawAmount: bigint;
  changeNote?: { amount: bigint; pubkey: Uint8Array; blinding: Uint8Array } | null;
}

function serializeMerkleProof(proof: MerkleProofStep[]): Array<{ is_left: boolean; sibling: number[] }> {
  return proof.map((step) => ({
    is_left: step.is_left,
    sibling: Array.from(step.sibling),
  }));
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Generate a transfer proof via the proxy server.
 */
export async function proveTransfer(request: BrowserTransferRequest): Promise<ProofResult> {
  const body = {
    input_notes: request.inputNotes.map((n) => ({
      amount: Number(n.amount),
      pubkey: Array.from(n.pubkey),
      blinding: Array.from(n.blinding),
    })),
    spending_keys: request.inputSpendingKeys.map((k) => Array.from(k)),
    merkle_proofs: request.inputMerkleProofs.map(serializeMerkleProof),
    output_notes: request.outputNotes.map((n) => ({
      amount: Number(n.amount),
      pubkey: Array.from(n.pubkey),
      blinding: Array.from(n.blinding),
    })),
    root: Array.from(request.root),
  };

  const proxyUrl = getProxyUrl();
  const res = await fetch(`${proxyUrl}/prove/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Proof generation failed: ${err.error || res.statusText}`);
  }

  return res.json();
}

/**
 * Generate a withdraw proof via the proxy server.
 */
export async function proveWithdraw(request: BrowserWithdrawRequest): Promise<ProofResult> {
  const body = {
    input_note: {
      amount: Number(request.inputNote.amount),
      pubkey: Array.from(request.inputNote.pubkey),
      blinding: Array.from(request.inputNote.blinding),
    },
    spending_key: Array.from(request.spendingKey),
    merkle_proof: serializeMerkleProof(request.merkleProof),
    root: Array.from(request.root),
    recipient: Array.from(hexToBytes(request.recipient)),
    withdraw_amount: Number(request.withdrawAmount),
    change_note: request.changeNote
      ? {
        amount: Number(request.changeNote.amount),
        pubkey: Array.from(request.changeNote.pubkey),
        blinding: Array.from(request.changeNote.blinding),
      }
      : null,
  };

  const proxyUrl = getProxyUrl();
  const res = await fetch(`${proxyUrl}/prove/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Proof generation failed: ${err.error || res.statusText}`);
  }

  return res.json();
}

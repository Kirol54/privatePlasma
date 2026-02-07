/**
 * Key management and note tracking for the shielded pool.
 */

import { randomBytes } from "crypto";
import {
  computeCommitment,
  computeNullifier,
  derivePubkey,
  bytesToHex,
} from "./crypto.js";
import type { Note, NoteWithIndex } from "./types.js";

export class ShieldedWallet {
  private spendingKey: Uint8Array;
  public pubkey: Uint8Array;
  private notes: Map<string, NoteWithIndex>; // commitment hex -> note
  private spentNullifiers: Set<string>;

  constructor(spendingKey?: Uint8Array) {
    this.spendingKey =
      spendingKey ?? new Uint8Array(randomBytes(32));
    this.pubkey = derivePubkey(this.spendingKey);
    this.notes = new Map();
    this.spentNullifiers = new Set();
  }

  /** Get the spending key (secret — guard carefully). */
  getSpendingKey(): Uint8Array {
    return this.spendingKey;
  }

  /** Create a new note owned by this wallet with a random blinding factor. */
  createNote(amount: bigint): Note {
    const blinding = new Uint8Array(randomBytes(32));
    return {
      amount,
      pubkey: new Uint8Array(this.pubkey),
      blinding,
    };
  }

  /** Register a note in the wallet's local state. */
  addNote(note: Note, leafIndex: number): NoteWithIndex {
    const commitment = computeCommitment(
      note.amount,
      note.pubkey,
      note.blinding
    );
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

  /** Mark a nullifier as spent (after a successful transfer/withdraw). */
  markSpent(nullifier: Uint8Array): void {
    this.spentNullifiers.add(bytesToHex(nullifier));
  }

  /** Get all unspent notes. */
  getSpendableNotes(): NoteWithIndex[] {
    return Array.from(this.notes.values()).filter((note) => {
      if (!note.nullifier) return false;
      return !this.spentNullifiers.has(bytesToHex(note.nullifier));
    });
  }

  /** Get total spendable balance. */
  getBalance(): bigint {
    return this.getSpendableNotes().reduce(
      (sum, note) => sum + note.amount,
      0n
    );
  }

  /**
   * Select notes to cover the requested amount.
   * Returns { inputs: NoteWithIndex[], change: bigint }.
   * For 2-in-2-out, always returns exactly 2 inputs (padding with dummy if needed).
   */
  selectNotes(
    amount: bigint,
    dummyNote?: NoteWithIndex
  ): { inputs: NoteWithIndex[]; change: bigint } {
    const spendable = this.getSpendableNotes().sort(
      (a, b) => Number(b.amount - a.amount) // largest first
    );

    let selected: NoteWithIndex[] = [];
    let total = 0n;

    for (const note of spendable) {
      if (total >= amount) break;
      selected.push(note);
      total += note.amount;
      if (selected.length >= 2) break;
    }

    if (total < amount) {
      throw new Error(
        `Insufficient balance: have ${total}, need ${amount}`
      );
    }

    // Pad to exactly 2 inputs
    while (selected.length < 2) {
      if (!dummyNote) {
        throw new Error(
          "Need a dummy zero-value note for 2-in-2-out padding"
        );
      }
      selected.push(dummyNote);
    }

    return { inputs: selected, change: total - amount };
  }

  /** Export wallet state as JSON (for persistence). */
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
}

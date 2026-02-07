/**
 * Client-side incremental Merkle tree.
 * Mirrors MerkleTree.sol exactly so proofs generated here verify on-chain.
 */

import { keccak256, hashPair } from "./crypto.js";
import type { MerkleProofStep } from "./types.js";

const ROOT_HISTORY_SIZE = 30;

/**
 * Compute zero values for each level of the Merkle tree.
 * Matches MerkleTree.sol constructor:
 *   zeros[0] = keccak256(abi.encodePacked(bytes32(0)))  // keccak256 of 32 zero bytes
 *   zeros[i] = keccak256(abi.encodePacked(zeros[i-1], zeros[i-1]))
 */
export function computeZeros(levels: number): Uint8Array[] {
  const zeros: Uint8Array[] = [];
  zeros[0] = keccak256(new Uint8Array(32)); // keccak256(bytes32(0))
  for (let i = 1; i < levels; i++) {
    zeros[i] = hashPair(zeros[i - 1], zeros[i - 1]);
  }
  return zeros;
}

export class ClientMerkleTree {
  readonly levels: number;
  readonly zeros: Uint8Array[];
  filledSubtrees: Uint8Array[];
  nextIndex: number;
  roots: Uint8Array[];
  currentRootIndex: number;
  leaves: Uint8Array[];

  constructor(levels: number) {
    this.levels = levels;
    this.zeros = computeZeros(levels);
    this.filledSubtrees = this.zeros.map((z) => new Uint8Array(z));
    this.nextIndex = 0;

    this.roots = Array.from({ length: ROOT_HISTORY_SIZE }, () =>
      new Uint8Array(32)
    );
    // Initial root = hashPair(zeros[levels-1], zeros[levels-1])
    this.roots[0] = hashPair(
      this.zeros[levels - 1],
      this.zeros[levels - 1]
    );
    this.currentRootIndex = 0;
    this.leaves = [];
  }

  /**
   * Insert a leaf into the tree. Returns the leaf index.
   * Mirrors MerkleTree.sol _insert() exactly.
   */
  insert(leaf: Uint8Array): number {
    const index = this.nextIndex;
    if (index >= 2 ** this.levels) {
      throw new Error("Merkle tree is full");
    }

    let currentIndex = index;
    let currentHash = new Uint8Array(leaf);

    for (let i = 0; i < this.levels; i++) {
      let left: Uint8Array;
      let right: Uint8Array;

      if (currentIndex % 2 === 0) {
        // Left child: pair with zero on the right
        left = currentHash;
        right = this.zeros[i];
        this.filledSubtrees[i] = new Uint8Array(currentHash);
      } else {
        // Right child: pair with filled subtree on the left
        left = this.filledSubtrees[i];
        right = currentHash;
      }

      currentHash = new Uint8Array(hashPair(left, right));
      currentIndex = Math.floor(currentIndex / 2);
    }

    // Update root in circular buffer
    const newRootIndex = (this.currentRootIndex + 1) % ROOT_HISTORY_SIZE;
    this.currentRootIndex = newRootIndex;
    this.roots[newRootIndex] = currentHash;

    this.nextIndex = index + 1;
    this.leaves.push(new Uint8Array(leaf));

    return index;
  }

  /** Get the most recent root. */
  getRoot(): Uint8Array {
    return this.roots[this.currentRootIndex];
  }

  /** Check if a root exists in recent history. */
  isKnownRoot(root: Uint8Array): boolean {
    if (root.every((b) => b === 0)) return false;

    let i = this.currentRootIndex;
    do {
      if (arraysEqual(this.roots[i], root)) return true;
      if (i === 0) i = ROOT_HISTORY_SIZE;
      i--;
    } while (i !== this.currentRootIndex);

    return false;
  }

  /**
   * Generate a Merkle proof for the leaf at the given index.
   * Rebuilds the full tree to compute sibling hashes.
   */
  getProof(leafIndex: number): MerkleProofStep[] {
    if (leafIndex >= this.leaves.length) {
      throw new Error("Leaf index out of range");
    }

    const numLeaves = 2 ** this.levels;
    let currentLevel: Uint8Array[] = [];

    // Fill leaves, pad rest with zeros[0]
    for (let i = 0; i < numLeaves; i++) {
      if (i < this.leaves.length) {
        currentLevel.push(new Uint8Array(this.leaves[i]));
      } else {
        currentLevel.push(new Uint8Array(this.zeros[0]));
      }
    }

    const proof: MerkleProofStep[] = [];
    let idx = leafIndex;

    for (let level = 0; level < this.levels; level++) {
      const siblingIdx = idx ^ 1;
      const sibling = currentLevel[siblingIdx];
      const isLeft = idx % 2 === 0;

      proof.push({ is_left: isLeft, sibling: new Uint8Array(sibling) });

      // Compute next level
      const nextLevel: Uint8Array[] = [];
      for (let j = 0; j < currentLevel.length / 2; j++) {
        nextLevel.push(hashPair(currentLevel[2 * j], currentLevel[2 * j + 1]));
      }
      currentLevel = nextLevel;
      idx = Math.floor(idx / 2);
    }

    return proof;
  }
}

/** Verify a Merkle proof against an expected root. */
export function verifyMerkleProof(
  leaf: Uint8Array,
  proof: MerkleProofStep[],
  expectedRoot: Uint8Array
): boolean {
  let current = new Uint8Array(leaf);

  for (const step of proof) {
    if (step.is_left) {
      current = new Uint8Array(hashPair(current, step.sibling));
    } else {
      current = new Uint8Array(hashPair(step.sibling, current));
    }
  }

  return arraysEqual(current, expectedRoot);
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

#![no_std]
extern crate alloc;

use alloc::vec;
use alloc::vec::Vec;
use serde::{Deserialize, Serialize};
use tiny_keccak::{Hasher, Keccak};

// =============================================================================
//                          KECCAK256 HELPERS
// =============================================================================

/// Compute keccak256 hash. This matches Solidity's keccak256() opcode.
/// Note: tiny_keccak::Keccak is the original Keccak-256 (NOT SHA3-256).
pub fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    hasher.update(data);
    let mut output = [0u8; 32];
    hasher.finalize(&mut output);
    output
}

/// Hash a pair of 32-byte nodes. Matches Solidity:
///   keccak256(abi.encodePacked(left, right))
/// which is keccak256 of 64 bytes (left ++ right).
pub fn hash_pair(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut data = [0u8; 64];
    data[..32].copy_from_slice(left);
    data[32..].copy_from_slice(right);
    keccak256(&data)
}

// =============================================================================
//                              NOTE TYPE
// =============================================================================

/// A shielded note representing ownership of tokens.
///
/// Off-chain representation:
///   commitment = keccak256(amount_be_8bytes || pubkey || blinding)
///   nullifier  = keccak256(commitment || spending_key)
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Note {
    /// Token amount (e.g., USDT with 6 decimals)
    pub amount: u64,
    /// Owner's public key: keccak256(spending_key)
    pub pubkey: [u8; 32],
    /// Random blinding factor for hiding
    pub blinding: [u8; 32],
}

impl Note {
    /// Compute the note commitment.
    ///
    /// commitment = keccak256(amount_be_8bytes || pubkey_32bytes || blinding_32bytes)
    /// Total preimage: 72 bytes.
    pub fn commitment(&self) -> [u8; 32] {
        let mut preimage = [0u8; 72];
        preimage[0..8].copy_from_slice(&self.amount.to_be_bytes());
        preimage[8..40].copy_from_slice(&self.pubkey);
        preimage[40..72].copy_from_slice(&self.blinding);
        keccak256(&preimage)
    }
}

// =============================================================================
//                          KEY DERIVATION
// =============================================================================

/// Derive the public key from a spending key.
/// pubkey = keccak256(spending_key)
pub fn derive_pubkey(spending_key: &[u8; 32]) -> [u8; 32] {
    keccak256(spending_key)
}

// =============================================================================
//                           NULLIFIER
// =============================================================================

/// Compute the nullifier for a note.
/// nullifier = keccak256(commitment || spending_key)
pub fn compute_nullifier(commitment: &[u8; 32], spending_key: &[u8; 32]) -> [u8; 32] {
    let mut preimage = [0u8; 64];
    preimage[0..32].copy_from_slice(commitment);
    preimage[32..64].copy_from_slice(spending_key);
    keccak256(&preimage)
}

// =============================================================================
//                          MERKLE TREE
// =============================================================================

/// A single step in a Merkle proof.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MerkleProofStep {
    /// true if the current node is the LEFT child (index even at this level).
    /// When is_left=true:  parent = hash(current, sibling)
    /// When is_left=false: parent = hash(sibling, current)
    pub is_left: bool,
    /// The sibling hash at this level.
    pub sibling: [u8; 32],
}

/// Verify a Merkle proof against an expected root.
///
/// Traverses from the leaf up to the root, hashing at each level
/// according to the `is_left` flag.
pub fn verify_merkle_proof(
    leaf: [u8; 32],
    proof: &[MerkleProofStep],
    expected_root: [u8; 32],
) -> bool {
    let mut current = leaf;
    for step in proof {
        if step.is_left {
            // Current node is left child: hash(current, sibling)
            current = hash_pair(&current, &step.sibling);
        } else {
            // Current node is right child: hash(sibling, current)
            current = hash_pair(&step.sibling, &current);
        }
    }
    current == expected_root
}

/// Compute the zero values for each level of the Merkle tree.
/// Matches MerkleTree.sol constructor logic:
///   zeros[0] = keccak256(abi.encodePacked(bytes32(0)))  // keccak256 of 32 zero bytes
///   zeros[i] = keccak256(abi.encodePacked(zeros[i-1], zeros[i-1]))
pub fn compute_zeros(levels: usize) -> Vec<[u8; 32]> {
    let mut zeros = vec![[0u8; 32]; levels];
    // zeros[0] = keccak256(bytes32(0)) where bytes32(0) is 32 zero bytes
    zeros[0] = keccak256(&[0u8; 32]);
    for i in 1..levels {
        zeros[i] = hash_pair(&zeros[i - 1], &zeros[i - 1]);
    }
    zeros
}

/// Compute the initial root of an empty tree with the given number of levels.
/// Matches MerkleTree.sol: roots[0] = _hashPair(currentZero, currentZero)
/// where currentZero is zeros[levels-1].
pub fn compute_empty_root(levels: usize) -> [u8; 32] {
    let zeros = compute_zeros(levels);
    hash_pair(&zeros[levels - 1], &zeros[levels - 1])
}

// =============================================================================
//                      CLIENT-SIDE MERKLE TREE
// =============================================================================

/// An incremental Merkle tree that mirrors MerkleTree.sol exactly.
/// Used by the client to track on-chain state and generate proofs.
#[derive(Clone, Debug)]
pub struct IncrementalMerkleTree {
    pub levels: usize,
    pub zeros: Vec<[u8; 32]>,
    pub filled_subtrees: Vec<[u8; 32]>,
    pub next_index: u32,
    /// Circular buffer of recent roots (matches ROOT_HISTORY_SIZE = 30)
    pub roots: Vec<[u8; 32]>,
    pub current_root_index: usize,
    /// All inserted leaves in order
    pub leaves: Vec<[u8; 32]>,
}

const ROOT_HISTORY_SIZE: usize = 30;

impl IncrementalMerkleTree {
    /// Create a new empty tree. Matches MerkleTree.sol constructor.
    pub fn new(levels: usize) -> Self {
        let zeros = compute_zeros(levels);
        let filled_subtrees = zeros.clone();

        let mut roots = vec![[0u8; 32]; ROOT_HISTORY_SIZE];
        // Initial root = hash of (zeros[levels-1], zeros[levels-1])
        roots[0] = hash_pair(&zeros[levels - 1], &zeros[levels - 1]);

        IncrementalMerkleTree {
            levels,
            zeros,
            filled_subtrees,
            next_index: 0,
            roots,
            current_root_index: 0,
            leaves: Vec::new(),
        }
    }

    /// Insert a leaf into the tree. Returns the leaf index.
    /// Matches MerkleTree.sol _insert() exactly.
    pub fn insert(&mut self, leaf: [u8; 32]) -> u32 {
        let index = self.next_index;
        assert!(
            (index as u64) < (1u64 << self.levels),
            "Merkle tree is full"
        );

        let mut current_index = index;
        let mut current_hash = leaf;

        for i in 0..self.levels {
            if current_index % 2 == 0 {
                // Left child: pair with zero on the right
                let left = current_hash;
                let right = self.zeros[i];
                self.filled_subtrees[i] = current_hash;
                current_hash = hash_pair(&left, &right);
            } else {
                // Right child: pair with filled subtree on the left
                let left = self.filled_subtrees[i];
                let right = current_hash;
                current_hash = hash_pair(&left, &right);
            }
            current_index /= 2;
        }

        // Update root in circular buffer
        let new_root_index = (self.current_root_index + 1) % ROOT_HISTORY_SIZE;
        self.current_root_index = new_root_index;
        self.roots[new_root_index] = current_hash;

        self.next_index = index + 1;
        self.leaves.push(leaf);

        index
    }

    /// Get the most recent root.
    pub fn get_root(&self) -> [u8; 32] {
        self.roots[self.current_root_index]
    }

    /// Check if a root exists in recent history.
    pub fn is_known_root(&self, root: [u8; 32]) -> bool {
        if root == [0u8; 32] {
            return false;
        }
        let mut i = self.current_root_index;
        loop {
            if self.roots[i] == root {
                return true;
            }
            if i == 0 {
                i = ROOT_HISTORY_SIZE;
            }
            i -= 1;
            if i == self.current_root_index {
                break;
            }
        }
        false
    }

    /// Generate a Merkle proof for the leaf at the given index.
    ///
    /// This rebuilds the tree to compute sibling hashes at each level.
    /// For a hackathon this is fine; production code would cache the tree.
    pub fn get_proof(&self, leaf_index: u32) -> Vec<MerkleProofStep> {
        assert!(
            (leaf_index as usize) < self.leaves.len(),
            "leaf index out of range"
        );

        // Rebuild tree level by level
        let num_leaves = 1usize << self.levels;
        let mut current_level: Vec<[u8; 32]> = Vec::with_capacity(num_leaves);

        // Fill in inserted leaves, pad rest with zeros[0]
        for i in 0..num_leaves {
            if i < self.leaves.len() {
                current_level.push(self.leaves[i]);
            } else {
                current_level.push(self.zeros[0]);
            }
        }

        let mut proof = Vec::with_capacity(self.levels);
        let mut idx = leaf_index as usize;

        for _level in 0..self.levels {
            let sibling_idx = idx ^ 1;
            let sibling = current_level[sibling_idx];
            let is_left = idx % 2 == 0;

            proof.push(MerkleProofStep { is_left, sibling });

            // Compute next level
            let next_len = current_level.len() / 2;
            let mut next_level = Vec::with_capacity(next_len);
            for j in 0..next_len {
                next_level.push(hash_pair(&current_level[2 * j], &current_level[2 * j + 1]));
            }
            current_level = next_level;
            idx /= 2;
        }

        proof
    }
}

// =============================================================================
//                    SP1 PROGRAM INPUT TYPES
// =============================================================================

/// Private inputs for the 2-in-2-out transfer circuit.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TransferPrivateInputs {
    /// Two input notes to spend
    pub input_notes: [Note; 2],
    /// Spending keys for each input note
    pub spending_keys: [[u8; 32]; 2],
    /// Merkle proofs for each input note
    pub merkle_proofs: [Vec<MerkleProofStep>; 2],
    /// Two output notes to create
    pub output_notes: [Note; 2],
    /// The Merkle root both proofs verify against
    pub root: [u8; 32],
}

/// Private inputs for the withdrawal circuit.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WithdrawPrivateInputs {
    /// The input note to spend
    pub input_note: Note,
    /// Spending key for the input note
    pub spending_key: [u8; 32],
    /// Merkle proof for the input note
    pub merkle_proof: Vec<MerkleProofStep>,
    /// The Merkle root the proof verifies against
    pub root: [u8; 32],
    /// Recipient Ethereum/Plasma address (20 bytes)
    pub recipient: [u8; 20],
    /// Amount to withdraw (publicly visible on-chain)
    pub withdraw_amount: u64,
    /// Change note for partial withdrawals (None for full withdrawal)
    pub change_note: Option<Note>,
}

// =============================================================================
//                              TESTS
// =============================================================================

#[cfg(test)]
mod tests {
    extern crate alloc;
    use super::*;

    #[test]
    fn test_keccak256_of_zero_bytes() {
        // keccak256(bytes32(0)) — this is zeros[0] in MerkleTree.sol
        // bytes32(0) is 32 zero bytes
        let result = keccak256(&[0u8; 32]);
        // Known value: keccak256 of 32 zero bytes
        let expected = hex_to_bytes32(
            "290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563",
        );
        assert_eq!(result, expected, "zeros[0] mismatch");
    }

    #[test]
    fn test_hash_pair() {
        let a = keccak256(&[0u8; 32]); // zeros[0]
        let b = keccak256(&[0u8; 32]); // zeros[0]
        let result = hash_pair(&a, &b);
        // This should be zeros[1] in MerkleTree.sol
        let zeros = compute_zeros(2);
        assert_eq!(result, zeros[1], "zeros[1] mismatch from hash_pair");
    }

    #[test]
    fn test_compute_zeros_consistency() {
        let zeros = compute_zeros(5);
        // zeros[0] = keccak256(32 zero bytes)
        assert_eq!(zeros[0], keccak256(&[0u8; 32]));
        // zeros[i] = hash_pair(zeros[i-1], zeros[i-1])
        for i in 1..5 {
            assert_eq!(zeros[i], hash_pair(&zeros[i - 1], &zeros[i - 1]));
        }
    }

    #[test]
    fn test_note_commitment() {
        let spending_key = [0xABu8; 32];
        let pubkey = derive_pubkey(&spending_key);
        let note = Note {
            amount: 1_000_000, // 1 USDT (6 decimals)
            pubkey,
            blinding: [0x42u8; 32],
        };
        let commitment = note.commitment();
        // Verify it's deterministic
        assert_eq!(commitment, note.commitment());
        // Verify it's not all zeros
        assert_ne!(commitment, [0u8; 32]);
    }

    #[test]
    fn test_nullifier() {
        let spending_key = [0xABu8; 32];
        let pubkey = derive_pubkey(&spending_key);
        let note = Note {
            amount: 1_000_000,
            pubkey,
            blinding: [0x42u8; 32],
        };
        let commitment = note.commitment();
        let nullifier = compute_nullifier(&commitment, &spending_key);
        // Deterministic
        assert_eq!(nullifier, compute_nullifier(&commitment, &spending_key));
        // Different from commitment
        assert_ne!(nullifier, commitment);
        // Different spending key → different nullifier
        let other_key = [0xCDu8; 32];
        let other_nullifier = compute_nullifier(&commitment, &other_key);
        assert_ne!(nullifier, other_nullifier);
    }

    #[test]
    fn test_merkle_tree_insert_and_proof() {
        let mut tree = IncrementalMerkleTree::new(4); // depth 4 = 16 leaves

        // Insert a leaf
        let leaf = keccak256(b"test leaf");
        let idx = tree.insert(leaf);
        assert_eq!(idx, 0);

        // Get proof and verify
        let proof = tree.get_proof(0);
        assert_eq!(proof.len(), 4); // depth 4
        assert!(verify_merkle_proof(leaf, &proof, tree.get_root()));
    }

    #[test]
    fn test_merkle_tree_multiple_inserts() {
        let mut tree = IncrementalMerkleTree::new(4);

        let leaf0 = keccak256(b"leaf 0");
        let leaf1 = keccak256(b"leaf 1");
        let leaf2 = keccak256(b"leaf 2");

        tree.insert(leaf0);
        tree.insert(leaf1);
        tree.insert(leaf2);

        // All proofs should verify against current root
        let root = tree.get_root();
        for i in 0..3 {
            let proof = tree.get_proof(i);
            let leaf = tree.leaves[i as usize];
            assert!(
                verify_merkle_proof(leaf, &proof, root),
                "proof failed for leaf {i}"
            );
        }
    }

    #[test]
    fn test_merkle_tree_root_history() {
        let mut tree = IncrementalMerkleTree::new(4);

        let root_before = tree.get_root();
        let leaf = keccak256(b"leaf");
        tree.insert(leaf);
        let root_after = tree.get_root();

        assert_ne!(root_before, root_after);
        // Both roots should be known
        assert!(tree.is_known_root(root_before));
        assert!(tree.is_known_root(root_after));
        // Zero root should not be known
        assert!(!tree.is_known_root([0u8; 32]));
    }

    #[test]
    fn test_invalid_merkle_proof() {
        let mut tree = IncrementalMerkleTree::new(4);
        let leaf = keccak256(b"real leaf");
        tree.insert(leaf);

        let proof = tree.get_proof(0);
        let fake_leaf = keccak256(b"fake leaf");
        // Proof for real leaf should NOT verify a fake leaf
        assert!(!verify_merkle_proof(fake_leaf, &proof, tree.get_root()));
    }

    #[test]
    fn test_derive_pubkey() {
        let key = [0x01u8; 32];
        let pubkey = derive_pubkey(&key);
        assert_eq!(pubkey, keccak256(&key));
        // Different key → different pubkey
        let other_key = [0x02u8; 32];
        assert_ne!(derive_pubkey(&key), derive_pubkey(&other_key));
    }

    // Helper to convert hex string to [u8; 32]
    fn hex_to_bytes32(hex: &str) -> [u8; 32] {
        let mut result = [0u8; 32];
        for i in 0..32 {
            result[i] = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap();
        }
        result
    }
}

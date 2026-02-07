// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MerkleTree
/// @notice Incremental Merkle tree for note commitments.
///         Uses keccak256 for all hashing (cheap in EVM, matches SP1 circuits).
///
/// @dev    Based on Tornado Cash's MerkleTreeWithHistory pattern.
///         Stores the last ROOT_HISTORY_SIZE roots so proofs generated
///         against recent roots remain valid.

contract MerkleTree {
    // =========================================================================
    //                              CONSTANTS
    // =========================================================================

    uint32 public constant ROOT_HISTORY_SIZE = 30;

    // =========================================================================
    //                               STATE
    // =========================================================================

    /// @notice Tree depth (set at construction, e.g., 20 for ~1M leaves)
    uint32 public immutable levels;

    /// @notice Pre-computed zero values for each level.
    ///         zeros[0] = hash of empty leaf
    ///         zeros[i] = hash(zeros[i-1], zeros[i-1])
    mapping(uint256 => bytes32) public zeros;

    /// @notice Filled subtrees — stores the most recent non-zero node
    ///         at each level. Used for efficient incremental insertion.
    mapping(uint256 => bytes32) public filledSubtrees;

    /// @notice Circular buffer of recent roots
    bytes32[ROOT_HISTORY_SIZE] public roots;

    /// @notice Current root index in the circular buffer
    uint32 public currentRootIndex;

    /// @notice Next leaf index to insert at
    uint32 public nextIndex;

    // =========================================================================
    //                              ERRORS
    // =========================================================================

    error MerkleTreeFull();
    error InvalidLevels();

    // =========================================================================
    //                            CONSTRUCTOR
    // =========================================================================

    constructor(uint32 _levels) {
        if (_levels == 0 || _levels > 32) revert InvalidLevels();
        levels = _levels;

        // Compute zero values for each level
        // zeros[0] is the "empty leaf" value
        bytes32 currentZero = keccak256(abi.encodePacked(bytes32(0)));
        zeros[0] = currentZero;
        filledSubtrees[0] = currentZero;

        for (uint32 i = 1; i < _levels; i++) {
            currentZero = _hashPair(currentZero, currentZero);
            zeros[i] = currentZero;
            filledSubtrees[i] = currentZero;
        }

        // Initial root = hash at the top level
        roots[0] = _hashPair(currentZero, currentZero);
    }

    // =========================================================================
    //                           INTERNAL
    // =========================================================================

    /// @notice Insert a leaf into the tree
    /// @return index The leaf index where the commitment was inserted
    function _insert(bytes32 leaf) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        if (_nextIndex >= uint32(2) ** levels) revert MerkleTreeFull();

        uint32 currentIndex = _nextIndex;
        bytes32 currentLevelHash = leaf;
        bytes32 left;
        bytes32 right;

        for (uint32 i = 0; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                // We're the left child — pair with the zero value on the right
                left = currentLevelHash;
                right = zeros[i];
                // Save our hash as the filled subtree at this level
                filledSubtrees[i] = currentLevelHash;
            } else {
                // We're the right child — pair with the filled subtree on the left
                left = filledSubtrees[i];
                right = currentLevelHash;
            }

            currentLevelHash = _hashPair(left, right);
            currentIndex /= 2;
        }

        // Update root in circular buffer
        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentLevelHash;

        // Advance leaf pointer
        nextIndex = _nextIndex + 1;
        return _nextIndex;
    }

    /// @notice Hash two children to get parent node
    function _hashPair(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(left, right));
    }

    // =========================================================================
    //                          VIEW FUNCTIONS
    // =========================================================================

    /// @notice Get the most recent root
    function getLastRoot() public view returns (bytes32) {
        return roots[currentRootIndex];
    }

    /// @notice Check if a root exists in recent history
    function isKnownRoot(bytes32 root) public view returns (bool) {
        if (root == bytes32(0)) return false;

        uint32 i = currentRootIndex;
        do {
            if (roots[i] == root) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != currentRootIndex);

        return false;
    }

    /// @notice Get the current number of leaves in the tree
    function getLeafCount() external view returns (uint32) {
        return nextIndex;
    }
}

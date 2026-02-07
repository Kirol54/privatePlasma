// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {MerkleTree} from "../contracts/MerkleTree.sol";

/// @notice Expose internal MerkleTree functions for testing
contract MerkleTreeHarness is MerkleTree {
    constructor(uint32 _levels) MerkleTree(_levels) {}

    function insert(bytes32 leaf) external returns (uint32) {
        return _insert(leaf);
    }

    function hashPair(bytes32 left, bytes32 right) external pure returns (bytes32) {
        return _hashPair(left, right);
    }
}

contract MerkleTreeTest is Test {
    MerkleTreeHarness tree;

    function setUp() public {
        tree = new MerkleTreeHarness(4); // depth 4, 16 leaves
    }

    // =========================================================================
    //  Constructor
    // =========================================================================

    function test_constructor_setsLevels() public view {
        assertEq(tree.levels(), 4);
    }

    function test_constructor_zeros0_isKeccakOfZeroBytes32() public view {
        bytes32 expected = keccak256(abi.encodePacked(bytes32(0)));
        assertEq(tree.zeros(0), expected);
    }

    function test_constructor_zerosChain() public view {
        bytes32 z0 = tree.zeros(0);
        bytes32 z1 = tree.zeros(1);
        assertEq(z1, keccak256(abi.encodePacked(z0, z0)));

        bytes32 z2 = tree.zeros(2);
        assertEq(z2, keccak256(abi.encodePacked(z1, z1)));

        bytes32 z3 = tree.zeros(3);
        assertEq(z3, keccak256(abi.encodePacked(z2, z2)));
    }

    function test_constructor_initialRoot() public view {
        bytes32 z3 = tree.zeros(3);
        bytes32 expectedRoot = keccak256(abi.encodePacked(z3, z3));
        assertEq(tree.getLastRoot(), expectedRoot);
    }

    function test_constructor_revertsOnZeroLevels() public {
        vm.expectRevert(MerkleTree.InvalidLevels.selector);
        new MerkleTreeHarness(0);
    }

    function test_constructor_revertsOnTooManyLevels() public {
        vm.expectRevert(MerkleTree.InvalidLevels.selector);
        new MerkleTreeHarness(33);
    }

    // =========================================================================
    //  Insert
    // =========================================================================

    function test_insert_returnsIndex() public {
        bytes32 leaf = keccak256("leaf0");
        uint32 idx = tree.insert(leaf);
        assertEq(idx, 0);

        idx = tree.insert(keccak256("leaf1"));
        assertEq(idx, 1);
    }

    function test_insert_updatesNextIndex() public {
        assertEq(tree.nextIndex(), 0);
        tree.insert(keccak256("a"));
        assertEq(tree.nextIndex(), 1);
        tree.insert(keccak256("b"));
        assertEq(tree.nextIndex(), 2);
    }

    function test_insert_changesRoot() public view {
        bytes32 rootBefore = tree.getLastRoot();
        assertTrue(rootBefore != bytes32(0));
    }

    function test_insert_rootChangesEachTime() public {
        bytes32 root0 = tree.getLastRoot();
        tree.insert(keccak256("a"));
        bytes32 root1 = tree.getLastRoot();
        tree.insert(keccak256("b"));
        bytes32 root2 = tree.getLastRoot();

        assertTrue(root0 != root1);
        assertTrue(root1 != root2);
        assertTrue(root0 != root2);
    }

    function test_insert_sameLeafSameRoot() public {
        bytes32 leaf = keccak256("same");

        // Deploy two fresh trees and insert the same leaf
        MerkleTreeHarness tree1 = new MerkleTreeHarness(4);
        MerkleTreeHarness tree2 = new MerkleTreeHarness(4);

        tree1.insert(leaf);
        tree2.insert(leaf);

        assertEq(tree1.getLastRoot(), tree2.getLastRoot());
    }

    function test_insert_revertsWhenFull() public {
        // Depth 4 = 16 leaves
        for (uint256 i = 0; i < 16; i++) {
            tree.insert(keccak256(abi.encodePacked(i)));
        }
        vm.expectRevert(MerkleTree.MerkleTreeFull.selector);
        tree.insert(keccak256("overflow"));
    }

    // =========================================================================
    //  Root history
    // =========================================================================

    function test_isKnownRoot_initialRootIsKnown() public view {
        assertTrue(tree.isKnownRoot(tree.getLastRoot()));
    }

    function test_isKnownRoot_zeroRootRejected() public view {
        assertFalse(tree.isKnownRoot(bytes32(0)));
    }

    function test_isKnownRoot_previousRootsRetained() public {
        bytes32 root0 = tree.getLastRoot();
        tree.insert(keccak256("a"));
        bytes32 root1 = tree.getLastRoot();
        tree.insert(keccak256("b"));

        assertTrue(tree.isKnownRoot(root0));
        assertTrue(tree.isKnownRoot(root1));
        assertTrue(tree.isKnownRoot(tree.getLastRoot()));
    }

    function test_isKnownRoot_unknownRootRejected() public view {
        assertFalse(tree.isKnownRoot(keccak256("random")));
    }

    function test_isKnownRoot_circularBufferEviction() public {
        // ROOT_HISTORY_SIZE = 30. Need a tree with enough capacity for 30+ inserts.
        MerkleTreeHarness bigTree = new MerkleTreeHarness(20); // 2^20 = 1M leaves

        // Insert one leaf to get a unique root, then remember it.
        bigTree.insert(keccak256("target_leaf"));
        bytes32 targetRoot = bigTree.getLastRoot();
        assertTrue(bigTree.isKnownRoot(targetRoot));

        // Insert 31 more leaves to guarantee full eviction.
        // With ROOT_HISTORY_SIZE=30, after 31 inserts the target root's
        // slot will definitely be overwritten even accounting for off-by-one.
        for (uint256 i = 0; i < 31; i++) {
            bigTree.insert(keccak256(abi.encodePacked("evict", i)));
        }

        // The target root should now be evicted from the circular buffer.
        assertFalse(bigTree.isKnownRoot(targetRoot));
    }

    // =========================================================================
    //  Hash pair
    // =========================================================================

    function test_hashPair_matchesKeccak() public view {
        bytes32 a = keccak256("left");
        bytes32 b = keccak256("right");
        assertEq(tree.hashPair(a, b), keccak256(abi.encodePacked(a, b)));
    }

    function test_hashPair_nonCommutative() public view {
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        assertTrue(tree.hashPair(a, b) != tree.hashPair(b, a));
    }

    // =========================================================================
    //  Manual root computation
    // =========================================================================

    function test_manualRoot_singleLeaf() public {
        // Insert one leaf into a depth-4 tree, compute expected root manually
        bytes32 leaf = keccak256("leaf0");
        tree.insert(leaf);

        bytes32 z0 = tree.zeros(0);
        bytes32 z1 = tree.zeros(1);
        bytes32 z2 = tree.zeros(2);

        // Level 0: hash(leaf, zeros[0])
        bytes32 h0 = keccak256(abi.encodePacked(leaf, z0));
        // Level 1: hash(h0, zeros[1])
        bytes32 h1 = keccak256(abi.encodePacked(h0, z1));
        // Level 2: hash(h1, zeros[2])
        bytes32 h2 = keccak256(abi.encodePacked(h1, z2));
        // Level 3: hash(h2, zeros[3])
        bytes32 z3 = tree.zeros(3);
        bytes32 expectedRoot = keccak256(abi.encodePacked(h2, z3));

        assertEq(tree.getLastRoot(), expectedRoot);
    }

    function test_manualRoot_twoLeaves() public {
        bytes32 leaf0 = keccak256("leaf0");
        bytes32 leaf1 = keccak256("leaf1");
        tree.insert(leaf0);
        tree.insert(leaf1);

        bytes32 z1 = tree.zeros(1);
        bytes32 z2 = tree.zeros(2);
        bytes32 z3 = tree.zeros(3);

        // Level 0: leaf1 is right child, pairs with filledSubtrees[0] = leaf0
        bytes32 h0 = keccak256(abi.encodePacked(leaf0, leaf1));
        // Level 1: h0 is left child (index 0), pairs with zeros[1]
        bytes32 h1 = keccak256(abi.encodePacked(h0, z1));
        // Level 2: h1 is left child (index 0), pairs with zeros[2]
        bytes32 h2 = keccak256(abi.encodePacked(h1, z2));
        // Level 3: h2 is left child (index 0), pairs with zeros[3]
        bytes32 expectedRoot = keccak256(abi.encodePacked(h2, z3));

        assertEq(tree.getLastRoot(), expectedRoot);
    }

    // =========================================================================
    //  Leaf count
    // =========================================================================

    function test_getLeafCount() public {
        assertEq(tree.getLeafCount(), 0);
        tree.insert(keccak256("a"));
        assertEq(tree.getLeafCount(), 1);
        tree.insert(keccak256("b"));
        tree.insert(keccak256("c"));
        assertEq(tree.getLeafCount(), 3);
    }

    // =========================================================================
    //  Cross-language parity (Rust lib)
    // =========================================================================

    function test_zeros0_matchesRust() public view {
        // From Rust lib tests: keccak256 of 32 zero bytes
        // = 0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563
        assertEq(
            tree.zeros(0),
            0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563
        );
    }
}

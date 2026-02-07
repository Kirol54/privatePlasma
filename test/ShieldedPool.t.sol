// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {ShieldedPool} from "../contracts/ShieldedPool.sol";
import {MockERC20} from "./MockERC20.sol";
import {MockSP1Verifier} from "./MockSP1Verifier.sol";

contract ShieldedPoolTest is Test {
    ShieldedPool pool;
    MockERC20 token;
    MockSP1Verifier verifier;

    bytes32 constant TRANSFER_VKEY = keccak256("transfer_vkey");
    bytes32 constant WITHDRAW_VKEY = keccak256("withdraw_vkey");
    uint32 constant TREE_LEVELS = 4;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        token = new MockERC20();
        verifier = new MockSP1Verifier();
        pool = new ShieldedPool(
            address(token),
            address(verifier),
            TRANSFER_VKEY,
            WITHDRAW_VKEY,
            TREE_LEVELS
        );

        // Fund alice
        token.mint(alice, 10_000_000); // 10 USDT (6 decimals)
    }

    // =========================================================================
    //  Constructor
    // =========================================================================

    function test_constructor_setsImmutables() public view {
        assertEq(address(pool.TOKEN()), address(token));
        assertEq(address(pool.VERIFIER()), address(verifier));
        assertEq(pool.TRANSFER_VKEY(), TRANSFER_VKEY);
        assertEq(pool.WITHDRAW_VKEY(), WITHDRAW_VKEY);
        assertEq(pool.levels(), TREE_LEVELS);
    }

    function test_constructor_revertsZeroToken() public {
        vm.expectRevert(ShieldedPool.ZeroAddress.selector);
        new ShieldedPool(
            address(0),
            address(verifier),
            TRANSFER_VKEY,
            WITHDRAW_VKEY,
            TREE_LEVELS
        );
    }

    function test_constructor_revertsZeroVerifier() public {
        vm.expectRevert(ShieldedPool.ZeroAddress.selector);
        new ShieldedPool(
            address(token),
            address(0),
            TRANSFER_VKEY,
            WITHDRAW_VKEY,
            TREE_LEVELS
        );
    }

    // =========================================================================
    //  Deposit
    // =========================================================================

    function test_deposit_transfersTokens() public {
        bytes32 commitment = keccak256("note1");

        vm.startPrank(alice);
        token.approve(address(pool), 1_000_000);
        pool.deposit(commitment, 1_000_000, "");
        vm.stopPrank();

        assertEq(token.balanceOf(address(pool)), 1_000_000);
        assertEq(token.balanceOf(alice), 9_000_000);
    }

    function test_deposit_insertsIntoMerkleTree() public {
        bytes32 commitment = keccak256("note1");

        vm.startPrank(alice);
        token.approve(address(pool), 1_000_000);
        pool.deposit(commitment, 1_000_000, "");
        vm.stopPrank();

        assertEq(pool.nextIndex(), 1);
    }

    function test_deposit_emitsEvent() public {
        bytes32 commitment = keccak256("note1");

        vm.startPrank(alice);
        token.approve(address(pool), 1_000_000);

        vm.expectEmit(true, false, false, true);
        emit ShieldedPool.Deposit(commitment, 1_000_000, 0, block.timestamp);

        pool.deposit(commitment, 1_000_000, "");
        vm.stopPrank();
    }

    function test_deposit_storesEncryptedNote() public {
        bytes32 commitment = keccak256("note1");
        bytes memory encrypted = hex"deadbeef";

        vm.startPrank(alice);
        token.approve(address(pool), 1_000_000);
        pool.deposit(commitment, 1_000_000, encrypted);
        vm.stopPrank();

        assertEq(pool.getEncryptedNote(0), encrypted);
    }

    function test_deposit_emitsEncryptedNoteEvent() public {
        bytes32 commitment = keccak256("note1");
        bytes memory encrypted = hex"deadbeef";

        vm.startPrank(alice);
        token.approve(address(pool), 1_000_000);

        vm.expectEmit(true, false, false, true);
        emit ShieldedPool.EncryptedNote(commitment, encrypted);

        pool.deposit(commitment, 1_000_000, encrypted);
        vm.stopPrank();
    }

    function test_deposit_noEncryptedNoteIfEmpty() public {
        bytes32 commitment = keccak256("note1");

        vm.startPrank(alice);
        token.approve(address(pool), 1_000_000);
        pool.deposit(commitment, 1_000_000, "");
        vm.stopPrank();

        assertEq(pool.getEncryptedNote(0).length, 0);
    }

    function test_deposit_revertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(ShieldedPool.InvalidDepositAmount.selector);
        pool.deposit(keccak256("note"), 0, "");
    }

    function test_deposit_revertsInsufficientAllowance() public {
        vm.prank(alice);
        // No approve
        vm.expectRevert("insufficient allowance");
        pool.deposit(keccak256("note"), 1_000_000, "");
    }

    function test_deposit_multipleDeposits() public {
        vm.startPrank(alice);
        token.approve(address(pool), 3_000_000);

        pool.deposit(keccak256("note1"), 1_000_000, "");
        pool.deposit(keccak256("note2"), 1_000_000, "");
        pool.deposit(keccak256("note3"), 1_000_000, "");
        vm.stopPrank();

        assertEq(pool.nextIndex(), 3);
        assertEq(token.balanceOf(address(pool)), 3_000_000);
    }

    function test_deposit_updatesRoot() public {
        bytes32 rootBefore = pool.getLastRoot();

        vm.startPrank(alice);
        token.approve(address(pool), 1_000_000);
        pool.deposit(keccak256("note1"), 1_000_000, "");
        vm.stopPrank();

        assertTrue(pool.getLastRoot() != rootBefore);
    }

    // =========================================================================
    //  Private Transfer
    // =========================================================================

    /// @dev Helper: deposit a note and return its commitment
    function _depositNote(address user, bytes32 commitment, uint256 amount) internal {
        token.mint(user, amount);
        vm.startPrank(user);
        token.approve(address(pool), amount);
        pool.deposit(commitment, amount, "");
        vm.stopPrank();
    }

    /// @dev Build valid-looking public values for a transfer
    function _buildTransferPublicValues(
        bytes32 root,
        bytes32 null1,
        bytes32 null2,
        bytes32 outComm1,
        bytes32 outComm2
    ) internal pure returns (bytes memory) {
        bytes32[5] memory v = [root, null1, null2, outComm1, outComm2];
        return abi.encode(v);
    }

    function test_transfer_succeeds() public {
        // Deposit two notes
        bytes32 comm1 = keccak256("note1");
        bytes32 comm2 = keccak256("note2");
        _depositNote(alice, comm1, 500_000);
        _depositNote(alice, comm2, 500_000);

        bytes32 root = pool.getLastRoot();
        bytes32 null1 = keccak256("nullifier1");
        bytes32 null2 = keccak256("nullifier2");
        bytes32 outComm1 = keccak256("out1");
        bytes32 outComm2 = keccak256("out2");

        bytes memory publicValues = _buildTransferPublicValues(root, null1, null2, outComm1, outComm2);

        pool.privateTransfer(hex"", publicValues, "", "");

        // Nullifiers marked as spent
        assertTrue(pool.nullifiers(null1));
        assertTrue(pool.nullifiers(null2));

        // Output commitments inserted (2 deposits + 2 outputs = 4 leaves)
        assertEq(pool.nextIndex(), 4);
    }

    function test_transfer_emitsEvent() public {
        bytes32 comm1 = keccak256("note1");
        _depositNote(alice, comm1, 500_000);

        bytes32 root = pool.getLastRoot();
        bytes32 null1 = keccak256("nullifier1");
        bytes32 null2 = keccak256("nullifier2");
        bytes32 outComm1 = keccak256("out1");
        bytes32 outComm2 = keccak256("out2");

        bytes memory publicValues = _buildTransferPublicValues(root, null1, null2, outComm1, outComm2);

        vm.expectEmit(true, true, false, true);
        emit ShieldedPool.PrivateTransfer(null1, null2, outComm1, outComm2, block.timestamp);

        pool.privateTransfer(hex"", publicValues, "", "");
    }

    function test_transfer_storesEncryptedOutputs() public {
        bytes32 comm1 = keccak256("note1");
        _depositNote(alice, comm1, 500_000);

        bytes32 root = pool.getLastRoot();
        bytes memory publicValues = _buildTransferPublicValues(
            root,
            keccak256("n1"),
            keccak256("n2"),
            keccak256("o1"),
            keccak256("o2")
        );

        bytes memory enc1 = hex"aabb";
        bytes memory enc2 = hex"ccdd";

        pool.privateTransfer(hex"", publicValues, enc1, enc2);

        // Leaf indices 1 and 2 (deposit was index 0)
        assertEq(pool.getEncryptedNote(1), enc1);
        assertEq(pool.getEncryptedNote(2), enc2);
    }

    function test_transfer_revertsUnknownRoot() public {
        bytes memory publicValues = _buildTransferPublicValues(
            keccak256("fake_root"),
            keccak256("n1"),
            keccak256("n2"),
            keccak256("o1"),
            keccak256("o2")
        );

        vm.expectRevert(ShieldedPool.InvalidMerkleRoot.selector);
        pool.privateTransfer(hex"", publicValues, "", "");
    }

    function test_transfer_revertsDoubleSpend_null1() public {
        bytes32 comm1 = keccak256("note1");
        _depositNote(alice, comm1, 500_000);
        bytes32 root = pool.getLastRoot();

        bytes32 null1 = keccak256("nullifier1");
        bytes32 null2 = keccak256("nullifier2");

        bytes memory pv = _buildTransferPublicValues(root, null1, null2, keccak256("o1"), keccak256("o2"));
        pool.privateTransfer(hex"", pv, "", "");

        // Second transfer re-using null1 with a valid root
        bytes32 newRoot = pool.getLastRoot();
        bytes memory pv2 = _buildTransferPublicValues(newRoot, null1, keccak256("n3"), keccak256("o3"), keccak256("o4"));
        vm.expectRevert(ShieldedPool.NullifierAlreadySpent.selector);
        pool.privateTransfer(hex"", pv2, "", "");
    }

    function test_transfer_revertsDoubleSpend_null2() public {
        bytes32 comm1 = keccak256("note1");
        _depositNote(alice, comm1, 500_000);
        bytes32 root = pool.getLastRoot();

        bytes32 null1 = keccak256("nullifier1");
        bytes32 null2 = keccak256("nullifier2");

        bytes memory pv = _buildTransferPublicValues(root, null1, null2, keccak256("o1"), keccak256("o2"));
        pool.privateTransfer(hex"", pv, "", "");

        bytes32 newRoot = pool.getLastRoot();
        bytes memory pv2 = _buildTransferPublicValues(newRoot, keccak256("n3"), null2, keccak256("o3"), keccak256("o4"));
        vm.expectRevert(ShieldedPool.NullifierAlreadySpent.selector);
        pool.privateTransfer(hex"", pv2, "", "");
    }

    function test_transfer_revertsInvalidProof() public {
        bytes32 comm1 = keccak256("note1");
        _depositNote(alice, comm1, 500_000);
        bytes32 root = pool.getLastRoot();

        verifier.setShouldRevert(true);

        bytes memory pv = _buildTransferPublicValues(root, keccak256("n1"), keccak256("n2"), keccak256("o1"), keccak256("o2"));
        vm.expectRevert("MockSP1Verifier: proof invalid");
        pool.privateTransfer(hex"", pv, "", "");
    }

    function test_transfer_doesNotMoveTokens() public {
        _depositNote(alice, keccak256("note1"), 1_000_000);
        uint256 poolBalanceBefore = token.balanceOf(address(pool));
        bytes32 root = pool.getLastRoot();

        bytes memory pv = _buildTransferPublicValues(root, keccak256("n1"), keccak256("n2"), keccak256("o1"), keccak256("o2"));
        pool.privateTransfer(hex"", pv, "", "");

        // Pool balance unchanged — private transfer doesn't move tokens
        assertEq(token.balanceOf(address(pool)), poolBalanceBefore);
    }

    // =========================================================================
    //  Withdraw
    // =========================================================================

    function _buildWithdrawPublicValues(
        bytes32 root,
        bytes32 nullifier,
        address recipient,
        uint256 amount,
        bytes32 changeComm
    ) internal pure returns (bytes memory) {
        return abi.encode(root, nullifier, recipient, amount, changeComm);
    }

    function test_withdraw_succeeds() public {
        _depositNote(alice, keccak256("note1"), 1_000_000);
        bytes32 root = pool.getLastRoot();
        bytes32 nullifier = keccak256("nullifier");

        bytes memory pv = _buildWithdrawPublicValues(root, nullifier, bob, 600_000, bytes32(0));
        pool.withdraw(hex"", pv, "");

        assertTrue(pool.nullifiers(nullifier));
        assertEq(token.balanceOf(bob), 600_000);
        assertEq(token.balanceOf(address(pool)), 400_000);
    }

    function test_withdraw_emitsEvent() public {
        _depositNote(alice, keccak256("note1"), 1_000_000);
        bytes32 root = pool.getLastRoot();
        bytes32 nullifier = keccak256("nullifier");

        bytes memory pv = _buildWithdrawPublicValues(root, nullifier, bob, 600_000, bytes32(0));

        vm.expectEmit(true, true, false, true);
        emit ShieldedPool.Withdrawal(nullifier, bob, 600_000, block.timestamp);

        pool.withdraw(hex"", pv, "");
    }

    function test_withdraw_withChangeCommitment() public {
        _depositNote(alice, keccak256("note1"), 1_000_000);
        bytes32 root = pool.getLastRoot();
        bytes32 nullifier = keccak256("nullifier");
        bytes32 changeComm = keccak256("change");

        bytes memory pv = _buildWithdrawPublicValues(root, nullifier, bob, 600_000, changeComm);
        pool.withdraw(hex"", pv, hex"aabb");

        // Change commitment inserted (deposit was index 0, change is index 1)
        assertEq(pool.nextIndex(), 2);
        assertEq(pool.getEncryptedNote(1), hex"aabb");
    }

    function test_withdraw_noChangeCommitment_noInsert() public {
        _depositNote(alice, keccak256("note1"), 1_000_000);
        bytes32 root = pool.getLastRoot();
        bytes32 nullifier = keccak256("nullifier");

        bytes memory pv = _buildWithdrawPublicValues(root, nullifier, bob, 1_000_000, bytes32(0));
        pool.withdraw(hex"", pv, "");

        // No extra insert — only the deposit
        assertEq(pool.nextIndex(), 1);
    }

    function test_withdraw_revertsUnknownRoot() public {
        bytes memory pv = _buildWithdrawPublicValues(keccak256("fake"), keccak256("n"), bob, 100, bytes32(0));
        vm.expectRevert(ShieldedPool.InvalidMerkleRoot.selector);
        pool.withdraw(hex"", pv, "");
    }

    function test_withdraw_revertsDoubleSpend() public {
        _depositNote(alice, keccak256("note1"), 2_000_000);
        bytes32 root = pool.getLastRoot();
        bytes32 nullifier = keccak256("nullifier");

        bytes memory pv = _buildWithdrawPublicValues(root, nullifier, bob, 1_000_000, bytes32(0));
        pool.withdraw(hex"", pv, "");

        // Try again with the same nullifier
        bytes32 newRoot = pool.getLastRoot();
        bytes memory pv2 = _buildWithdrawPublicValues(newRoot, nullifier, bob, 500_000, bytes32(0));
        vm.expectRevert(ShieldedPool.NullifierAlreadySpent.selector);
        pool.withdraw(hex"", pv2, "");
    }

    function test_withdraw_revertsZeroRecipient() public {
        _depositNote(alice, keccak256("note1"), 1_000_000);
        bytes32 root = pool.getLastRoot();

        bytes memory pv = _buildWithdrawPublicValues(root, keccak256("n"), address(0), 1_000_000, bytes32(0));
        vm.expectRevert(ShieldedPool.ZeroAddress.selector);
        pool.withdraw(hex"", pv, "");
    }

    function test_withdraw_revertsInvalidProof() public {
        _depositNote(alice, keccak256("note1"), 1_000_000);
        bytes32 root = pool.getLastRoot();

        verifier.setShouldRevert(true);

        bytes memory pv = _buildWithdrawPublicValues(root, keccak256("n"), bob, 500_000, bytes32(0));
        vm.expectRevert("MockSP1Verifier: proof invalid");
        pool.withdraw(hex"", pv, "");
    }

    function test_withdraw_revertsInsufficientPoolBalance() public {
        // Deposit 1 USDT, try to withdraw 2 USDT
        _depositNote(alice, keccak256("note1"), 1_000_000);
        bytes32 root = pool.getLastRoot();

        bytes memory pv = _buildWithdrawPublicValues(root, keccak256("n"), bob, 2_000_000, bytes32(0));
        vm.expectRevert("insufficient balance");
        pool.withdraw(hex"", pv, "");
    }

    // =========================================================================
    //  View functions
    // =========================================================================

    function test_isSpent_falseByDefault() public view {
        assertFalse(pool.isSpent(keccak256("random")));
    }

    function test_isSpent_trueAfterTransfer() public {
        _depositNote(alice, keccak256("note1"), 500_000);
        bytes32 root = pool.getLastRoot();
        bytes32 null1 = keccak256("n1");

        bytes memory pv = _buildTransferPublicValues(root, null1, keccak256("n2"), keccak256("o1"), keccak256("o2"));
        pool.privateTransfer(hex"", pv, "", "");

        assertTrue(pool.isSpent(null1));
    }

    // =========================================================================
    //  Integration: deposit → transfer → withdraw
    // =========================================================================

    function test_fullFlow_deposit_transfer_withdraw() public {
        // 1. Alice deposits 1 USDT
        bytes32 aliceComm = keccak256("alice_note");
        _depositNote(alice, aliceComm, 1_000_000);

        // Deposit a dummy second note (2-in-2-out requires 2 inputs)
        bytes32 dummyComm = keccak256("dummy_note");
        _depositNote(alice, dummyComm, 1); // minimum amount

        // 2. Alice does a private transfer → creates two output notes
        bytes32 transferRoot = pool.getLastRoot();
        bytes32 tn1 = keccak256("transfer_null_1");
        bytes32 tn2 = keccak256("transfer_null_2");
        bytes32 bobComm = keccak256("bob_note");
        bytes32 aliceChangeComm = keccak256("alice_change");

        bytes memory transferPv = _buildTransferPublicValues(transferRoot, tn1, tn2, bobComm, aliceChangeComm);
        pool.privateTransfer(hex"", transferPv, hex"aa", hex"bb");

        // 3. Bob withdraws 0.6 USDT with change
        bytes32 withdrawRoot = pool.getLastRoot();
        bytes32 wn = keccak256("withdraw_null");
        bytes32 bobChange = keccak256("bob_change");

        bytes memory withdrawPv = _buildWithdrawPublicValues(withdrawRoot, wn, bob, 600_000, bobChange);
        pool.withdraw(hex"", withdrawPv, "");

        // Verify final state
        assertEq(token.balanceOf(bob), 600_000);
        assertTrue(pool.isSpent(tn1));
        assertTrue(pool.isSpent(tn2));
        assertTrue(pool.isSpent(wn));
        // deposit(2) + transfer outputs(2) + withdraw change(1) = 5 leaves
        assertEq(pool.nextIndex(), 5);
    }
}

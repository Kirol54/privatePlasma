//! SP1 Withdraw Circuit: consume a note and withdraw to a public address.
//!
//! Proves a valid withdrawal from the shielded pool:
//! - Input note exists in the Merkle tree
//! - Sender owns the input note
//! - Nullifier is correctly derived
//! - Withdrawal amount + change amount == input note amount
//! - Recipient address is committed (prevents front-running)
//!
//! Public values committed (160 bytes = 5 × 32-byte slots):
//!   [root, nullifier, recipient (left-padded), amount (uint256 BE), changeCommitment]
//! Matches ShieldedPool.sol:
//!   abi.decode(publicValues, (bytes32, bytes32, address, uint256, bytes32))

#![no_main]
sp1_zkvm::entrypoint!(main);

use shielded_pool_lib::{
    compute_nullifier, derive_pubkey, verify_merkle_proof, WithdrawPrivateInputs,
};

pub fn main() {
    // 1. Read all private inputs from the prover (host)
    let inputs = sp1_zkvm::io::read::<WithdrawPrivateInputs>();

    // 2. Verify spending key ownership
    let pubkey = derive_pubkey(&inputs.spending_key);
    assert_eq!(
        pubkey, inputs.input_note.pubkey,
        "spending key does not match note pubkey"
    );

    // 3. Compute commitment and nullifier
    let commitment = inputs.input_note.commitment();
    let nullifier = compute_nullifier(&commitment, &inputs.spending_key);

    // 4. Verify Merkle inclusion
    assert!(
        verify_merkle_proof(commitment, &inputs.merkle_proof, inputs.root),
        "Merkle proof invalid"
    );

    // 5. Compute change commitment and verify conservation
    let change_commitment: [u8; 32] = if let Some(ref change_note) = inputs.change_note {
        // Partial withdrawal: input = withdraw + change
        assert_eq!(
            inputs.input_note.amount,
            inputs.withdraw_amount + change_note.amount,
            "partial withdrawal amounts don't balance"
        );
        change_note.commitment()
    } else {
        // Full withdrawal: entire note amount
        assert_eq!(
            inputs.input_note.amount, inputs.withdraw_amount,
            "full withdrawal amount mismatch"
        );
        [0u8; 32]
    };

    // 6. Commit public values
    // Must produce exactly 160 bytes matching:
    //   abi.decode(publicValues, (bytes32, bytes32, address, uint256, bytes32))
    // ABI encoding: each field is a 32-byte slot.

    // root: bytes32 (32 bytes)
    sp1_zkvm::io::commit_slice(&inputs.root);

    // nullifier: bytes32 (32 bytes)
    sp1_zkvm::io::commit_slice(&nullifier);

    // recipient: address left-padded to 32 bytes
    // ABI encoding of `address`: 12 zero bytes + 20 address bytes
    let mut recipient_padded = [0u8; 32];
    recipient_padded[12..32].copy_from_slice(&inputs.recipient);
    sp1_zkvm::io::commit_slice(&recipient_padded);

    // amount: uint256 big-endian (32 bytes)
    // withdraw_amount is u64, pad to 32 bytes: 24 zero bytes + 8 BE bytes
    let mut amount_be = [0u8; 32];
    amount_be[24..32].copy_from_slice(&inputs.withdraw_amount.to_be_bytes());
    sp1_zkvm::io::commit_slice(&amount_be);

    // changeCommitment: bytes32 (32 bytes)
    sp1_zkvm::io::commit_slice(&change_commitment);
}

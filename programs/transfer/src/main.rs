//! SP1 Transfer Circuit: 2-in-2-out private transfer.
//!
//! Proves a valid private transfer within the shielded pool:
//! - Two input notes are consumed (nullified)
//! - Two output notes are created
//! - Sum of inputs == sum of outputs (conservation)
//! - Sender owns both input notes
//! - Both inputs exist in the Merkle tree
//!
//! Public values committed (160 bytes = 5 × bytes32):
//!   [root, nullifier1, nullifier2, outCommitment1, outCommitment2]
//! Matches ShieldedPool.sol: abi.decode(publicValues, (bytes32[5]))

#![no_main]
sp1_zkvm::entrypoint!(main);

use shielded_pool_lib::{
    compute_nullifier, derive_pubkey, verify_merkle_proof, TransferPrivateInputs,
};

pub fn main() {
    // 1. Read all private inputs from the prover (host)
    let inputs = sp1_zkvm::io::read::<TransferPrivateInputs>();

    // 2. Verify input note 0
    let commitment0 = inputs.input_notes[0].commitment();
    let pubkey0 = derive_pubkey(&inputs.spending_keys[0]);
    assert_eq!(
        pubkey0, inputs.input_notes[0].pubkey,
        "spending key mismatch for input note 0"
    );
    let nullifier0 = compute_nullifier(&commitment0, &inputs.spending_keys[0]);
    assert!(
        verify_merkle_proof(commitment0, &inputs.merkle_proofs[0], inputs.root),
        "Merkle proof invalid for input note 0"
    );

    // 3. Verify input note 1
    let commitment1 = inputs.input_notes[1].commitment();
    let pubkey1 = derive_pubkey(&inputs.spending_keys[1]);
    assert_eq!(
        pubkey1, inputs.input_notes[1].pubkey,
        "spending key mismatch for input note 1"
    );
    let nullifier1 = compute_nullifier(&commitment1, &inputs.spending_keys[1]);
    assert!(
        verify_merkle_proof(commitment1, &inputs.merkle_proofs[1], inputs.root),
        "Merkle proof invalid for input note 1"
    );

    // 4. Compute output commitments
    let out_commitment0 = inputs.output_notes[0].commitment();
    let out_commitment1 = inputs.output_notes[1].commitment();

    // 5. Conservation check: sum(inputs) == sum(outputs)
    let input_sum = inputs.input_notes[0].amount as u128 + inputs.input_notes[1].amount as u128;
    let output_sum = inputs.output_notes[0].amount as u128 + inputs.output_notes[1].amount as u128;
    assert_eq!(input_sum, output_sum, "amounts don't balance");

    // 6. Commit public values
    // Must produce exactly 160 bytes matching:
    //   abi.decode(publicValues, (bytes32[5]))
    // which is 5 contiguous bytes32 with no length prefix.
    sp1_zkvm::io::commit_slice(&inputs.root);     // 32 bytes: Merkle root
    sp1_zkvm::io::commit_slice(&nullifier0);       // 32 bytes: nullifier for input 0
    sp1_zkvm::io::commit_slice(&nullifier1);       // 32 bytes: nullifier for input 1
    sp1_zkvm::io::commit_slice(&out_commitment0);  // 32 bytes: output commitment 0
    sp1_zkvm::io::commit_slice(&out_commitment1);  // 32 bytes: output commitment 1
}

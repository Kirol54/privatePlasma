#[cfg(test)]
mod tests {
    use shielded_pool_lib::*;

    /// Create a test scenario: two notes in a small Merkle tree, build transfer inputs.
    fn build_transfer_test_inputs() -> TransferPrivateInputs {
        let spending_key = [0xABu8; 32];
        let pubkey = derive_pubkey(&spending_key);

        let note0 = Note {
            amount: 700_000,
            pubkey,
            blinding: [0x01u8; 32],
        };
        let note1 = Note {
            amount: 300_000,
            pubkey,
            blinding: [0x02u8; 32],
        };

        let mut tree = IncrementalMerkleTree::new(4);
        let comm0 = note0.commitment();
        let comm1 = note1.commitment();
        tree.insert(comm0);
        tree.insert(comm1);

        let root = tree.get_root();
        let proof0 = tree.get_proof(0);
        let proof1 = tree.get_proof(1);

        let recipient_key = [0xCDu8; 32];
        let recipient_pubkey = derive_pubkey(&recipient_key);

        let out_note0 = Note {
            amount: 500_000,
            pubkey: recipient_pubkey,
            blinding: [0x03u8; 32],
        };
        let out_note1 = Note {
            amount: 500_000,
            pubkey,
            blinding: [0x04u8; 32],
        };

        TransferPrivateInputs {
            input_notes: [note0, note1],
            spending_keys: [spending_key, spending_key],
            merkle_proofs: [proof0, proof1],
            output_notes: [out_note0, out_note1],
            root,
        }
    }

    fn build_withdraw_test_inputs() -> WithdrawPrivateInputs {
        let spending_key = [0xABu8; 32];
        let pubkey = derive_pubkey(&spending_key);

        let note = Note {
            amount: 1_000_000,
            pubkey,
            blinding: [0x01u8; 32],
        };

        let mut tree = IncrementalMerkleTree::new(4);
        let comm = note.commitment();
        tree.insert(comm);

        let root = tree.get_root();
        let proof = tree.get_proof(0);

        let change_note = Note {
            amount: 400_000,
            pubkey,
            blinding: [0x05u8; 32],
        };

        WithdrawPrivateInputs {
            input_note: note,
            spending_key,
            merkle_proof: proof,
            root,
            recipient: [0xDE; 20],
            withdraw_amount: 600_000,
            change_note: Some(change_note),
        }
    }

    #[test]
    fn test_transfer_inputs_serialize_json() {
        let inputs = build_transfer_test_inputs();
        let json = serde_json::to_string_pretty(&inputs).unwrap();
        std::fs::write("/tmp/test_transfer_input.json", &json).unwrap();
        let parsed: TransferPrivateInputs = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.input_notes[0].amount, 700_000);
        assert_eq!(parsed.output_notes[0].amount, 500_000);
    }

    #[test]
    fn test_withdraw_inputs_serialize_json() {
        let inputs = build_withdraw_test_inputs();
        let json = serde_json::to_string_pretty(&inputs).unwrap();
        std::fs::write("/tmp/test_withdraw_input.json", &json).unwrap();
        let parsed: WithdrawPrivateInputs = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.input_note.amount, 1_000_000);
        assert_eq!(parsed.withdraw_amount, 600_000);
    }

    #[test]
    fn test_transfer_conservation() {
        let inputs = build_transfer_test_inputs();
        let input_sum: u64 = inputs.input_notes.iter().map(|n| n.amount).sum();
        let output_sum: u64 = inputs.output_notes.iter().map(|n| n.amount).sum();
        assert_eq!(input_sum, output_sum);
    }

    #[test]
    fn test_withdraw_conservation() {
        let inputs = build_withdraw_test_inputs();
        let change_amount = inputs.change_note.as_ref().map(|n| n.amount).unwrap_or(0);
        assert_eq!(inputs.input_note.amount, inputs.withdraw_amount + change_amount);
    }

    #[test]
    fn test_merkle_proof_verifies_for_transfer() {
        let inputs = build_transfer_test_inputs();
        for i in 0..2 {
            let comm = inputs.input_notes[i].commitment();
            assert!(verify_merkle_proof(comm, &inputs.merkle_proofs[i], inputs.root));
        }
    }

    #[test]
    fn test_spending_key_matches_pubkey() {
        let inputs = build_transfer_test_inputs();
        for i in 0..2 {
            let derived = derive_pubkey(&inputs.spending_keys[i]);
            assert_eq!(derived, inputs.input_notes[i].pubkey);
        }
    }

    #[test]
    fn test_public_values_size_transfer() {
        let inputs = build_transfer_test_inputs();
        let null0 = compute_nullifier(&inputs.input_notes[0].commitment(), &inputs.spending_keys[0]);
        let null1 = compute_nullifier(&inputs.input_notes[1].commitment(), &inputs.spending_keys[1]);
        let out0 = inputs.output_notes[0].commitment();
        let out1 = inputs.output_notes[1].commitment();

        let mut pv = Vec::new();
        pv.extend_from_slice(&inputs.root);
        pv.extend_from_slice(&null0);
        pv.extend_from_slice(&null1);
        pv.extend_from_slice(&out0);
        pv.extend_from_slice(&out1);
        assert_eq!(pv.len(), 160);
    }

    #[test]
    fn test_public_values_size_withdraw() {
        let inputs = build_withdraw_test_inputs();
        let commitment = inputs.input_note.commitment();
        let nullifier = compute_nullifier(&commitment, &inputs.spending_key);
        let change_comm = inputs.change_note.as_ref().map(|n| n.commitment()).unwrap_or([0u8; 32]);

        let mut pv = Vec::new();
        pv.extend_from_slice(&inputs.root);
        pv.extend_from_slice(&nullifier);
        let mut recipient_padded = [0u8; 32];
        recipient_padded[12..].copy_from_slice(&inputs.recipient);
        pv.extend_from_slice(&recipient_padded);
        let mut amount_be = [0u8; 32];
        amount_be[24..].copy_from_slice(&inputs.withdraw_amount.to_be_bytes());
        pv.extend_from_slice(&amount_be);
        pv.extend_from_slice(&change_comm);
        assert_eq!(pv.len(), 160);
    }
}

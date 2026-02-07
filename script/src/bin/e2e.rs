//! End-to-end test: deposit → transfer → withdraw against a deployed ShieldedPool.
//!
//! Runs the full shielded pool lifecycle with real Groth16 proofs:
//!   1. Deposits USDT into the pool (two notes)
//!   2. Private transfer to a recipient (ZK proof via Succinct Network)
//!   3. Recipient withdraws to a public address (ZK proof)
//!   4. Verifies on-chain state (nullifiers, Merkle tree, balances)
//!
//! Usage:
//!   SP1_PROVER=network cargo run --release -p shielded-pool-script --bin e2e
//!
//! Required env vars (from .env):
//!   RPC_URL           — Plasma RPC endpoint
//!   PRIVATE_KEY       — Funded wallet private key
//!   TOKEN_ADDRESS     — ERC20 token (USDT) address
//!   POOL_ADDRESS      — Deployed ShieldedPool address
//!   NETWORK_PRIVATE_KEY   — Succinct Prover Network API key
//!
//! Optional env vars:
//!   TREE_LEVELS       — Merkle tree depth (default: 20)
//!   DEPOSIT_A         — First deposit in USDT (default: 0.7)
//!   DEPOSIT_B         — Second deposit in USDT (default: 0.3)
//!   TRANSFER_AMOUNT   — Amount to send to recipient in USDT (default: 0.5)
//!   WITHDRAW_AMOUNT   — Amount recipient withdraws in USDT (default: 0.3)
//!   RECIPIENT_PUBKEY  — Recipient's shielded public key (hex, 64 chars).
//!                       If not set, a random recipient key is generated.

use alloy::{
    consensus::Transaction as _,
    primitives::{ Address, Bytes, FixedBytes, U256 },
    providers::{Provider, ProviderBuilder},
    signers::local::PrivateKeySigner,
    sol,
};
use anyhow::{ ensure, Context, Result };
use rand::Rng;
use serde::{Deserialize, Serialize};
use shielded_pool_lib::{
    compute_nullifier,
    derive_pubkey,
    IncrementalMerkleTree,
    Note,
    TransferPrivateInputs,
    WithdrawPrivateInputs,
};
use sp1_sdk::{ include_elf, ProverClient, SP1Stdin };

pub const TRANSFER_ELF: &[u8] = include_elf!("transfer-program");
pub const WITHDRAW_ELF: &[u8] = include_elf!("withdraw-program");

// ---------------------------------------------------------------------------
// Contract bindings (inline — no ABI files needed)
// ---------------------------------------------------------------------------

sol! {
    #[sol(rpc)]
    interface IERC20 {
        function approve(address spender, uint256 amount) external returns (bool);
        function balanceOf(address account) external view returns (uint256);
        function mint(address to, uint256 amount) external;
    }

    #[sol(rpc)]
    interface IShieldedPool {
        function deposit(bytes32 commitment, uint256 amount, bytes calldata encryptedData) external;
        function privateTransfer(bytes calldata proof, bytes calldata publicValues, bytes calldata encryptedOutput1, bytes calldata encryptedOutput2) external;
        function withdraw(bytes calldata proof, bytes calldata publicValues, bytes calldata encryptedChange) external;
        function getLastRoot() external view returns (bytes32);
        function getLeafCount() external view returns (uint32);
        function isKnownRoot(bytes32 root) external view returns (bool);
        function isSpent(bytes32 nullifier) external view returns (bool);

        event Deposit(bytes32 indexed commitment, uint256 amount, uint32 leafIndex, uint256 timestamp);
        event PrivateTransfer(bytes32 indexed nullifier1, bytes32 indexed nullifier2, bytes32 newCommitment1, bytes32 newCommitment2, uint256 timestamp);
        event Withdrawal(bytes32 indexed nullifier, address indexed recipient, uint256 amount, uint256 timestamp);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse a USDT amount string like "0.7" into u64 with 6 decimals (700000).
fn parse_usdt(s: &str) -> Result<u64> {
    let f: f64 = s.parse().context("invalid USDT amount")?;
    Ok((f * 1_000_000.0).round() as u64)
}

/// Decode a 32-byte hex string (with or without 0x prefix) into [u8; 32].
fn decode_hex_32(s: &str) -> Result<[u8; 32]> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    let bytes = hex::decode(s).context("invalid hex")?;
    ensure!(bytes.len() == 32, "expected 32 bytes, got {}", bytes.len());
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

// ---------------------------------------------------------------------------
// Wallet state — saved to disk so the exit script can withdraw
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize)]
struct WalletNote {
    /// Human label (e.g. "deposit_a", "transfer_change")
    label: String,
    /// Note amount (raw, 6 decimals)
    amount: u64,
    /// Hex-encoded 32-byte public key
    pubkey: String,
    /// Hex-encoded 32-byte blinding factor
    blinding: String,
    /// Hex-encoded 32-byte commitment
    commitment: String,
    /// Leaf index in the Merkle tree
    leaf_index: u32,
}

#[derive(Serialize, Deserialize)]
struct WalletState {
    /// Hex-encoded spending keys (sender, recipient)
    spending_keys: Vec<WalletSpendingKey>,
    /// All notes created during this session
    notes: Vec<WalletNote>,
}

#[derive(Serialize, Deserialize)]
struct WalletSpendingKey {
    label: String,
    /// Hex-encoded 32-byte spending key
    spending_key: String,
    /// Hex-encoded 32-byte derived pubkey
    pubkey: String,
}

fn encode_note(label: &str, note: &Note, leaf_index: u32) -> WalletNote {
    WalletNote {
        label: label.to_string(),
        amount: note.amount,
        pubkey: hex::encode(note.pubkey),
        blinding: hex::encode(note.blinding),
        commitment: hex::encode(note.commitment()),
        leaf_index,
    }
}

fn save_wallet(state: &WalletState) -> Result<()> {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("fixtures");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("wallet.json");
    let json = serde_json::to_string_pretty(state)?;
    std::fs::write(&path, &json)?;
    println!("    Wallet state saved to {}", path.display());
    Ok(())
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    sp1_sdk::utils::setup_logger();

    // ── Step 0: Load config ────────────────────────────────────────────
    println!("\n=== Shielded Pool E2E Test ===\n");

    let rpc_url = std::env::var("RPC_URL").context("RPC_URL not set")?;
    let private_key = std::env::var("PRIVATE_KEY").context("PRIVATE_KEY not set")?;
    let token_addr: Address = std::env
        ::var("TOKEN_ADDRESS")
        .context("TOKEN_ADDRESS not set")?
        .parse()?;
    let pool_addr: Address = std::env
        ::var("POOL_ADDRESS")
        .context("POOL_ADDRESS not set")?
        .parse()?;
    let tree_levels: usize = std::env
        ::var("TREE_LEVELS")
        .unwrap_or_else(|_| "20".to_string())
        .parse()?;
    let deploy_block: u64 = std::env
        ::var("DEPLOY_BLOCK")
        .unwrap_or_else(|_| "0".to_string())
        .parse()
        .context("DEPLOY_BLOCK must be a number")?;

    // Amounts (USDT, 6 decimals)
    let deposit_a = parse_usdt(&std::env::var("DEPOSIT_A").unwrap_or_else(|_| "0.7".to_string()))?;
    let deposit_b = parse_usdt(&std::env::var("DEPOSIT_B").unwrap_or_else(|_| "0.3".to_string()))?;
    let transfer_amount = parse_usdt(
        &std::env::var("TRANSFER_AMOUNT").unwrap_or_else(|_| "0.5".to_string())
    )?;
    let withdraw_amount = parse_usdt(
        &std::env::var("WITHDRAW_AMOUNT").unwrap_or_else(|_| "0.3".to_string())
    )?;
    let total_deposit = deposit_a + deposit_b;
    let change_from_transfer = total_deposit - transfer_amount;
    let change_from_withdraw = transfer_amount - withdraw_amount;

    ensure!(
        transfer_amount <= total_deposit,
        "TRANSFER_AMOUNT ({transfer_amount}) > total deposits ({total_deposit})"
    );
    ensure!(
        withdraw_amount <= transfer_amount,
        "WITHDRAW_AMOUNT ({withdraw_amount}) > TRANSFER_AMOUNT ({transfer_amount})"
    );

    println!("RPC:              {rpc_url}");
    println!("Pool:             {pool_addr}");
    println!("Token:            {token_addr}");
    println!("Tree:             {tree_levels} levels");
    println!("Deposit A:        {} USDT", (deposit_a as f64) / 1e6);
    println!("Deposit B:        {} USDT", (deposit_b as f64) / 1e6);
    println!("Transfer amount:  {} USDT", (transfer_amount as f64) / 1e6);
    println!("Withdraw amount:  {} USDT\n", (withdraw_amount as f64) / 1e6);

    // ── Step 1: Connect ────────────────────────────────────────────────
    let signer: PrivateKeySigner = private_key.parse()?;
    let wallet_address = signer.address();
    println!("[1] Wallet: {wallet_address}");

    let provider = ProviderBuilder::new().wallet(signer).connect_http(rpc_url.parse()?);

    let token = IERC20::new(token_addr, &provider);
    let pool = IShieldedPool::new(pool_addr, &provider);

    // ── Step 2: Generate spending keys ─────────────────────────────────
    let mut rng = rand::thread_rng();
    let spending_key: [u8; 32] = rng.gen();
    let pubkey = derive_pubkey(&spending_key);
    println!("[2] Sender pubkey:    0x{}", hex::encode(pubkey));

    // Recipient: from env or random
    let (recipient_spending_key, recipient_pubkey) = if
        let Ok(pk_hex) = std::env::var("RECIPIENT_PUBKEY")
    {
        let pk = decode_hex_32(&pk_hex)?;
        // When pubkey is provided, we don't know the spending key.
        // For the e2e test we need the spending key to build the withdraw proof,
        // so RECIPIENT_PUBKEY is treated as a spending key and we derive pubkey from it.
        let pubkey = derive_pubkey(&pk);
        println!("    Recipient key:    0x{} (from env)", hex::encode(pubkey));
        (pk, pubkey)
    } else {
        let sk: [u8; 32] = rng.gen();
        let pk = derive_pubkey(&sk);
        println!("    Recipient key:    0x{} (random)", hex::encode(pk));
        (sk, pk)
    };

    // ── Wallet state — track all notes for the exit script ────────────
    let mut wallet = WalletState {
        spending_keys: vec![
            WalletSpendingKey {
                label: "sender".into(),
                spending_key: hex::encode(spending_key),
                pubkey: hex::encode(pubkey),
            },
            WalletSpendingKey {
                label: "recipient".into(),
                spending_key: hex::encode(recipient_spending_key),
                pubkey: hex::encode(recipient_pubkey),
            },
        ],
        notes: Vec::new(),
    };

    // ── Step 3: Create notes ───────────────────────────────────────────
    let note_a = Note {
        amount: deposit_a,
        pubkey,
        blinding: rng.gen(),
    };
    let note_b = Note {
        amount: deposit_b,
        pubkey,
        blinding: rng.gen(),
    };
    let comm_a = note_a.commitment();
    let comm_b = note_b.commitment();
    println!(
        "[3] Notes: {} + {} = {} USDT",
        (deposit_a as f64) / 1e6,
        (deposit_b as f64) / 1e6,
        (total_deposit as f64) / 1e6
    );

    // ── Step 4: Deposit ────────────────────────────────────────────────
    println!("[4] Approving token spend...");
    let tx = token.approve(pool_addr, U256::from(total_deposit)).send().await?;
    let receipt = tx.get_receipt().await?;
    println!("    Approve tx: {}", receipt.transaction_hash);

    println!("    Depositing {} USDT...", (deposit_a as f64) / 1e6);
    let tx = pool
        .deposit(FixedBytes::from(comm_a), U256::from(deposit_a), Bytes::new())
        .send().await?;
    let receipt = tx.get_receipt().await?;
    println!("    Deposit A tx: {}", receipt.transaction_hash);

    println!("    Depositing {} USDT...", (deposit_b as f64) / 1e6);
    let tx = pool
        .deposit(FixedBytes::from(comm_b), U256::from(deposit_b), Bytes::new())
        .send().await?;
    let receipt = tx.get_receipt().await?;
    println!("    Deposit B tx: {}", receipt.transaction_hash);

    // ── Step 5: Mirror Merkle tree ─────────────────────────────────────
    println!("[5] Building local Merkle tree from all on-chain events...");
    let mut tree = IncrementalMerkleTree::new(tree_levels);

    // We need to replay ALL commitment insertions in order:
    //   - Deposit:         1 commitment  (from event)
    //   - PrivateTransfer: 2 commitments (from event)
    //   - Withdrawal:      0 or 1 commitment (change, from tx calldata)
    // Collect them all, sort by (block, logIndex), insert in order.

    struct Insertion {
        block: u64,
        log_index: u64,
        commitments: Vec<[u8; 32]>,
    }

    let mut insertions: Vec<Insertion> = Vec::new();

    // 1. Deposits
    let deposit_logs = pool.Deposit_filter().from_block(deploy_block).query().await?;
    println!("    Deposits: {}", deposit_logs.len());
    for (event, log) in &deposit_logs {
        insertions.push(Insertion {
            block: log.block_number.unwrap_or(0),
            log_index: log.log_index.unwrap_or(0),
            commitments: vec![event.commitment.0],
        });
    }

    // 2. Private transfers (2 commitments each)
    let transfer_logs = pool.PrivateTransfer_filter().from_block(deploy_block).query().await?;
    println!("    Transfers: {}", transfer_logs.len());
    for (event, log) in &transfer_logs {
        insertions.push(Insertion {
            block: log.block_number.unwrap_or(0),
            log_index: log.log_index.unwrap_or(0),
            commitments: vec![event.newCommitment1.0, event.newCommitment2.0],
        });
    }

    // 3. Withdrawals — decode changeCommitment from tx calldata
    let withdrawal_logs = pool.Withdrawal_filter().from_block(deploy_block).query().await?;
    println!("    Withdrawals: {}", withdrawal_logs.len());
    for (_event, log) in &withdrawal_logs {
        if let Some(tx_hash) = log.transaction_hash {
            if let Some(tx) = provider.get_transaction_by_hash(tx_hash).await? {
                let input = tx.input();
                // withdraw(bytes proof, bytes publicValues, bytes encryptedChange)
                // Calldata layout: 4-byte selector + ABI-encoded (bytes, bytes, bytes)
                // Word 0: offset to proof
                // Word 1: offset to publicValues
                // Word 2: offset to encryptedChange
                // At each offset: first 32 bytes = length, then data
                if input.len() > 4 + 32 * 3 {
                    let data = &input[4..]; // skip selector
                    // Read offset to publicValues (word 1, big-endian u256, but it's small)
                    let pv_offset = u64::from_be_bytes(data[32 + 24..32 + 32].try_into().unwrap()) as usize;
                    if pv_offset + 32 <= data.len() {
                        // Read length of publicValues
                        let pv_len = u64::from_be_bytes(data[pv_offset + 24..pv_offset + 32].try_into().unwrap()) as usize;
                        let pv_start = pv_offset + 32;
                        if pv_len >= 160 && pv_start + 160 <= data.len() {
                            let mut change_comm = [0u8; 32];
                            change_comm.copy_from_slice(&data[pv_start + 128..pv_start + 160]);
                            if change_comm != [0u8; 32] {
                                insertions.push(Insertion {
                                    block: log.block_number.unwrap_or(0),
                                    log_index: log.log_index.unwrap_or(0),
                                    commitments: vec![change_comm],
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by block number, then log index
    insertions.sort_by_key(|i| (i.block, i.log_index));

    let total_commitments: usize = insertions.iter().map(|i| i.commitments.len()).sum();
    println!("    Total commitments to insert: {total_commitments}");

    for ins in &insertions {
        for comm in &ins.commitments {
            tree.insert(*comm);
        }
    }

    // Verify root matches on-chain
    let on_chain_root: FixedBytes<32> = pool.getLastRoot().call().await?;
    let local_root = tree.get_root();
    ensure!(
        FixedBytes::from(local_root) == on_chain_root,
        "Root mismatch! local={} on-chain={}",
        hex::encode(local_root),
        on_chain_root
    );
    println!("    Root verified: 0x{}...", hex::encode(&local_root[..8]));

    // Our leaves are the last two inserted
    let leaf_count = tree.leaves.len();
    let leaf_a_idx = (leaf_count - 2) as u32;
    let leaf_b_idx = (leaf_count - 1) as u32;
    println!("    Our leaves: A={leaf_a_idx}, B={leaf_b_idx}");

    // Track deposit notes in wallet
    wallet.notes.push(encode_note("deposit_a", &note_a, leaf_a_idx));
    wallet.notes.push(encode_note("deposit_b", &note_b, leaf_b_idx));

    // ── Step 6: Build transfer inputs ──────────────────────────────────
    println!("[6] Building transfer inputs...");
    println!(
        "    {} USDT → recipient, {} USDT → change",
        (transfer_amount as f64) / 1e6,
        (change_from_transfer as f64) / 1e6
    );

    let output_note_0 = Note {
        amount: transfer_amount,
        pubkey: recipient_pubkey,
        blinding: rng.gen(),
    };
    let output_note_1 = Note {
        amount: change_from_transfer,
        pubkey,
        blinding: rng.gen(),
    };

    let root = tree.get_root();
    let proof_a = tree.get_proof(leaf_a_idx);
    let proof_b = tree.get_proof(leaf_b_idx);

    let transfer_inputs = TransferPrivateInputs {
        input_notes: [note_a.clone(), note_b.clone()],
        spending_keys: [spending_key, spending_key],
        merkle_proofs: [proof_a, proof_b],
        output_notes: [output_note_0.clone(), output_note_1.clone()],
        root,
    };

    // ── Step 7: Generate transfer proof ────────────────────────────────
    println!("[7] Generating transfer Groth16 proof (this may take a few minutes)...");
    let sp1_client = ProverClient::from_env();

    let mut stdin = SP1Stdin::new();
    stdin.write(&transfer_inputs);

    let (pk, vk) = sp1_client.setup(TRANSFER_ELF);
    let transfer_proof = sp1_client.prove(&pk, &stdin).groth16().run()?;
    // sp1_client.verify(&transfer_proof, &vk)?;
    // println!("    Transfer proof verified locally");

    let transfer_proof_bytes = transfer_proof.bytes();
    let transfer_public_values = transfer_proof.public_values.to_vec();
    println!(
        "    Proof: {} bytes, Public values: {} bytes",
        transfer_proof_bytes.len(),
        transfer_public_values.len()
    );

    // ── Step 8: Submit transfer ────────────────────────────────────────
    println!("[8] Submitting private transfer on-chain...");
    let tx = pool
        .privateTransfer(
            Bytes::from(transfer_proof_bytes),
            Bytes::from(transfer_public_values),
            Bytes::new(),
            Bytes::new()
        )
        .send().await?;
    let receipt = tx.get_receipt().await?;
    println!("    Transfer tx: {}", receipt.transaction_hash);

    // Update local tree with output commitments
    let out_comm_0 = output_note_0.commitment();
    let out_comm_1 = output_note_1.commitment();
    let out_leaf_0 = tree.insert(out_comm_0);
    let out_leaf_1 = tree.insert(out_comm_1);
    println!("    Output leaves: {out_leaf_0}, {out_leaf_1}");

    // Track transfer output notes
    wallet.notes.push(encode_note("transfer_to_recipient", &output_note_0, out_leaf_0));
    wallet.notes.push(encode_note("transfer_change", &output_note_1, out_leaf_1));

    // Verify root still matches
    let on_chain_root: FixedBytes<32> = pool.getLastRoot().call().await?;
    ensure!(FixedBytes::from(tree.get_root()) == on_chain_root, "Root mismatch after transfer!");
    println!("    Root verified after transfer");

    // ── Step 9: Build withdraw inputs ──────────────────────────────────
    println!("[9] Building withdraw inputs...");
    println!(
        "    Withdrawing {} USDT, {} USDT change",
        (withdraw_amount as f64) / 1e6,
        (change_from_withdraw as f64) / 1e6
    );

    let change_note = if change_from_withdraw > 0 {
        Some(Note {
            amount: change_from_withdraw,
            pubkey: recipient_pubkey,
            blinding: rng.gen(),
        })
    } else {
        None
    };

    let root = tree.get_root();
    let proof_out0 = tree.get_proof(out_leaf_0);
    let recipient_address: [u8; 20] = wallet_address.0.0;

    let withdraw_inputs = WithdrawPrivateInputs {
        input_note: output_note_0.clone(),
        spending_key: recipient_spending_key,
        merkle_proof: proof_out0,
        root,
        recipient: recipient_address,
        withdraw_amount,
        change_note: change_note.clone(),
    };

    // ── Step 10: Generate withdraw proof ───────────────────────────────
    println!("[10] Generating withdraw Groth16 proof...");

    let mut stdin = SP1Stdin::new();
    stdin.write(&withdraw_inputs);

    let (pk, vk) = sp1_client.setup(WITHDRAW_ELF);
    let withdraw_proof = sp1_client.prove(&pk, &stdin).groth16().run()?;
    // sp1_client.verify(&withdraw_proof, &vk)?;
    // println!("     Withdraw proof verified locally");

    let withdraw_proof_bytes = withdraw_proof.bytes();
    let withdraw_public_values = withdraw_proof.public_values.to_vec();

    // ── Step 11: Submit withdraw ───────────────────────────────────────
    println!("[11] Submitting withdraw on-chain...");
    let tx = pool
        .withdraw(
            Bytes::from(withdraw_proof_bytes),
            Bytes::from(withdraw_public_values),
            Bytes::new()
        )
        .send().await?;
    let receipt = tx.get_receipt().await?;
    println!("     Withdraw tx: {}", receipt.transaction_hash);

    // Update local tree with change commitment
    if let Some(ref cn) = change_note {
        let change_leaf = tree.insert(cn.commitment());
        wallet.notes.push(encode_note("withdraw_change", cn, change_leaf));
    }

    // ── Save wallet state ──────────────────────────────────────────────
    save_wallet(&wallet)?;

    // ── Step 12: Verify final state ────────────────────────────────────
    println!("\n[12] Verifying final state...");

    // Check transfer nullifiers are spent
    let null_a = compute_nullifier(&comm_a, &spending_key);
    let null_b = compute_nullifier(&comm_b, &spending_key);
    let spent_a: bool = pool.isSpent(FixedBytes::from(null_a)).call().await?;
    let spent_b: bool = pool.isSpent(FixedBytes::from(null_b)).call().await?;
    ensure!(spent_a, "Nullifier A not spent!");
    ensure!(spent_b, "Nullifier B not spent!");
    println!("     Transfer nullifiers spent: OK");

    // Check withdraw nullifier is spent
    let withdraw_null = compute_nullifier(&out_comm_0, &recipient_spending_key);
    let spent_w: bool = pool.isSpent(FixedBytes::from(withdraw_null)).call().await?;
    ensure!(spent_w, "Withdraw nullifier not spent!");
    println!("     Withdraw nullifier spent: OK");

    // Check leaf count
    let on_chain_leaves: u32 = pool.getLeafCount().call().await?;
    let expected_leaves = if change_note.is_some() { 5u32 } else { 4u32 };
    println!("     On-chain leaf count: {on_chain_leaves} (expected {expected_leaves})");

    // Check token balance
    let balance: U256 = token.balanceOf(wallet_address).call().await?;
    println!("     Wallet token balance: {balance}");

    println!("\n=== E2E Test Passed! ===\n");
    Ok(())
}

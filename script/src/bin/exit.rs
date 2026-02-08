//! Exit script: withdraw ALL unspent notes from the shielded pool.
//!
//! Reads wallet state from fixtures/wallet.json (created by the e2e script),
//! checks which notes are still unspent on-chain, and withdraws each one
//! to the caller's wallet address.
//!
//! Usage:
//!   SP1_PROVER=network cargo run --release -p shielded-pool-script --bin exit
//!
//! Required env vars (from .env):
//!   RPC_URL               — Plasma RPC endpoint
//!   PRIVATE_KEY           — Funded wallet private key (receives the withdrawn USDT)
//!   TOKEN_ADDRESS         — ERC20 token (USDT) address
//!   POOL_ADDRESS          — Deployed ShieldedPool address
//!   NETWORK_PRIVATE_KEY   — Succinct Prover Network API key
//!
//! Optional env vars:
//!   DEPLOY_BLOCK          — Block the ShieldedPool was deployed at (default: 0)
//!   TREE_LEVELS           — Merkle tree depth (default: 20)
//!   WALLET_FILE           — Path to wallet.json (default: fixtures/wallet.json)
//!   RECIPIENT_ADDRESS     — Override withdrawal address (default: PRIVATE_KEY's address)

use alloy::{
    consensus::Transaction as _,
    primitives::{Address, Bytes, FixedBytes, U256},
    providers::{Provider, ProviderBuilder},
    signers::local::PrivateKeySigner,
    sol,
};
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use shielded_pool_lib::{
    compute_nullifier, IncrementalMerkleTree, Note, WithdrawPrivateInputs,
};
use sp1_sdk::{include_elf, ProverClient, SP1Stdin};

pub const WITHDRAW_ELF: &[u8] = include_elf!("withdraw-program");

// ---------------------------------------------------------------------------
// Contract bindings
// ---------------------------------------------------------------------------

sol! {
    #[sol(rpc)]
    interface IERC20 {
        function balanceOf(address account) external view returns (uint256);
    }

    #[sol(rpc)]
    interface IShieldedPool {
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
// Wallet state types (must match e2e.rs)
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize)]
struct WalletNote {
    label: String,
    amount: u64,
    pubkey: String,
    blinding: String,
    commitment: String,
    leaf_index: u32,
}

#[derive(Serialize, Deserialize)]
struct WalletState {
    spending_keys: Vec<WalletSpendingKey>,
    notes: Vec<WalletNote>,
}

#[derive(Serialize, Deserialize)]
struct WalletSpendingKey {
    label: String,
    spending_key: String,
    pubkey: String,
    #[serde(default)]
    viewing_pubkey: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn decode_hex_32(s: &str) -> Result<[u8; 32]> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    let bytes = hex::decode(s).context("invalid hex")?;
    ensure!(bytes.len() == 32, "expected 32 bytes, got {}", bytes.len());
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

/// Reconstruct a Note from wallet JSON fields
fn reconstruct_note(wn: &WalletNote) -> Result<Note> {
    Ok(Note {
        amount: wn.amount,
        pubkey: decode_hex_32(&wn.pubkey)?,
        blinding: decode_hex_32(&wn.blinding)?,
    })
}

/// Find the spending key whose pubkey matches the note's pubkey
fn find_spending_key<'a>(
    wallet: &'a WalletState,
    note_pubkey: &str,
) -> Option<&'a WalletSpendingKey> {
    wallet.spending_keys.iter().find(|sk| sk.pubkey == note_pubkey)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    sp1_sdk::utils::setup_logger();

    println!("\n=== Shielded Pool Exit — Withdraw All ===\n");

    // ── Load config ────────────────────────────────────────────────────
    let rpc_url = std::env::var("RPC_URL").context("RPC_URL not set")?;
    let private_key = std::env::var("PRIVATE_KEY").context("PRIVATE_KEY not set")?;
    let token_addr: Address = std::env::var("TOKEN_ADDRESS")
        .context("TOKEN_ADDRESS not set")?
        .parse()?;
    let pool_addr: Address = std::env::var("POOL_ADDRESS")
        .context("POOL_ADDRESS not set")?
        .parse()?;
    let tree_levels: usize = std::env::var("TREE_LEVELS")
        .unwrap_or_else(|_| "20".to_string())
        .parse()?;
    let deploy_block: u64 = std::env::var("DEPLOY_BLOCK")
        .unwrap_or_else(|_| "0".to_string())
        .parse()
        .context("DEPLOY_BLOCK must be a number")?;

    // Wallet file
    let default_wallet_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("fixtures/wallet.json");
    let wallet_path = std::env::var("WALLET_FILE")
        .map(std::path::PathBuf::from)
        .unwrap_or(default_wallet_path);

    // Recipient override
    let recipient_override = std::env::var("RECIPIENT_ADDRESS").ok();

    // ── Connect ────────────────────────────────────────────────────────
    let signer: PrivateKeySigner = private_key.parse()?;
    let wallet_address = signer.address();
    println!("Wallet:       {wallet_address}");

    let withdraw_to: Address = if let Some(ref addr) = recipient_override {
        addr.parse()?
    } else {
        wallet_address
    };
    println!("Withdraw to:  {withdraw_to}");

    let provider = ProviderBuilder::new()
        .wallet(signer)
        .connect_http(rpc_url.parse()?);

    let token = IERC20::new(token_addr, &provider);
    let pool = IShieldedPool::new(pool_addr, &provider);

    // ── Load wallet state ──────────────────────────────────────────────
    println!("Wallet file:  {}\n", wallet_path.display());
    let wallet_json = std::fs::read_to_string(&wallet_path)
        .context(format!("Failed to read wallet file: {}", wallet_path.display()))?;
    let wallet: WalletState = serde_json::from_str(&wallet_json)?;

    println!("Found {} spending keys, {} notes", wallet.spending_keys.len(), wallet.notes.len());

    // ── Build Merkle tree from on-chain events ─────────────────────────
    println!("\n[1] Building Merkle tree from all on-chain events...");
    let mut tree = IncrementalMerkleTree::new(tree_levels);

    // Replay ALL commitment insertions in order:
    //   Deposit:         1 commitment  (from event)
    //   PrivateTransfer: 2 commitments (from event)
    //   Withdrawal:      0 or 1 commitment (change, from tx calldata)

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
                // Calldata: 4-byte selector + ABI-encoded (bytes, bytes, bytes)
                // Word 0: offset to proof, Word 1: offset to publicValues, Word 2: offset to encryptedChange
                // At each offset: first 32 bytes = length, then data
                if input.len() > 4 + 32 * 3 {
                    let data = &input[4..];
                    let pv_offset = u64::from_be_bytes(data[32 + 24..32 + 32].try_into().unwrap()) as usize;
                    if pv_offset + 32 <= data.len() {
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

    // Verify root
    let on_chain_root: FixedBytes<32> = pool.getLastRoot().call().await?;
    let on_chain_leaves: u32 = pool.getLeafCount().call().await?;
    println!("    On-chain leaves: {on_chain_leaves}, local leaves: {}", tree.leaves.len());

    if FixedBytes::from(tree.get_root()) == on_chain_root {
        println!("    Root verified ✓");
    } else {
        println!("    ⚠ Root mismatch — tree may be incomplete.");
        println!("    Local root:    0x{}", hex::encode(tree.get_root()));
        println!("    On-chain root: {on_chain_root}");
        println!("    Continuing anyway — will use isKnownRoot() for each withdrawal...");
    }

    // ── Find unspent notes ─────────────────────────────────────────────
    println!("\n[2] Checking which notes are unspent...");

    struct UnspentNote {
        note: Note,
        spending_key: [u8; 32],
        leaf_index: u32,
        label: String,
    }

    let mut unspent: Vec<UnspentNote> = Vec::new();
    let mut total_unspent: u64 = 0;

    for wn in &wallet.notes {
        let note = reconstruct_note(wn)?;
        let commitment = note.commitment();

        // Verify the stored commitment matches
        let stored_comm = decode_hex_32(&wn.commitment)?;
        ensure!(
            commitment == stored_comm,
            "Commitment mismatch for note '{}': computed={} stored={}",
            wn.label,
            hex::encode(commitment),
            wn.commitment
        );

        // Find the spending key for this note
        let sk_entry = find_spending_key(&wallet, &wn.pubkey);
        let sk_entry = match sk_entry {
            Some(sk) => sk,
            None => {
                println!("    {} — no spending key (skip)", wn.label);
                continue;
            }
        };
        let sk = decode_hex_32(&sk_entry.spending_key)?;

        // Check if nullifier is already spent
        let nullifier = compute_nullifier(&commitment, &sk);
        let is_spent: bool = pool.isSpent(FixedBytes::from(nullifier)).call().await?;

        if is_spent {
            println!(
                "    {} — {} USDT — SPENT",
                wn.label,
                wn.amount as f64 / 1e6
            );
        } else {
            println!(
                "    {} — {} USDT — UNSPENT ✓",
                wn.label,
                wn.amount as f64 / 1e6
            );
            total_unspent += wn.amount;
            unspent.push(UnspentNote {
                note,
                spending_key: sk,
                leaf_index: wn.leaf_index,
                label: wn.label.clone(),
            });
        }
    }

    if unspent.is_empty() {
        println!("\nNo unspent notes found. Nothing to withdraw.");
        return Ok(());
    }

    println!(
        "\nFound {} unspent note(s) totalling {} USDT",
        unspent.len(),
        total_unspent as f64 / 1e6
    );

    // ── Withdraw each unspent note ─────────────────────────────────────
    let sp1_client = ProverClient::from_env();
    let recipient_bytes: [u8; 20] = withdraw_to.0 .0;

    let balance_before: U256 = token.balanceOf(withdraw_to).call().await?;
    println!("Balance before: {balance_before}\n");

    for (i, un) in unspent.iter().enumerate() {
        println!(
            "[{}] Withdrawing '{}' — {} USDT (leaf {})",
            i + 3,
            un.label,
            un.note.amount as f64 / 1e6,
            un.leaf_index,
        );

        // Build Merkle proof
        let root = tree.get_root();

        // Verify root is known on-chain (use recent root)
        let root_ok: bool = pool.isKnownRoot(FixedBytes::from(root)).call().await?;
        if !root_ok {
            println!("    ⚠ Current local root not recognized on-chain. Skipping this note.");
            println!("    Root: 0x{}", hex::encode(root));
            continue;
        }

        let proof = tree.get_proof(un.leaf_index);

        let withdraw_inputs = WithdrawPrivateInputs {
            input_note: un.note.clone(),
            spending_key: un.spending_key,
            merkle_proof: proof,
            root,
            recipient: recipient_bytes,
            withdraw_amount: un.note.amount, // full withdrawal, no change
            change_note: None,
        };

        // Generate proof
        println!("    Generating Groth16 proof...");
        let mut stdin = SP1Stdin::new();
        stdin.write(&withdraw_inputs);

        let (pk, _vk) = sp1_client.setup(WITHDRAW_ELF);
        let proof = sp1_client.prove(&pk, &stdin).groth16().run()?;

        let proof_bytes = proof.bytes();
        let public_values = proof.public_values.to_vec();
        println!(
            "    Proof: {} bytes, Public values: {} bytes",
            proof_bytes.len(),
            public_values.len()
        );

        // Submit on-chain
        println!("    Submitting withdraw tx...");
        let tx = pool
            .withdraw(
                Bytes::from(proof_bytes),
                Bytes::from(public_values),
                Bytes::new(),
            )
            .send()
            .await?;
        let receipt = tx.get_receipt().await?;
        println!("    ✓ Tx: {}", receipt.transaction_hash);
    }

    // ── Final balance ──────────────────────────────────────────────────
    let balance_after: U256 = token.balanceOf(withdraw_to).call().await?;
    println!("\n=== Exit Complete ===");
    println!("Balance before: {balance_before}");
    println!("Balance after:  {balance_after}");
    println!("Recovered:      {} USDT\n", total_unspent as f64 / 1e6);

    Ok(())
}

//! SP1 Proof Generation CLI for the Shielded Pool.
//!
//! Subcommands:
//!   transfer  - Generate a transfer proof (2-in-2-out)
//!   withdraw  - Generate a withdraw proof
//!   vkeys     - Print verification keys for contract deployment
//!   execute   - Execute a program without proof generation (for testing)

use anyhow::Result;
use clap::{Parser, Subcommand};
use sp1_sdk::{include_elf, HashableKey, ProverClient, SP1Stdin};
use std::fs;

pub const TRANSFER_ELF: &[u8] = include_elf!("transfer-program");
pub const WITHDRAW_ELF: &[u8] = include_elf!("withdraw-program");

// Type alias: ProverClient::from_env() returns EnvProver
type Client = sp1_sdk::EnvProver;

#[derive(Parser)]
#[command(name = "shielded-pool")]
#[command(about = "SP1 proof generation for the Plasma Shielded Pool")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate a transfer proof (2-in-2-out private transfer)
    Transfer {
        /// Path to JSON file with TransferPrivateInputs
        #[arg(long)]
        input: String,
        /// Path to write proof output JSON
        #[arg(long)]
        output: String,
        /// Just execute without generating a real proof (fast, for testing)
        #[arg(long, default_value = "false")]
        execute_only: bool,
    },
    /// Generate a withdraw proof
    Withdraw {
        /// Path to JSON file with WithdrawPrivateInputs
        #[arg(long)]
        input: String,
        /// Path to write proof output JSON
        #[arg(long)]
        output: String,
        /// Just execute without generating a real proof (fast, for testing)
        #[arg(long, default_value = "false")]
        execute_only: bool,
    },
    /// Print the verification keys (for deploying contracts)
    Vkeys,
}

#[derive(serde::Serialize)]
struct ProofOutput {
    /// Hex-encoded Groth16 proof bytes (for on-chain verification)
    proof: String,
    /// Hex-encoded public values (ABI-encoded, passed to Solidity)
    public_values: String,
    /// Hex-encoded verification key (bytes32)
    vkey: String,
}

fn main() -> Result<()> {
    sp1_sdk::utils::setup_logger();
    let cli = Cli::parse();
    let client = ProverClient::from_env();

    match cli.command {
        Commands::Transfer {
            input,
            output,
            execute_only,
        } => {
            generate_proof(
                &client,
                TRANSFER_ELF,
                "transfer",
                &input,
                &output,
                execute_only,
            )?;
        }
        Commands::Withdraw {
            input,
            output,
            execute_only,
        } => {
            generate_proof(
                &client,
                WITHDRAW_ELF,
                "withdraw",
                &input,
                &output,
                execute_only,
            )?;
        }
        Commands::Vkeys => {
            let (_, transfer_vk) = client.setup(TRANSFER_ELF);
            let (_, withdraw_vk) = client.setup(WITHDRAW_ELF);
            println!("TRANSFER_VKEY: 0x{}", transfer_vk.bytes32());
            println!("WITHDRAW_VKEY: 0x{}", withdraw_vk.bytes32());
        }
    }

    Ok(())
}

fn generate_proof(
    client: &Client,
    elf: &[u8],
    name: &str,
    input_path: &str,
    output_path: &str,
    execute_only: bool,
) -> Result<()> {
    // 1. Read inputs from JSON file
    let input_json = fs::read_to_string(input_path)?;

    // 2. Prepare SP1 stdin — write raw JSON bytes, the guest will deserialize
    let mut stdin = SP1Stdin::new();

    // Depending on the circuit, deserialize the appropriate type and write it
    match name {
        "transfer" => {
            let inputs: shielded_pool_lib::TransferPrivateInputs =
                serde_json::from_str(&input_json)?;
            stdin.write(&inputs);
        }
        "withdraw" => {
            let inputs: shielded_pool_lib::WithdrawPrivateInputs =
                serde_json::from_str(&input_json)?;
            stdin.write(&inputs);
        }
        _ => unreachable!(),
    }

    if execute_only {
        // Execute without proof — fast sanity check
        let (public_values, report) = client.execute(elf, &stdin).run()?;
        println!(
            "[{}] Execution successful. Cycles: {}",
            name,
            report.total_instruction_count()
        );
        println!(
            "[{}] Public values size: {} bytes",
            name,
            public_values.as_slice().len()
        );
        return Ok(());
    }

    // 3. Setup proving/verification keys
    let (pk, vk) = client.setup(elf);

    // 4. Generate Groth16 proof for on-chain verification
    println!("[{}] Generating Groth16 proof...", name);
    let proof = client.prove(&pk, &stdin).groth16().run()?;

    // 5. Verify locally
    client.verify(&proof, &vk)?;
    println!("[{}] Proof verified locally", name);

    // 6. Extract proof bytes and public values
    let proof_bytes = proof.bytes();
    let public_values = proof.public_values.to_vec();
    println!(
        "[{}] Proof size: {} bytes, Public values size: {} bytes",
        name,
        proof_bytes.len(),
        public_values.len()
    );

    // 7. Write output as JSON
    let output = ProofOutput {
        proof: hex::encode(&proof_bytes),
        public_values: hex::encode(&public_values),
        vkey: vk.bytes32(),
    };
    fs::write(output_path, serde_json::to_string_pretty(&output)?)?;
    println!("[{}] Proof written to {}", name, output_path);

    Ok(())
}

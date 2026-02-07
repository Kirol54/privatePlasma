/**
 * Wraps the Rust SP1 proof generation binary.
 *
 * Invokes the shielded-pool-script binary via subprocess.
 * For production, set SP1_PROVER=network to use the Succinct Prover Network.
 */

import { execFile } from "child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import { hexToBytes, bytesToHex } from "./crypto.js";
import type {
  TransferRequest,
  WithdrawRequest,
  ProofResult,
  MerkleProofStep,
} from "./types.js";

const execFileAsync = promisify(execFile);

export interface ProverOptions {
  /** Path to the shielded-pool-script binary. Default: auto-detect via cargo. */
  binaryPath?: string;
  /** Working directory for the Rust project. */
  projectDir?: string;
  /** If true, only execute without generating a real proof (fast, for testing). */
  executeOnly?: boolean;
}

export class Prover {
  private binaryPath?: string;
  private projectDir: string;
  private executeOnly: boolean;

  constructor(options: ProverOptions = {}) {
    this.binaryPath = options.binaryPath;
    this.projectDir = options.projectDir ?? process.cwd();
    this.executeOnly = options.executeOnly ?? false;
  }

  /** Generate a transfer proof. */
  async proveTransfer(request: TransferRequest): Promise<ProofResult> {
    const input = serializeTransferInputs(request);
    return this.runProver("transfer", input);
  }

  /** Generate a withdraw proof. */
  async proveWithdraw(request: WithdrawRequest): Promise<ProofResult> {
    const input = serializeWithdrawInputs(request);
    return this.runProver("withdraw", input);
  }

  private async runProver(
    circuit: string,
    inputJson: string
  ): Promise<ProofResult> {
    const tempDir = mkdtempSync(join(tmpdir(), "shielded-pool-"));
    const inputPath = join(tempDir, "input.json");
    const outputPath = join(tempDir, "output.json");

    try {
      writeFileSync(inputPath, inputJson);

      const args = [
        "run",
        "--release",
        "-p",
        "shielded-pool-script",
        "--",
        circuit,
        "--input",
        inputPath,
        "--output",
        outputPath,
      ];
      if (this.executeOnly) {
        args.push("--execute-only");
      }

      await execFileAsync("cargo", args, {
        cwd: this.projectDir,
        timeout: 600_000, // 10 minute timeout for proof generation
      });

      if (this.executeOnly) {
        // In execute-only mode, there's no output file
        return {
          proof: new Uint8Array(0),
          publicValues: new Uint8Array(0),
          vkey: "",
        };
      }

      const output = JSON.parse(readFileSync(outputPath, "utf-8"));
      return {
        proof: hexToBytes(output.proof),
        publicValues: hexToBytes(output.public_values),
        vkey: output.vkey,
      };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

// ============================================================================
//                    INPUT SERIALIZATION
// ============================================================================

function serializeMerkleProof(
  proof: MerkleProofStep[]
): Array<{ is_left: boolean; sibling: number[] }> {
  return proof.map((step) => ({
    is_left: step.is_left,
    sibling: Array.from(step.sibling),
  }));
}

function serializeTransferInputs(request: TransferRequest): string {
  return JSON.stringify({
    input_notes: request.inputNotes.map((n) => ({
      amount: Number(n.amount),
      pubkey: Array.from(n.pubkey),
      blinding: Array.from(n.blinding),
    })),
    spending_keys: request.inputSpendingKeys.map((k) => Array.from(k)),
    merkle_proofs: request.inputMerkleProofs.map(serializeMerkleProof),
    output_notes: request.outputNotes.map((n) => ({
      amount: Number(n.amount),
      pubkey: Array.from(n.pubkey),
      blinding: Array.from(n.blinding),
    })),
    root: Array.from(request.root),
  });
}

function serializeWithdrawInputs(request: WithdrawRequest): string {
  return JSON.stringify({
    input_note: {
      amount: Number(request.inputNote.amount),
      pubkey: Array.from(request.inputNote.pubkey),
      blinding: Array.from(request.inputNote.blinding),
    },
    spending_key: Array.from(request.spendingKey),
    merkle_proof: serializeMerkleProof(request.merkleProof),
    root: Array.from(request.root),
    recipient: Array.from(hexToBytes(request.recipient)),
    withdraw_amount: Number(request.withdrawAmount),
    change_note: request.changeNote
      ? {
          amount: Number(request.changeNote.amount),
          pubkey: Array.from(request.changeNote.pubkey),
          blinding: Array.from(request.changeNote.blinding),
        }
      : null,
  });
}

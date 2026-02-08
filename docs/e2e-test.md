# End-to-End Test Script

Full lifecycle test against a deployed ShieldedPool contract: **deposit → private transfer → withdraw**, with real Groth16 proofs generated via the Succinct Prover Network.

## What It Does

The E2E script (`script/src/bin/e2e.rs`) runs 12 steps:

| Step | Action                                                                                   | On-chain? |
| ---- | ---------------------------------------------------------------------------------------- | --------- |
| 0    | Load config from `.env`                                                                  | —         |
| 1    | Connect wallet + provider                                                                | —         |
| 2    | Generate sender & recipient spending keys + viewing keypairs                             | —         |
| 3    | Create two deposit notes (A + B)                                                         | —         |
| 4    | ERC20 approve + two `deposit()` calls with encrypted note data                           | ✅        |
| 5    | Replay all events to build local Merkle tree, verify root matches on-chain               | ✅ (read) |
| 6    | Build transfer inputs (2-in-2-out, split to recipient + change)                          | —         |
| 7    | Generate Groth16 transfer proof via Succinct Network                                     | —         |
| 8    | Submit `privateTransfer()` with encrypted output notes (recipient + sender viewing keys) | ✅        |
| 9    | Build withdraw inputs (recipient withdraws part of their note)                           | —         |
| 10   | Generate Groth16 withdraw proof via Succinct Network                                     | —         |
| 11   | Submit `withdraw()` with encrypted change note                                           | ✅        |
| 12   | Verify: nullifiers spent, leaf count, token balance                                      | ✅ (read) |

## Prerequisites

1. **ShieldedPool deployed** — run `make deploy-plasma` first (see README)
2. **Funded wallet** — the deployer wallet needs USDT for deposits + gas
3. **Succinct API key** — sign up at [network.succinct.xyz](https://network.succinct.xyz)

## Configuration

All config comes from `.env`. Copy the example and fill in your values:

```bash
cp .env.example .env
```

### Required

| Variable              | Description                     |
| --------------------- | ------------------------------- |
| `RPC_URL`             | Plasma RPC endpoint             |
| `PRIVATE_KEY`         | Funded wallet private key       |
| `TOKEN_ADDRESS`       | ERC20 token (USDT) address      |
| `POOL_ADDRESS`        | Deployed ShieldedPool address   |
| `NETWORK_PRIVATE_KEY` | Succinct Prover Network API key |

### Optional

| Variable                   | Default      | Description                                                               |
| -------------------------- | ------------ | ------------------------------------------------------------------------- |
| `DEPLOY_BLOCK`             | `0`          | Block the ShieldedPool was deployed at (auto-set by `make deploy-plasma`) |
| `TREE_LEVELS`              | `20`         | Merkle tree depth (must match deployment)                                 |
| `DEPOSIT_A`                | `0.7`        | First deposit amount in USDT                                              |
| `DEPOSIT_B`                | `0.3`        | Second deposit amount in USDT                                             |
| `TRANSFER_AMOUNT`          | `0.5`        | Amount sent to recipient in USDT                                          |
| `WITHDRAW_AMOUNT`          | `0.3`        | Amount recipient withdraws in USDT                                        |
| `RECIPIENT_PUBKEY`         | _(random)_   | 32-byte hex spending key for recipient                                    |
| `RECIPIENT_VIEWING_PUBKEY` | _(derived)_  | 32-byte hex viewing public key for recipient (x25519)                     |

Amounts use human-readable USDT values (e.g., `0.7` = 700,000 raw units with 6 decimals).

### Amount Constraints

The script validates:

- `TRANSFER_AMOUNT ≤ DEPOSIT_A + DEPOSIT_B`
- `WITHDRAW_AMOUNT ≤ TRANSFER_AMOUNT`

The remaining balances become change notes:

- **Transfer change** = `(DEPOSIT_A + DEPOSIT_B) - TRANSFER_AMOUNT` → returned to sender
- **Withdraw change** = `TRANSFER_AMOUNT - WITHDRAW_AMOUNT` → stays in pool for recipient

If `WITHDRAW_AMOUNT == TRANSFER_AMOUNT`, no change note is created (full withdrawal).

## Running

```bash
# From project root:
make e2e
```

This runs:

```bash
SP1_PROVER=network NETWORK_PRIVATE_KEY=$NETWORK_PRIVATE_KEY \
  cargo run --release -p shielded-pool-script --bin e2e
```

Proof generation takes **2–5 minutes per proof** (two proofs total: transfer + withdraw). The script logs each step with transaction hashes so you can track progress.

### Example Output

```
=== Shielded Pool E2E Test ===

RPC:              https://testnet-rpc.plasma.to
Pool:             0x1234...
Token:            0x5678...
Tree:             20 levels
Deposit A:        0.7 USDT
Deposit B:        0.3 USDT
Transfer amount:  0.5 USDT
Withdraw amount:  0.3 USDT

[1] Wallet: 0xAbCd...
[2] Sender pubkey:    0xaabb...
    Recipient key:    0xccdd... (random)
[3] Notes: 0.7 + 0.3 = 1 USDT
[4] Approving token spend...
    Approve tx: 0x...
    Depositing 0.7 USDT...
    Deposit A tx: 0x...
    Depositing 0.3 USDT...
    Deposit B tx: 0x...
[5] Building local Merkle tree...
    Found 2 total deposit events
    Root verified: 0xaabb...
    Our leaves: A=0, B=1
[6] Building transfer inputs...
    0.5 USDT → recipient, 0.5 USDT → change
[7] Generating transfer Groth16 proof (this may take a few minutes)...
    Transfer proof verified locally
    Proof: 260 bytes, Public values: 160 bytes
[8] Submitting private transfer on-chain...
    Transfer tx: 0x...
    Output leaves: 2, 3
    Root verified after transfer
[9] Building withdraw inputs...
    Withdrawing 0.3 USDT, 0.2 USDT change
[10] Generating withdraw Groth16 proof...
     Withdraw proof verified locally
[11] Submitting withdraw on-chain...
     Withdraw tx: 0x...
[12] Verifying final state...
     Transfer nullifiers spent: OK
     Withdraw nullifier spent: OK
     On-chain leaf count: 5 (expected 5)
     Wallet token balance: ...

=== E2E Test Passed! ===
```

## Recipient Keys

### Spending Key (`RECIPIENT_PUBKEY`)

The `RECIPIENT_PUBKEY` env var is treated as a **spending key** (not a public key). The script derives the actual shielded public key from it using `derive_pubkey(spending_key) = keccak256(spending_key)`.

This is because the E2E script needs to know the recipient's spending key in order to build the withdraw proof (proving ownership of the transferred note). In a real application, the sender would only know the recipient's public key, and the recipient would generate their own withdraw proof using their spending key.

**If `RECIPIENT_PUBKEY` is not set**, a random 32-byte key is generated for the test.

### Viewing Key (`RECIPIENT_VIEWING_PUBKEY`)

The `RECIPIENT_VIEWING_PUBKEY` env var is the recipient's **x25519 viewing public key**. This key is used to encrypt the transferred note so the recipient can detect it by scanning `EncryptedNote` events on-chain.

**If `RECIPIENT_VIEWING_PUBKEY` is not set**, it is derived from the recipient's spending key: `viewing_secret = keccak256("viewing" || spending_key)`, then the x25519 public key is computed from that.

To use the frontend's keys with the e2e script:
1. Open the frontend with the recipient's MetaMask account
2. Create a shielded wallet
3. Copy the **Shielded Public Key** from the Dashboard — but note this is a *derived public key*, not the spending key. The e2e script needs the spending key to generate the withdraw proof.
4. Copy the **Viewing Public Key** from the Dashboard — set this as `RECIPIENT_VIEWING_PUBKEY`

In practice, the e2e script generates its own keys. Use `RECIPIENT_VIEWING_PUBKEY` when you want the frontend to detect notes created by the e2e script.

### Generating keys manually

```bash
# Generate a random 32-byte hex key:
openssl rand -hex 32
```

## How It Works Internally

### Merkle Tree Mirroring

The script maintains a local copy of the on-chain Merkle tree by replaying all events (`Deposit`, `PrivateTransfer`, `Withdrawal`) starting from `DEPLOY_BLOCK` (auto-saved to `.env` by `make deploy-plasma`). After inserting all commitments in order, it asserts the local root matches `getLastRoot()`. This ensures Merkle proofs generated locally will be accepted on-chain.

After each operation (transfer, withdraw), the script inserts the new output commitments into the local tree and re-verifies the root.

### Note Encryption

All notes are encrypted using NaCl box (x25519 + XSalsa20-Poly1305) before being submitted on-chain:

- **Deposits**: encrypted with the sender's viewing public key
- **Transfers**: output note 0 encrypted with recipient's viewing key, output note 1 (change) encrypted with sender's viewing key
- **Withdrawals**: change note encrypted with the withdrawer's viewing key

The encrypted data is emitted via `EncryptedNote` events. The frontend scans these events, attempts decryption with the user's viewing secret key, and adds successfully decrypted notes to the wallet. This is how users detect incoming private transfers.

### Proof Generation Flow

```
TransferPrivateInputs / WithdrawPrivateInputs
    ↓
SP1Stdin::write(&inputs)       ← bincode serialization
    ↓
ProverClient::from_env()       ← picks SP1_PROVER=network
    ↓
client.prove(&pk, &stdin)
       .groth16()
       .run()                  ← sends to Succinct Network, waits
    ↓
client.verify(&proof, &vk)    ← local sanity check
    ↓
proof.bytes()                  ← ~260 bytes, ready for Solidity
proof.public_values.to_vec()   ← 160 bytes ABI-encoded
```

### Contract Bindings

The script uses alloy's `sol!` macro for inline contract bindings — no ABI files needed:

```rust
sol! {
    #[sol(rpc)]
    interface IShieldedPool {
        function deposit(bytes32 commitment, uint256 amount, bytes calldata encryptedData) external;
        function privateTransfer(bytes calldata proof, bytes calldata publicValues, ...) external;
        function withdraw(bytes calldata proof, bytes calldata publicValues, ...) external;
        // ...
    }
}
```

## Troubleshooting

| Problem                        | Fix                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `Root mismatch!`               | Your local tree diverged from on-chain state. Check that `DEPLOY_BLOCK` in `.env` matches the actual deployment block. |
| `NETWORK_PRIVATE_KEY not set`  | Add your Succinct API key to `.env`                                                                                    |
| `POOL_ADDRESS not set`         | Deploy the contract first (`make deploy-plasma`) and put the address in `.env`                                         |
| Proof generation hangs         | Check your Succinct dashboard at [network.succinct.xyz](https://network.succinct.xyz) for proof status                 |
| `Transfer nullifier not spent` | The transfer proof was rejected on-chain. Check the transaction receipt for revert reason.                             |

# Frontend Integration Guide

How to run and extend the Plasma Shielded Pool frontend application.

## Architecture

The frontend consists of two components:

1. **React Frontend** (`frontend/`) — Vite + React 18 + TypeScript, dark green theme
2. **Express Proxy** (`proxy/`) — bridges the browser to the Rust SP1 prover binary

```
+-------------------+       +-------------------+       +------------------+
|                   |       |                   |       |                  |
|   React Frontend  | ----> |  Express Proxy    | ----> |  Rust SP1 Prover |
|   (Vite + React)  |       |  (proxy/)         |       |  (script/)       |
|                   |       |                   |       |                  |
+-------------------+       +-------------------+       +------------------+
        |                                                       |
        v                                                       v
   Browser Wallet                                    Succinct Prover Network
   (MetaMask)                                        (Groth16 proof generation)
        |
        v
   ShieldedPool Smart Contract (on Plasma)
```

The proxy receives proof requests from the browser, invokes the Rust SP1 prover binary as a subprocess, and returns the proof. This keeps the `NETWORK_PRIVATE_KEY` (Succinct API key) on the server side.

## Quick Start

```bash
# 1. Start the proxy server (runs on port 3001)
cd proxy && npm install && npm run dev

# 2. Start the frontend dev server (runs on port 5173)
cd frontend && npm install && npm run dev
```

Configure `frontend/.env` with your deployed contract addresses:

```env
VITE_POOL_ADDRESS=0x...
VITE_TOKEN_ADDRESS=0x...
VITE_RPC_URL=https://testnet-rpc.plasma.to
VITE_PROXY_URL=http://localhost:3001
VITE_DEPLOY_BLOCK=0
VITE_TREE_LEVELS=20
```

## Key Concepts

### Two Types of Keys

Each shielded wallet has two key pairs:

| Key | Derivation | Purpose |
|-----|-----------|---------|
| **Spending key** (secret) | Random 32 bytes | Controls all funds — can spend notes |
| **Shielded public key** | `keccak256(spending_key)` | Used in note commitments to assign ownership |
| **Viewing secret key** | `keccak256("viewing" \|\| spending_key)` | Decrypts incoming notes |
| **Viewing public key** | x25519 pubkey from viewing secret | Shared with senders for note encryption |

To receive a private transfer, share **both** public keys:
1. **Shielded Public Key** — used in the ZK circuit to create a note owned by you
2. **Viewing Public Key** — used to NaCl-box encrypt the note data so you can detect it

### Note Encryption & Scanning

When a private transfer is submitted, the sender encrypts each output note:
- Output note 0 (recipient's note) encrypted with **recipient's viewing public key**
- Output note 1 (sender's change) encrypted with **sender's viewing public key**

The encrypted data is emitted via `EncryptedNote(bytes32 commitment, bytes encryptedData)` events.

During `sync()`, the frontend:
1. Fetches all `EncryptedNote` events
2. Tries to decrypt each one with the user's viewing secret key
3. If decryption succeeds, verifies the commitment matches
4. Adds the note to the wallet

### 2-in-2-out Transfer Circuit

The transfer ZK circuit requires exactly **2 input notes** and produces **2 output notes**. This means:
- Users need at least 2 spendable notes to do a private transfer
- If they only have 1 note, they should make another deposit first (or use withdraw instead)
- The UI shows a warning when the user has fewer than 2 notes

### Wallet Import/Export

The frontend supports wallet portability:

- **Export**: Downloads a JSON file containing the spending key and all tracked notes
- **Import from file**: Upload a previously exported wallet JSON file
- **Import from key**: Paste a 32-byte hex spending key directly

The exported JSON uses the same format as `localStorage` persistence (via `BrowserShieldedWallet.toJSON()`).

## Proof Generation & Trust Model

### How it works

1. User initiates a transfer or withdrawal in the UI
2. The browser builds proof inputs (notes, Merkle proofs, spending key)
3. Inputs are sent to the Express proxy via HTTP POST
4. The proxy invokes the Rust SP1 prover binary as a subprocess
5. The prover sends inputs to the Succinct Prover Network for Groth16 proving
6. The proof comes back through the proxy to the browser
7. MetaMask pops up — the user signs the on-chain transaction

### Privacy tradeoff

The Succinct Prover Network can see raw inputs during proof generation. The resulting proof reveals nothing, but the proving service itself is trusted.

| Approach | Privacy | Performance | Practical? |
|----------|---------|-------------|------------|
| **Succinct Prover Network** (our approach) | Trust Succinct's secure enclaves | ~2-5 min | Yes |
| Client-side local proving | Fully trustless | ~16GB RAM, minutes | Not in a browser |

## Frontend Components

### Dashboard (`Dashboard.tsx`)

Displays:
- Shielded and public token balances
- Shielded Public Key (click to copy)
- Viewing Public Key (click to copy)
- Spendable note count and tree leaf count
- Sync, Export, and Reset buttons

On first load (no wallet), shows Create/Import options.

### DepositForm (`DepositForm.tsx`)

- Amount input in USDT
- Handles ERC20 approve + deposit in sequence
- Note is encrypted with sender's viewing key for self-recovery

### TransferForm (`TransferForm.tsx`)

- Requires **Recipient Shielded Public Key** and **Recipient Viewing Public Key**
- Amount input in USDT
- Shows warning banner if user has < 2 spendable notes
- Encrypts recipient's note with their viewing key, change note with sender's viewing key

### WithdrawForm (`WithdrawForm.tsx`)

- Recipient Ethereum address and amount
- Change note encrypted with sender's viewing key

### NotesList (`NotesList.tsx`)

- Table of all notes (active and spent)
- Shows amount, leaf index, commitment prefix, and status badge

## State Management

### ShieldedContext (`context/ShieldedContext.tsx`)

React context providing:
- `shieldedWallet` — `BrowserShieldedWallet` instance
- `poolClient` — `BrowserPoolClient` instance
- Balance, notes, tree state
- Actions: `initWallet`, `importWallet`, `exportWallet`, `resetWallet`, `sync`, `deposit`, `privateTransfer`, `withdraw`

### Persistence

Wallet state is persisted to `localStorage` under key `shielded-pool-wallet`. On page load:
1. Wallet is restored from localStorage (spending key + notes + spent nullifiers)
2. On first sync, the Merkle tree is rebuilt from on-chain events
3. `EncryptedNote` events are scanned for incoming notes
4. On-chain nullifier spent status is checked

## Deployment Checklist

1. Deploy contracts: `make deploy-plasma`
2. Note the deployed `ShieldedPool` address and set in `frontend/.env`
3. Set `NETWORK_PRIVATE_KEY` in `proxy/.env` (Succinct API key)
4. Start proxy: `cd proxy && npm run dev`
5. Start frontend: `cd frontend && npm run dev`
6. Test full flow: deposit (x2) → transfer → recipient sync → withdraw

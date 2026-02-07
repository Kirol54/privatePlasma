# Frontend Integration Guide

How to build a user-facing application on top of the Plasma Shielded Pool.

## Overview

A frontend app interacts with the shielded pool through the TypeScript SDK (`@shielded-pool/client`). The SDK handles all cryptography, Merkle tree tracking, proof generation, and contract calls. The frontend only needs to manage UI, wallet connection, and call SDK methods.

Proofs are generated via the **Succinct Prover Network** — a decentralized proving service. No backend server needed.

```
+-------------------+       +-------------------+       +------------------+
|                   |       |                   |       |                  |
|   React / Next.js | ----> | @shielded-pool/   | ----> |  ShieldedPool    |
|   Frontend        |       |    client SDK     |       |  Smart Contract  |
|                   |       |                   |       |  (on Plasma)     |
+-------------------+       +-------------------+       +------------------+
        |                           |
        v                           v
   Browser Wallet           Succinct Prover Network
   (MetaMask)               (decentralized proving)
```

## Proof Generation & Trust Model

### Two different keys

The system uses two completely separate keys. Don't confuse them:

| Key | What it is | Who holds it |
|-----|-----------|-------------|
| **Wallet private key** (MetaMask) | Signs on-chain transactions | The user |
| **SP1 API key** (`SP1_PRIVATE_KEY`) | Authorizes proof generation on the Succinct Prover Network | The app developer |

The SP1 API key is like an Infura or Alchemy key — a service credential for the developer, not a user secret. Get one at [network.succinct.xyz](https://network.succinct.xyz).

### How proof generation works

1. User initiates a transfer or withdrawal in the UI
2. The SDK builds the proof inputs (notes, Merkle proofs, spending key) — **all in the browser**
3. The SDK sends these inputs to the Succinct Prover Network using the developer's SP1 API key
4. Succinct generates the Groth16 proof (~30-60 seconds)
5. The proof comes back to the browser
6. MetaMask pops up — the user signs the on-chain transaction containing the proof

The developer pays for proof generation (Succinct bills per proof). The user never sees or needs the SP1 key.

### Hackathon approach: embed the API key

For the hackathon, we embed the SP1 API key directly in the frontend code:

```typescript
const SP1_API_KEY = "your-succinct-api-key-here";

const client = new ShieldedPoolClient(wallet, {
  poolAddress: POOL_ADDRESS,
  tokenAddress: USDT_ADDRESS,
  signer,
  proverOptions: {
    proverNetwork: true,
    sp1ApiKey: SP1_API_KEY,
  },
});
```

This is fine for a hackathon demo. In production, you'd proxy proof requests through a lightweight backend to keep the API key secret and add rate limiting.

### Privacy tradeoff

When the SDK sends proof inputs to the Succinct Prover Network, the prover infrastructure **can see** the raw inputs (note amounts, spending keys, etc.) during proof generation. The resulting proof reveals nothing, but the proving service itself is trusted.

| Approach | Privacy | Performance | Practical? |
|----------|---------|-------------|------------|
| **Succinct Prover Network** (our approach) | Trust Succinct's secure enclaves | ~30-60s | Yes |
| Client-side local proving | Fully trustless | ~16GB RAM, minutes | Not in a browser |

For the hackathon, this is the right tradeoff. Succinct's provers run in secure enclaves and don't log inputs. In a production system, client-side proving would be ideal once hardware/WASM support matures.

Show a loading spinner in the UI during proof generation (~30-60 seconds).

## Spending Key Management

The spending key is the master secret. Whoever holds it can spend all notes. The recommended approach is to **derive it from a wallet signature** — deterministic, no separate backup:

```typescript
import { ShieldedWallet, keccak256 } from "@shielded-pool/client";
import { ethers } from "ethers";

async function createWalletFromSignature(signer: ethers.Signer): Promise<ShieldedWallet> {
  const message = "Shielded Pool Spending Key Derivation v1";
  const signature = await signer.signMessage(message);
  const spendingKey = keccak256(ethers.getBytes(signature));
  return new ShieldedWallet(spendingKey);
}
```

Same wallet always yields the same spending key. User reconnects with the same MetaMask account and gets the same shielded identity.

## State Persistence

The wallet tracks owned notes and spent nullifiers. Persist across sessions with `localStorage`:

```typescript
// Save
localStorage.setItem("shielded-wallet", wallet.toJSON());

// Restore (on page load, rebuild Merkle tree from on-chain events)
await client.sync();
```

The Merkle tree is always rebuilt from on-chain events via `client.sync()`. Only wallet note state needs persistence.

## Step-by-Step: Building the Frontend

### 1. Install the SDK

```bash
npm install @shielded-pool/client ethers
```

### 2. Initialize on page load

```typescript
import {
  ShieldedPoolClient,
  ShieldedWallet,
} from "@shielded-pool/client";
import { ethers } from "ethers";

const POOL_ADDRESS = "0x...";  // Deployed ShieldedPool address
const USDT_ADDRESS = "0x...";  // USDT on Plasma

async function init() {
  // Connect wallet (MetaMask, WalletConnect, etc.)
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  // Derive spending key from wallet signature
  const wallet = await createWalletFromSignature(signer);

  // Create pool client
  const client = new ShieldedPoolClient(wallet, {
    poolAddress: POOL_ADDRESS,
    tokenAddress: USDT_ADDRESS,
    signer,
  });

  // Sync Merkle tree from on-chain events
  await client.sync();

  return { client, wallet };
}
```

### 3. Show balance

```typescript
function showBalance(wallet: ShieldedWallet) {
  const balance = wallet.getBalance();
  // USDT has 6 decimals
  const formatted = (Number(balance) / 1_000_000).toFixed(2);
  return `$${formatted} USDT`;
}
```

### 4. Deposit flow

The user deposits public USDT into the shielded pool. After this, their tokens are private.

```typescript
async function handleDeposit(client: ShieldedPoolClient, amountUsdt: number) {
  const amount = BigInt(Math.round(amountUsdt * 1_000_000)); // 6 decimals

  // This will:
  // 1. Create a note commitment
  // 2. Approve USDT spending
  // 3. Call deposit() on the contract
  // 4. Track the note locally
  const receipt = await client.deposit(amount);

  return receipt.hash; // transaction hash
}
```

**UI flow:**
1. User enters amount (e.g., "100 USDT")
2. MetaMask popup: approve USDT spending
3. MetaMask popup: deposit transaction
4. Show confirmation with tx hash
5. Update displayed balance

### 5. Private transfer flow

The user sends USDT privately to another user. The recipient is identified by their **public key** (not their Ethereum address).

```typescript
import { hexToBytes } from "@shielded-pool/client";

async function handleTransfer(
  client: ShieldedPoolClient,
  recipientPubkeyHex: string,
  amountUsdt: number
) {
  const amount = BigInt(Math.round(amountUsdt * 1_000_000));
  const recipientPubkey = hexToBytes(recipientPubkeyHex);

  // This will:
  // 1. Select input notes from wallet
  // 2. Create output notes (recipient + change)
  // 3. Generate ZK proof via Succinct Prover Network (~30-60s)
  // 4. Submit transaction
  // 5. Update local state
  const receipt = await client.privateTransfer(recipientPubkey, amount);

  return receipt.hash;
}
```

**UI flow:**
1. User enters recipient's public key and amount
2. Show "Generating proof..." spinner (~30-60 seconds)
3. MetaMask popup: submit transfer transaction
4. Show confirmation
5. Update balance (deducted amount + any change returned)

### 6. Withdraw flow

The user converts private USDT back to public USDT, sent to any address.

```typescript
async function handleWithdraw(
  client: ShieldedPoolClient,
  recipientAddress: string,
  amountUsdt: number
) {
  const amount = BigInt(Math.round(amountUsdt * 1_000_000));

  // This will:
  // 1. Select an input note
  // 2. Create change note if partial withdrawal
  // 3. Generate ZK proof via Succinct Prover Network (~30-60s)
  // 4. Submit transaction (tokens sent to recipientAddress)
  // 5. Update local state
  const receipt = await client.withdraw(amount, recipientAddress);

  return receipt.hash;
}
```

### 7. Sharing your public key

For others to send you private transfers, they need your **public key** (not your address). Display it in the UI:

```typescript
import { bytesToHex } from "@shielded-pool/client";

function getMyPublicKey(wallet: ShieldedWallet): string {
  return bytesToHex(wallet.pubkey);
}
// Returns something like: "0x1a2b3c4d...64 hex chars"
```

Users can share this via QR code, clipboard copy, or messaging.

## Scanning for Incoming Notes

When someone sends you a private transfer, you need to scan for it. The SDK does this by:

1. Fetching encrypted note data from on-chain events
2. Attempting decryption with your viewing key
3. If decryption succeeds, the note belongs to you

```typescript
import { decryptNote, deriveViewingKeypair } from "@shielded-pool/client";

async function scanForMyNotes(
  client: ShieldedPoolClient,
  wallet: ShieldedWallet
) {
  const viewingKeypair = deriveViewingKeypair(wallet.getSpendingKey());
  const tree = client.getTree();

  for (let i = 0; i < tree.nextIndex; i++) {
    const encrypted = await pool.getEncryptedNote(i);
    if (encrypted.length === 0) continue;

    const note = decryptNote(encrypted, viewingKeypair.secretKey);
    if (note) {
      wallet.addNote(note, i);
    }
  }
}
```

## Example: Minimal React Component

```tsx
function ShieldedPool() {
  const [balance, setBalance] = useState("0.00");
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState<ShieldedPoolClient | null>(null);
  const [wallet, setWallet] = useState<ShieldedWallet | null>(null);

  async function connect() {
    const { client, wallet } = await init();
    setClient(client);
    setWallet(wallet);
    setBalance((Number(wallet.getBalance()) / 1e6).toFixed(2));
  }

  async function deposit(amount: number) {
    if (!client) return;
    setLoading(true);
    await client.deposit(BigInt(amount * 1e6));
    setBalance((Number(wallet!.getBalance()) / 1e6).toFixed(2));
    setLoading(false);
  }

  async function transfer(pubkey: string, amount: number) {
    if (!client) return;
    setLoading(true);
    await client.privateTransfer(hexToBytes(pubkey), BigInt(amount * 1e6));
    setBalance((Number(wallet!.getBalance()) / 1e6).toFixed(2));
    setLoading(false);
  }

  async function withdraw(address: string, amount: number) {
    if (!client) return;
    setLoading(true);
    await client.withdraw(BigInt(amount * 1e6), address);
    setBalance((Number(wallet!.getBalance()) / 1e6).toFixed(2));
    setLoading(false);
  }

  return (
    <div>
      {!client ? (
        <button onClick={connect}>Connect Wallet</button>
      ) : (
        <div>
          <p>Shielded Balance: ${balance} USDT</p>
          <p>My Public Key: {bytesToHex(wallet!.pubkey)}</p>
          {loading && <p>Generating proof...</p>}
          {/* Add forms for deposit, transfer, withdraw here */}
        </div>
      )}
    </div>
  );
}
```

## Deployment Checklist

1. Deploy contracts: `make deploy-plasma` (see project root Makefile)
2. Note the deployed `ShieldedPool` address from the output
3. Get an SP1 API key from [network.succinct.xyz](https://network.succinct.xyz)
4. Configure frontend with contract addresses and SP1 API key
5. Test the full flow: deposit, transfer, withdraw
6. Add loading states for proof generation (~30-60s)
7. Implement note scanning for incoming transfers
8. Add wallet state persistence (localStorage)

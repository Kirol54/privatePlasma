import { useState } from 'react';
import '../landing.css';

interface LandingPageProps {
  onLaunchApp: () => void;
}

/* ── tiny reusable sub-components ───────────────────────────────────── */

function FlowNode({ label, type }: { label: string; type: 'public' | 'shielded' | 'zk' | 'neutral' }) {
  return <div className={`flow-node flow-node--${type}`}>{label}</div>;
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flow-arrow-wrap">
      <div className="flow-arrow" />
      {label && <span className="flow-arrow-label">{label}</span>}
    </div>
  );
}

/* ── collapsible section ────────────────────────────────────────────── */

function Collapsible({ label, children, defaultOpen }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="collapsible">
      <button className="collapsible-trigger" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'} {label}</span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

/* ── architecture diagram row ───────────────────────────────────────── */

function ArchRow({ label, type, items }: { label: string; type: 'onchain' | 'offchain' | 'infra'; items: { name: string; desc: string }[] }) {
  return (
    <div className={`arch-row arch-row--${type}`}>
      <div className="arch-row-label">{label}</div>
      <div className="arch-row-items">
        {items.map((it, i) => (
          <div key={i} className="arch-item">
            <div className="arch-item-name">{it.name}</div>
            <div className="arch-item-desc">{it.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── detailed flow step ─────────────────────────────────────────────── */

function DetailedStep({ num, action, component, location, detail }: {
  num: number; action: string; component: string; location: 'on-chain' | 'off-chain' | 'browser' | 'proxy'; detail: string;
}) {
  return (
    <div className="df-step">
      <div className="df-num">{num}</div>
      <div className="df-content">
        <div className="df-action">{action}</div>
        <div className="df-meta">
          <span className={`df-loc df-loc--${location.replace(/-/g, '')}`}>{location}</span>
          <span className="df-comp">{component}</span>
        </div>
        <div className="df-detail">{detail}</div>
      </div>
    </div>
  );
}

/* ── main landing page ──────────────────────────────────────────────── */

export function LandingPage({ onLaunchApp }: LandingPageProps) {
  return (
    <div className="landing">
      <div className="landing-bg" />
      {/* ─── HERO ────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-badge">Built on Plasma</div>

        {/* Logo and Title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', marginBottom: '32px' }}>
          <img src="/logo.svg" alt="Plasma Confidential SP1" style={{ maxWidth: '600px', width: '100%', height: 'auto' }} />
        </div>

        <p className="hero-sub">
          Enterprise-grade private stablecoin transfers on Plasma using SP1 zero-knowledge proofs.
          Amounts, balances, and counterparties are hidden by default, with optional selective disclosure.
        </p>

        {/* animated mini flow */}
        <div className="hero-flow">
          <FlowNode label="Public Wallet" type="public" />
          <FlowArrow label="Deposit" />
          <FlowNode label="Shielded Pool" type="shielded" />
          <FlowArrow label="Transfer" />
          <FlowNode label="Recipient" type="shielded" />
          <FlowArrow label="Withdraw" />
          <FlowNode label="Public Wallet" type="public" />
        </div>

        <button className="btn-cta" onClick={onLaunchApp}>
          Launch App →
        </button>
      </section>

      {/* ─── THE PROBLEM ─────────────────────────────────────────────── */}
      <section className="section" id="problem">
        <h2 className="section-title">The Problem</h2>
        <p className="section-lead">
          Every standard USDT transfer on a public chain leaks business-critical data.
        </p>

        <div className="leak-grid">
          <div className="leak-card">
            <span className="leak-icon">💲</span>
            <h4>Pricing Exposed</h4>
            <p>Competitors see exactly what you charge each client.</p>
          </div>
          <div className="leak-card">
            <span className="leak-icon">💰</span>
            <h4>Salary Leaks</h4>
            <p>Anyone can reconstruct org charts and compensation.</p>
          </div>
          <div className="leak-card">
            <span className="leak-icon">🏦</span>
            <h4>Treasury Tracking</h4>
            <p>Your runway and fund movements are fully visible.</p>
          </div>
        </div>

        <p className="section-note">
          Enterprises and institutions need payment confidentiality — not full
          anonymity, but control over who sees what.
        </p>
      </section>

      {/* ─── THE SOLUTION ────────────────────────────────────────────── */}
      <section className="section" id="solution">
        <h2 className="section-title">The Solution</h2>
        <p className="section-lead">
          A shielded pool for USDT — confidential transfers with provable correctness.
        </p>

        <div className="solution-pillars">
          <div className="pillar">
            <div className="pillar-icon">🛡️</div>
            <h4>Shielded Pool</h4>
            <p>Funds enter a privacy-preserving pool on-chain. Balances and amounts are hidden.</p>
          </div>
          <div className="pillar">
            <div className="pillar-icon">🔐</div>
            <h4>ZK-Proven Transfers</h4>
            <p>Zero-knowledge proofs guarantee correctness without revealing amounts or parties.</p>
          </div>
          <div className="pillar">
            <div className="pillar-icon">👁️</div>
            <h4>Selective Disclosure</h4>
            <p>Viewing keys allow optional auditing — share payment details only when required.</p>
          </div>
        </div>
      </section>
      {/* ─── PAYMENT LIFECYCLE ───────────────────────────────────────── */}
      <section className="section" id="lifecycle">
        <h2 className="section-title">How It Works</h2>
        <p className="section-lead">
          Three simple steps — deposit, transfer, withdraw.
        </p>

        <div className="lifecycle">
          <div className="lc-step">
            <div className="lc-num">1</div>
            <div className="lc-body">
              <h4>Deposit</h4>
              <p>Send USDT from your wallet into the shielded pool. A cryptographic commitment is stored on-chain.</p>
              <div className="lc-tags">
                <span className="tag tag--public">Public</span>
                <span className="tag tag--info">No ZK proof needed</span>
              </div>
            </div>
          </div>

          <div className="lc-connector" />

          <div className="lc-step">
            <div className="lc-num">2</div>
            <div className="lc-body">
              <h4>Private Transfer</h4>
              <p>Move funds inside the pool. A ZK proof ensures correctness without revealing sender, recipient, or amount.</p>
              <div className="lc-tags">
                <span className="tag tag--hidden">Amount hidden</span>
                <span className="tag tag--hidden">Parties hidden</span>
                <span className="tag tag--zk">Proven via ZK</span>
              </div>
            </div>
          </div>

          <div className="lc-connector" />

          <div className="lc-step">
            <div className="lc-num">3</div>
            <div className="lc-body">
              <h4>Withdraw</h4>
              <p>Convert shielded notes back to USDT, sent to any public address.</p>
              <div className="lc-tags">
                <span className="tag tag--public">Public</span>
                <span className="tag tag--zk">Proven via ZK</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── USE CASES (compact) ──────────────────────────────────────── */}
      <section className="section" id="use-cases">
        <h2 className="section-title">Use Cases</h2>
        <div className="use-cases-compact">
          <div className="uc-compact-card">
            <span className="uc-compact-icon">📄</span>
            <div>
              <h4>B2B Invoices</h4>
              <p>Settle invoices on-chain without exposing pricing or client relationships.</p>
            </div>
          </div>
          <div className="uc-compact-card">
            <span className="uc-compact-icon">💼</span>
            <div>
              <h4>Payroll</h4>
              <p>Pay salaries privately. No public salary leaks or org-chart inference.</p>
            </div>
          </div>
          <div className="uc-compact-card">
            <span className="uc-compact-icon">🏛️</span>
            <div>
              <h4>Treasury Ops</h4>
              <p>Move funds between internal wallets without revealing runway or strategy.</p>
            </div>
          </div>
          <div className="uc-compact-card">
            <span className="uc-compact-icon">🤝</span>
            <div>
              <h4>Revenue Sharing</h4>
              <p>Pay partners without exposing revenue splits or performance data.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── WHY PLASMA ──────────────────────────────────────────────── */}
      <section className="section" id="plasma">
        <h2 className="section-title">Why Plasma?</h2>

        <div className="plasma-grid">
          <div className="plasma-card">
            <div className="plasma-icon">⚡</div>
            <h4>Fast Finality</h4>
            <p>Transactions confirm in seconds.</p>
          </div>
          <div className="plasma-card">
            <div className="plasma-icon">🪙</div>
            <h4>Low Fees</h4>
            <p>Sub-cent gas costs for frequent payments.</p>
          </div>
          <div className="plasma-card">
            <div className="plasma-icon">💵</div>
            <h4>Stablecoin-Native</h4>
            <p>Purpose-built L1 — USDT is first-class.</p>
          </div>
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────────────────── */}
      <section className="section cta-section">
        <h2 className="section-title">Try It Yourself</h2>
        <p className="section-lead">
          Connect your wallet and experience confidential payments on Plasma.
        </p>
        <button className="btn-cta btn-cta--lg" onClick={onLaunchApp}>
          Launch App →
        </button>
      </section>

      {/* ─── TECHNICAL DEEP DIVE (collapsed) ─────────────────────────── */}
      <section className="section" id="technical">
        <Collapsible label="Technical Deep Dive">
          {/* Transfer mechanics */}
          <div style={{ marginBottom: '32px' }}>
            <h3 className="section-subtitle">How Private Transfers Work</h3>
            <div className="mechanics-flow">
              <div className="mech-col">
                <h4>Inputs</h4>
                <div className="mech-box mech-box--hidden">Note A<br /><small>owned by sender</small></div>
                <div className="mech-box mech-box--hidden">Note B<br /><small>owned by sender</small></div>
              </div>
              <div className="mech-arrow">
                <div className="mech-arrow-line" />
                <div className="mech-proof-label">ZK Proof</div>
                <ul className="mech-checklist">
                  <li>✓ Notes exist in Merkle tree</li>
                  <li>✓ Sender owns inputs</li>
                  <li>✓ Total value conserved</li>
                  <li>✓ Nullifiers prevent double-spend</li>
                </ul>
              </div>
              <div className="mech-col">
                <h4>Outputs</h4>
                <div className="mech-box mech-box--hidden">Note C<br /><small>for recipient</small></div>
                <div className="mech-box mech-box--hidden">Note D<br /><small>change back to sender</small></div>
              </div>
            </div>
            <div className="mech-delivery">
              <span>📩</span> Encrypted notes are delivered to recipients — only the intended party can decrypt and spend them.
            </div>
          </div>

          {/* Tech stack cards */}
          <div style={{ marginBottom: '32px' }}>
            <h3 className="section-subtitle">Components</h3>
            <div className="tech-grid">
              <div className="tech-card">
                <h5>Smart Contract</h5>
                <p>On-chain state: Merkle tree of commitments, nullifier set, USDT escrow. Verifies SP1 proofs.</p>
              </div>
              <div className="tech-card">
                <h5>Prover</h5>
                <p>Generates SP1 zero-knowledge proofs for transfers and withdrawals via proxy or locally.</p>
              </div>
              <div className="tech-card">
                <h5>Client SDK</h5>
                <p>TypeScript SDK handles wallet management, note encryption, Merkle proofs, and pool interaction.</p>
              </div>
              <div className="tech-card">
                <h5>Plasma Chain</h5>
                <p>Fast-finality, low-fee L1 purpose-built for stablecoin payments.</p>
              </div>
            </div>
          </div>

          {/* Detailed flows */}
          <div style={{ marginBottom: '32px' }}>
            <h3 className="section-subtitle">Detailed Operation Flows</h3>

            <Collapsible label="Deposit Flow — Public → Shielded Pool">
              <div className="df-flow">
                <DetailedStep num={1} action="User enters deposit amount"
                  component="DepositForm.tsx" location="browser"
                  detail="User specifies USDT amount in the React UI. No keys or recipient needed." />
                <DetailedStep num={2} action="Generate note commitment"
                  component="ShieldedWallet (client SDK)" location="browser"
                  detail="Creates a new Note with random blinding factor. Computes commitment = keccak256(amount || pubkey || blinding). Encrypts note data to self using viewing key (x25519 + NaCl box)." />
                <DetailedStep num={3} action="Approve USDT transfer"
                  component="ERC-20 Token Contract" location="on-chain"
                  detail="Browser sends ERC-20 approve(poolAddress, amount) transaction via MetaMask." />
                <DetailedStep num={4} action="Call deposit(commitment, amount, encryptedData)"
                  component="ShieldedPool.sol" location="on-chain"
                  detail="Contract transfers USDT from user into escrow, inserts commitment into the on-chain Merkle tree, and emits a Deposit event." />
                <DetailedStep num={5} action="Store note in local wallet"
                  component="ShieldedWallet" location="browser"
                  detail="Wallet adds the new note to its local store. Persisted in localStorage." />
              </div>
            </Collapsible>

            <Collapsible label="Private Transfer Flow — Shielded → Shielded (2-in-2-out)">
              <div className="df-flow">
                <DetailedStep num={1} action="User enters recipient pubkey, viewing key, and amount"
                  component="TransferForm.tsx" location="browser"
                  detail="Sender specifies recipient's shielded public key, viewing public key, and USDT amount." />
                <DetailedStep num={2} action="Select input notes (coin selection)"
                  component="ShieldedWallet" location="browser"
                  detail="Wallet selects 2 unspent notes that together cover the amount." />
                <DetailedStep num={3} action="Create output notes"
                  component="ShieldedWallet" location="browser"
                  detail="Creates Note C (recipient) and Note D (change). Each encrypted with the respective viewing key." />
                <DetailedStep num={4} action="Build Merkle proofs for input notes"
                  component="ClientMerkleTree" location="browser"
                  detail="Generates inclusion proofs for each input note from the locally-mirrored tree." />
                <DetailedStep num={5} action="Generate SP1 Groth16 proof"
                  component="Prover (via Proxy)" location="proxy"
                  detail="Proxy spawns the Rust SP1 prover which requests a Groth16 proof on the Succinct Prover Network. Takes ~1-3 min." />
                <DetailedStep num={6} action="Submit privateTransfer(proof, publicValues, enc1, enc2)"
                  component="ShieldedPool.sol" location="on-chain"
                  detail="Contract verifies the SP1 proof, marks nullifiers as spent, inserts 2 new commitments, emits EncryptedNote events." />
                <DetailedStep num={7} action="Recipient syncs and decrypts"
                  component="ShieldedWallet" location="browser"
                  detail="Recipient's wallet replays EncryptedNote events, decrypts with viewing key, adds spendable notes." />
              </div>
            </Collapsible>

            <Collapsible label="Withdraw Flow — Shielded Pool → Public Wallet">
              <div className="df-flow">
                <DetailedStep num={1} action="User enters withdrawal amount and recipient address"
                  component="WithdrawForm.tsx" location="browser"
                  detail="USDT amount and public recipient address. Partial withdrawals create a change note." />
                <DetailedStep num={2} action="Select input note and create change note"
                  component="ShieldedWallet" location="browser"
                  detail="Selects one unspent note >= amount. Creates change note if needed, encrypted to self." />
                <DetailedStep num={3} action="Build Merkle proof for input note"
                  component="ClientMerkleTree" location="browser"
                  detail="Generates inclusion proof for the input note in the locally-mirrored tree." />
                <DetailedStep num={4} action="Generate SP1 Groth16 proof"
                  component="Prover (via Proxy)" location="proxy"
                  detail="Rust prover generates a Groth16 proof. Recipient address is committed inside the proof to prevent front-running." />
                <DetailedStep num={5} action="Submit withdraw(proof, publicValues, encryptedChange)"
                  component="ShieldedPool.sol" location="on-chain"
                  detail="Contract verifies proof, marks nullifier as spent, transfers USDT to recipient. Change commitment inserted if present." />
                <DetailedStep num={6} action="Update local wallet state"
                  component="ShieldedWallet" location="browser"
                  detail="Marks spent nullifier. Adds change note if created. USDT appears in public wallet." />
              </div>
            </Collapsible>
          </div>

          {/* Architecture */}
          <div>
            <h3 className="section-subtitle">System Architecture</h3>
            <div className="arch-diagram">
              <ArchRow label="Browser (off-chain)" type="offchain" items={[
                { name: 'React Frontend', desc: 'Vite + React 18 — deposit, transfer, withdraw UI' },
                { name: 'ShieldedWallet', desc: 'Key management, note creation, coin selection, NaCl encryption' },
                { name: 'ClientMerkleTree', desc: 'Locally-mirrored Merkle tree for ZK inclusion proofs' },
                { name: 'BrowserPoolClient', desc: 'Orchestrates all operations — calls proxy for proofs, submits txs' },
              ]} />

              <div className="arch-connector">
                <div className="arch-connector-line" />
                <span className="arch-connector-label">HTTP (POST /prove/transfer, /prove/withdraw)</span>
              </div>

              <ArchRow label="Proxy Server (off-chain)" type="infra" items={[
                { name: 'Express Server', desc: 'Receives proof requests, forwards to Rust prover subprocess' },
                { name: 'SP1 Prover (Rust)', desc: 'Groth16 proofs via SP1 zkVM — transfer and withdraw circuits' },
              ]} />

              <div className="arch-connector">
                <div className="arch-connector-line" />
                <span className="arch-connector-label">JSON-RPC (ethers.js → Plasma node)</span>
              </div>

              <ArchRow label="Plasma Chain (on-chain)" type="onchain" items={[
                { name: 'ShieldedPool.sol', desc: 'deposit(), privateTransfer(), withdraw() — USDT escrow + Merkle tree + nullifier registry' },
                { name: 'MerkleTree.sol', desc: 'Incremental keccak256 binary tree with 30-root history' },
                { name: 'SP1 Verifier', desc: 'On-chain Groth16 proof verification' },
                { name: 'USDT (ERC-20)', desc: 'Stablecoin token — native on Plasma' },
              ]} />
            </div>

            <div className="arch-key">
              <h5>On-chain vs Off-chain</h5>
              <div className="arch-key-grid">
                <div className="arch-key-item">
                  <span className="arch-key-dot arch-key-dot--onchain" /> <strong>On-chain:</strong> Commitments, nullifiers, token escrow, proof verification
                </div>
                <div className="arch-key-item">
                  <span className="arch-key-dot arch-key-dot--offchain" /> <strong>Off-chain:</strong> Note contents, amounts, keys, wallet state, Merkle proofs
                </div>
                <div className="arch-key-item">
                  <span className="arch-key-dot arch-key-dot--infra" /> <strong>Infrastructure:</strong> ZK proof generation (Rust SP1 prover via Express proxy)
                </div>
              </div>
            </div>
          </div>
        </Collapsible>
      </section>

      <footer className="landing-footer">
        Plasma Shielded Pool · Confidential Payments · Hackathon Demo
      </footer>
    </div>
  );
}

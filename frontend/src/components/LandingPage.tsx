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

/* ── use case card ──────────────────────────────────────────────────── */

function UseCaseCard({
  icon,
  title,
  bullets,
  flow,
}: {
  icon: string;
  title: string;
  bullets: string[];
  flow: { from: string; to: string; hidden: string };
}) {
  return (
    <div className="use-case-card">
      <div className="use-case-header">
        <span className="use-case-icon">{icon}</span>
        <h3>{title}</h3>
      </div>
      <ul className="use-case-bullets">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      <div className="use-case-flow">
        <span className="uc-flow-label">From</span>
        <span className="uc-flow-value">{flow.from}</span>
        <span className="uc-flow-arrow">→</span>
        <span className="uc-flow-label">To</span>
        <span className="uc-flow-value">{flow.to}</span>
        <span className="uc-flow-hidden">🔒 Hidden: {flow.hidden}</span>
      </div>
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
  const [showTech, setShowTech] = useState(false);

  return (
    <div className="landing">
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
      {/* ─── USE CASES ───────────────────────────────────────────────── */}
      <section className="section" id="use-cases">
        <h2 className="section-title">Enterprise Payment Use Cases</h2>
        <p className="section-lead">
          Real-world scenarios where payment confidentiality matters.
        </p>

        <div className="use-cases-grid">
          <UseCaseCard
            icon="📄"
            title="B2B Invoice Settlements"
            bullets={[
              'Companies settle invoices in USDT on-chain',
              'Pricing, volume, and counterparties stay confidential',
              'Competitors cannot scrape payment data',
              'Settlements are final, provable, and auditable',
            ]}
            flow={{ from: 'Company A', to: 'Company B', hidden: 'amount, pricing, relationship' }}
          />
          <UseCaseCard
            icon="💼"
            title="Confidential Payroll & Contractor Payments"
            bullets={[
              'Pay salaries or contractors privately in USDT',
              'No public salary leaks or org-chart inference',
              'Employees can withdraw publicly or stay shielded',
              'Viewing keys enable auditing when required',
            ]}
            flow={{ from: 'Employer', to: 'Employees', hidden: 'salary amounts, org structure' }}
          />
          <UseCaseCard
            icon="🏛️"
            title="Treasury & Internal Fund Movements"
            bullets={[
              'Move USDT between internal wallets privately',
              'Prevents balance tracking and strategy inference',
              'Rebalancing, runway management, ops funds',
              'Full on-chain settlement with confidentiality',
            ]}
            flow={{ from: 'Treasury', to: 'Ops Wallet', hidden: 'balances, fund movements' }}
          />
          <UseCaseCard
            icon="🤝"
            title="Partner & Revenue-Share Payouts"
            bullets={[
              'Pay partners without revealing revenue splits',
              'Partner performance stays confidential',
              'Clean on-chain settlement',
              'Protect confidential business relationships',
            ]}
            flow={{ from: 'Platform', to: 'Partners', hidden: 'revenue splits, performance data' }}
          />
        </div>
      </section>
      {/* ─── PAYMENT LIFECYCLE ───────────────────────────────────────── */}
      <section className="section" id="lifecycle">
        <h2 className="section-title">Payment Lifecycle</h2>
        <p className="section-lead">
          Three simple steps — deposit, transfer, withdraw.
        </p>

        <div className="lifecycle">
          {/* Step 1 */}
          <div className="lc-step">
            <div className="lc-num">1</div>
            <div className="lc-body">
              <h4>Deposit</h4>
              <p>User sends USDT from their <strong>public wallet</strong> into the shielded pool.
                A cryptographic note commitment is stored on-chain.</p>
              <div className="lc-tags">
                <span className="tag tag--public">Public</span>
                <span className="tag tag--info">No ZK proof needed</span>
              </div>
            </div>
          </div>

          <div className="lc-connector" />

          {/* Step 2 */}
          <div className="lc-step">
            <div className="lc-num">2</div>
            <div className="lc-body">
              <h4>Private Transfer</h4>
              <p>Funds move inside the shielded pool. A ZK proof ensures correctness — amount
                conservation, ownership, and double-spend prevention — without revealing anything.</p>
              <div className="lc-tags">
                <span className="tag tag--hidden">Amount hidden</span>
                <span className="tag tag--hidden">Parties hidden</span>
                <span className="tag tag--zk">Proven via ZK</span>
              </div>
            </div>
          </div>

          <div className="lc-connector" />

          {/* Step 3 */}
          <div className="lc-step">
            <div className="lc-num">3</div>
            <div className="lc-body">
              <h4>Withdraw</h4>
              <p>Recipient withdraws from the shielded pool to any <strong>public wallet</strong>. A ZK proof
                ensures the withdrawal amount matches what was received.</p>
              <div className="lc-tags">
                <span className="tag tag--public">Public</span>
                <span className="tag tag--zk">Proven via ZK</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRIVATE TRANSFER MECHANICS ──────────────────────────────── */}
      <section className="section" id="mechanics">
        <h2 className="section-title">How Private Transfers Work</h2>
        <p className="section-lead">
          No cryptographic math required — here is the high-level flow.
        </p>

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
          <span>📩</span> Encrypted notes are delivered to recipients — only the intended
          party can decrypt and spend them.
        </div>

        {/* Technical details toggle */}
        <button
          className="toggle-tech"
          onClick={() => setShowTech(!showTech)}
        >
          {showTech ? '▾ Hide' : '▸ Show'} technical components
        </button>

        {showTech && (
          <div className="tech-grid">
            <div className="tech-card">
              <h5>Smart Contract</h5>
              <p>On-chain state: Merkle tree of commitments, nullifier set, USDT escrow. Verifies SP1 proofs.</p>
            </div>
            <div className="tech-card">
              <h5>Prover</h5>
              <p>Generates SP1 zero-knowledge proofs for transfers and withdrawals client-side or via proxy.</p>
            </div>
            <div className="tech-card">
              <h5>Client SDK</h5>
              <p>TypeScript SDK handles wallet management, note encryption, Merkle proofs, and pool interaction.</p>
            </div>
            <div className="tech-card">
              <h5>Plasma Chain</h5>
              <p>Fast-finality, low-fee L1 purpose-built for stablecoin payments. Native USDT support.</p>
            </div>
          </div>
        )}
      </section>

      {/* ─── DETAILED FLOW DIAGRAMS ──────────────────────────────────── */}
      <section className="section" id="detailed-flows">
        <h2 className="section-title">Detailed Operation Flows</h2>
        <p className="section-lead">
          Step-by-step breakdown of each operation — which components run, where proofs are generated, and what happens on-chain vs off-chain.
        </p>

        <Collapsible label="Deposit Flow — Public → Shielded Pool">
          <div className="df-flow">
            <DetailedStep num={1} action="User enters deposit amount"
              component="DepositForm.tsx" location="browser"
              detail="User specifies USDT amount in the React UI. No keys or recipient needed." />
            <DetailedStep num={2} action="Generate note commitment"
              component="ShieldedWallet (client SDK)" location="browser"
              detail="Creates a new Note with random blinding factor. Computes commitment = keccak256(amount ‖ pubkey ‖ blinding). Encrypts note data to self using viewing key (x25519 + NaCl box)." />
            <DetailedStep num={3} action="Approve USDT transfer"
              component="ERC-20 Token Contract" location="on-chain"
              detail="Browser sends ERC-20 approve(poolAddress, amount) transaction via MetaMask so the ShieldedPool can pull tokens." />
            <DetailedStep num={4} action="Call deposit(commitment, amount, encryptedData)"
              component="ShieldedPool.sol" location="on-chain"
              detail="Contract transfers USDT from user into escrow, inserts commitment into the on-chain Merkle tree (20-root history), and emits a Deposit event with encrypted note data. No ZK proof required." />
            <DetailedStep num={5} action="Store note in local wallet"
              component="ShieldedWallet" location="browser"
              detail="Wallet adds the new note (amount, blinding, leaf index) to its local store. Persisted in localStorage for recovery." />
          </div>
          <div className="df-legend">
            <span className="df-loc df-loc--browser">browser</span> = React frontend &nbsp;
            <span className="df-loc df-loc--onchain">on-chain</span> = Plasma smart contract
          </div>
        </Collapsible>

        <Collapsible label="Private Transfer Flow — Shielded → Shielded (2-in-2-out)">
          <div className="df-flow">
            <DetailedStep num={1} action="User enters recipient pubkey, viewing key, and amount"
              component="TransferForm.tsx" location="browser"
              detail="Sender specifies recipient's shielded public key, viewing public key, and the USDT amount to transfer privately." />
            <DetailedStep num={2} action="Select input notes (coin selection)"
              component="ShieldedWallet" location="browser"
              detail="Wallet selects 2 unspent notes that together cover the amount (greedy largest-first)." />
            <DetailedStep num={3} action="Create output notes"
              component="ShieldedWallet" location="browser"
              detail="Creates Note C (recipient's pubkey, transfer amount, random blinding) and Note D (sender's pubkey, change amount, random blinding). Each encrypted with the respective viewing key." />
            <DetailedStep num={4} action="Build Merkle proofs for input notes"
              component="ClientMerkleTree" location="browser"
              detail="Fetches the current Merkle root and generates inclusion proofs (sibling hashes + path bits) for each input note's leaf index from the locally-mirrored tree." />
            <DetailedStep num={5} action="Generate SP1 Groth16 proof"
              component="Prover (via Proxy)" location="proxy"
              detail="Browser sends POST /prove/transfer to the Express proxy server. Proxy spawns the Rust SP1 prover binary (cargo run --release) which requests a Groth16 proof on Succint Prover Network. The proof attests: both inputs exist in tree, sender owns them (knows spending keys), output amounts = input amounts (conservation), and nullifiers are correctly derived. Takes ~1–3 min." />
            <DetailedStep num={6} action="Submit privateTransfer(proof, publicValues, enc1, enc2)"
              component="ShieldedPool.sol" location="on-chain"
              detail="Contract verifies the SP1 proof against TRANSFER_VKEY. Checks nullifiers haven't been spent before. Marks both input nullifiers as spent. Inserts 2 new output commitments into Merkle tree. Emits EncryptedNote events with the encrypted output data." />
            <DetailedStep num={7} action="Recipient syncs and decrypts"
              component="ShieldedWallet" location="browser"
              detail="Recipient's wallet replays EncryptedNote events, attempts decryption with their viewing key. Successfully decrypted notes are added to their local wallet as spendable." />
          </div>
          <div className="df-legend">
            <span className="df-loc df-loc--browser">browser</span> = React + Client SDK &nbsp;
            <span className="df-loc df-loc--proxy">proxy</span> = Express → Rust SP1 prover &nbsp;
            <span className="df-loc df-loc--onchain">on-chain</span> = Plasma contract
          </div>
        </Collapsible>

        <Collapsible label="Withdraw Flow — Shielded Pool → Public Wallet">
          <div className="df-flow">
            <DetailedStep num={1} action="User enters withdrawal amount and recipient address"
              component="WithdrawForm.tsx" location="browser"
              detail="Sender specifies the USDT amount and the public recipient address (defaults to connected wallet). Partial withdrawals create a change note." />
            <DetailedStep num={2} action="Select input note and create change note"
              component="ShieldedWallet" location="browser"
              detail="Wallet selects one unspent note ≥ withdrawal amount. If note value > amount, creates a change note (sender's pubkey, remaining balance, random blinding) encrypted to self." />
            <DetailedStep num={3} action="Build Merkle proof for input note"
              component="ClientMerkleTree" location="browser"
              detail="Generates inclusion proof for the input note's leaf in the locally-mirrored Merkle tree." />
            <DetailedStep num={4} action="Generate SP1 Groth16 proof"
              component="Prover (via Proxy)" location="proxy"
              detail="Browser sends POST /prove/withdraw to the Express proxy. Rust prover generates a Groth16 proof attesting: input note exists, sender owns it, withdrawal amount + change = input amount, and recipient address is committed inside the proof (prevents front-running)." />
            <DetailedStep num={5} action="Submit withdraw(proof, publicValues, encryptedChange)"
              component="ShieldedPool.sol" location="on-chain"
              detail="Contract verifies the SP1 proof against WITHDRAW_VKEY. Marks input nullifier as spent. Transfers the withdrawal amount in USDT from escrow to the recipient's public address. If there's change, inserts the change commitment into the Merkle tree." />
            <DetailedStep num={6} action="Update local wallet state"
              component="ShieldedWallet" location="browser"
              detail="Marks the spent note's nullifier. If a change note was created, adds it to wallet. USDT appears in recipient's public wallet balance." />
          </div>
          <div className="df-legend">
            <span className="df-loc df-loc--browser">browser</span> = React + Client SDK &nbsp;
            <span className="df-loc df-loc--proxy">proxy</span> = Express → Rust SP1 prover &nbsp;
            <span className="df-loc df-loc--onchain">on-chain</span> = Plasma contract
          </div>
        </Collapsible>
      </section>

      {/* ─── TECHNICAL ARCHITECTURE ──────────────────────────────────── */}
      <section className="section" id="architecture">
        <h2 className="section-title">System Architecture</h2>
        <p className="section-lead">
          How the system components connect — from the browser to the blockchain.
        </p>

        <Collapsible label="Technical Architecture Diagram">
          <div className="arch-diagram">
            <ArchRow label="Browser (off-chain)" type="offchain" items={[
              { name: 'React Frontend', desc: 'Vite + React 18 — DepositForm, TransferForm, WithdrawForm, Dashboard, NotesList' },
              { name: 'ShieldedWallet', desc: 'Key management, note creation, coin selection, note encryption/decryption (x25519 + NaCl)' },
              { name: 'ClientMerkleTree', desc: 'Locally-mirrored binary Merkle tree — builds inclusion proofs for ZK circuits' },
              { name: 'BrowserPoolClient', desc: 'Orchestrates deposit / transfer / withdraw — calls proxy for proofs, submits txs via ethers.js' },
            ]} />

            <div className="arch-connector">
              <div className="arch-connector-line" />
              <span className="arch-connector-label">HTTP (POST /prove/transfer, /prove/withdraw)</span>
            </div>

            <ArchRow label="Proxy Server (off-chain)" type="infra" items={[
              { name: 'Express Server', desc: 'Node.js proxy — receives proof requests from browser, forwards to Rust prover subprocess' },
              { name: 'SP1 Prover (Rust)', desc: 'Generates Groth16 proofs via SP1 zkVM — transfer circuit (2-in-2-out) and withdraw circuit — spawned as cargo subprocess' },
            ]} />

            <div className="arch-connector">
              <div className="arch-connector-line" />
              <span className="arch-connector-label">JSON-RPC (ethers.js → Plasma node)</span>
            </div>

            <ArchRow label="Plasma Chain (on-chain)" type="onchain" items={[
              { name: 'ShieldedPool.sol', desc: 'Main contract — deposit(), privateTransfer(), withdraw(). Holds USDT escrow, Merkle tree of commitments, nullifier registry' },
              { name: 'MerkleTree.sol', desc: 'Incremental keccak256 binary Merkle tree with 30-root history ring buffer for concurrent proof generation' },
              { name: 'SP1 Verifier', desc: 'On-chain Groth16 proof verification — validates proofs against TRANSFER_VKEY and WITHDRAW_VKEY' },
              { name: 'USDT (ERC-20)', desc: 'Stablecoin token contract — native on Plasma L1, used for deposits and withdrawal payouts' },
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
        </Collapsible>
      </section>


      {/* ─── WHY PLASMA ──────────────────────────────────────────────── */}
      <section className="section" id="plasma">
        <h2 className="section-title">Why Plasma?</h2>
        <p className="section-lead">
          The ideal chain for confidential stablecoin payments.
        </p>

        <div className="plasma-grid">
          <div className="plasma-card">
            <div className="plasma-icon">⚡</div>
            <h4>Fast Finality</h4>
            <p>Transactions confirm in seconds — critical for real-time payment flows.</p>
          </div>
          <div className="plasma-card">
            <div className="plasma-icon">🪙</div>
            <h4>Low Fees</h4>
            <p>Micro-cent transaction costs make frequent payments practical and scalable.</p>
          </div>
          <div className="plasma-card">
            <div className="plasma-icon">💵</div>
            <h4>Stablecoin-Native</h4>
            <p>Plasma is purpose-built as a stablecoin L1 — USDT is a first-class citizen.</p>
          </div>
        </div>

        <div className="plasma-note">
          <strong>This is about payments UX, not DeFi.</strong> No swaps, no lending,
          no yield — just fast, cheap, confidential payments that work for real businesses.
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

      <footer className="landing-footer">
        Plasma Shielded Pool · Confidential Payments · Hackathon Demo
      </footer>
    </div>
  );
}

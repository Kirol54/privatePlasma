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

/* ── main landing page ──────────────────────────────────────────────── */

export function LandingPage({ onLaunchApp }: LandingPageProps) {
  const [showTech, setShowTech] = useState(false);

  return (
    <div className="landing">
      {/* ─── HERO ────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-badge">Built on Plasma</div>
        <h1 className="hero-title">
          Confidential USDT Payments
        </h1>
        <p className="hero-sub">
          Enterprise-grade private stablecoin transfers — amounts, balances, and
          counterparties hidden by default, with optional selective disclosure.
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

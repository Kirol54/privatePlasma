# Diagrams

Visual documentation for the Plasma Shielded Pool codebase.

All diagrams use **Mermaid** (`.mmd` files) so GitHub renders them natively. To view a diagram, click any `.mmd` file in this directory — GitHub will render the flowchart or sequence diagram inline.

> **Keeping diagrams up to date:** if a PR changes flow logic, contract interfaces, or component responsibilities, update the relevant diagram in the same PR.

---

## System-Level Diagrams

| Diagram | File | Question it answers |
|---------|------|---------------------|
| **System Architecture** | [`system-architecture.mmd`](system-architecture.mmd) | What are all the components and how do they connect? What is on-chain vs off-chain? |
| **Deposit Sequence** | [`sequence-deposit.mmd`](sequence-deposit.mmd) | What happens step-by-step when a user deposits USDT into the pool? |
| **Private Transfer Sequence** | [`sequence-transfer.mmd`](sequence-transfer.mmd) | How does a 2-in-2-out private transfer work end-to-end? |
| **Withdraw Sequence** | [`sequence-withdraw.mmd`](sequence-withdraw.mmd) | How does a user withdraw from the pool back to a public address? |
| **Data & Artifacts** | [`data-artifacts.mmd`](data-artifacts.mmd) | Where are commitments, nullifiers, Merkle proofs, ZK proofs, and encrypted notes created, stored, and verified? |

## Per-Component Diagrams

| Diagram | File | Question it answers |
|---------|------|---------------------|
| **Deployment Flow** | [`deployment-flow.mmd`](deployment-flow.mmd) | What are the steps to deploy the ShieldedPool contract (local or Plasma)? |
| **Proof Generation Flow** | [`proof-generation-flow.mmd`](proof-generation-flow.mmd) | How does the Rust host CLI (`script/`) generate ZK proofs? What are the binaries and their relationships? |
| **Proxy Flow** | [`proxy-flow.mmd`](proxy-flow.mmd) | Why does the proxy exist? How does it bridge the browser to the Rust prover? |
| **TypeScript SDK Flow** | [`sdk-flow.mmd`](sdk-flow.mmd) | What does each SDK module (`client/`) do? How do wallet, Merkle tree, crypto, and encryption fit together? |
| **Frontend Flow** | [`frontend-flow.mmd`](frontend-flow.mmd) | What is the user journey through the React app? Which calls go directly to the chain vs through the proxy? |
| **Makefile Orchestration** | [`makefile-orchestration.mmd`](makefile-orchestration.mmd) | What Makefile targets exist, what do they do, and how do they depend on each other? |

---

## Diagram Format

- **Format:** Mermaid (`.mmd`) — renders natively on GitHub
- **Each diagram includes:** title, legend, and references to real repo paths
- **Style conventions:**
  - Blue = on-chain / build targets
  - Green = off-chain user-side / test targets
  - Orange = proxy / deploy targets
  - Purple = proof / ZK-related
  - Red/Pink = E2E / sync flows

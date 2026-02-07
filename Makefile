# ============================================================================
# Plasma Shielded Pool — Build & Deploy
# ============================================================================

-include .env

FIXTURES := fixtures

# ---------- Build ----------

.PHONY: build-circuits build-host build-contracts build-client build-all

build-circuits: ## Build SP1 guest programs (RISC-V)
	cd programs/transfer && cargo prove build
	cd programs/withdraw && cargo prove build

build-host: ## Build the proof generation CLI
	cargo build --release -p shielded-pool-script

build-contracts: ## Compile Solidity contracts
	forge build

build-client: ## Build the TypeScript SDK
	cd client && npm install && npm run build

build-all: build-circuits build-host build-contracts build-client ## Build everything

# ---------- Test ----------

.PHONY: test-contracts test-lib test-integration test-all

test-contracts: ## Run Foundry tests (56 tests)
	forge test -v

test-lib: ## Run Rust shared library tests
	cargo test -p shielded-pool-lib

test-integration: ## Run Rust integration tests
	@mkdir -p $(FIXTURES)
	cargo test -p shielded-pool-tests

test-all: test-contracts test-lib test-integration ## Run all tests

# ---------- Verification Keys ----------

.PHONY: vkeys

vkeys: ## Print SP1 verification keys for contract deployment
	SP1_PROVER=mock cargo run --release -p shielded-pool-script -- vkeys

# ---------- Deploy ----------

.PHONY: deploy-local deploy-plasma anvil

anvil: ## Start local Anvil node
	anvil

deploy-local: ## Deploy to local Anvil (uses .env)
	forge script deploy/Deploy.s.sol \
		--rpc-url http://127.0.0.1:8545 \
		--broadcast

deploy-plasma: ## Deploy to Plasma network (uses .env)
	@test -n "$(RPC_URL)" || (echo "Error: RPC_URL not set. Copy .env.example to .env and configure it." && exit 1)
	forge script deploy/Deploy.s.sol \
		--rpc-url $(RPC_URL) \
		--broadcast \
		--verify

# ---------- Prove ----------

.PHONY: prove-transfer prove-withdraw execute-transfer execute-withdraw

execute-transfer: ## Execute transfer circuit (no proof, fast verification)
	SP1_PROVER=mock cargo run --release -p shielded-pool-script -- \
		transfer --input $(FIXTURES)/test_transfer_input.json \
		--output $(FIXTURES)/test_output.json --execute-only

execute-withdraw: ## Execute withdraw circuit (no proof, fast verification)
	SP1_PROVER=mock cargo run --release -p shielded-pool-script -- \
		withdraw --input $(FIXTURES)/test_withdraw_input.json \
		--output $(FIXTURES)/test_output.json --execute-only

prove-transfer: ## Generate real Groth16 transfer proof (via Succinct Network)
	@test -n "$(SP1_PRIVATE_KEY)" || (echo "Error: SP1_PRIVATE_KEY not set." && exit 1)
	SP1_PROVER=network SP1_PRIVATE_KEY=$(SP1_PRIVATE_KEY) \
		cargo run --release -p shielded-pool-script -- \
		transfer --input $(INPUT) --output $(OUTPUT)

prove-withdraw: ## Generate real Groth16 withdraw proof (via Succinct Network)
	@test -n "$(SP1_PRIVATE_KEY)" || (echo "Error: SP1_PRIVATE_KEY not set." && exit 1)
	SP1_PROVER=network SP1_PRIVATE_KEY=$(SP1_PRIVATE_KEY) \
		cargo run --release -p shielded-pool-script -- \
		withdraw --input $(INPUT) --output $(OUTPUT)

# ---------- Help ----------

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

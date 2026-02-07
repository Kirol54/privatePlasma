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

deploy-local: ## Deploy to local Anvil (uses .env), saves POOL_ADDRESS + DEPLOY_BLOCK to .env
	forge script deploy/Deploy.s.sol \
		--rpc-url http://127.0.0.1:8545 \
		--broadcast
	@BROADCAST=$$(ls -t broadcast/Deploy.s.sol/*/run-latest.json 2>/dev/null | head -1); \
	if [ -n "$$BROADCAST" ]; then \
		ADDR=$$(python3 -c "import json; d=json.load(open('$$BROADCAST')); print(d['receipts'][0]['contractAddress'])"); \
		BLOCK=$$(python3 -c "import json; d=json.load(open('$$BROADCAST')); print(int(d['receipts'][0]['blockNumber'],16))"); \
		sed -i '' "s|^POOL_ADDRESS=.*|POOL_ADDRESS=$$ADDR|" .env; \
		if grep -q '^DEPLOY_BLOCK=' .env; then \
			sed -i '' "s|^DEPLOY_BLOCK=.*|DEPLOY_BLOCK=$$BLOCK|" .env; \
		else \
			sed -i '' "/^POOL_ADDRESS=/a\\
DEPLOY_BLOCK=$$BLOCK" .env; \
		fi; \
		echo ""; \
		echo "  ✓ Saved to .env:"; \
		echo "    POOL_ADDRESS=$$ADDR"; \
		echo "    DEPLOY_BLOCK=$$BLOCK"; \
	fi

deploy-plasma: ## Deploy to Plasma network (uses .env), saves POOL_ADDRESS + DEPLOY_BLOCK to .env
	@test -n "$(RPC_URL)" || (echo "Error: RPC_URL not set. Copy .env.example to .env and configure it." && exit 1)
	forge script deploy/Deploy.s.sol \
		--rpc-url $(RPC_URL) \
		--broadcast
	@BROADCAST=$$(ls -t broadcast/Deploy.s.sol/*/run-latest.json 2>/dev/null | head -1); \
	if [ -n "$$BROADCAST" ]; then \
		ADDR=$$(python3 -c "import json; d=json.load(open('$$BROADCAST')); print(d['receipts'][0]['contractAddress'])"); \
		BLOCK=$$(python3 -c "import json; d=json.load(open('$$BROADCAST')); print(int(d['receipts'][0]['blockNumber'],16))"); \
		sed -i '' "s|^POOL_ADDRESS=.*|POOL_ADDRESS=$$ADDR|" .env; \
		if grep -q '^DEPLOY_BLOCK=' .env; then \
			sed -i '' "s|^DEPLOY_BLOCK=.*|DEPLOY_BLOCK=$$BLOCK|" .env; \
		else \
			sed -i '' "/^POOL_ADDRESS=/a\\
DEPLOY_BLOCK=$$BLOCK" .env; \
		fi; \
		echo ""; \
		echo "  ✓ Saved to .env:"; \
		echo "    POOL_ADDRESS=$$ADDR"; \
		echo "    DEPLOY_BLOCK=$$BLOCK"; \
	fi
		
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

# ---------- E2E ----------

.PHONY: e2e

e2e: ## Run full e2e test (deposit → transfer → withdraw) against deployed contract
	@test -n "$(POOL_ADDRESS)" || (echo "Error: POOL_ADDRESS not set in .env" && exit 1)
	@test -n "$(SP1_PRIVATE_KEY)" || (echo "Error: SP1_PRIVATE_KEY not set." && exit 1)
	SP1_PROVER=network SP1_PRIVATE_KEY=$(SP1_PRIVATE_KEY) \
		cargo run --release -p shielded-pool-script --bin e2e

# ---------- Help ----------

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

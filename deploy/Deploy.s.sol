// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ShieldedPool} from "../contracts/ShieldedPool.sol";

/// @title Deploy
/// @notice Foundry script to deploy ShieldedPool.
///
/// Usage:
///   # Local (Anvil)
///   forge script deploy/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///
///   # Plasma testnet
///   forge script deploy/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify
///
/// Required env vars (see .env.example):
///   PRIVATE_KEY, TOKEN_ADDRESS, VERIFIER_ADDRESS, TRANSFER_VKEY, WITHDRAW_VKEY
///
/// Optional:
///   TREE_LEVELS (default 20)
contract DeployShieldedPool is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address token = vm.envAddress("TOKEN_ADDRESS");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        bytes32 transferVkey = vm.envBytes32("TRANSFER_VKEY");
        bytes32 withdrawVkey = vm.envBytes32("WITHDRAW_VKEY");
        uint32 treeLevels = uint32(vm.envOr("TREE_LEVELS", uint256(20)));

        console.log("Deploying ShieldedPool...");
        console.log("  Token:         ", token);
        console.log("  Verifier:      ", verifier);
        console.log("  Transfer VKey: ");
        console.logBytes32(transferVkey);
        console.log("  Withdraw VKey: ");
        console.logBytes32(withdrawVkey);
        console.log("  Tree Levels:   ", treeLevels);

        vm.startBroadcast(deployerKey);

        ShieldedPool pool = new ShieldedPool(
            token,
            verifier,
            transferVkey,
            withdrawVkey,
            treeLevels
        );

        vm.stopBroadcast();

        console.log("ShieldedPool deployed at:", address(pool));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ISP1Verifier
/// @notice Interface for the SP1 Groth16 on-chain verifier.
///         The actual contract is deployed by Succinct and is the same
///         on every EVM chain. We just need the interface.
///         See: https://github.com/succinctlabs/sp1-contracts
interface ISP1Verifier {
    /// @notice Verifies a SP1 proof.
    /// @param vkey         The verification key for the SP1 program.
    /// @param publicValues The ABI-encoded public inputs to the program.
    /// @param proofBytes   The encoded Groth16 proof.
    /// @dev Reverts if the proof is invalid.
    function verifyProof(
        bytes32 vkey,
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view;
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Mock verifier that always passes. For testing only.
contract MockSP1Verifier {
    bool public shouldRevert;

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function verifyProof(
        bytes32,
        bytes calldata,
        bytes calldata
    ) external view {
        if (shouldRevert) {
            revert("MockSP1Verifier: proof invalid");
        }
    }
}

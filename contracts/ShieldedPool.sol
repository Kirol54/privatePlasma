// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "./interfaces/IERC20.sol";
import {ISP1Verifier} from "./interfaces/ISP1Verifier.sol";
import {MerkleTree} from "./MerkleTree.sol";

/// @title ShieldedPool
/// @notice Private USDT payment pool on Plasma using SP1 ZK proofs.
///         Users deposit USDT and receive a cryptographic note commitment.
///         Transfers happen privately — the ZK proof guarantees correctness
///         without revealing sender, recipient, or amount.
///
/// @dev Note structure (off-chain):
///      note = {amount, pubkey, blinding}
///      commitment = keccak256(amount, pubkey, blinding)
///      nullifier  = keccak256(commitment, spending_key)
///
///      Three operations, each verified by a separate SP1 program:
///      1. Deposit:  public amount in, commitment inserted into Merkle tree
///      2. Transfer: consume input note(s), create output note(s), prove in ZK
///      3. Withdraw: consume note, release public tokens
///
///      Selective disclosure: each note optionally stores an encrypted blob
///      on-chain, decryptable by the recipient (and anyone with their viewing key).

contract ShieldedPool is MerkleTree {
    // =========================================================================
    //                              CONSTANTS
    // =========================================================================

    /// @notice SP1 verification keys for each circuit (set at deploy time)
    bytes32 public immutable TRANSFER_VKEY;
    bytes32 public immutable WITHDRAW_VKEY;

    /// @notice The token used in this pool (USDT on Plasma)
    IERC20 public immutable TOKEN;

    /// @notice SP1 Groth16 verifier contract (deployed by Succinct)
    ISP1Verifier public immutable VERIFIER;

    // =========================================================================
    //                               STATE
    // =========================================================================

    /// @notice Spent nullifiers — prevents double-spending
    mapping(bytes32 => bool) public nullifiers;

    /// @notice Encrypted note data for selective disclosure.
    ///         Maps commitment → encrypted blob.
    ///         The blob is encrypted with the recipient's public key.
    ///         Anyone with the viewing key can decrypt.
    mapping(uint256 => bytes) public encryptedNotes;

    // =========================================================================
    //                              EVENTS
    // =========================================================================

    /// @notice Emitted on deposit. Listeners can track new commitments.
    event Deposit(
        bytes32 indexed commitment,
        uint256 amount,
        uint32 leafIndex,
        uint256 timestamp
    );

    /// @notice Emitted on private transfer. Only nullifiers and new commitments
    ///         are visible — no amounts, no addresses.
    event PrivateTransfer(
        bytes32 indexed nullifier1,
        bytes32 indexed nullifier2,
        bytes32 newCommitment1,
        bytes32 newCommitment2,
        uint256 timestamp
    );

    /// @notice Emitted on withdrawal.
    event Withdrawal(
        bytes32 indexed nullifier,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when encrypted note data is stored (for viewing key holders)
    event EncryptedNote(
        bytes32 indexed commitment,
        bytes encryptedData
    );

    // =========================================================================
    //                              ERRORS
    // =========================================================================

    error NullifierAlreadySpent();
    error InvalidMerkleRoot();
    error InvalidProof();
    error InvalidDepositAmount();
    error TransferFailed();
    error ZeroAddress();

    // =========================================================================
    //                            CONSTRUCTOR
    // =========================================================================

    /// @param _token        USDT (or any ERC20) address on Plasma
    /// @param _verifier     SP1 Groth16 verifier contract address
    /// @param _transferVkey SP1 verification key for the transfer circuit
    /// @param _withdrawVkey SP1 verification key for the withdraw circuit
    /// @param _treeLevels   Merkle tree depth (e.g., 20 → supports ~1M notes)
    constructor(
        address _token,
        address _verifier,
        bytes32 _transferVkey,
        bytes32 _withdrawVkey,
        uint32 _treeLevels
    ) MerkleTree(_treeLevels) {
        if (_token == address(0) || _verifier == address(0)) revert ZeroAddress();

        TOKEN = IERC20(_token);
        VERIFIER = ISP1Verifier(_verifier);
        TRANSFER_VKEY = _transferVkey;
        WITHDRAW_VKEY = _withdrawVkey;

    }

    // =========================================================================
    //                              DEPOSIT
    // =========================================================================

    /// @notice Deposit tokens into the shielded pool.
    ///         No ZK proof needed — this is a public action.
    ///         The commitment hides the note details.
    ///
    /// @param commitment     keccak256 hash of (amount, pubkey, blinding)
    /// @param amount         Token amount to deposit (public)
    /// @param encryptedData  Optional: note details encrypted to recipient's
    ///                       viewing key. Pass empty bytes if not using.
    function deposit(
        bytes32 commitment,
        uint256 amount,
        bytes calldata encryptedData
    ) external {
        if (amount == 0) revert InvalidDepositAmount();

        // Transfer tokens from sender to this contract
        bool success = TOKEN.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        // Insert commitment into the Merkle tree
        uint32 leafIndex = _insert(commitment);

        // Store the new root as a known root
        

        // Store encrypted note data if provided (for viewing key disclosure)
        if (encryptedData.length > 0) {
            encryptedNotes[leafIndex] = encryptedData;
            emit EncryptedNote(commitment, encryptedData);
        }

        emit Deposit(commitment, amount, leafIndex, block.timestamp);
    }

    // =========================================================================
    //                          PRIVATE TRANSFER
    // =========================================================================

    /// @notice Execute a private transfer within the pool.
    ///         Consumes 2 input notes, creates 2 output notes (2-in-2-out
    ///         like Zcash Sapling — handles change naturally).
    ///
    ///         The SP1 proof guarantees:
    ///         - Both input notes exist in the Merkle tree (under the proven root)
    ///         - The sender knows the secret keys for both input notes
    ///         - Nullifiers are correctly derived
    ///         - sum(input amounts) == sum(output amounts)   [no inflation]
    ///         - Output commitments are well-formed
    ///
    /// @param proof          SP1 Groth16 proof bytes
    /// @param publicValues   ABI-encoded public inputs:
    ///                       (bytes32 root, bytes32 nullifier1, bytes32 nullifier2,
    ///                        bytes32 outCommitment1, bytes32 outCommitment2)
    /// @param encryptedOutput1 Encrypted note data for first output (optional)
    /// @param encryptedOutput2 Encrypted note data for second output (optional)
    function privateTransfer(
        bytes calldata proof,
        bytes calldata publicValues,
        bytes calldata encryptedOutput1,
        bytes calldata encryptedOutput2
    ) external {
        // Decode into memory struct to avoid stack-too-deep
        bytes32[5] memory v = abi.decode(publicValues, (bytes32[5]));
        // v[0] = root, v[1] = nullifier1, v[2] = nullifier2,
        // v[3] = outCommitment1, v[4] = outCommitment2

        // 1. Check the Merkle root is known
        if (!isKnownRoot(v[0])) revert InvalidMerkleRoot();

        // 2. Check nullifiers haven't been spent
        if (nullifiers[v[1]]) revert NullifierAlreadySpent();
        if (nullifiers[v[2]]) revert NullifierAlreadySpent();

        // 3. Verify the SP1 proof
        VERIFIER.verifyProof(TRANSFER_VKEY, publicValues, proof);

        // 4. Mark nullifiers as spent
        nullifiers[v[1]] = true;
        nullifiers[v[2]] = true;

        // 5. Insert new commitments into the Merkle tree
        _insertAndStoreEncrypted(v[3], encryptedOutput1);
        _insertAndStoreEncrypted(v[4], encryptedOutput2);

        emit PrivateTransfer(v[1], v[2], v[3], v[4], block.timestamp);
    }

    /// @dev Helper to insert commitment and optionally store encrypted data
    function _insertAndStoreEncrypted(
        bytes32 commitment,
        bytes calldata encryptedData
    ) internal {
        uint32 idx = _insert(commitment);
        if (encryptedData.length > 0) {
            encryptedNotes[idx] = encryptedData;
            emit EncryptedNote(commitment, encryptedData);
        }
    }

    // =========================================================================
    //                             WITHDRAW
    // =========================================================================

    /// @notice Withdraw tokens from the shielded pool to a public address.
    ///         Consumes a note and sends tokens to the recipient.
    ///
    ///         The SP1 proof guarantees:
    ///         - The input note exists in the Merkle tree
    ///         - The caller knows the secret key for the note
    ///         - Nullifier is correctly derived
    ///         - The claimed amount matches the note's amount
    ///         - The recipient address is committed in the proof (prevents front-running)
    ///
    /// @param proof          SP1 Groth16 proof bytes
    /// @param publicValues   ABI-encoded public inputs:
    ///                       (bytes32 root, bytes32 nullifier, address recipient,
    ///                        uint256 amount, bytes32 changeCommitment)
    /// @param encryptedChange Encrypted note data for change output (optional)
    function withdraw(
        bytes calldata proof,
        bytes calldata publicValues,
        bytes calldata encryptedChange
    ) external {
        // Decode public values
        (
            bytes32 root,
            bytes32 nullifier,
            address recipient,
            uint256 amount,
            bytes32 changeCommitment
        ) = abi.decode(publicValues, (bytes32, bytes32, address, uint256, bytes32));

        // 1. Validate
        if (!isKnownRoot(root)) revert InvalidMerkleRoot();
        if (nullifiers[nullifier]) revert NullifierAlreadySpent();
        if (recipient == address(0)) revert ZeroAddress();

        // 2. Verify the SP1 proof
        VERIFIER.verifyProof(WITHDRAW_VKEY, publicValues, proof);

        // 3. Mark nullifier as spent
        nullifiers[nullifier] = true;

        // 4. Insert change commitment if non-zero (partial withdrawal)
        if (changeCommitment != bytes32(0)) {
            uint32 changeIdx = _insert(changeCommitment);
            

            if (encryptedChange.length > 0) {
                encryptedNotes[changeIdx] = encryptedChange;
                emit EncryptedNote(changeCommitment, encryptedChange);
            }
        }

        // 5. Transfer tokens to recipient
        bool success = TOKEN.transfer(recipient, amount);
        if (!success) revert TransferFailed();

        emit Withdrawal(nullifier, recipient, amount, block.timestamp);
    }

    // =========================================================================
    //                          VIEW FUNCTIONS
    // =========================================================================

    /// @notice Check if a nullifier has been spent
    function isSpent(bytes32 nullifier) external view returns (bool) {
        return nullifiers[nullifier];
    }

    /// @notice Get encrypted note data for a given leaf index
    function getEncryptedNote(uint256 leafIndex) external view returns (bytes memory) {
        return encryptedNotes[leafIndex];
    }
}

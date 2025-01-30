// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./BridgeValidator.sol";
// import "./BridgeStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Bridge
 * @dev Main bridge contract implementing lock and release functionality
 */
contract Bridge is ReentrancyGuard, Pausable, AccessControl, Ownable {
    address public admin;
    // uint256 public platformFeePercentage;
    uint256 public constant ADMIN_DELAY = 2 days;
    uint256 public constant RATE_LIMIT_DURATION = 1 hours;
    uint256 public constant MAX_TRANSFER_PER_HOUR = 1000 ether;

    // Rate limiting
    mapping(address => uint256) public lastTransferTimestamp;
    mapping(address => uint256) public transferredInWindow;

    // Multi-sig related
    uint256 public constant REQUIRED_SIGNATURES = 2;
    mapping(address => bool) public validators;
    uint256 public validatorCount;

    // Transaction tracking
    mapping(bytes32 => bool) public processedHashes;
    mapping(bytes32 => mapping(address => bool)) public validatorSignatures;
    mapping(bytes32 => uint256) public signatureCount;

    // Events
    event TokensLocked(
        address indexed token,
        address indexed from,
        uint256 amount,
        bytes32 indexed targetChainTxHash
    );
    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event NativeTokenLocked(
        address indexed from,
        uint256 amount,
        bytes32 indexed targetChainTxHash
    );
    event NativeTokenReleased(
        address indexed to,
        uint256 amount,
        bytes32 indexed sourceChainTxHash
    );
    event TokensReleased(
        address indexed token,
        address indexed to,
        uint256 amount,
        bytes32 indexed sourceChainTxHash
    );
    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event SignatureSubmitted(bytes32 indexed txHash, address indexed validator);

    // Custom errors for gas optimization
    error NotOwner();
    error NotAdmin();
    error InvalidAddress();
    error AlreadyProcessed();
    error InsufficientBalance();
    error TransferFailed();
    error NotValidator();
    error AlreadyValidated();
    error InvalidSignatureCount();
    error RateLimitExceeded();

    // Modifiers
    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyValidator() {
        if (!validators[msg.sender]) revert NotValidator();
        _;
    }

    constructor() Ownable(msg.sender) {
        // platformFeePercentage = _platformFeePercentage;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        admin = msg.sender;
        validators[msg.sender] = true;
        validatorCount = 1;
    }

    // Owner function to change admin
    function changeAdmin(address newAdmin) public onlyOwner {
        if (newAdmin == address(0)) revert InvalidAddress();
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminChanged(oldAdmin, newAdmin);
    }

    // Validator management
    function addValidator(address validator) external onlyOwner {
        if (validator == address(0)) revert InvalidAddress();
        if (validators[validator]) revert AlreadyValidated();

        validators[validator] = true;
        validatorCount++;
        emit ValidatorAdded(validator);
    }

    function removeValidator(address validator) external onlyOwner {
        if (!validators[validator]) revert NotValidator();
        if (validatorCount <= REQUIRED_SIGNATURES)
            revert InvalidSignatureCount();

        validators[validator] = false;
        validatorCount--;
        emit ValidatorRemoved(validator);
    }

    // Main public function that admin calls
    function executeTokenOperation(
        address token,
        uint256 amount,
        address account,
        bytes32 txHash,
        bool isLock
    ) external onlyValidator {
        if (account == address(0)) revert InvalidAddress();
        if (processedHashes[txHash]) revert AlreadyProcessed();

        // Rate limiting check
        uint256 currentWindow = block.timestamp / RATE_LIMIT_DURATION;
        uint256 lastWindow = lastTransferTimestamp[account] /
            RATE_LIMIT_DURATION;

        if (currentWindow > lastWindow) {
            transferredInWindow[account] = 0;
        }

        if (transferredInWindow[account] + amount > MAX_TRANSFER_PER_HOUR) {
            revert RateLimitExceeded();
        }
        // Multi-sig validation
        if (validatorSignatures[txHash][msg.sender]) revert AlreadyValidated();
        validatorSignatures[txHash][msg.sender] = true;
        signatureCount[txHash]++;

        emit SignatureSubmitted(txHash, msg.sender);

        if (signatureCount[txHash] < REQUIRED_SIGNATURES) {
            return;
        }

        // Update rate limiting data
        transferredInWindow[account] += amount;
        lastTransferTimestamp[account] = block.timestamp;

        processedHashes[txHash] = true;

        if (isLock) {
            _lockTokens(token, account, amount, txHash);
        } else {
            _releaseTokens(token, account, amount, txHash);
        }
    }

    // Internal functions
    function _lockTokens(
        address token,
        address sender,
        uint256 amount,
        bytes32 targetChainTxHash
    ) internal nonReentrant whenNotPaused {
        if (token == address(0)) {
            if (address(this).balance < amount) revert InsufficientBalance();
            emit NativeTokenLocked(sender, amount, targetChainTxHash);
        } else {
            bool success = IERC20(token).transferFrom(
                sender,
                address(this),
                amount
            );
            if (!success) revert TransferFailed();
            emit TokensLocked(token, sender, amount, targetChainTxHash);
        }
    }

    // decimal fee deduction 0.3% of the transaction amount, add gas fee with this 0.3%

    function _releaseTokens(
        address token,
        address recipient,
        uint256 amount,
        // bytes memory signature,
        bytes32 sourceChainTxHash
    ) internal nonReentrant whenNotPaused {
        if (recipient == address(0)) revert InvalidAddress();
        if (token == address(0)) {
            // Handle native token
            if (address(this).balance < amount) revert InsufficientBalance();
            (bool success, ) = recipient.call{value: amount}("");
            if (!success) revert TransferFailed();
            emit NativeTokenReleased(recipient, amount, sourceChainTxHash);
        } else {
            // Handle ERC20 token
            bool success = IERC20(token).transfer(recipient, amount);
            if (!success) revert TransferFailed();
            emit TokensReleased(token, recipient, amount, sourceChainTxHash);
        }

        // require(
        //     validator.validateTransaction(
        //         sourceChainId,
        //         chainId,
        //         token,
        //         amount,
        //         recipient,
        //         signature
        //     ),
        //     "Invalid transaction signature"
        // );

        // transactions[txHash].processed = true;

        // Calculate platform fee
        // uint256 platformFee = (amount * platformFeePercentage)/10000;

        // // Ensure sufficient amount remains after deducting fees
        // require(amount > platformFee, "Amount too low after fees");

        // uint256 finalAmount = amount - platformFee;

        // release tokens to recipient account
        // IERC20(token).transfer(recipient, amount);

        // // Transfer platform fee to the decimal account
        // // IERC20(token).transfer(msg.sender, platformFee);

        // tokenBalances[token][chainId] -= amount;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // Function to receive native tokens
    receive() external payable {}
}

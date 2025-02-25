// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

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
    uint256 public constant RATE_LIMIT_DURATION = 1 hours;
    uint256 public constant MAX_TRANSFER_PER_HOUR = 1000 ether;
    uint256 public constant MAX_TRANSACTION_AMOUNT = 100 ether;
    uint256 public constant MAX_TRANSACTIONS_PER_HOUR = 10;
    uint256 public platformFeePercentage; // 0.3%
    address public platformAddress; // Address to receive platform fees

    // Rate limiting
    mapping(address => uint256) public lastTransferTimestamp;
    mapping(address => uint256) public transferredInWindow;
    mapping(address => uint256) public transactionCount;

    // Transaction tracking
    mapping(bytes32 => bool) public processedHashes;

    // Withdrawal tracking
    mapping(address => uint256) public withdrawableTokens;

    // Events
    event TokensLocked(
        address indexed token,
        uint256 amount,
        address indexed from,
        address to,
        bytes32 indexed targetChainTxHash
    );
    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event NativeTokenLocked(
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes32 indexed targetChainTxHash
    );
    event NativeTokenReleased(
        address indexed from,
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
    event TokensWithdrawn(address indexed token, address indexed to, uint256 amount);
    event PlatformFeeDeducted(address indexed token, uint256 fee);
    event PlatformAddressChanged(address indexed newPlatformAddress);
    event PlatformFeeChanged(uint256 newFeePercentage);

    // Custom errors for gas optimization
    error NotOwner();
    error NotAdmin();
    error InvalidAddress();
    error AlreadyProcessed();
    error InsufficientBalance();
    error TransferFailed();
    error RateLimitExceeded();

    constructor(uint256 _platformFeePercentage) Ownable(msg.sender) {
        platformAddress = msg.sender; // Set the platform address to the owner
        platformFeePercentage = _platformFeePercentage; // Set the platform fee percentage
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        admin = msg.sender;
    }

    // Owner function to change admin
    function changeAdmin(address newAdmin) public onlyOwner {
        if (newAdmin == address(0)) revert InvalidAddress();
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminChanged(oldAdmin, newAdmin);
    }

    function addAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid address");
        _grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        emit AdminChanged(address(0), newAdmin);
    }

    function removeAdmin(address adminAddress) external onlyOwner {
        require(adminAddress != address(0), "Invalid address");
        require(adminAddress == admin, "Not the current admin");
        _revokeRole(DEFAULT_ADMIN_ROLE, adminAddress);
        emit AdminChanged(adminAddress, address(0));
    }

    function lockTokens(
        address token,
        uint256 amount,
        address from,
        address to,
        bytes32 txHash
    ) public {
        require(from != address(0), "Invalid address");
        require(to != address(0), "Invalid address");
        require(amount <= MAX_TRANSACTION_AMOUNT, "Amount exceeds limit");
        if (processedHashes[txHash]) revert AlreadyProcessed();

        // Rate limiting check
        uint256 currentWindow = block.timestamp / RATE_LIMIT_DURATION;
        uint256 lastWindow = lastTransferTimestamp[from] / RATE_LIMIT_DURATION;

        if (currentWindow > lastWindow) {
            transferredInWindow[from] = 0;
        }

        if (transferredInWindow[from] + amount > MAX_TRANSFER_PER_HOUR) {
            revert RateLimitExceeded();
        }

        // Locking logic here
        lastTransferTimestamp[from] = block.timestamp;
        transferredInWindow[from] += amount;
        processedHashes[txHash] = true;
        if (token == address(0)) {
            if (address(this).balance < amount) revert InsufficientBalance();
            emit NativeTokenLocked(from, to, amount, txHash);
        } else {
            bool success = IERC20(token).transferFrom(
                from,
                address(this),
                amount
            );
            if (!success) revert TransferFailed();
            emit TokensLocked(token, amount, from, to, txHash);
        }
    }

    function releaseTokens(
        address token,
        uint256 amount,
        address recipient,
        bytes32 sourceChainTxHash
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(recipient != address(0), "Invalid address");
        require(amount <= MAX_TRANSACTION_AMOUNT, "Amount exceeds limit");

        uint256 currentWindow = block.timestamp / RATE_LIMIT_DURATION;
        if (lastTransferTimestamp[recipient] < currentWindow) {
            transferredInWindow[recipient] = 0;
        }

        // Calculate platform fee
        uint256 fee = (amount * platformFeePercentage) / 10000; // Assuming percentage is in basis points
        uint256 amountAfterFee = amount - fee;

        // Transfer the fee to the platform
        if (token == address(0)) {
            require(address(this).balance >= amount, "Insufficient balance");
            (bool success, ) = platformAddress.call{value: fee}(''); // Transfer fee to platform
            require(success, "Fee transfer failed");
            (success, ) = recipient.call{value: amountAfterFee}('');
            require(success, "Transfer failed");
        } else {
            require(IERC20(token).transfer(platformAddress, fee), "Fee transfer failed");
            require(IERC20(token).transfer(recipient, amountAfterFee), "Transfer failed");
        }

        withdrawableTokens[recipient] += amountAfterFee; // Track withdrawable tokens
        emit TokensReleased(token, recipient, amountAfterFee, sourceChainTxHash);
        emit PlatformFeeDeducted(token, fee); // Emit an event for fee deduction
    }

    function withdrawTokens() external nonReentrant {
        uint256 amount = withdrawableTokens[msg.sender];
        require(amount > 0, "No tokens to withdraw");
        withdrawableTokens[msg.sender] = 0;

        require(IERC20(address(0)).transfer(msg.sender, amount), "Transfer failed");
        emit TokensWithdrawn(address(0), msg.sender, amount);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setPlatformAddress(address newPlatformAddress) external onlyOwner {
        require(newPlatformAddress != address(0), "Invalid address");
        platformAddress = newPlatformAddress;
        emit PlatformAddressChanged(newPlatformAddress);
    }

    function setPlatformFee(uint256 newFeePercentage) external onlyOwner {
        require(newFeePercentage > 0, "Fee must be greater than zero");
        platformFeePercentage = newFeePercentage;
        emit PlatformFeeChanged(newFeePercentage);
    }

    // Function to receive native tokens
    receive() external payable {}
}

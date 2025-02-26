// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

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
    uint256 public platformFeePercentage; // 300 for 3%
    address public platformAddress; // Address to receive platform fees

    // Rate limiting
    mapping(address => uint256) public lastTransferTimestamp;
    mapping(address => uint256) public transferredInWindow;
    mapping(address => uint256) public transactionCount;

    // Transaction tracking
    mapping(bytes32 => bool) public processedHashes;

    // Mapping to track withdrawable tokens for each recipient and token
    mapping(address => mapping(address => uint256)) public withdrawableTokens;

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
    event TokensWithdrawn(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
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
        address to,
        bytes32 txHash
    ) public payable {
        require(to != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be greater than zero");
        require(amount <= MAX_TRANSACTION_AMOUNT, "Amount exceeds limit");

        // Ensure the transaction hash has not been processed before
        if (processedHashes[txHash]) revert AlreadyProcessed();

        // Rate limiting check
        uint256 currentWindow = block.timestamp / RATE_LIMIT_DURATION;
        uint256 lastWindow = lastTransferTimestamp[msg.sender] /
            RATE_LIMIT_DURATION;

        if (currentWindow > lastWindow) {
            transferredInWindow[msg.sender] = 0;
        }

        if (transferredInWindow[msg.sender] + amount > MAX_TRANSFER_PER_HOUR) {
            revert RateLimitExceeded();
        }

        // Update rate-limiting state
        lastTransferTimestamp[msg.sender] = block.timestamp;
        transferredInWindow[msg.sender] += amount;
        processedHashes[txHash] = true;

        // Handle locking logic
        if (token == address(0)) {
            // Native token (ETH)
            require(msg.value == amount, "Incorrect ETH amount sent");
            emit NativeTokenLocked(msg.sender, to, amount, txHash);
        } else {
            // ERC20 token: Transfer tokens from sender to the bridge contract
            bool success = IERC20(token).transferFrom(
                msg.sender,
                address(this),
                amount
            );
            if (!success) revert TransferFailed();
            emit TokensLocked(token, amount, msg.sender, to, txHash);
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

        // Rate limiting logic
        uint256 currentWindow = block.timestamp / RATE_LIMIT_DURATION;
        if (lastTransferTimestamp[recipient] < currentWindow) {
            transferredInWindow[recipient] = 0;
        }
        require(
            transferredInWindow[recipient] + amount <= MAX_TRANSACTION_AMOUNT,
            "Rate limit exceeded"
        );

        // Calculate platform fee
        require(
            platformFeePercentage <= 10000,
            "Invalid platform fee percentage"
        );
        uint256 fee = (amount * platformFeePercentage) / 10000; // Assuming percentage is in basis points
        console.log("Fee: ", fee);
        require(fee <= amount, "Fee exceeds amount");
        uint256 amountAfterFee = amount - fee;
        console.log("Amount after fee: ", amountAfterFee);
        // Ensure sufficient balance
        if (token == address(0)) {
            // Native token (ETH)
            require(address(this).balance >= amount, "Insufficient balance");
            (bool success, ) = platformAddress.call{value: fee}(""); // Transfer fee to platform
            require(success, "Fee transfer failed");
            (success, ) = recipient.call{value: amountAfterFee}("");
            require(success, "Transfer failed");
            emit NativeTokenReleased(
                address(this),
                recipient,
                amountAfterFee,
                sourceChainTxHash
            );
        } else {
            // ERC20 token
            require(
                IERC20(token).balanceOf(address(this)) >= amount,
                "Insufficient token balance"
            );
            require(
                IERC20(token).transfer(platformAddress, fee),
                "Fee transfer failed"
            );
            require(
                IERC20(token).approve(recipient, amountAfterFee),
                "Approval failed"
            );
            emit TokensReleased(
                token,
                recipient,
                amountAfterFee,
                sourceChainTxHash
            );
        }

        // Track withdrawable tokens
        withdrawableTokens[recipient][token] += amountAfterFee;

        // Emit events
        emit PlatformFeeDeducted(token, fee); // Emit an event for fee deduction
    }

    function withdrawTokens(address token) external nonReentrant {
        // Get the amount of tokens the sender is allowed to withdraw
        uint256 amount = withdrawableTokens[msg.sender][token];
        require(amount > 0, "No tokens to withdraw");

        // Deduct platform fee
        uint256 fee = (amount * platformFeePercentage) / 10000;
        uint256 netAmount = amount - fee;

        // Transfer tokens to the recipient and platform fee to the platform address
        if (token == address(0)) {
            // Native token (ETH)
            require(
                address(this).balance >= amount,
                "Insufficient ETH balance"
            );
            (bool success, ) = platformAddress.call{value: fee}(""); // Transfer fee to platform
            require(success, "Fee transfer failed");
            (success, ) = msg.sender.call{value: netAmount}(""); // Transfer net amount to recipient
            require(success, "Transfer failed");
        } else {
            // ERC20 token
            require(
                IERC20(token).balanceOf(address(this)) >= amount,
                "Insufficient token balance"
            );
            require(
                IERC20(token).transfer(platformAddress, fee),
                "Fee transfer failed"
            );
            require(
                IERC20(token).transfer(msg.sender, netAmount),
                "Transfer failed"
            );
        }
        // Reset the withdrawable balance for the specified token
        withdrawableTokens[msg.sender][token] = 0;

        // Update rate limiting state
        uint256 currentWindow = block.timestamp / RATE_LIMIT_DURATION;
        if (lastTransferTimestamp[msg.sender] < currentWindow) {
            transferredInWindow[msg.sender] = 0;
        }
        transferredInWindow[msg.sender] += netAmount;
        lastTransferTimestamp[msg.sender] = currentWindow;

        // Emit event
        emit TokensWithdrawn(token, msg.sender, netAmount);
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

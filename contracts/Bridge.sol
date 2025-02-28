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
    uint256 public platformFeePercentage; // 300 for 3%
    address public platformAddress; // Address to receive platform fees

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
    error FeeTransferFailed();

    constructor(uint256 _platformFeePercentage) Ownable(msg.sender) {
        platformAddress = msg.sender; // Set the platform address to the owner
        platformFeePercentage = _platformFeePercentage; // Set the platform fee percentage
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // Owner function to change admin
    function changeAdmin(address newAdmin) public onlyOwner {
        if (newAdmin == address(0)) revert InvalidAddress();
        emit AdminChanged(address(0), newAdmin);
    }

    function addAdmin(address newAdmin) external onlyOwner {
        if (newAdmin == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        emit AdminChanged(address(0), newAdmin);
    }

    function removeAdmin(address adminAddress) external onlyOwner {
        if (adminAddress == address(0)) revert InvalidAddress();
        _revokeRole(DEFAULT_ADMIN_ROLE, adminAddress);
        emit AdminChanged(adminAddress, address(0));
    }

    function lockTokens(
        address token,
        uint256 amount,
        address to,
        bytes32 targetChainTxHash
    ) public payable {
        require(to != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be greater than zero");

        // Ensure the transaction hash has not been processed before
        if (processedHashes[targetChainTxHash]) revert AlreadyProcessed();

        // Handle locking logic
        if (token == address(0)) {
            // Native token (ETH)
            require(msg.value == amount, "Incorrect ETH amount sent");
        } else {
            // ERC20 token: Transfer tokens from sender to the bridge contract
            bool success = IERC20(token).transfer(
                address(this),
                amount
            );
            if (!success) revert TransferFailed();
        }
        processedHashes[targetChainTxHash] = true;
        emit TokensLocked(token, amount, msg.sender, to, targetChainTxHash);
    }

    function releaseTokens(
        address token,
        uint256 amount,
        address recipient,
        bytes32 sourceChainTxHash
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(recipient != address(0), "Invalid address");

        // Calculate platform fee
        require(
            platformFeePercentage <= 10000,
            "Invalid platform fee percentage"
        );
        uint256 fee = (amount * platformFeePercentage) / 10000; // Assuming percentage is in basis points
        require(fee <= amount, "Fee exceeds amount");
        uint256 netAmount = amount - fee;

        // Track withdrawable tokens
        withdrawableTokens[recipient][token] += netAmount;

        // Ensure sufficient balance
        if (token == address(0)) {
            // Native token (ETH)
            require(address(this).balance >= amount, "Insufficient balance");
            (bool success, ) = platformAddress.call{value: fee}(""); // Transfer fee to platform
            require(success, "Fee transfer failed");
            (success, ) = recipient.call{value: netAmount}(""); // Transfer net amount to recipient
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
                IERC20(token).approve(recipient, netAmount),
                "Approval failed"
            );
        }

        // Emit events
        emit TokensReleased(token, recipient, netAmount, sourceChainTxHash);
        emit PlatformFeeDeducted(token, fee); // Emit an event for fee deduction
    }

    function withdrawTokens(address token) external nonReentrant {
        // Get the amount of tokens the sender is allowed to withdraw
        uint256 amount = withdrawableTokens[msg.sender][token];
        if (amount == 0) revert InsufficientBalance();

        // Reset the withdrawable balance for the specified token
        withdrawableTokens[msg.sender][token] = 0;

        // Transfer tokens to the recipient and platform fee to the platform address
        if (token == address(0)) {
            // Native token (ETH)
            require(
                address(this).balance >= amount,
                "Insufficient ETH balance"
            );

            (bool success, ) = msg.sender.call{value: amount}(""); // Transfer net amount to recipient
            require(success, "Transfer failed");
        } else {
            require(
                IERC20(token).balanceOf(address(this)) >= amount,
                "Insufficient balance"
            );
            require(
                IERC20(token).transfer(msg.sender, amount),
                "Transfer failed"
            );
        }

        // Emit event
        emit TokensWithdrawn(token, msg.sender, amount);
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

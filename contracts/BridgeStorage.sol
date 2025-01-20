// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;


/**
 * @title BridgeStorage
 * @dev Contract to handle bridge state storage
*/
contract BridgeStorage {
    struct Transaction {
        uint256 sourceChainId;
        uint256 destinationChainId;
        address token;
        uint256 amount;
        address recipient;
        bool processed;
    }

    mapping(bytes32 => Transaction) public transactions;
    mapping(address => mapping(uint256 => uint256)) public tokenBalances;

    event TransactionProcessed(bytes32 indexed txHash, address indexed recipient, uint256 amount);
    event TokensLocked(address indexed token, address indexed sender, uint256 amount);
    event TokensReleased(address indexed token, address indexed recipient, uint256 amount);
}
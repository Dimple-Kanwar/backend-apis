// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IBridgeValidator
 * @dev Bridge validator Interface
 */

interface IBridgeValidator {
    function validateTransaction(uint256 sourceChainId, uint256 destinationChainId, address token, uint256 amount, address recipient, bytes memory signature) external view returns (bool);
}


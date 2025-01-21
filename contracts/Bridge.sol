// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./BridgeValidator.sol";
import "./BridgeStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Bridge
 * @dev Main bridge contract implementing lock and release functionality
*/
contract Bridge is BridgeStorage, ReentrancyGuard, Pausable, AccessControl {

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    IBridgeValidator public immutable validator;
    uint256 public immutable chainId;

    event TokenLocked(address token, address sender, uint256 amount, address recipient, uint256 sourceChainId, uint256 destinationChainId);

    constructor(address _validator, uint256 _chainId) {
        validator = IBridgeValidator(_validator);
        chainId = _chainId;
       _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); 
       _grantRole(OPERATOR_ROLE, msg.sender);
    }

    function lockTokens(address token, uint256 amount, uint256 destinationChainId, address recipient) external nonReentrant whenNotPaused{
        require(amount > 0 , "Amount must be greater than 0");
        require(recipient != address(0), "Invalid recipient");
        require(destinationChainId != chainId, "Invalid destination chain");

        IERC20(token).transferFrom(msg.sender, address(this), amount);

        bytes32 txHash = keccak256(abi.encodePacked(chainId, destinationChainId,token,amount,recipient,block.timestamp));

        transactions[txHash] = Transaction({
            sourceChainId: chainId,
            destinationChainId: destinationChainId,
            token: token,
            amount: amount,
            recipient: recipient,
            processed: false
        });

        tokenBalances[token][chainId] += amount;
        
        emit TokenLocked(token, msg.sender, amount, recipient, chainId, destinationChainId);
    }

    // decimal fee deduction 0.3% of the transaction amount, add gas fee with this 0.3%

    function releaseToken(uint256 sourceChainId, address token, uint256 amount, address recipient, bytes memory signature) external nonReentrant whenNotPaused onlyRole(OPERATOR_ROLE){
        bytes32 txHash = keccak256(abi.encodePacked(sourceChainId, token, chainId, amount, recipient, block.timestamp));
        require(!transactions[txHash].processed, "Transaction processed already");
        require(validator.validateTransaction(sourceChainId,chainId, token, amount, recipient,signature), "Invalid transaction signature");

        transactions[txHash].processed = true;

        IERC20(token).transfer(recipient, amount);
        tokenBalances[token][chainId] -= amount;

        emit TokensReleased(token, recipient, amount);
        emit TransactionProcessed(txHash, recipient, amount);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE){
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE){
        _unpause();
    }

}

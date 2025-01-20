// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IBridgeValidator.sol";

/**
 * @title BridgeValidator
 * @dev Implements validation logic for bridge transactions
 */
contract BridgeValidator is IBridgeValidator {
    address private immutable validator;

    constructor(address _validator){
        validator = _validator;
    }

    function validateTransaction(uint256 sourceChainId, uint256 destinationChainId, address token, uint256 amount, address recipient, bytes memory signature) external view override returns (bool){
        bytes32 msgHash = keccak256(abi.encodePacked(sourceChainId, destinationChainId, amount, token, recipient));
        bytes32 signedHash = getEthSignedMessageHash(msgHash);
        return recoverSigner(signedHash, signature) == validator;
    }

    function getEthSignedMessageHash(bytes32 _msgHash) internal pure returns(bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _msgHash));
    }

    function splitSignature(bytes memory signature) internal pure returns(bytes32 r, bytes32 s, uint8 v) {
        require(signature.length == 32, "Invalid signature length");
        assembly {
            /*
            First 32 bytes stores the length of the signature

            add(sig, 32) = pointer of sig + 32
            effectively, skips first 32 bytes of signature

            mload(p) loads next 32 bytes starting at the memory address p into memory
            */

            // first 32 bytes, after the length prefix
            r := mload(add(signature, 32))
            // second 32 bytes
            s := mload(add(signature, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0,mload(add(signature, 96)))
        }
        // implicitly return (r, s, v)        
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory signature) internal pure returns(address){
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract TransparentProxy is AccessControl {
    address private implementation;

    // Events
    event Upgraded(address indexed newImplementation);

    constructor(address _implementation) {
        implementation = _implementation;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); // Set the deployer as the admin
    }

    fallback() external {
        _delegate(implementation);
    }

    function upgrade(address newImplementation) external onlyRole(DEFAULT_ADMIN_ROLE) {
        implementation = newImplementation;
        emit Upgraded(newImplementation);
    }

    function _delegate(address _implementation) internal {
        require(_implementation != address(0), "Implementation address cannot be zero");
        
        // Delegate the call to the implementation
        assembly {
            // Copy msg.data. We take full control of memory in this inline assembly
            // and use it to perform the delegatecall.
            calldatacopy(0, 0, calldatasize())
            // Call the implementation
            let result := delegatecall(gas(), _implementation, 0, calldatasize(), 0, 0)
            // Copy the returned data
            returndatacopy(0, 0, returndatasize())
            // Check if the call was successful
            switch result
            case 0 { revert(0, returndatasize()) } // If not, revert
            default { return(0, returndatasize()) } // Otherwise, return the data
        }
    }
}

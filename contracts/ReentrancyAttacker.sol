// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Bridge.sol";

contract ReentrancyAttacker {
    Bridge private bridge;
    IERC20 private token;
    
    constructor(address _bridge, address _token) {
        bridge = Bridge(_bridge);
        token = IERC20(_token);
    }
    
    function attack() external {
        token.approve(address(bridge), type(uint256).max);
        bridge.lockTokens(address(token), 100, 2, address(this));
    }
    
    receive() external payable {
        if (address(bridge).balance > 0) {
            bridge.lockTokens(address(token), 100, 2, address(this));
        }
    }
}
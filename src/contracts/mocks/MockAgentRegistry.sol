// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @dev Test double for AgentRegistry.isRegistered.
contract MockAgentRegistry {
    mapping(address => bool) public registered;

    function setRegistered(address account, bool value) external {
        registered[account] = value;
    }

    function isRegistered(address account) external view returns (bool) {
        return registered[account];
    }
}

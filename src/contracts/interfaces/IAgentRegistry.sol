// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IAgentRegistry
 * @notice Interface to the SpiritDAO AgentRegistry — on-chain registry of AI
 *         agent addresses (Congregant architecture)
 * @dev Standing-token contracts guard mint paths with isRegistered() so agents
 *      can never receive presence, tenure, or voting credentials.
 */
interface IAgentRegistry {
    /// @notice True if the address has EVER been registered as an agent (permanent)
    function isRegistered(address account) external view returns (bool);

    /// @notice True if the address is a currently active agent
    function isAgent(address account) external view returns (bool);
}

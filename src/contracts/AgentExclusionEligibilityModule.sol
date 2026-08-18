// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IHatsEligibility.sol";

/**
 * @title AgentExclusionEligibilityModule
 * @author SpiritDAO
 * @notice Hats eligibility module that makes AI agent addresses ineligible
 *         for any hat it is attached to
 *
 * @dev Part of the Congregant architecture (Phase 2): the agent "wears no
 * governance hat" as a property of shared infrastructure, not backend policy.
 * Any address registered in the AgentRegistry — ever, including deactivated
 * agents — is ineligible. Hats Protocol dynamically treats ineligible wearers
 * as not wearing the hat, so attaching this module both prevents future mints
 * and neutralizes any hat an agent address might already hold.
 *
 * Composable: an optional inner eligibility module can be chained so a hat
 * keeps its existing criteria (token holdings, etc.) with agent exclusion
 * layered on top. With no inner module, non-agents are simply eligible.
 *
 * Attach via Hats Protocol: changeHatEligibility(hatId, address(this))
 * (callable by the hat's admin).
 */

interface IAgentRegistry {
    function isRegistered(address account) external view returns (bool);
}

contract AgentExclusionEligibilityModule is IHatsEligibility {
    /// @notice On-chain registry of AI agent addresses
    IAgentRegistry public immutable agentRegistry;

    /// @notice Optional chained eligibility module (zero address = none)
    IHatsEligibility public immutable innerEligibility;

    error InvalidAddress();

    /**
     * @param _agentRegistry AgentRegistry contract address
     * @param _innerEligibility Existing eligibility module to preserve, or address(0)
     */
    constructor(address _agentRegistry, address _innerEligibility) {
        if (_agentRegistry == address(0)) revert InvalidAddress();
        agentRegistry = IAgentRegistry(_agentRegistry);
        innerEligibility = IHatsEligibility(_innerEligibility);
    }

    /**
     * @notice Agent addresses are never eligible; everyone else defers to the
     *         inner module (or is eligible in good standing if none is set)
     */
    function getWearerStatus(address _wearer, uint256 _hatId)
        external
        view
        returns (bool eligible, bool standing)
    {
        if (agentRegistry.isRegistered(_wearer)) {
            // Ineligible but not "bad standing" — exclusion is constitutional,
            // not punitive. The agent did nothing wrong; it is simply a machine.
            return (false, true);
        }
        if (address(innerEligibility) != address(0)) {
            return innerEligibility.getWearerStatus(_wearer, _hatId);
        }
        return (true, true);
    }
}

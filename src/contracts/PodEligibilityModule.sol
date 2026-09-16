// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IHats.sol";
import "./interfaces/IHatsEligibility.sol";
import "./interfaces/IAgentRegistry.sol";

/**
 * @title PodEligibilityModule
 * @author SpiritDAO
 * @notice One eligibility module for pod hats that composes three rules:
 *
 *   1. Agent exclusion — any address ever registered in the AgentRegistry is
 *      ineligible (constitutional; the agent "wears no governance hat").
 *   2. Admin revocation — a hat's admin (per Hats Protocol's own
 *      isAdminOfHat) can revoke a wearer. Hats treats an ineligible wearer as
 *      not wearing the hat, and anyone may call Hats.checkHatWearerStatus to
 *      burn the token. This is the on-chain "remove member" the app never
 *      had: transferHat to the zero address is refused by Hats, and
 *      setHatWearerStatus may be called only by the eligibility module.
 *   3. Criteria — an optional inner module (the deployed EligibilityModule:
 *      signed agreements, token balances, time windows) is consulted last.
 *      With no inner module, or no criteria on the hat, humans are eligible.
 *
 * @dev Audit Phase 2, step 3 (2026-09-16). Replaces the
 * AgentExclusionEligibilityModule on pod hats; that module's inner
 * eligibility is immutable and set to zero, so composition requires a new
 * contract. Revocation is not "bad standing": standing stays true, so a
 * revoked member can be re-admitted by `reinstate` followed by a normal
 * mint, and carries no on-chain mark of punishment.
 *
 * Attach via Hats Protocol: changeHatEligibility(hatId, address(this)),
 * callable by the hat's admin.
 */
contract PodEligibilityModule is IHatsEligibility {
    /// @notice Hats Protocol
    IHats public immutable HATS;

    /// @notice On-chain registry of AI agent addresses
    IAgentRegistry public immutable agentRegistry;

    /// @notice Optional criteria module consulted after exclusion and revocation (zero = none)
    IHatsEligibility public immutable criteriaModule;

    /// @notice hatId => wearer => revoked by a hat admin
    mapping(uint256 => mapping(address => bool)) public revoked;

    event WearerRevoked(uint256 indexed hatId, address indexed wearer, address indexed by);
    event WearerReinstated(uint256 indexed hatId, address indexed wearer, address indexed by);

    error InvalidAddress();
    error NotHatAdmin();

    modifier onlyHatAdmin(uint256 _hatId) {
        if (!HATS.isAdminOfHat(msg.sender, _hatId)) revert NotHatAdmin();
        _;
    }

    /**
     * @param _hats Hats Protocol address
     * @param _agentRegistry AgentRegistry address (required)
     * @param _criteriaModule Existing criteria module to consult, or address(0)
     */
    constructor(address _hats, address _agentRegistry, address _criteriaModule) {
        if (_hats == address(0) || _agentRegistry == address(0)) revert InvalidAddress();
        HATS = IHats(_hats);
        agentRegistry = IAgentRegistry(_agentRegistry);
        criteriaModule = IHatsEligibility(_criteriaModule);
    }

    /*//////////////////////////////////////////////////////////////
                              REVOCATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Revoke a wearer. Callable by any admin of the hat (Hats'
     *         isAdminOfHat: the management hat's wearer, or an admin above it).
     *         Follow with Hats.checkHatWearerStatus(hatId, wearer) to burn.
     */
    function revoke(uint256 _hatId, address _wearer) external onlyHatAdmin(_hatId) {
        revoked[_hatId][_wearer] = true;
        emit WearerRevoked(_hatId, _wearer, msg.sender);
    }

    /// @notice Lift a revocation so the wearer may be minted the hat again.
    function reinstate(uint256 _hatId, address _wearer) external onlyHatAdmin(_hatId) {
        revoked[_hatId][_wearer] = false;
        emit WearerReinstated(_hatId, _wearer, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                              ELIGIBILITY
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Agents never; revoked wearers not until reinstated; everyone
     *         else per the criteria module, or eligible if there is none.
     *         Standing is true in every branch this contract decides —
     *         exclusion and revocation are removals, not punishments.
     */
    function getWearerStatus(address _wearer, uint256 _hatId)
        external
        view
        override
        returns (bool eligible, bool standing)
    {
        if (agentRegistry.isRegistered(_wearer)) return (false, true);
        if (revoked[_hatId][_wearer]) return (false, true);
        if (address(criteriaModule) != address(0)) {
            return criteriaModule.getWearerStatus(_wearer, _hatId);
        }
        return (true, true);
    }
}

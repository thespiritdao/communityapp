// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IEligibilityModule
 * @notice Interface for eligibility module that checks multiple criteria
 */
interface IEligibilityModule {
    /**
     * @notice Set up eligibility criteria for a hat
     * @param hatId The ID of the hat
     * @param tokenAddress The address of the token to check (if applicable)
     * @param minimumAmount The minimum amount required (if applicable)
     */
    function setupHatEligibility(
        uint256 hatId,
        address tokenAddress,
        uint256 minimumAmount
    ) external;

    /**
     * @notice Get the wearer status for a hat
     * @param wearer The address to check
     * @param hatId The hat ID
     * @return eligible Whether the wearer is eligible
     * @return standing Whether the wearer is in good standing
     */
    function getWearerStatus(address wearer, uint256 hatId)
        external
        view
        returns (bool eligible, bool standing);
}

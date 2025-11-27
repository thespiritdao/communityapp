// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IHatsEligibility
 * @notice Interface for Hats Protocol eligibility modules
 * @dev Modules implement this interface to determine hat eligibility
 */
interface IHatsEligibility {
    /**
     * @notice Returns the eligibility status and standing for a wearer of a hat
     * @param _wearer The address of the current or potential Hat wearer
     * @param _hatId The id of the hat in question
     * @return eligible Whether the wearer is eligible for the hat
     * @return standing Whether the wearer is in good standing (if eligible)
     */
    function getWearerStatus(address _wearer, uint256 _hatId)
        external
        view
        returns (bool eligible, bool standing);
}

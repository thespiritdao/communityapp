// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IHatsToggle
 * @notice Interface for Hats Protocol toggle modules
 * @dev Modules implement this interface to control hat active status
 */
interface IHatsToggle {
    /**
     * @notice Returns the status of a hat
     * @param _hatId The id of the hat
     * @return status Whether the hat is active
     */
    function getHatStatus(uint256 _hatId) external view returns (bool status);
}

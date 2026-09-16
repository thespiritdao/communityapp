// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @dev Test double for the one Hats call PodEligibilityModule makes.
contract MockHatsAdmin {
    mapping(uint256 => mapping(address => bool)) public admins;

    function setAdmin(uint256 hatId, address user, bool isAdmin) external {
        admins[hatId][user] = isAdmin;
    }

    function isAdminOfHat(address user, uint256 hatId) external view returns (bool) {
        return admins[hatId][user];
    }
}

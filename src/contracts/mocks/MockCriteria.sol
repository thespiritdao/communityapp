// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @dev Test double for a chained criteria module: one switch per wearer.
contract MockCriteria {
    mapping(address => bool) public ineligible;

    function setIneligible(address wearer, bool value) external {
        ineligible[wearer] = value;
    }

    function getWearerStatus(address wearer, uint256) external view returns (bool eligible, bool standing) {
        return (!ineligible[wearer], true);
    }
}

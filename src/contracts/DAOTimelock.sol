// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title DAOTimelock
 * @dev Simple wrapper around OpenZeppelin's TimelockController
 * This contract adds a time delay between proposal acceptance and execution
 */
contract DAOTimelock is TimelockController {
    /**
     * @dev Constructor sets up the timelock roles
     * @param minDelay Minimum delay before execution
     * @param proposers Addresses that can propose
     * @param executors Addresses that can execute
     * @param admin Admin address with special permissions
     */
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(
        minDelay,
        proposers,
        executors,
        admin
    ) {}
}
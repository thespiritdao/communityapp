// File: src/contracts/SystemToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SystemToken
/// @notice ERC20 “SYSTEM” token pegged 1:1 to fiat. Minting controlled via EXECUTIVE_ROLE.
contract SystemToken is ERC20, AccessControl {
    /// @notice Role identifier for accounts allowed to mint new tokens.
    bytes32 public constant EXECUTIVE_ROLE = keccak256("EXECUTIVE_ROLE");

    /// @param initialSupply   Amount of tokens (in wei) to mint initially.
    /// @param executiveAddress Address to receive EXECUTIVE_ROLE and initialSupply.
    constructor(uint256 initialSupply, address executiveAddress) ERC20("SystemToken", "SYSTEM") {
        require(executiveAddress != address(0), "SystemToken: invalid executive address");

        // Grant deployer the admin role so they can grant/revoke EXECUTIVE_ROLE
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Grant minting/executive permission
        _grantRole(EXECUTIVE_ROLE, executiveAddress);

        // Mint the initial supply to the executive
        _mint(executiveAddress, initialSupply);
    }

    /// @notice Creates `amount` new tokens for `to`. Caller must have EXECUTIVE_ROLE.
    /// @param to      Recipient of the newly minted tokens.
    /// @param amount  Number of tokens to mint (in wei).
    function mint(address to, uint256 amount) external onlyRole(EXECUTIVE_ROLE) {
        _mint(to, amount);
    }
}

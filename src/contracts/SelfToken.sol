// File: src/contracts/SelfToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SelfToken
/// @notice ERC20 “SELF” token with minting controlled by MINTER_ROLE.
contract SelfToken is ERC20, ERC20Burnable, AccessControl {
    /// @notice Role identifier for accounts allowed to mint new tokens.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @param initialSupply  Amount of tokens (in wei) to mint initially.
    /// @param initialMinter  Address to receive initialSupply and be granted MINTER_ROLE.
    constructor(uint256 initialSupply, address initialMinter) ERC20("SelfToken", "SELF") {
        require(initialMinter != address(0), "SelfToken: invalid minter address");

        // Grant deployer the default admin role
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Grant minting permission to the designated minter
        _grantRole(MINTER_ROLE, initialMinter);

        // Mint the initial supply to the minter
        _mint(initialMinter, initialSupply);
    }

    /// @notice Mints `amount` new tokens to `to`. Caller must have MINTER_ROLE.
    /// @param to      Recipient of the newly minted tokens.
    /// @param amount  Number of tokens to mint (in wei).
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}

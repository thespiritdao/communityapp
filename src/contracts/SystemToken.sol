// src/contracts/SystemToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; 
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol"; 
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SystemToken
 * @notice ERC20 token representing $SYSTEM (fiat-backed 1:1) with minting and burning functionality.
 *         Minting is restricted to addresses holding the EXECUTIVE_ROLE.
 */
contract SystemToken is ERC20, ERC20Burnable, AccessControl {
    // Define the role for governance—addresses with this role can mint tokens.
    bytes32 public constant EXECUTIVE_ROLE = keccak256("EXECUTIVE_ROLE");

    /**
     * @notice Constructor that mints an initial supply and grants EXECUTIVE_ROLE.
     * @param initialSupply The initial number of tokens (in wei).
     * @param executiveAddress The address that will hold the EXECUTIVE_ROLE.
     */
    constructor(uint256 initialSupply, address executiveAddress) ERC20("SystemToken", "$SYSTEM") {
        // Grant the deployer the default admin role.
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Grant EXECUTIVE_ROLE to the designated executive pod address.
        _setupRole(EXECUTIVE_ROLE, executiveAddress);
        // Mint the initial supply to the community vault (executive address).
        _mint(executiveAddress, initialSupply);
    }

    /**
     * @notice Mint additional $SYSTEM tokens.
     * @dev Only callable by accounts with EXECUTIVE_ROLE.
     * @param to The address to receive the minted tokens.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) external onlyRole(EXECUTIVE_ROLE) {
        _mint(to, amount);
    }
}

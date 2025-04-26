// contracts/SelfToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; 
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol"; 
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SelfToken
 * @notice ERC20 token representing $SELF (timebound). Minting is controlled by MINTER_ROLE.
 */
contract SelfToken is ERC20, ERC20Burnable, AccessControl {
    // Define a role that allows minting.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /**
     * @notice Constructor that mints an initial supply and sets up roles.
     * @param initialSupply The initial number of tokens to mint (in wei units).
     * @param initialMinter The address that will receive the MINTER_ROLE.
     */
    constructor(uint256 initialSupply, address initialMinter) ERC20("SelfToken", "$SELF") {
        // Grant the deployer the default admin role.
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Grant the MINTER_ROLE to the designated address.
        _setupRole(MINTER_ROLE, initialMinter);
        // Mint the initial supply to the deployer (or you can mint to another address if needed).
        _mint(msg.sender, initialSupply);
    }

    /**
     * @notice Mint additional $SELF tokens.
     * @param to The address to receive the minted tokens.
     * @param amount The amount of tokens to mint.
     * @dev Only accounts with MINTER_ROLE can call this function.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}

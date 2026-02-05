// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SystemTokenV2
/// @notice ERC20 "SYSTEM" token pegged 1:1 to fiat
/// @dev V2 uses Hats Protocol for automatic permission management
/// @dev Minting allowed for Executive Pod Leader Hat wearers OR manual EXECUTIVE_ROLE grants
interface IHats {
    function balanceOf(address wearer, uint256 hatId) external view returns (uint256);
    function isWearerOfHat(address wearer, uint256 hatId) external view returns (bool);
}

contract SystemTokenV2 is ERC20, AccessControl {
    /// @notice Role identifier for accounts allowed to mint new tokens (fallback).
    bytes32 public constant EXECUTIVE_ROLE = keccak256("EXECUTIVE_ROLE");

    /// @notice Hats Protocol contract reference
    IHats public immutable hatsProtocol;

    /// @notice Executive Pod Leader Hat ID
    uint256 public immutable executiveHatId;

    /// @param initialSupply       Amount of tokens (in wei) to mint initially.
    /// @param executiveAddress    Address to receive EXECUTIVE_ROLE and initialSupply.
    /// @param _hatsProtocol       Hats Protocol contract address
    /// @param _executiveHatId     Executive Pod Leader Hat ID
    constructor(
        uint256 initialSupply,
        address executiveAddress,
        address _hatsProtocol,
        uint256 _executiveHatId
    ) ERC20("SystemToken", "SYSTEM") {
        require(executiveAddress != address(0), "SystemToken: invalid executive address");
        require(_hatsProtocol != address(0), "SystemToken: invalid hats address");
        require(_executiveHatId != 0, "SystemToken: invalid hat ID");

        hatsProtocol = IHats(_hatsProtocol);
        executiveHatId = _executiveHatId;

        // Grant deployer the admin role so they can grant/revoke EXECUTIVE_ROLE
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Grant fallback minting permission
        _grantRole(EXECUTIVE_ROLE, executiveAddress);

        // Mint the initial supply to the executive
        _mint(executiveAddress, initialSupply);
    }

    /// @notice Check if caller has permission to mint
    /// @dev Returns true if caller wears Executive Hat OR has EXECUTIVE_ROLE
    /// @param account Address to check
    /// @return bool True if authorized to mint
    function canMint(address account) public view returns (bool) {
        // Check if account wears the Executive Pod Leader Hat
        if (hatsProtocol.isWearerOfHat(account, executiveHatId)) {
            return true;
        }

        // Fallback: Check if account has manual EXECUTIVE_ROLE
        return hasRole(EXECUTIVE_ROLE, account);
    }

    /// @notice Creates `amount` new tokens for `to`
    /// @dev Caller must wear Executive Hat OR have EXECUTIVE_ROLE
    /// @param to      Recipient of the newly minted tokens
    /// @param amount  Number of tokens to mint (in wei)
    function mint(address to, uint256 amount) external {
        require(canMint(msg.sender), "SystemToken: caller cannot mint");
        _mint(to, amount);
    }

    /// @notice Emergency function to update Executive Hat ID
    /// @dev Only callable by DEFAULT_ADMIN_ROLE
    /// @param newHatId New Executive Pod Leader Hat ID
    function updateExecutiveHatId(uint256 newHatId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newHatId != 0, "SystemToken: invalid hat ID");
        // Note: This would require making executiveHatId mutable
        // For production, consider using UUPS proxy pattern instead
        revert("SystemToken: Hat ID is immutable. Deploy new contract or use proxy.");
    }
}

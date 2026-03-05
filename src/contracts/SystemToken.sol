// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SystemToken
/// @notice ERC20 "SYSTEM" token pegged 1:1 to fiat.
/// @dev Minting is authorized for Executive Pod Leader Hat wearers (via Hats Protocol)
///      or addresses with the manual EXECUTIVE_ROLE fallback grant.
interface IHats {
    function isWearerOfHat(address wearer, uint256 hatId) external view returns (bool);
}

contract SystemToken is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant EXECUTIVE_ROLE = keccak256("EXECUTIVE_ROLE");

    IHats public immutable hatsProtocol;
    uint256 public immutable executiveHatId;

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

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EXECUTIVE_ROLE, executiveAddress);
        _mint(executiveAddress, initialSupply);
    }

    /// @notice Returns true if `account` is authorized to mint.
    function canMint(address account) public view returns (bool) {
        return hatsProtocol.isWearerOfHat(account, executiveHatId) || hasRole(EXECUTIVE_ROLE, account);
    }

    /// @notice Mint `amount` tokens to `to`. Caller must be authorized via canMint().
    function mint(address to, uint256 amount) external {
        require(canMint(msg.sender), "SystemToken: caller cannot mint");
        _mint(to, amount);
    }
}

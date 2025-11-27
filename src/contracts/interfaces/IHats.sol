// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IHats
 * @notice Interface for Hats Protocol
 * @dev Minimal interface for hat management
 */
interface IHats {
    function mintTopHat(
        address _target,
        string calldata _details,
        string calldata _imageURI
    ) external returns (uint256 topHatId);

    function createHat(
        uint256 _admin,
        string calldata _details,
        uint32 _maxSupply,
        address _eligibility,
        address _toggle,
        bool _mutable,
        string calldata _imageURI
    ) external returns (uint256 newHatId);

    function mintHat(uint256 _hatId, address _wearer) external returns (bool);

    function transferHat(uint256 _hatId, address _from, address _to) external;

    function isWearerOfHat(address _user, uint256 _hatId) external view returns (bool);

    function isAdminOfHat(address _user, uint256 _hatId) external view returns (bool);

    function isActive(uint256 _hatId) external view returns (bool);

    function getHatStatus(uint256 _hatId) external view returns (bool);

    function getHatEligibilityModule(uint256 _hatId) external view returns (address);

    function getHatToggleModule(uint256 _hatId) external view returns (address);

    function getHatMaxSupply(uint256 _hatId) external view returns (uint32);

    function hatSupply(uint256 _hatId) external view returns (uint32);

    function getImageURIForHat(uint256 _hatId) external view returns (string memory);

    function balanceOf(address _wearer, uint256 _hatId) external view returns (uint256);

    function uri(uint256 id) external view returns (string memory);
}

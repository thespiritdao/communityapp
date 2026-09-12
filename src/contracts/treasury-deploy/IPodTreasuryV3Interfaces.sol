// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IHatsBalance {
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

interface IPodTreasuryFactoryV3 {
    function deployTreasury(
        string memory podId,
        uint256 managementHatId,
        address[] memory supportedTokens,
        uint256 initialThresholdBps
    ) external returns (address);

    function getTreasuryForPod(string memory podId) external view returns (address);
    function hasTreasury(string memory podId) external view returns (bool);
}

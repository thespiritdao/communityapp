// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PodTreasuryV3.sol";

/**
 * @title PodTreasuryFactoryV3
 * @dev Factory for deploying PodTreasuryV3 contracts.
 *      `deployTreasury` is gated to `authorizedDeployer` only — the wrapper
 *      contract (PodTreasuryDeployerV3) that enforces the pod↔hat binding
 *      against the canonical Hats tree before any deploy. This closes the
 *      front-run/squat attack (H-1) while keeping the flow self-sovereign:
 *      anyone holding a legitimate pod management hat can call the deployer,
 *      no central admin gate on actual treasury creation.
 *      `Ownable` retained only for proxy/default-tokens/deployer config.
 */
contract PodTreasuryFactoryV3 is Ownable, ReentrancyGuard {
    address public immutable hatsContract;
    address public authorizedProxy;
    address public bountyManager;
    address public authorizedDeployer;
    address[] public defaultSupportedTokens;

    mapping(string => address) public podTreasuries;
    mapping(address => bool) public isTreasury;
    mapping(address => string) public treasuryToPod;
    mapping(string => bool) public isPodTreasuryDeployed;
    address[] public allTreasuries;
    string[] public allPodIds;

    event TreasuryDeployed(
        string indexed podId,
        address indexed treasuryAddress,
        uint256 indexed managementHatId,
        uint256 initialThresholdBps,
        address[] supportedTokens,
        address deployer
    );

    event AuthorizedProxyUpdated(
        address indexed oldProxy,
        address indexed newProxy,
        address updater
    );

    event AuthorizedDeployerUpdated(
        address indexed oldDeployer,
        address indexed newDeployer,
        address updater
    );

    modifier onlyAuthorizedDeployer() {
        require(msg.sender == authorizedDeployer, "Only authorized deployer");
        _;
    }

    constructor(
        address _hatsContract,
        address[] memory _defaultSupportedTokens,
        address _owner,
        address _authorizedProxy,
        address _bountyManager
    ) Ownable(_owner) {
        require(_hatsContract != address(0), "Invalid hats contract");
        require(_authorizedProxy != address(0), "Invalid proxy address");
        hatsContract = _hatsContract;
        authorizedProxy = _authorizedProxy;
        bountyManager = _bountyManager;
        defaultSupportedTokens = _defaultSupportedTokens;
    }

    function deployTreasury(
        string memory podId,
        uint256 managementHatId,
        address[] memory supportedTokens,
        uint256 initialThresholdBps
    ) external onlyAuthorizedDeployer nonReentrant returns (address) {
        require(bytes(podId).length > 0, "Pod ID cannot be empty");
        require(managementHatId > 0, "Invalid management hat ID");
        require(!isPodTreasuryDeployed[podId], "Treasury already exists for pod");

        address[] memory tokens = supportedTokens.length > 0 ? supportedTokens : defaultSupportedTokens;
        require(tokens.length > 0, "Must have at least one supported token");

        bytes32 salt = keccak256(abi.encodePacked(podId, managementHatId));
        PodTreasuryV3 treasury = new PodTreasuryV3{salt: salt}(
            hatsContract,
            managementHatId,
            podId,
            tokens,
            authorizedProxy,
            bountyManager,
            initialThresholdBps
        );

        address treasuryAddress = address(treasury);

        podTreasuries[podId] = treasuryAddress;
        isTreasury[treasuryAddress] = true;
        treasuryToPod[treasuryAddress] = podId;
        isPodTreasuryDeployed[podId] = true;
        allTreasuries.push(treasuryAddress);
        allPodIds.push(podId);

        emit TreasuryDeployed(podId, treasuryAddress, managementHatId, initialThresholdBps, tokens, msg.sender);

        return treasuryAddress;
    }

    function getTreasuryForPod(string memory podId) external view returns (address) {
        return podTreasuries[podId];
    }

    function getPodForTreasury(address treasuryAddress) external view returns (string memory) {
        return treasuryToPod[treasuryAddress];
    }

    function hasTreasury(string memory podId) external view returns (bool) {
        return isPodTreasuryDeployed[podId];
    }

    function getAllTreasuries() external view returns (address[] memory) {
        return allTreasuries;
    }

    function getAllPodIds() external view returns (string[] memory) {
        return allPodIds;
    }

    function getTreasuryCount() external view returns (uint256) {
        return allTreasuries.length;
    }

    function updateDefaultSupportedTokens(address[] memory newTokens) external onlyOwner {
        defaultSupportedTokens = newTokens;
    }

    function getDefaultSupportedTokens() external view returns (address[] memory) {
        return defaultSupportedTokens;
    }

    function updateAuthorizedProxy(address _newProxy) external onlyOwner {
        require(_newProxy != address(0), "Invalid proxy address");
        address oldProxy = authorizedProxy;
        authorizedProxy = _newProxy;
        emit AuthorizedProxyUpdated(oldProxy, _newProxy, msg.sender);
    }

    function updateAuthorizedDeployer(address _newDeployer) external onlyOwner {
        require(_newDeployer != address(0), "Invalid deployer address");
        address oldDeployer = authorizedDeployer;
        authorizedDeployer = _newDeployer;
        emit AuthorizedDeployerUpdated(oldDeployer, _newDeployer, msg.sender);
    }
}

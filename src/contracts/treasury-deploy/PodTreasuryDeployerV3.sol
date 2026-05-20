// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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

/**
 * @title PodTreasuryDeployerV3
 * @dev Permissionless wrapper that gates the treasury factory while preserving
 *      pod self-sovereignty. Any user holding a legitimate pod management hat
 *      can deploy that pod's treasury through this contract — no admin gate.
 *
 * Two on-chain checks block the front-run/squat attack from H-1:
 * 1. Caller must currently wear the management hat (`balanceOf > 0`)
 * 2. The management hat must belong to a registered canonical Hats tree —
 *    verified by `hatId >> 224 == canonicalTopHatDomain`. A self-minted hat
 *    in an attacker's own tree has a different top-hat domain and fails.
 *
 * Multiple canonical top-hat domains can be registered to support tree
 * migrations (e.g., the 0x00000749 → future tree transition).
 *
 * Owner controls only: rotate the factory, add/remove canonical top-hat
 * domains. Cannot block a legitimate deploy whose tree is already registered.
 */
contract PodTreasuryDeployerV3 is Ownable, ReentrancyGuard {
    IHatsBalance public immutable hatsContract;
    IPodTreasuryFactoryV3 public factory;

    mapping(uint32 => bool) public isCanonicalTopHatDomain;
    uint32[] public canonicalTopHatDomains;

    event CanonicalTopHatDomainAdded(uint32 indexed domain);
    event CanonicalTopHatDomainRemoved(uint32 indexed domain);
    event FactoryUpdated(address indexed oldFactory, address indexed newFactory);
    event TreasuryDeployedViaWrapper(
        string indexed podId,
        uint256 indexed managementHatId,
        address indexed caller,
        address treasury
    );

    constructor(
        address _hatsContract,
        address _factory,
        uint32 _initialCanonicalTopHatDomain,
        address _owner
    ) Ownable(_owner) {
        require(_hatsContract != address(0), "Invalid hats contract");
        require(_factory != address(0), "Invalid factory");
        require(_initialCanonicalTopHatDomain > 0, "Invalid domain");

        hatsContract = IHatsBalance(_hatsContract);
        factory = IPodTreasuryFactoryV3(_factory);
        isCanonicalTopHatDomain[_initialCanonicalTopHatDomain] = true;
        canonicalTopHatDomains.push(_initialCanonicalTopHatDomain);
        emit CanonicalTopHatDomainAdded(_initialCanonicalTopHatDomain);
    }

    function deployTreasury(
        string memory podId,
        uint256 managementHatId,
        address[] memory supportedTokens,
        uint256 initialThresholdBps
    ) external nonReentrant returns (address) {
        require(managementHatId > 0, "Invalid management hat");

        uint32 domain = uint32(managementHatId >> 224);
        require(isCanonicalTopHatDomain[domain], "Hat not in canonical tree");

        require(
            hatsContract.balanceOf(msg.sender, managementHatId) > 0,
            "Caller must hold management hat"
        );

        address treasury = factory.deployTreasury(
            podId,
            managementHatId,
            supportedTokens,
            initialThresholdBps
        );

        emit TreasuryDeployedViaWrapper(podId, managementHatId, msg.sender, treasury);
        return treasury;
    }

    function addCanonicalTopHatDomain(uint32 domain) external onlyOwner {
        require(domain > 0, "Invalid domain");
        require(!isCanonicalTopHatDomain[domain], "Already registered");
        isCanonicalTopHatDomain[domain] = true;
        canonicalTopHatDomains.push(domain);
        emit CanonicalTopHatDomainAdded(domain);
    }

    function removeCanonicalTopHatDomain(uint32 domain) external onlyOwner {
        require(isCanonicalTopHatDomain[domain], "Not registered");
        isCanonicalTopHatDomain[domain] = false;

        uint256 len = canonicalTopHatDomains.length;
        for (uint256 i = 0; i < len; i++) {
            if (canonicalTopHatDomains[i] == domain) {
                canonicalTopHatDomains[i] = canonicalTopHatDomains[len - 1];
                canonicalTopHatDomains.pop();
                break;
            }
        }

        emit CanonicalTopHatDomainRemoved(domain);
    }

    function updateFactory(address newFactory) external onlyOwner {
        require(newFactory != address(0), "Invalid factory");
        address oldFactory = address(factory);
        factory = IPodTreasuryFactoryV3(newFactory);
        emit FactoryUpdated(oldFactory, newFactory);
    }

    function canonicalTopHatDomainsList() external view returns (uint32[] memory) {
        return canonicalTopHatDomains;
    }

    function getTreasuryForPod(string memory podId) external view returns (address) {
        return factory.getTreasuryForPod(podId);
    }

    function hasTreasury(string memory podId) external view returns (bool) {
        return factory.hasTreasury(podId);
    }
}

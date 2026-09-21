// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PodTreasuryV2WithVoting.sol";


/**
 * @title PodTreasuryFactory
 * @dev Factory contract to deploy PodTreasury contracts with deterministic addresses
 */
contract PodTreasuryFactory is Ownable, ReentrancyGuard {
    address public immutable hatsContract;
    address public authorizedProxy; // Treasury proxy address - now mutable
    address public bountyManager;   // BountyManager address — auto-approved in each treasury at construction
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
        address[] supportedTokens,
        address deployer
    );
    
    event TreasuryRegistered(
        string indexed podId,
        address indexed treasuryAddress,
        uint256 indexed managementHatId,
        address registrar
    );
    
    event AuthorizedProxyUpdated(
        address indexed oldProxy,
        address indexed newProxy,
        address updater
    );
    
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
        address[] memory supportedTokens
    ) external nonReentrant returns (address) {
        require(bytes(podId).length > 0, "Pod ID cannot be empty");
        require(managementHatId > 0, "Invalid management hat ID");
        require(!isPodTreasuryDeployed[podId], "Treasury already exists for pod");

        address[] memory tokens = supportedTokens.length > 0 ? supportedTokens : defaultSupportedTokens;
        require(tokens.length > 0, "Must have at least one supported token");

        bytes32 salt = keccak256(abi.encodePacked(podId, managementHatId, block.timestamp));
        PodTreasuryV2WithVoting treasury = new PodTreasuryV2WithVoting{salt: salt}(
            hatsContract,
            managementHatId,
            podId,
            tokens,
            authorizedProxy,
            bountyManager
        );
        
        address treasuryAddress = address(treasury);
        
        podTreasuries[podId] = treasuryAddress;
        isTreasury[treasuryAddress] = true;
        treasuryToPod[treasuryAddress] = podId;
        isPodTreasuryDeployed[podId] = true;
        allTreasuries.push(treasuryAddress);
        allPodIds.push(podId);
        
        emit TreasuryDeployed(podId, treasuryAddress, managementHatId, tokens, msg.sender);
        
        return treasuryAddress;
    }
    
    function registerExistingTreasury(
        string memory podId,
        address treasuryAddress,
        uint256 managementHatId
    ) external onlyOwner nonReentrant {
        require(bytes(podId).length > 0, "Pod ID cannot be empty");
        require(treasuryAddress != address(0), "Invalid treasury address");
        require(managementHatId > 0, "Invalid management hat ID");
        require(!isPodTreasuryDeployed[podId], "Treasury already exists for this pod");

        PodTreasuryV2WithVoting treasury = PodTreasuryV2WithVoting(treasuryAddress);
        require(treasury.managementHatId() == managementHatId, "Management hat ID mismatch");
        require(keccak256(bytes(treasury.podId())) == keccak256(bytes(podId)), "Pod ID mismatch");
        
        podTreasuries[podId] = treasuryAddress;
        isTreasury[treasuryAddress] = true;
        treasuryToPod[treasuryAddress] = podId;
        isPodTreasuryDeployed[podId] = true;
        allTreasuries.push(treasuryAddress);
        allPodIds.push(podId);
        
        emit TreasuryRegistered(podId, treasuryAddress, managementHatId, msg.sender);
    }
    
    function batchDeployTreasuries(
        string[] memory podIds,
        uint256[] memory managementHatIds,
        address[][] memory supportedTokens
    ) external returns (address[] memory) {
        require(podIds.length == managementHatIds.length, "Arrays length mismatch");

        address[] memory deployedTreasuries = new address[](podIds.length);

        for (uint i = 0; i < podIds.length; i++) {
            address[] memory tokens = supportedTokens.length > i && supportedTokens[i].length > 0
                ? supportedTokens[i]
                : defaultSupportedTokens;

            deployedTreasuries[i] = this.deployTreasury(podIds[i], managementHatIds[i], tokens);
        }

        return deployedTreasuries;
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
    
    /**
     * @dev Update the treasury address for an existing pod (owner only)
     * Used when redeploying a treasury contract for an existing pod
     */
    function updateTreasury(
        string memory podId,
        address newTreasuryAddress
    ) external onlyOwner {
        require(isPodTreasuryDeployed[podId], "Pod not registered");
        require(newTreasuryAddress != address(0), "Invalid treasury address");

        address oldTreasury = podTreasuries[podId];
        isTreasury[oldTreasury] = false;

        podTreasuries[podId] = newTreasuryAddress;
        isTreasury[newTreasuryAddress] = true;
        treasuryToPod[newTreasuryAddress] = podId;
        allTreasuries.push(newTreasuryAddress);

        emit TreasuryRegistered(podId, newTreasuryAddress, 0, msg.sender);
    }

    /**
     * @dev Update the authorized proxy address (owner only)
     * This allows updating the proxy reference after deployment
     */
    function updateAuthorizedProxy(address _newProxy) external onlyOwner {
        require(_newProxy != address(0), "Invalid proxy address");
        address oldProxy = authorizedProxy;
        authorizedProxy = _newProxy;
        emit AuthorizedProxyUpdated(oldProxy, _newProxy, msg.sender);
    }
}

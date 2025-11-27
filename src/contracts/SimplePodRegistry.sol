// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IHats {
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function isValidHat(uint256 hatId) external view returns (bool);
}

/**
 * @title SimplePodRegistry
 * @dev Lightweight registry for HATS-based pods
 * Users create HATs directly, then register them here for DAO integration
 */
contract SimplePodRegistry is Ownable {
    IHats public immutable hatsContract;
    
    struct PodInfo {
        uint256 managementHatId;
        uint256 membershipHatId;  // Optional - set later
        string name;
        string description;
        string ipfsMetadata;
        address[] leaders;
        address treasuryContract; // Optional - deploy when needed
        uint256 registeredAt;
        bool isActive;
    }
    
    mapping(uint256 => PodInfo) public pods; // managementHatId => PodInfo
    mapping(address => uint256[]) public userPods; // user => hatIds they lead
    uint256[] public allPodHats;
    
    event PodRegistered(uint256 indexed managementHatId, string name, address[] leaders);
    event TreasuryDeployed(uint256 indexed managementHatId, address treasuryContract);
    event PodDeactivated(uint256 indexed managementHatId);
    
    constructor(address _hatsContract, address initialOwner) Ownable(initialOwner) {
        hatsContract = IHats(_hatsContract);
    }
    
    /**
     * @dev Register an existing HAT as a DAO pod
     * Anyone can register if they wear the management HAT
     */
    function registerPod(
        uint256 managementHatId,
        string memory name,
        string memory description,
        string memory ipfsMetadata,
        address[] memory leaders
    ) external {
        require(hatsContract.isValidHat(managementHatId), "Invalid HAT");
        require(
            hatsContract.balanceOf(msg.sender, managementHatId) > 0,
            "Must wear the HAT to register"
        );
        require(!pods[managementHatId].isActive, "Pod already registered");
        require(bytes(name).length > 0, "Name required");
        require(leaders.length > 0, "Leaders required");
        
        pods[managementHatId] = PodInfo({
            managementHatId: managementHatId,
            membershipHatId: 0, // Set later if needed
            name: name,
            description: description,
            ipfsMetadata: ipfsMetadata,
            leaders: leaders,
            treasuryContract: address(0),
            registeredAt: block.timestamp,
            isActive: true
        });
        
        allPodHats.push(managementHatId);
        
        // Track user associations
        for (uint i = 0; i < leaders.length; i++) {
            userPods[leaders[i]].push(managementHatId);
        }
        
        emit PodRegistered(managementHatId, name, leaders);
    }
    
    /**
     * @dev Deploy treasury for a registered pod (optional)
     */
    function deployTreasury(uint256 managementHatId) external {
        PodInfo storage pod = pods[managementHatId];
        require(pod.isActive, "Pod not registered");
        require(
            hatsContract.balanceOf(msg.sender, managementHatId) > 0,
            "Must be pod leader"
        );
        require(pod.treasuryContract == address(0), "Treasury already deployed");
        
        // Deploy treasury (simplified - use your existing treasury logic)
        address treasuryContract = _deployTreasury(managementHatId);
        pod.treasuryContract = treasuryContract;
        
        emit TreasuryDeployed(managementHatId, treasuryContract);
    }
    
    /**
     * @dev Set membership HAT for pod
     */
    function setMembershipHat(uint256 managementHatId, uint256 membershipHatId) external {
        PodInfo storage pod = pods[managementHatId];
        require(pod.isActive, "Pod not registered");
        require(
            hatsContract.balanceOf(msg.sender, managementHatId) > 0,
            "Must be pod leader"
        );
        require(hatsContract.isValidHat(membershipHatId), "Invalid membership HAT");
        
        pod.membershipHatId = membershipHatId;
    }
    
    /**
     * @dev Get pod info
     */
    function getPodInfo(uint256 managementHatId) external view returns (PodInfo memory) {
        require(pods[managementHatId].isActive, "Pod not found");
        return pods[managementHatId];
    }
    
    /**
     * @dev Get all registered pod HATs
     */
    function getAllPods() external view returns (uint256[] memory) {
        return allPodHats;
    }
    
    /**
     * @dev Get user's pods
     */
    function getUserPods(address user) external view returns (uint256[] memory) {
        return userPods[user];
    }
    
    /**
     * @dev Check if HAT is registered as pod
     */
    function isPod(uint256 hatId) external view returns (bool) {
        return pods[hatId].isActive;
    }
    
    /**
     * @dev Simplified treasury deployment
     * TODO: Integrate with your existing PodTreasury contracts
     */
    function _deployTreasury(uint256 managementHatId) internal returns (address) {
        // For now, this is a placeholder
        // In production, you would deploy your PodTreasury contract here
        // using the same logic from your PodCreationManager
        
        // Example deployment (replace with your actual treasury logic):
        // bytes memory bytecode = abi.encodePacked(
        //     type(PodTreasuryProxy).creationCode,
        //     abi.encode(treasuryImplementation, managementHatId, "registry-pod")
        // );
        // bytes32 salt = keccak256(abi.encodePacked(managementHatId, block.timestamp));
        // address treasury;
        // assembly {
        //     treasury := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        // }
        // return treasury;
        
        return address(0); // Return zero for now - treasury deployment optional
    }
    
    /**
     * @dev Emergency deactivation (owner only)
     */
    function deactivatePod(uint256 managementHatId) external onlyOwner {
        require(pods[managementHatId].isActive, "Pod not active");
        pods[managementHatId].isActive = false;
        emit PodDeactivated(managementHatId);
    }
}
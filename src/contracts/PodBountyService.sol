// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PodBountyService
 * @notice Service contract for validating pod permissions for bounty management
 * @dev Integrates with your existing pod system and Supabase data
 */
contract PodBountyService is Ownable {
    
    // Pod data structures
    struct Pod {
        string podId;
        address creator;
        address[] leaders;
        address treasuryAddress;
        bool isActive;
        uint256 createdAt;
    }

    // Pod role permissions
    struct PodRole {
        string podId;
        address userAddress;
        string role; // 'leader', 'member', 'treasury_manager'
        bool isActive;
        uint256 grantedAt;
    }

    // Storage
    mapping(string => Pod) public pods;
    mapping(string => mapping(address => PodRole)) public podRoles;
    mapping(string => address[]) public podMembers;
    mapping(address => bool) public authorizedUpdaters; // Off-chain services that can update pod data
    
    string[] public podIds;

    // Events
    event PodRegistered(string indexed podId, address indexed creator);
    event PodUpdated(string indexed podId);
    event RoleGranted(string indexed podId, address indexed user, string role);
    event RoleRevoked(string indexed podId, address indexed user, string role);
    event TreasuryAddressUpdated(string indexed podId, address indexed newTreasury);
    event AuthorizedUpdaterAdded(address indexed updater);
    event AuthorizedUpdaterRemoved(address indexed updater);

    constructor() Ownable(msg.sender) {
        // Contract deployer is initial owner
        authorizedUpdaters[msg.sender] = true;
    }

    modifier onlyAuthorizedUpdater() {
        require(authorizedUpdaters[msg.sender] || msg.sender == owner(), "Not authorized to update pod data");
        _;
    }

    /**
     * @notice Register a new pod (called by your backend API)
     * @param podId Unique pod identifier
     * @param creator Pod creator address
     * @param leaders Array of initial pod leaders
     * @param treasuryAddress Pod treasury contract address
     */
    function registerPod(
        string calldata podId,
        address creator,
        address[] calldata leaders,
        address treasuryAddress
    ) external onlyAuthorizedUpdater {
        require(bytes(podId).length > 0, "Pod ID required");
        require(creator != address(0), "Creator required");
        require(!isValidPod(podId), "Pod already exists");

        // Create pod
        pods[podId] = Pod({
            podId: podId,
            creator: creator,
            leaders: leaders,
            treasuryAddress: treasuryAddress,
            isActive: true,
            createdAt: block.timestamp
        });

        podIds.push(podId);

        // Grant creator leader role
        _grantRole(podId, creator, "leader");

        // Grant leader roles to initial leaders
        for (uint i = 0; i < leaders.length; i++) {
            if (leaders[i] != creator) {
                _grantRole(podId, leaders[i], "leader");
            }
            podMembers[podId].push(leaders[i]);
        }

        emit PodRegistered(podId, creator);
    }

    /**
     * @notice Update pod information
     * @param podId Pod identifier
     * @param newLeaders Updated leaders array
     * @param newTreasuryAddress Updated treasury address
     * @param isActive Whether pod is active
     */
    function updatePod(
        string calldata podId,
        address[] calldata newLeaders,
        address newTreasuryAddress,
        bool isActive
    ) external onlyAuthorizedUpdater {
        require(isValidPod(podId), "Pod not found");
        
        Pod storage pod = pods[podId];
        
        // Update leaders
        if (newLeaders.length > 0) {
            // Revoke existing leader roles
            for (uint i = 0; i < pod.leaders.length; i++) {
                _revokeRole(podId, pod.leaders[i], "leader");
            }
            
            // Grant new leader roles
            pod.leaders = newLeaders;
            for (uint i = 0; i < newLeaders.length; i++) {
                _grantRole(podId, newLeaders[i], "leader");
            }
        }
        
        // Update treasury if provided
        if (newTreasuryAddress != address(0) && newTreasuryAddress != pod.treasuryAddress) {
            pod.treasuryAddress = newTreasuryAddress;
            emit TreasuryAddressUpdated(podId, newTreasuryAddress);
        }
        
        // Update active status
        pod.isActive = isActive;
        
        emit PodUpdated(podId);
    }

    /**
     * @notice Grant a role to a user in a pod
     * @param podId Pod identifier
     * @param user User address
     * @param role Role to grant ('leader', 'member', 'treasury_manager')
     */
    function grantRole(
        string calldata podId,
        address user,
        string calldata role
    ) external onlyAuthorizedUpdater {
        require(isValidPod(podId), "Pod not found");
        _grantRole(podId, user, role);
        
        // Add to members list if not already there
        address[] storage members = podMembers[podId];
        bool isMember = false;
        for (uint i = 0; i < members.length; i++) {
            if (members[i] == user) {
                isMember = true;
                break;
            }
        }
        if (!isMember) {
            members.push(user);
        }
    }

    /**
     * @notice Revoke a role from a user in a pod
     * @param podId Pod identifier
     * @param user User address
     * @param role Role to revoke
     */
    function revokeRole(
        string calldata podId,
        address user,
        string calldata role
    ) external onlyAuthorizedUpdater {
        require(isValidPod(podId), "Pod not found");
        _revokeRole(podId, user, role);
    }

    /**
     * @notice Check if user can manage bounties for a pod
     * @param user User address
     * @param podId Pod identifier
     * @return bool True if user can manage bounties
     */
    function canManageBounties(address user, string calldata podId) 
        external 
        view 
        returns (bool) 
    {
        if (!isValidPod(podId)) return false;
        
        Pod memory pod = pods[podId];
        if (!pod.isActive) return false;
        
        PodRole memory role = podRoles[podId][user];
        
        // Pod creator can always manage bounties
        if (pod.creator == user) return true;
        
        // Pod leaders can manage bounties
        if (role.isActive && 
            (keccak256(bytes(role.role)) == keccak256(bytes("leader")))) {
            return true;
        }
        
        return false;
    }

    /**
     * @notice Check if user can use pod treasury
     * @param user User address
     * @param podId Pod identifier
     * @return bool True if user can use treasury
     */
    function canUsePodTreasury(address user, string calldata podId) 
        external 
        view 
        returns (bool) 
    {
        if (!isValidPod(podId)) return false;
        
        Pod memory pod = pods[podId];
        if (!pod.isActive) return false;
        
        PodRole memory role = podRoles[podId][user];
        
        // Pod creator can use treasury
        if (pod.creator == user) return true;
        
        // Leaders and treasury managers can use treasury
        if (role.isActive && 
            (keccak256(bytes(role.role)) == keccak256(bytes("leader")) ||
             keccak256(bytes(role.role)) == keccak256(bytes("treasury_manager")))) {
            return true;
        }
        
        return false;
    }

    /**
     * @notice Get pod treasury address
     * @param podId Pod identifier
     * @return address Treasury contract address
     */
    function getPodTreasuryAddress(string calldata podId) 
        external 
        view 
        returns (address) 
    {
        if (!isValidPod(podId)) return address(0);
        return pods[podId].treasuryAddress;
    }

    /**
     * @notice Check if pod exists and is valid
     * @param podId Pod identifier
     * @return bool True if pod is valid
     */
    function isValidPod(string calldata podId) public view returns (bool) {
        return bytes(pods[podId].podId).length > 0;
    }

    /**
     * @notice Get pod information
     * @param podId Pod identifier
     * @return Pod struct data
     */
    function getPod(string calldata podId) 
        external 
        view 
        returns (Pod memory) 
    {
        require(isValidPod(podId), "Pod not found");
        return pods[podId];
    }

    /**
     * @notice Get user's role in a pod
     * @param podId Pod identifier
     * @param user User address
     * @return PodRole struct data
     */
    function getUserRole(string calldata podId, address user) 
        external 
        view 
        returns (PodRole memory) 
    {
        return podRoles[podId][user];
    }

    /**
     * @notice Get all pod members
     * @param podId Pod identifier
     * @return address[] Array of member addresses
     */
    function getPodMembers(string calldata podId) 
        external 
        view 
        returns (address[] memory) 
    {
        return podMembers[podId];
    }

    /**
     * @notice Get all registered pod IDs
     * @return string[] Array of pod IDs
     */
    function getAllPods() external view returns (string[] memory) {
        return podIds;
    }

    // Internal functions
    function _grantRole(
        string memory podId,
        address user,
        string memory role
    ) internal {
        podRoles[podId][user] = PodRole({
            podId: podId,
            userAddress: user,
            role: role,
            isActive: true,
            grantedAt: block.timestamp
        });
        
        emit RoleGranted(podId, user, role);
    }

    function _revokeRole(
        string memory podId,
        address user,
        string memory role
    ) internal {
        PodRole storage userRole = podRoles[podId][user];
        if (keccak256(bytes(userRole.role)) == keccak256(bytes(role))) {
            userRole.isActive = false;
            emit RoleRevoked(podId, user, role);
        }
    }

    // Admin functions
    function addAuthorizedUpdater(address updater) external onlyOwner {
        authorizedUpdaters[updater] = true;
        emit AuthorizedUpdaterAdded(updater);
    }

    function removeAuthorizedUpdater(address updater) external onlyOwner {
        authorizedUpdaters[updater] = false;
        emit AuthorizedUpdaterRemoved(updater);
    }

    function isAuthorizedUpdater(address updater) external view returns (bool) {
        return authorizedUpdaters[updater];
    }
}
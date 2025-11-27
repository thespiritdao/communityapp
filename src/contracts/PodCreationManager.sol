// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IHats {
    function createHat(
        uint256 _admin,
        string calldata _details,
        uint32 _maxSupply,
        address _eligibility,
        address _toggle,
        bool _mutable,
        string calldata _imageURI
    ) external returns (uint256);
    
    function mintHat(uint256 hatId, address wearer) external returns (bool);
    function batchMintHats(uint256[] calldata hatIds, address[] calldata wearers) external returns (bool);
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

interface IPodTreasuryFactory {
    function deployTreasury(
        string memory podId,
        uint256 managementHatId,
        address[] memory supportedTokens
    ) external returns (address);
    
    function registerExistingTreasury(
        string memory podId,
        address treasuryAddress,
        uint256 managementHatId
    ) external;
    
    function getTreasuryForPod(string memory podId) external view returns (address);
    function hasTreasury(string memory podId) external view returns (bool);
}

/**
 * @title PodCreationManager
 * @dev Manages the creation and activation of DAO pods with HATS integration
 * Handles pod lifecycle from proposal to activation with governance integration
 */
contract PodCreationManager is Ownable, ReentrancyGuard, Pausable {
    IHats public immutable hatsContract;
    address public immutable daoGovernor;
    uint256 public immutable executiveHatId;
    IPodTreasuryFactory public treasuryFactory;
    address[] public defaultSupportedTokens;
    
    struct PodData {
        string podId;
        string name;
        string description;
        string imageURI;
        address[] podLeads;
        uint256 parentHatId;
        uint256 managementHatId;
        uint256 membershipHatId;
        address treasuryContract;
        address creator;
        uint256 createdAt;
        PodStatus status;
    }
    
    enum PodStatus {
        Draft,      // Created but not yet proposed
        Proposed,   // Submitted for governance approval
        Active,     // Approved and operational
        Inactive    // Deactivated
    }
    
    // Storage
    mapping(string => PodData) public pods;
    mapping(string => bool) public podExists;
    mapping(address => string[]) public userPods; // User address -> pod IDs they created or lead
    string[] public allPodIds;
    
    // Events
    event PodProposed(
        string indexed podId, 
        address indexed creator,
        address[] podLeads, 
        uint256 managementHatId,
        uint256 timestamp
    );
    
    event PodActivated(
        string indexed podId, 
        uint256 membershipHatId, 
        address treasuryContract,
        uint256 timestamp
    );
    
    event HatsAirdropped(
        string indexed podId, 
        address[] recipients,
        uint256 hatId
    );
    
    event PodDeactivated(
        string indexed podId,
        uint256 timestamp
    );
    
    event TreasuryDeployed(
        string indexed podId,
        address treasuryContract,
        uint256 managementHatId
    );
    
    constructor(
        address _hatsContract,
        address _daoGovernor,
        uint256 _executiveHatId,
        address _treasuryFactory,
        address[] memory _defaultSupportedTokens,
        address initialOwner
    ) Ownable(initialOwner) ReentrancyGuard() {
        require(_hatsContract != address(0), "Invalid hats contract");
        require(_daoGovernor != address(0), "Invalid DAO governor");
        require(_treasuryFactory != address(0), "Invalid treasury factory");
        require(initialOwner != address(0), "Invalid initial owner");
        
        hatsContract = IHats(_hatsContract);
        daoGovernor = _daoGovernor;
        executiveHatId = _executiveHatId;
        treasuryFactory = IPodTreasuryFactory(_treasuryFactory);
        defaultSupportedTokens = _defaultSupportedTokens;
    }
    
    /**
     * @dev Create a pod proposal with management hat creation
     * This puts the pod in "Proposed" status awaiting governance approval
     */
    function createPodProposal(
        string memory podId,
        string memory name,
        string memory description,
        string memory imageURI,
        address[] memory podLeads,
        uint256 parentHatId
    ) external onlyOwner nonReentrant whenNotPaused {
        require(bytes(podId).length > 0, "Pod ID cannot be empty");
        require(bytes(name).length > 0, "Name cannot be empty");
        require(!podExists[podId], "Pod already exists");
        require(podLeads.length > 0 && podLeads.length <= 5, "Invalid number of pod leads");
        require(parentHatId > 0, "Invalid parent hat ID");
        
        // Validate pod leads are unique
        for (uint i = 0; i < podLeads.length; i++) {
            require(podLeads[i] != address(0), "Invalid pod lead address");
            for (uint j = i + 1; j < podLeads.length; j++) {
                require(podLeads[i] != podLeads[j], "Duplicate pod lead addresses");
            }
        }
        
        // Create management hat for pod leads
        string memory managementDetails = string.concat(name, " Pod Leadership");
        uint256 managementHatId = hatsContract.createHat(
            parentHatId,       // _admin
            managementDetails, // _details
            uint32(podLeads.length), // _maxSupply = number of pod leads
            address(1),        // _eligibility - Dummy address (cannot be zero)
            address(1),        // _toggle - Dummy address (cannot be zero)
            true,              // _mutable
            imageURI           // _imageURI
        );
        
        // Store pod data
        pods[podId] = PodData({
            podId: podId,
            name: name,
            description: description,
            imageURI: imageURI,
            podLeads: podLeads,
            parentHatId: parentHatId,
            managementHatId: managementHatId,
            membershipHatId: 0, // Set during activation
            treasuryContract: address(0), // Set during activation
            creator: msg.sender,
            createdAt: block.timestamp,
            status: PodStatus.Proposed
        });
        
        podExists[podId] = true;
        allPodIds.push(podId);
        
        // Track user associations
        userPods[msg.sender].push(podId);
        for (uint i = 0; i < podLeads.length; i++) {
            userPods[podLeads[i]].push(podId);
        }
        
        emit PodProposed(podId, msg.sender, podLeads, managementHatId, block.timestamp);
    }
    
    /**
     * @dev Activate pod after governance approval
     * Creates membership hat, deploys treasury, and mints management hats
     */
    function activatePod(string memory podId) external onlyOwner nonReentrant {
        require(podExists[podId], "Pod does not exist");
        PodData storage pod = pods[podId];
        require(pod.status == PodStatus.Proposed, "Pod not in proposed status");
        
        // Create membership hat (unlimited supply)
        string memory membershipDetails = string.concat(pod.name, " Pod Membership");
        uint256 membershipHatId = hatsContract.createHat(
            pod.managementHatId, // _admin - Child of management hat
            membershipDetails,   // _details
            type(uint32).max,    // _maxSupply - Unlimited members
            address(1),          // _eligibility - Dummy address (cannot be zero)
            address(1),          // _toggle - Dummy address (cannot be zero)
            true,                // _mutable
            pod.imageURI         // _imageURI
        );
        
        // Deploy treasury contract using factory
        address treasuryContract = treasuryFactory.deployTreasury(
            podId,
            pod.managementHatId,
            defaultSupportedTokens
        );
        
        // Update pod data
        pod.membershipHatId = membershipHatId;
        pod.treasuryContract = treasuryContract;
        pod.status = PodStatus.Active;
        
        // Mint management hats to pod leads
        uint256[] memory hatIds = new uint256[](pod.podLeads.length);
        for (uint i = 0; i < pod.podLeads.length; i++) {
            hatIds[i] = pod.managementHatId;
        }
        
        bool success = hatsContract.batchMintHats(hatIds, pod.podLeads);
        require(success, "Failed to mint management hats");
        
        emit PodActivated(podId, membershipHatId, treasuryContract, block.timestamp);
        emit HatsAirdropped(podId, pod.podLeads, pod.managementHatId);
    }
    
    /**
     * @dev Deactivate a pod (emergency function)
     */
    function deactivatePod(string memory podId) external onlyOwner {
        require(podExists[podId], "Pod does not exist");
        PodData storage pod = pods[podId];
        require(pod.status == PodStatus.Active, "Pod not active");
        
        pod.status = PodStatus.Inactive;
        
        emit PodDeactivated(podId, block.timestamp);
    }
    
    /**
     * @dev Deploy treasury for existing pod (separate from activation)
     * Allows pod managers to deploy treasury after pod creation
     */
    function deployPodTreasury(
        string memory podId,
        address[] memory supportedTokens
    ) external nonReentrant {
        require(podExists[podId], "Pod does not exist");
        PodData memory pod = pods[podId];
        require(pod.status == PodStatus.Active, "Pod not active");
        require(!treasuryFactory.hasTreasury(podId), "Treasury already deployed");
        
        // Verify caller has management hat for this pod
        require(
            hatsContract.balanceOf(msg.sender, pod.managementHatId) > 0,
            "Only pod managers can deploy treasury"
        );
        
        // Use provided tokens or default
        address[] memory tokens = supportedTokens.length > 0 ? supportedTokens : defaultSupportedTokens;
        
        // Deploy treasury using factory
        address treasuryAddress = treasuryFactory.deployTreasury(
            podId,
            pod.managementHatId,
            tokens
        );
        
        // Update pod data
        pods[podId].treasuryContract = treasuryAddress;
        
        emit TreasuryDeployed(podId, treasuryAddress, pod.managementHatId);
    }
    
    /**
     * @dev Register existing treasury for pod (migration support)
     */
    function registerExistingPodTreasury(
        string memory podId,
        address treasuryAddress
    ) external onlyOwner {
        require(podExists[podId], "Pod does not exist");
        PodData memory pod = pods[podId];
        require(!treasuryFactory.hasTreasury(podId), "Treasury already registered");
        
        // Register with factory
        treasuryFactory.registerExistingTreasury(
            podId,
            treasuryAddress,
            pod.managementHatId
        );
        
        // Update pod data
        pods[podId].treasuryContract = treasuryAddress;
        
        emit TreasuryDeployed(podId, treasuryAddress, pod.managementHatId);
    }
    
    /**
     * @dev Mint membership hat to new pod member (restricted to pod managers)
     */
    function mintMembershipHat(string memory podId, address newMember) external nonReentrant {
        require(podExists[podId], "Pod does not exist");
        PodData memory pod = pods[podId];
        require(pod.status == PodStatus.Active, "Pod not active");
        require(pod.membershipHatId > 0, "Membership hat not created");
        
        // Verify caller has management hat for this pod
        require(
            hatsContract.balanceOf(msg.sender, pod.managementHatId) > 0,
            "Only pod managers can mint membership hats"
        );
        
        bool success = hatsContract.mintHat(pod.membershipHatId, newMember);
        require(success, "Failed to mint membership hat");
    }
    
    /**
     * @dev Batch mint membership hats (for pod managers)
     */
    function batchMintMembershipHats(
        string memory podId, 
        address[] memory newMembers
    ) external nonReentrant {
        require(podExists[podId], "Pod does not exist");
        PodData memory pod = pods[podId];
        require(pod.status == PodStatus.Active, "Pod not active");
        require(pod.membershipHatId > 0, "Membership hat not created");
        
        // Verify caller has management hat for this pod
        require(
            hatsContract.balanceOf(msg.sender, pod.managementHatId) > 0,
            "Only pod managers can mint membership hats"
        );
        
        uint256[] memory hatIds = new uint256[](newMembers.length);
        for (uint i = 0; i < newMembers.length; i++) {
            hatIds[i] = pod.membershipHatId;
        }
        
        bool success = hatsContract.batchMintHats(hatIds, newMembers);
        require(success, "Failed to batch mint membership hats");
        
        emit HatsAirdropped(podId, newMembers, pod.membershipHatId);
    }
    
    /**
     * @dev Get pod data by ID
     */
    function getPodData(string memory podId) external view returns (PodData memory) {
        require(podExists[podId], "Pod does not exist");
        return pods[podId];
    }
    
    /**
     * @dev Get all pod IDs
     */
    function getAllPodIds() external view returns (string[] memory) {
        return allPodIds;
    }
    
    /**
     * @dev Get user's associated pod IDs
     */
    function getUserPods(address user) external view returns (string[] memory) {
        return userPods[user];
    }
    
    /**
     * @dev Get pods by status
     */
    function getPodsByStatus(PodStatus status) external view returns (string[] memory) {
        string[] memory result = new string[](allPodIds.length);
        uint256 count = 0;
        
        for (uint i = 0; i < allPodIds.length; i++) {
            if (pods[allPodIds[i]].status == status) {
                result[count] = allPodIds[i];
                count++;
            }
        }
        
        // Resize array
        assembly {
            mstore(result, count)
        }
        
        return result;
    }
    
    /**
     * @dev Check if address is pod manager
     */
    function isPodManager(string memory podId, address user) external view returns (bool) {
        if (!podExists[podId]) return false;
        PodData memory pod = pods[podId];
        return hatsContract.balanceOf(user, pod.managementHatId) > 0;
    }
    
    /**
     * @dev Check if address is pod member
     */
    function isPodMember(string memory podId, address user) external view returns (bool) {
        if (!podExists[podId]) return false;
        PodData memory pod = pods[podId];
        if (pod.membershipHatId == 0) return false;
        return hatsContract.balanceOf(user, pod.membershipHatId) > 0;
    }
    
    /**
     * @dev Update treasury factory (owner only)
     */
    function updateTreasuryFactory(address newFactory) external onlyOwner {
        require(newFactory != address(0), "Invalid factory");
        treasuryFactory = IPodTreasuryFactory(newFactory);
    }
    
    /**
     * @dev Update default supported tokens (owner only)
     */
    function updateDefaultSupportedTokens(address[] memory newTokens) external onlyOwner {
        require(newTokens.length > 0, "Must specify at least one token");
        defaultSupportedTokens = newTokens;
    }
    
    /**
     * @dev Get default supported tokens
     */
    function getDefaultSupportedTokens() external view returns (address[] memory) {
        return defaultSupportedTokens;
    }
    
    /**
     * @dev Get treasury factory address
     */
    function getTreasuryFactory() external view returns (address) {
        return address(treasuryFactory);
    }
    
    /**
     * @dev Emergency functions
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
}


// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/**
 * @title IHats
 * @notice Interface for Hats Protocol
 */
interface IHats {
    function changeHatDetails(uint256 _hatId, string memory _newDetails) external;
    function changeHatImageURI(uint256 _hatId, string memory _newImageURI) external;
    function changeHatMaxSupply(uint256 _hatId, uint32 _newMaxSupply) external;
    function changeHatEligibility(uint256 _hatId, address _newEligibility) external;
    function changeHatToggle(uint256 _hatId, address _newToggle) external;
    function isAdminOfHat(address _user, uint256 _hatId) external view returns (bool);
    function isWearerOfHat(address _user, uint256 _hatId) external view returns (bool);
}

/**
 * @title IMultiCriteriaEligibility
 * @notice Interface for MultiCriteriaEligibility module
 */
interface IMultiCriteriaEligibility {
    function addTokenBalanceCriterion(uint256 _hatId, address _tokenContract, uint256 _minimumAmount, bool _requireAll) external;
    function addTimeCriterion(uint256 _hatId, uint256 _validFrom, uint256 _validUntil, bool _requireAll) external;
    function addAgreementCriterion(uint256 _hatId, bytes32 _agreementHash, bool _requireAll) external;
    function addCredentialCriterion(uint256 _hatId, address _credentialContract, uint256 _tokenId, bool _requireAll) external;
    function clearAllCriteria(uint256 _hatId) external;
    function setHatAdmin(uint256 _hatId, address _admin) external;
}

/**
 * @title IHatsToggle
 * @notice Interface for Hats Protocol toggle modules
 * @dev Toggle modules control whether a HAT is active/inactive
 */
interface IHatsToggle {
    /**
     * @notice Returns the status of a HAT
     * @param _hatId The HAT ID to check
     * @return bool True if the HAT is active, false otherwise
     */
    function getHatStatus(uint256 _hatId) external view returns (bool);
}

/**
 * @title PodAuthProxy
 * @notice Template contract for pod authorization instances (deployed as minimal proxies)
 * @dev Each pod gets its own proxy instance with specific authorization rules
 *
 * ARCHITECTURE:
 * - This proxy serves as the ADMIN of the pod's HATs
 * - Pod leaders can manage HAT details through this proxy
 * - Executive Pod retains emergency control via factory
 * - Achieves pod autonomy while maintaining organizational oversight
 */
contract PodAuthProxy is Initializable {

    // Hats Protocol address (Base mainnet)
    address public constant HATS_PROTOCOL = 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137;

    // Factory address (set during initialization)
    address public factory;

    // Pod data
    string public podId;
    address public creator;
    address[] public leaders;
    address public treasuryAddress;
    bool public isActive;
    uint256 public createdAt;

    // HAT data
    uint256 public managementHatId;
    uint256 public membershipHatId;
    uint256 public proxyAdminHatId;  // Proxy wears this HAT to have admin rights

    // Role mappings for gas-efficient lookups
    mapping(address => bool) public isLeader;
    mapping(address => bool) public isTreasuryManager;

    // Events
    event PodInitialized(string indexed podId, address indexed creator);
    event PodUpdated(string indexed podId);
    event LeaderAdded(string indexed podId, address indexed leader);
    event LeaderRemoved(string indexed podId, address indexed leader);
    event ProxyAdminHatSet(string indexed podId, uint256 proxyAdminHatId);
    event HatDetailsChanged(string indexed podId, uint256 indexed hatId, string newDetails);
    event HatImageChanged(string indexed podId, uint256 indexed hatId, string newImageURI);
    event HatMaxSupplyChanged(string indexed podId, uint256 indexed hatId, uint32 newMaxSupply);
    event TreasuryManagerAdded(string indexed podId, address indexed manager);
    event TreasuryManagerRemoved(string indexed podId, address indexed manager);

    /**
     * @notice Initialize the pod proxy (called by factory)
     * @param _podId Unique pod identifier
     * @param _creator Pod creator address
     * @param _leaders Array of pod leader addresses
     * @param _treasuryAddress Pod treasury address
     * @param _predictedProxyAdminHatId Predicted admin HAT ID (calculated off-chain before deployment)
     */
    function initialize(
        string calldata _podId,
        address _creator,
        address[] calldata _leaders,
        address _treasuryAddress,
        uint256 _predictedProxyAdminHatId
    ) external initializer {
        require(bytes(_podId).length > 0, "Pod ID required");
        require(_creator != address(0), "Creator required");
        require(_predictedProxyAdminHatId > 0, "Admin HAT ID required");

        // Store factory address (msg.sender is the factory calling this)
        factory = msg.sender;

        podId = _podId;
        creator = _creator;
        treasuryAddress = _treasuryAddress;
        proxyAdminHatId = _predictedProxyAdminHatId;
        isActive = true;
        createdAt = block.timestamp;

        // Set creator as leader
        isLeader[_creator] = true;
        leaders.push(_creator);

        // Add initial leaders
        for (uint i = 0; i < _leaders.length; i++) {
            address leader = _leaders[i];
            if (leader != address(0) && !isLeader[leader]) {
                isLeader[leader] = true;
                leaders.push(leader);
            }
        }

        emit PodInitialized(_podId, _creator);
        emit ProxyAdminHatSet(_podId, _predictedProxyAdminHatId);
    }

    /**
     * @notice Set the HAT IDs for this pod (called after HAT creation)
     * @param _managementHatId Management HAT ID
     * @param _membershipHatId Membership HAT ID
     */
    function setHatIds(uint256 _managementHatId, uint256 _membershipHatId) external {
        require(msg.sender == _getFactory() || isLeader[msg.sender], "Not authorized");
        require(managementHatId == 0, "HAT IDs already set");

        managementHatId = _managementHatId;
        membershipHatId = _membershipHatId;
    }

    /**
     * @notice Set the Proxy Admin HAT ID (emergency use only)
     * @dev In v2, admin HAT ID is set during initialization via predicted value
     *      This function is kept for emergency corrections if prediction fails
     *      or for backwards compatibility with v1 workflows
     * @param _proxyAdminHatId The HAT ID that this proxy will wear as admin
     */
    function setProxyAdminHat(uint256 _proxyAdminHatId) external {
        require(msg.sender == _getFactory() || isLeader[msg.sender], "Not authorized");
        require(_proxyAdminHatId > 0, "Invalid admin HAT ID");

        proxyAdminHatId = _proxyAdminHatId;

        emit ProxyAdminHatSet(podId, _proxyAdminHatId);
    }

    /**
     * @notice Verify this proxy wears the admin HAT (internal helper)
     * @dev Checks if proxy has been properly set up with admin HAT
     * @return bool True if proxy wears admin HAT
     */
    function _verifyAdminHat() internal view returns (bool) {
        if (proxyAdminHatId == 0) {
            return false;
        }

        // Check if this proxy wears the admin HAT
        // This was minted to the proxy in Phase 5 of pod creation
        return IHats(HATS_PROTOCOL).isWearerOfHat(address(this), proxyAdminHatId);
    }

    /**
     * @notice Get the Proxy Admin HAT ID
     * @return uint256 The admin HAT ID this proxy wears
     */
    function getProxyAdminHatId() external view returns (uint256) {
        return proxyAdminHatId;
    }

    /**
     * @notice Update pod data (only callable by factory when authorized)
     * @param newLeaders Updated leaders array
     * @param newTreasuryAddress Updated treasury address
     * @param _isActive Pod active status
     */
    function updatePodData(
        address[] calldata newLeaders,
        address newTreasuryAddress,
        bool _isActive
    ) external {
        require(msg.sender == _getFactory(), "Only factory can update");
        
        // Clear existing leaders
        for (uint i = 0; i < leaders.length; i++) {
            isLeader[leaders[i]] = false;
        }
        delete leaders;
        
        // Set creator as leader (always)
        isLeader[creator] = true;
        leaders.push(creator);
        
        // Add new leaders
        for (uint i = 0; i < newLeaders.length; i++) {
            address leader = newLeaders[i];
            if (leader != address(0) && !isLeader[leader]) {
                isLeader[leader] = true;
                leaders.push(leader);
            }
        }
        
        treasuryAddress = newTreasuryAddress;
        isActive = _isActive;
        
        emit PodUpdated(podId);
    }
    
    /**
     * @notice Check if user can manage bounties for this pod
     * @dev Uses Hats Protocol to check management HAT ownership (works with smart wallets)
     * @param user Address to check
     * @return bool True if user can manage bounties
     */
    function canManage(address user) public view returns (bool) {
        if (!isActive) return false;

        // Check if user wears the management HAT
        // This works for both EOAs and smart wallets since Hats Protocol
        // tracks HAT ownership regardless of wallet type
        if (managementHatId != 0) {
            return IHats(HATS_PROTOCOL).isWearerOfHat(user, managementHatId);
        }

        // Fallback to legacy authorization (for pods created before HAT integration)
        return user == creator || isLeader[user];
    }

    /**
     * @notice Check if user can manage pod (for HAT modifications that require proxy admin)
     * @dev More restrictive than canManage - only for operations that need proxy admin setup
     * @param user Address to check
     * @return bool True if user can perform HAT modifications
     */
    function canManageHats(address user) public view returns (bool) {
        if (!isActive) return false;

        // For HAT modification operations, require both:
        // 1. User has management HAT
        // 2. Proxy admin HAT is set up (Phase 5 completed)
        if (managementHatId != 0 && proxyAdminHatId != 0) {
            return IHats(HATS_PROTOCOL).isWearerOfHat(user, managementHatId);
        }

        // Fallback to legacy authorization
        return user == creator || isLeader[user];
    }

    /**
     * @notice Check if user can use pod treasury
     * @dev Uses Hats Protocol for management HAT check (works with smart wallets)
     * @param user Address to check
     * @return bool True if user can use treasury
     */
    function canUseTreasury(address user) public view returns (bool) {
        if (!isActive) return false;

        // Check if user is a treasury manager
        if (isTreasuryManager[user]) return true;

        // Check if user wears the management HAT (works with smart wallets)
        if (managementHatId != 0) {
            return IHats(HATS_PROTOCOL).isWearerOfHat(user, managementHatId);
        }

        // Fallback to legacy authorization
        return user == creator || isLeader[user];
    }
    
    /**
     * @notice Get pod ID
     */
    function getPodId() external view returns (string memory) {
        return podId;
    }
    
    /**
     * @notice Get all leaders
     */
    function getLeaders() external view returns (address[] memory) {
        return leaders;
    }
    
    /**
     * @notice Get factory address
     * @dev Returns the factory address stored during initialization
     * @return address The factory contract address
     */
    function _getFactory() internal view returns (address) {
        return factory;
    }

    /**
     * @notice Get factory address (public getter)
     * @return address The factory contract address
     */
    function getFactory() external view returns (address) {
        return factory;
    }

    /**
     * @notice Check if address is a leader
     */
    function checkIsLeader(address user) external view returns (bool) {
        return isLeader[user];
    }
    
    /**
     * @notice Get pod creation timestamp
     */
    function getCreatedAt() external view returns (uint256) {
        return createdAt;
    }

    // ============================================================
    // TREASURY MANAGER FUNCTIONS
    // ============================================================

    /**
     * @notice Add a treasury manager to the pod
     * @dev Only pod leaders can add treasury managers
     * @param manager Address to grant treasury manager role
     */
    function addTreasuryManager(address manager) external {
        require(isActive, "Pod is not active");
        require(canManage(msg.sender), "Not authorized to manage pod");
        require(manager != address(0), "Invalid manager address");
        require(!isTreasuryManager[manager], "Already a treasury manager");

        isTreasuryManager[manager] = true;
        emit TreasuryManagerAdded(podId, manager);
    }

    /**
     * @notice Remove a treasury manager from the pod
     * @dev Only pod leaders can remove treasury managers
     * @param manager Address to revoke treasury manager role from
     */
    function removeTreasuryManager(address manager) external {
        require(isActive, "Pod is not active");
        require(canManage(msg.sender), "Not authorized to manage pod");
        require(isTreasuryManager[manager], "Not a treasury manager");

        isTreasuryManager[manager] = false;
        emit TreasuryManagerRemoved(podId, manager);
    }

    /**
     * @notice Check if an address is a treasury manager
     * @param user Address to check
     * @return bool True if user is a treasury manager
     */
    function checkIsTreasuryManager(address user) external view returns (bool) {
        return isTreasuryManager[user];
    }

    // ============================================================
    // HAT ADMIN FUNCTIONS (PROXY AS ADMIN PATTERN)
    // ============================================================

    /**
     * @notice Change HAT details via proxy (enables pod leader autonomy)
     * @dev This proxy must wear the admin HAT and be set as admin of the target HAT
     * @param _hatId HAT ID to modify
     * @param _newDetails New details string (usually IPFS URI)
     */
    function changeHatDetailsViaProxy(uint256 _hatId, string memory _newDetails) external {
        require(isActive, "Pod is not active");
        require(canManageHats(msg.sender), "Not authorized to manage pod");

        // Verify proxy has admin HAT set up
        require(proxyAdminHatId > 0, "Proxy admin HAT not set - pod needs migration");

        // Verify this proxy wears the admin HAT and is admin of target HAT
        require(
            _verifyAdminHat(),
            "Proxy does not wear admin HAT or is not admin of pod HATs"
        );

        // Verify proxy is admin of the specific HAT being modified
        require(
            IHats(HATS_PROTOCOL).isAdminOfHat(address(this), _hatId),
            "Proxy is not admin of this specific HAT"
        );

        // Call Hats Protocol as the admin
        IHats(HATS_PROTOCOL).changeHatDetails(_hatId, _newDetails);

        emit HatDetailsChanged(podId, _hatId, _newDetails);
    }

    /**
     * @notice Change HAT image URI via proxy
     * @param _hatId HAT ID to modify
     * @param _newImageURI New image URI
     */
    function changeHatImageURIViaProxy(uint256 _hatId, string memory _newImageURI) external {
        require(isActive, "Pod is not active");
        require(canManageHats(msg.sender), "Not authorized to manage pod");
        require(proxyAdminHatId > 0, "Proxy admin HAT not set - pod needs migration");
        require(_verifyAdminHat(), "Proxy does not wear admin HAT or is not admin of pod HATs");
        require(
            IHats(HATS_PROTOCOL).isAdminOfHat(address(this), _hatId),
            "Proxy is not admin of this specific HAT"
        );

        IHats(HATS_PROTOCOL).changeHatImageURI(_hatId, _newImageURI);

        emit HatImageChanged(podId, _hatId, _newImageURI);
    }

    /**
     * @notice Change HAT max supply via proxy
     * @param _hatId HAT ID to modify
     * @param _newMaxSupply New max supply
     */
    function changeHatMaxSupplyViaProxy(uint256 _hatId, uint32 _newMaxSupply) external {
        require(isActive, "Pod is not active");
        require(canManageHats(msg.sender), "Not authorized to manage pod");
        require(proxyAdminHatId > 0, "Proxy admin HAT not set - pod needs migration");
        require(_verifyAdminHat(), "Proxy does not wear admin HAT or is not admin of pod HATs");
        require(
            IHats(HATS_PROTOCOL).isAdminOfHat(address(this), _hatId),
            "Proxy is not admin of this specific HAT"
        );

        IHats(HATS_PROTOCOL).changeHatMaxSupply(_hatId, _newMaxSupply);

        emit HatMaxSupplyChanged(podId, _hatId, _newMaxSupply);
    }

    /**
     * @notice Change HAT eligibility module via proxy
     * @param _hatId HAT ID to modify
     * @param _newEligibility New eligibility module address
     */
    function changeHatEligibilityViaProxy(uint256 _hatId, address _newEligibility) external {
        require(isActive, "Pod is not active");
        require(canManageHats(msg.sender), "Not authorized to manage pod");
        require(proxyAdminHatId > 0, "Proxy admin HAT not set - pod needs migration");
        require(_verifyAdminHat(), "Proxy does not wear admin HAT or is not admin of pod HATs");
        require(
            IHats(HATS_PROTOCOL).isAdminOfHat(address(this), _hatId),
            "Proxy is not admin of this specific HAT"
        );

        IHats(HATS_PROTOCOL).changeHatEligibility(_hatId, _newEligibility);
    }

    /**
     * @notice Change HAT toggle module via proxy
     * @param _hatId HAT ID to modify
     * @param _newToggle New toggle module address
     */
    function changeHatToggleViaProxy(uint256 _hatId, address _newToggle) external {
        require(isActive, "Pod is not active");
        require(canManageHats(msg.sender), "Not authorized to manage pod");
        require(proxyAdminHatId > 0, "Proxy admin HAT not set - pod needs migration");
        require(_verifyAdminHat(), "Proxy does not wear admin HAT or is not admin of pod HATs");
        require(
            IHats(HATS_PROTOCOL).isAdminOfHat(address(this), _hatId),
            "Proxy is not admin of this specific HAT"
        );

        IHats(HATS_PROTOCOL).changeHatToggle(_hatId, _newToggle);
    }

    /**
     * @notice Check if this proxy is admin of a specific HAT
     * @param _hatId HAT ID to check
     * @return bool True if proxy is admin
     */
    function isProxyAdminOfHat(uint256 _hatId) external view returns (bool) {
        return IHats(HATS_PROTOCOL).isAdminOfHat(address(this), _hatId);
    }

    // ============================================================
    // ELIGIBILITY CRITERIA MANAGEMENT (PROXY ROUTING PATTERN)
    // ============================================================

    /**
     * @notice Add token balance criterion via proxy (enables pod leaders to set token-gating)
     * @dev Routes the call through this proxy which has admin rights on the eligibility module
     * @param _eligibilityModule Address of the MultiCriteriaEligibility module
     * @param _hatId HAT ID to add criterion for
     * @param _tokenContract Address of the token contract
     * @param _minimumAmount Minimum token balance required
     * @param _requireAll Whether all criteria must be met (true) or any (false)
     */
    function addTokenBalanceCriterionViaProxy(
        address _eligibilityModule,
        uint256 _hatId,
        address _tokenContract,
        uint256 _minimumAmount,
        bool _requireAll
    ) external {
        require(isActive, "Pod is not active");
        require(_eligibilityModule != address(0), "Invalid eligibility module address");
        require(_tokenContract != address(0), "Invalid token contract address");

        // 🚀 V3 PATTERN: Trust factory's authorization (scalable for all communities)
        if (msg.sender == factory) {
            // Factory already validated user wears management HAT
            // This enables pod leaders to manage eligibility without proxy wearing admin HAT
            IMultiCriteriaEligibility(_eligibilityModule).addTokenBalanceCriterion(
                _hatId,
                _tokenContract,
                _minimumAmount,
                _requireAll
            );
            return;
        }

        // For direct calls (not through factory), require full authorization
        require(canManage(msg.sender), "Not authorized to manage pod");
        require(proxyAdminHatId > 0, "Proxy admin HAT not set - pod needs migration");
        require(_verifyAdminHat(), "Proxy does not wear admin HAT");

        // Call eligibility module as the admin (this proxy)
        IMultiCriteriaEligibility(_eligibilityModule).addTokenBalanceCriterion(
            _hatId,
            _tokenContract,
            _minimumAmount,
            _requireAll
        );
    }

    /**
     * @notice Add time-based criterion via proxy
     * @param _eligibilityModule Address of the MultiCriteriaEligibility module
     * @param _hatId HAT ID to add criterion for
     * @param _validFrom Unix timestamp when eligibility starts
     * @param _validUntil Unix timestamp when eligibility ends
     * @param _requireAll Whether all criteria must be met (true) or any (false)
     */
    function addTimeCriterionViaProxy(
        address _eligibilityModule,
        uint256 _hatId,
        uint256 _validFrom,
        uint256 _validUntil,
        bool _requireAll
    ) external {
        require(isActive, "Pod is not active");
        require(_eligibilityModule != address(0), "Invalid eligibility module address");
        require(_validUntil > _validFrom, "Invalid time range");

        // 🚀 V3 PATTERN: Trust factory's authorization (scalable for all communities)
        if (msg.sender == factory) {
            // Factory already validated user wears management HAT
            // This enables pod leaders to manage eligibility without proxy wearing admin HAT
            IMultiCriteriaEligibility(_eligibilityModule).addTimeCriterion(
                _hatId,
                _validFrom,
                _validUntil,
                _requireAll
            );
            return;
        }

        // For direct calls (not through factory), require full authorization
        require(canManage(msg.sender), "Not authorized to manage pod");
        require(proxyAdminHatId > 0, "Proxy admin HAT not set - pod needs migration");
        require(_verifyAdminHat(), "Proxy does not wear admin HAT");

        // Call eligibility module as the admin (this proxy)
        IMultiCriteriaEligibility(_eligibilityModule).addTimeCriterion(
            _hatId,
            _validFrom,
            _validUntil,
            _requireAll
        );
    }

    /**
     * @notice Add agreement criterion via proxy
     * @param _eligibilityModule Address of the MultiCriteriaEligibility module
     * @param _hatId HAT ID to add criterion for
     * @param _agreementHash Keccak256 hash of the agreement text
     * @param _requireAll Whether all criteria must be met (true) or any (false)
     */
    function addAgreementCriterionViaProxy(
        address _eligibilityModule,
        uint256 _hatId,
        bytes32 _agreementHash,
        bool _requireAll
    ) external {
        require(isActive, "Pod is not active");
        require(_eligibilityModule != address(0), "Invalid eligibility module address");
        require(_agreementHash != bytes32(0), "Invalid agreement hash");

        // 🚀 V3 PATTERN: Trust factory's authorization (scalable for all communities)
        if (msg.sender == factory) {
            // Factory already validated user wears management HAT
            // This enables pod leaders to manage eligibility without proxy wearing admin HAT
            IMultiCriteriaEligibility(_eligibilityModule).addAgreementCriterion(
                _hatId,
                _agreementHash,
                _requireAll
            );
            return;
        }

        // For direct calls (not through factory), require full authorization
        require(canManage(msg.sender), "Not authorized to manage pod");
        require(proxyAdminHatId > 0, "Proxy admin HAT not set - pod needs migration");
        require(_verifyAdminHat(), "Proxy does not wear admin HAT");

        // Call eligibility module as the admin (this proxy)
        IMultiCriteriaEligibility(_eligibilityModule).addAgreementCriterion(
            _hatId,
            _agreementHash,
            _requireAll
        );
    }

    /**
     * @notice Add credential/NFT criterion via proxy
     * @param _eligibilityModule Address of the MultiCriteriaEligibility module
     * @param _hatId HAT ID to add criterion for
     * @param _credentialContract Address of the credential/NFT contract
     * @param _tokenId Specific token ID required (0 for any)
     * @param _requireAll Whether all criteria must be met (true) or any (false)
     */
    function addCredentialCriterionViaProxy(
        address _eligibilityModule,
        uint256 _hatId,
        address _credentialContract,
        uint256 _tokenId,
        bool _requireAll
    ) external {
        require(isActive, "Pod is not active");
        require(_eligibilityModule != address(0), "Invalid eligibility module address");
        require(_credentialContract != address(0), "Invalid credential contract address");

        // 🚀 V3 PATTERN: Trust factory's authorization (scalable for all communities)
        if (msg.sender == factory) {
            // Factory already validated user wears management HAT
            // This enables pod leaders to manage eligibility without proxy wearing admin HAT
            IMultiCriteriaEligibility(_eligibilityModule).addCredentialCriterion(
                _hatId,
                _credentialContract,
                _tokenId,
                _requireAll
            );
            return;
        }

        // For direct calls (not through factory), require full authorization
        require(canManage(msg.sender), "Not authorized to manage pod");
        require(proxyAdminHatId > 0, "Proxy admin HAT not set - pod needs migration");
        require(_verifyAdminHat(), "Proxy does not wear admin HAT");

        // Call eligibility module as the admin (this proxy)
        IMultiCriteriaEligibility(_eligibilityModule).addCredentialCriterion(
            _hatId,
            _credentialContract,
            _tokenId,
            _requireAll
        );
    }

    /**
     * @notice Clear all eligibility criteria via proxy
     * @param _eligibilityModule Address of the MultiCriteriaEligibility module
     * @param _hatId HAT ID to clear criteria for
     */
    function clearAllCriteriaViaProxy(
        address _eligibilityModule,
        uint256 _hatId
    ) external {
        require(isActive, "Pod is not active");
        require(_eligibilityModule != address(0), "Invalid eligibility module address");

        // 🚀 V3 PATTERN: Trust factory's authorization (scalable for all communities)
        if (msg.sender == factory) {
            // Factory already validated user wears management HAT (see PodAuthorizationFactory line 371)
            // This enables pod leaders to manage eligibility without proxy wearing admin HAT
            // Supports Phase 4 & 5 skip optimization and scalability across communities
            IMultiCriteriaEligibility(_eligibilityModule).clearAllCriteria(_hatId);
            return;
        }

        // For direct calls (not through factory), require full authorization
        require(canManage(msg.sender), "Not authorized to manage pod");
        require(proxyAdminHatId > 0, "Proxy admin HAT not set - pod needs migration");
        require(_verifyAdminHat(), "Proxy does not wear admin HAT");

        // Call eligibility module as the admin (this proxy)
        IMultiCriteriaEligibility(_eligibilityModule).clearAllCriteria(_hatId);
    }

    // ============================================================
    // HATS TOGGLE MODULE IMPLEMENTATION
    // ============================================================

    /**
     * @notice Get the status of a HAT (implements IHatsToggle)
     * @dev This proxy acts as a toggle module for the admin HAT
     *      When Hats Protocol checks if this proxy wears the admin HAT,
     *      it calls this function to determine if the HAT is active
     * @param _hatId The HAT ID to check status for
     * @return bool True if the HAT should be active, false otherwise
     */
    function getHatStatus(uint256 _hatId) external view returns (bool) {
        // The proxy admin HAT is always active when the pod is active
        // This allows the proxy to maintain admin rights over pod HATs
        if (_hatId == proxyAdminHatId) {
            return isActive;
        }

        // Management HAT controlled by pod active status
        if (_hatId == managementHatId) {
            return isActive;
        }

        // Membership HAT controlled by pod active status
        if (_hatId == membershipHatId) {
            return isActive;
        }

        // For any other HAT ID, return true (not controlled by this toggle)
        // This ensures we don't accidentally deactivate HATs we're not managing
        return true;
    }
}
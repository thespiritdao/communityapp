// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/IHats.sol";

/**
 * @title IPodAuthProxy
 * @notice Interface for pod authorization proxy instances
 */
interface IPodAuthProxy {
    function initialize(
        string calldata _podId,
        address _creator,
        address[] calldata _leaders,
        address _treasuryAddress,
        uint256 _predictedProxyAdminHatId
    ) external;

    function updatePodData(
        address[] calldata newLeaders,
        address newTreasuryAddress,
        bool _isActive
    ) external;

    function canManage(address user) external view returns (bool);

    function managementHatId() external view returns (uint256);

    function setProxyAdminHat(uint256 _proxyAdminHatId) external;

    function setHatIds(uint256 _managementHatId, uint256 _membershipHatId) external;

    function clearAllCriteriaViaProxy(
        address _eligibilityModule,
        uint256 _hatId
    ) external;

    function addTokenBalanceCriterionViaProxy(
        address _eligibilityModule,
        uint256 _hatId,
        address _tokenContract,
        uint256 _minimumAmount,
        bool _requireAll
    ) external;

    function addTimeLimitCriterionViaProxy(
        address _eligibilityModule,
        uint256 _hatId,
        uint256 _validFrom,
        uint256 _validUntil,
        bool _requireAll
    ) external;

    function addAgreementCriterionViaProxy(
        address _eligibilityModule,
        uint256 _hatId,
        bytes32 _agreementHash,
        bool _requireAll
    ) external;

    function addHatsWornCriterionViaProxy(
        address _eligibilityModule,
        uint256 _hatId,
        uint256[] calldata _hatsRequired,
        bool _requireAll
    ) external;
}

/**
 * @title PodAuthorizationFactory V3 - COMPLETE
 * @notice Factory for creating and managing pod authorization proxies
 *
 * ✅ V3 CHANGES (ERC-4337 ELIGIBILITY FIX):
 * - ALL routing functions now accept `actualUser` parameter
 * - Authorization checks use IHats directly instead of proxy.canManage(msg.sender)
 * - Enables sponsored transactions with smart wallets (ERC-4337)
 * - BACKWARD COMPATIBLE: All view functions and createPodProxy unchanged
 *
 * 🚀 V3 COMPLETE INCLUDES:
 * - All 7 eligibility routing functions with actualUser parameter
 * - All 2 HAT management functions with actualUser parameter
 * - All existing pod management functions (unchanged)
 */
contract PodAuthorizationFactory is Ownable {

    // Hats Protocol address (Base mainnet)
    address public constant HATS_PROTOCOL = 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137;

    // Template for minimal proxies
    address public podAuthTemplate;

    // Pod ID => Proxy address mapping
    mapping(string => address) public podProxies;

    // Reverse mapping: Proxy => Pod ID
    mapping(address => string) public proxyToPodId;

    // Pod active status
    mapping(string => bool) public activePods;

    // Array of all pod IDs for enumeration
    string[] public allPodIds;

    constructor(address _podAuthTemplate) Ownable(msg.sender) {
        require(_podAuthTemplate != address(0), "Invalid template address");
        podAuthTemplate = _podAuthTemplate;
    }

    /**
     * @notice Update the pod auth template address
     * @dev Only owner can update. Allows upgrading template without redeploying factory.
     * @param _newTemplate New template address
     */
    function updatePodAuthTemplate(address _newTemplate) external onlyOwner {
        require(_newTemplate != address(0), "Invalid template address");
        require(_newTemplate != podAuthTemplate, "Same template address");

        address oldTemplate = podAuthTemplate;
        podAuthTemplate = _newTemplate;

        emit PodAuthTemplateUpdated(oldTemplate, _newTemplate);
    }

    // ============================================
    // POD CREATION & MANAGEMENT (UNCHANGED)
    // ============================================

    /**
     * @notice Create a new pod authorization proxy
     * ✅ UNCHANGED - Works with ERC-4337
     */
    function createPodProxy(
        string calldata podId,
        address creator,
        address[] calldata leaders,
        address treasuryAddress,
        uint256 predictedProxyAdminHatId
    ) external returns (address proxy) {
        require(bytes(podId).length > 0, "Pod ID required");
        require(creator != address(0), "Creator required");
        require(podProxies[podId] == address(0), "Pod proxy already exists");
        require(predictedProxyAdminHatId > 0, "Predicted admin HAT required");

        // Generate deterministic salt from podId and creator
        bytes32 salt = keccak256(abi.encodePacked(podId, creator));

        // Create minimal proxy clone with CREATE2 for deterministic address
        proxy = Clones.cloneDeterministic(podAuthTemplate, salt);

        // Initialize the proxy with pod data including predicted admin HAT ID
        IPodAuthProxy(proxy).initialize(podId, creator, leaders, treasuryAddress, predictedProxyAdminHatId);

        // Store mappings
        podProxies[podId] = proxy;
        proxyToPodId[proxy] = podId;
        activePods[podId] = true;
        allPodIds.push(podId);

        emit PodProxyCreated(podId, proxy, creator);
    }

    /**
     * @notice Update pod data
     * ✅ UNCHANGED
     */
    function updatePodProxy(
        string calldata podId,
        address[] calldata newLeaders,
        address newTreasuryAddress,
        bool isActive
    ) external onlyOwner {
        address proxy = podProxies[podId];
        require(proxy != address(0), "Pod proxy does not exist");

        // Update proxy data
        IPodAuthProxy(proxy).updatePodData(newLeaders, newTreasuryAddress, isActive);
        activePods[podId] = isActive;

        emit PodProxyUpdated(podId, proxy);
    }

    /**
     * @notice Check if user can manage bounties for a pod
     * ✅ UNCHANGED
     */
    function canManageBounties(address user, string calldata podId) external view returns (bool) {
        address proxy = podProxies[podId];
        if (proxy == address(0)) return false;
        return IPodAuthProxy(proxy).canManage(user);
    }

    /**
     * @notice Check if user can use pod treasury
     * ✅ UNCHANGED
     */
    function canUsePodTreasury(address user, string calldata podId) external view returns (bool) {
        address proxy = podProxies[podId];
        if (proxy == address(0)) return false;
        return IPodAuthProxy(proxy).canManage(user);
    }

    /**
     * @notice Get proxy address for a pod
     * ✅ UNCHANGED
     */
    function getProxyAddress(string calldata podId) external view returns (address) {
        return podProxies[podId];
    }

    /**
     * @notice Get pod ID for a proxy
     * ✅ UNCHANGED
     */
    function getPodId(address proxy) external view returns (string memory) {
        return proxyToPodId[proxy];
    }

    /**
     * @notice Check if pod is active
     * ✅ UNCHANGED
     */
    function isPodActive(string calldata podId) external view returns (bool) {
        return activePods[podId];
    }

    /**
     * @notice Get all pod IDs
     * ✅ UNCHANGED
     */
    function getAllPods() external view returns (string[] memory) {
        return allPodIds;
    }

    /**
     * @notice Get total number of pods
     * ✅ UNCHANGED
     */
    function getTotalPods() external view returns (uint256) {
        return allPodIds.length;
    }

    /**
     * @notice Predict proxy address using CREATE2
     * ✅ UNCHANGED
     */
    function predictProxyAddress(
        string calldata podId,
        address creator
    ) external view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(podId, creator));
        return Clones.predictDeterministicAddress(podAuthTemplate, salt);
    }

    // ============================================
    // 🚀 V3: HAT MANAGEMENT FUNCTIONS (ERC-4337 COMPATIBLE)
    // ============================================

    /**
     * @notice Set proxy admin HAT via factory routing (SPONSORED, ERC-4337 COMPATIBLE)
     *
     * 🚀 V3 CHANGE: Now accepts actualUser parameter
     *
     * @param podId Pod identifier
     * @param proxyAdminHatId HAT ID for proxy admin
     * @param actualUser The actual user's wallet address (for authorization check)
     */
    function setProxyAdminHatViaFactory(
        string calldata podId,
        uint256 proxyAdminHatId,
        address actualUser  // 🚀 NEW PARAMETER
    ) external {
        address proxy = podProxies[podId];
        require(proxy != address(0), "Pod proxy does not exist");

        // 🚀 V3 FIX: Check authorization using actualUser + IHats directly
        uint256 managementHatId = IPodAuthProxy(proxy).managementHatId();
        require(managementHatId != 0, "Management HAT not set");
        require(
            IHats(HATS_PROTOCOL).isWearerOfHat(actualUser, managementHatId),
            "User does not wear management HAT"
        );

        // Call proxy's setProxyAdminHat function
        IPodAuthProxy(proxy).setProxyAdminHat(proxyAdminHatId);

        emit ProxyAdminHatSet(podId, proxyAdminHatId, actualUser);
    }

    /**
     * @notice Set HAT IDs via factory routing (SPONSORED, ERC-4337 COMPATIBLE)
     *
     * 🚀 V3 CHANGE: Now accepts actualUser parameter
     *
     * @param podId Pod identifier
     * @param managementHatId Management HAT ID
     * @param membershipHatId Membership HAT ID
     * @param actualUser The actual user's wallet address
     */
    function setHatIdsViaFactory(
        string calldata podId,
        uint256 managementHatId,
        uint256 membershipHatId,
        address actualUser  // 🚀 NEW PARAMETER
    ) external {
        address proxy = podProxies[podId];
        require(proxy != address(0), "Pod proxy does not exist");

        // 🚀 V3 FIX: Check authorization using actualUser + IHats directly
        // Note: For first-time setHatIds, managementHatId might be 0 in proxy
        // So we check if user wears the managementHatId being set
        require(managementHatId != 0, "Management HAT ID required");
        require(
            IHats(HATS_PROTOCOL).isWearerOfHat(actualUser, managementHatId),
            "User does not wear management HAT"
        );

        // Call proxy's setHatIds function
        IPodAuthProxy(proxy).setHatIds(managementHatId, membershipHatId);

        emit HatIdsSet(podId, managementHatId, membershipHatId, actualUser);
    }

    // ============================================
    // 🚀 V3: ELIGIBILITY FUNCTIONS (ERC-4337 COMPATIBLE)
    // ============================================

    /**
     * @notice Clear all eligibility criteria via factory routing (SPONSORED, ERC-4337 COMPATIBLE)
     *
     * 🚀 V3 CHANGE: Now accepts actualUser parameter instead of relying on msg.sender
     * This enables sponsored transactions with smart wallets (ERC-4337)
     *
     * @param podId Pod identifier
     * @param eligibilityModule Address of the eligibility module
     * @param hatId HAT ID to clear criteria for
     * @param actualUser The actual user's wallet address (for authorization check)
     */
    function clearAllCriteriaViaFactory(
        string calldata podId,
        address eligibilityModule,
        uint256 hatId,
        address actualUser  // 🚀 NEW PARAMETER
    ) external {
        address proxy = podProxies[podId];
        require(proxy != address(0), "Pod proxy does not exist");

        // 🚀 V3 FIX: Check authorization using actualUser + IHats directly
        uint256 managementHatId = IPodAuthProxy(proxy).managementHatId();
        require(managementHatId != 0, "Management HAT not set");
        require(
            IHats(HATS_PROTOCOL).isWearerOfHat(actualUser, managementHatId),
            "User does not wear management HAT"
        );

        // Call proxy's clearAllCriteriaViaProxy function
        IPodAuthProxy(proxy).clearAllCriteriaViaProxy(eligibilityModule, hatId);

        emit EligibilityCriteriaCleared(podId, hatId, actualUser);
    }

    /**
     * @notice Add token balance criterion via factory routing (SPONSORED, ERC-4337 COMPATIBLE)
     *
     * 🚀 V3 CHANGE: Now accepts actualUser parameter
     */
    function addTokenBalanceCriterionViaFactory(
        string calldata podId,
        address eligibilityModule,
        uint256 hatId,
        address tokenContract,
        uint256 minimumAmount,
        bool requireAll,
        address actualUser  // 🚀 NEW PARAMETER
    ) external {
        address proxy = podProxies[podId];
        require(proxy != address(0), "Pod proxy does not exist");

        // 🚀 V3 FIX: Check authorization using actualUser + IHats directly
        uint256 managementHatId = IPodAuthProxy(proxy).managementHatId();
        require(managementHatId != 0, "Management HAT not set");
        require(
            IHats(HATS_PROTOCOL).isWearerOfHat(actualUser, managementHatId),
            "User does not wear management HAT"
        );

        // Call proxy's addTokenBalanceCriterionViaProxy function
        IPodAuthProxy(proxy).addTokenBalanceCriterionViaProxy(
            eligibilityModule,
            hatId,
            tokenContract,
            minimumAmount,
            requireAll
        );

        emit TokenBalanceCriterionAdded(podId, hatId, tokenContract, minimumAmount, actualUser);
    }

    /**
     * @notice Add time limit criterion via factory routing (SPONSORED, ERC-4337 COMPATIBLE)
     *
     * 🚀 V3 CHANGE: Now accepts actualUser parameter
     */
    function addTimeLimitCriterionViaFactory(
        string calldata podId,
        address eligibilityModule,
        uint256 hatId,
        uint256 validFrom,
        uint256 validUntil,
        bool requireAll,
        address actualUser  // 🚀 NEW PARAMETER
    ) external {
        address proxy = podProxies[podId];
        require(proxy != address(0), "Pod proxy does not exist");

        // 🚀 V3 FIX: Check authorization using actualUser + IHats directly
        uint256 managementHatId = IPodAuthProxy(proxy).managementHatId();
        require(managementHatId != 0, "Management HAT not set");
        require(
            IHats(HATS_PROTOCOL).isWearerOfHat(actualUser, managementHatId),
            "User does not wear management HAT"
        );

        // Call proxy's addTimeLimitCriterionViaProxy function
        IPodAuthProxy(proxy).addTimeLimitCriterionViaProxy(
            eligibilityModule,
            hatId,
            validFrom,
            validUntil,
            requireAll
        );

        emit TimeLimitCriterionAdded(podId, hatId, validFrom, validUntil, actualUser);
    }

    /**
     * @notice Add agreement criterion via factory routing (SPONSORED, ERC-4337 COMPATIBLE)
     *
     * 🚀 V3 NEW FUNCTION: Added with actualUser parameter
     *
     * @param podId Pod identifier
     * @param eligibilityModule Address of the eligibility module
     * @param hatId HAT ID to add criterion for
     * @param agreementCid IPFS CID of the agreement (will be hashed to bytes32)
     * @param requireAll Whether all criteria must be met
     * @param actualUser The actual user's wallet address
     */
    function addAgreementCriterionViaFactory(
        string calldata podId,
        address eligibilityModule,
        uint256 hatId,
        string calldata agreementCid,
        bool requireAll,
        address actualUser  // 🚀 NEW PARAMETER
    ) external {
        address proxy = podProxies[podId];
        require(proxy != address(0), "Pod proxy does not exist");

        // 🚀 V3 FIX: Check authorization using actualUser + IHats directly
        uint256 managementHatId = IPodAuthProxy(proxy).managementHatId();
        require(managementHatId != 0, "Management HAT not set");
        require(
            IHats(HATS_PROTOCOL).isWearerOfHat(actualUser, managementHatId),
            "User does not wear management HAT"
        );

        // Convert agreementCid to bytes32 hash
        bytes32 agreementHash = keccak256(abi.encodePacked(agreementCid));

        // Call proxy's addAgreementCriterionViaProxy function
        IPodAuthProxy(proxy).addAgreementCriterionViaProxy(
            eligibilityModule,
            hatId,
            agreementHash,
            requireAll
        );

        emit AgreementCriterionAdded(podId, hatId, agreementCid, actualUser);
    }

    /**
     * @notice Add hats worn criterion via factory routing (SPONSORED, ERC-4337 COMPATIBLE)
     *
     * 🚀 V3 NEW FUNCTION: Added with actualUser parameter
     *
     * @param podId Pod identifier
     * @param eligibilityModule Address of the eligibility module
     * @param hatId HAT ID to add criterion for
     * @param hatsRequired Array of HAT IDs that must be worn
     * @param requireAll Whether all criteria must be met
     * @param actualUser The actual user's wallet address
     */
    function addHatsWornCriterionViaFactory(
        string calldata podId,
        address eligibilityModule,
        uint256 hatId,
        uint256[] calldata hatsRequired,
        bool requireAll,
        address actualUser  // 🚀 NEW PARAMETER
    ) external {
        address proxy = podProxies[podId];
        require(proxy != address(0), "Pod proxy does not exist");

        // 🚀 V3 FIX: Check authorization using actualUser + IHats directly
        uint256 managementHatId = IPodAuthProxy(proxy).managementHatId();
        require(managementHatId != 0, "Management HAT not set");
        require(
            IHats(HATS_PROTOCOL).isWearerOfHat(actualUser, managementHatId),
            "User does not wear management HAT"
        );

        // Call proxy's addHatsWornCriterionViaProxy function
        IPodAuthProxy(proxy).addHatsWornCriterionViaProxy(
            eligibilityModule,
            hatId,
            hatsRequired,
            requireAll
        );

        emit HatsWornCriterionAdded(podId, hatId, hatsRequired.length, actualUser);
    }

    // ============================================
    // 🚀 V3: ADMIN HAT MANAGEMENT (ERC-4337 COMPATIBLE)
    // ============================================

    /**
     * @notice Create proxy admin HAT via factory routing (SPONSORED, ERC-4337 COMPATIBLE)
     *
     * 🚀 V3 NEW FUNCTION: Enables sponsored admin HAT creation
     *
     * @param podId Pod identifier
     * @param details HAT details (JSON metadata)
     * @param actualUser The actual user's wallet address (for authorization check)
     * @return newHatId The ID of the created admin HAT
     */
    function createProxyAdminHatViaFactory(
        string calldata podId,
        string calldata details,
        address actualUser
    ) external returns (uint256 newHatId) {
        address proxy = podProxies[podId];
        require(proxy != address(0), "Pod proxy does not exist");

        uint256 managementHatId = IPodAuthProxy(proxy).managementHatId();
        require(managementHatId != 0, "Management HAT not set");

        // 🚀 V3 FIX: Validate actualUser is admin of management HAT (self-admin architecture)
        require(
            IHats(HATS_PROTOCOL).isAdminOfHat(actualUser, managementHatId),
            "User is not admin of management HAT"
        );

        // Create admin HAT as child of management HAT
        // Using zero addresses for eligibility and toggle to keep it simple and avoid validation issues
        newHatId = IHats(HATS_PROTOCOL).createHat(
            managementHatId,        // admin (parent HAT)
            details,                // details (JSON metadata)
            1,                      // maxSupply (only proxy wears it)
            address(0),             // eligibility (none - always eligible)
            address(0),             // toggle (none - always active)
            false,                  // mutable (cannot be changed)
            ""                      // imageURI (empty)
        );

        emit ProxyAdminHatCreated(podId, newHatId, actualUser);
    }

    /**
     * @notice Mint proxy admin HAT via factory routing (SPONSORED, ERC-4337 COMPATIBLE)
     *
     * 🚀 V3 NEW FUNCTION: Enables sponsored admin HAT minting
     *
     * @param podId Pod identifier
     * @param adminHatId The admin HAT ID to mint
     * @param actualUser The actual user's wallet address (for authorization check)
     */
    function mintProxyAdminHatViaFactory(
        string calldata podId,
        uint256 adminHatId,
        address actualUser
    ) external {
        address proxy = podProxies[podId];
        require(proxy != address(0), "Pod proxy does not exist");

        uint256 managementHatId = IPodAuthProxy(proxy).managementHatId();
        require(managementHatId != 0, "Management HAT not set");

        // 🚀 V3 FIX: Validate actualUser wears management HAT
        require(
            IHats(HATS_PROTOCOL).isWearerOfHat(actualUser, managementHatId),
            "User does not wear management HAT"
        );

        // Mint admin HAT to proxy address
        IHats(HATS_PROTOCOL).mintHat(adminHatId, proxy);

        emit ProxyAdminHatMinted(podId, adminHatId, proxy, actualUser);
    }

    // ============================================
    // EVENTS
    // ============================================

    event PodProxyCreated(string indexed podId, address indexed proxy, address indexed creator);
    event PodProxyUpdated(string indexed podId, address indexed proxy);
    event PodAuthTemplateUpdated(address indexed oldTemplate, address indexed newTemplate);

    // HAT Management Events
    event ProxyAdminHatSet(string indexed podId, uint256 proxyAdminHatId, address indexed user);
    event HatIdsSet(string indexed podId, uint256 managementHatId, uint256 membershipHatId, address indexed user);
    event ProxyAdminHatCreated(string indexed podId, uint256 indexed adminHatId, address indexed user);
    event ProxyAdminHatMinted(string indexed podId, uint256 indexed adminHatId, address indexed proxy, address user);

    // Eligibility Events
    event EligibilityCriteriaCleared(string indexed podId, uint256 indexed hatId, address indexed user);
    event TokenBalanceCriterionAdded(string indexed podId, uint256 indexed hatId, address tokenContract, uint256 amount, address indexed user);
    event TimeLimitCriterionAdded(string indexed podId, uint256 indexed hatId, uint256 validFrom, uint256 validUntil, address indexed user);
    event AgreementCriterionAdded(string indexed podId, uint256 indexed hatId, string agreementCid, address indexed user);
    event HatsWornCriterionAdded(string indexed podId, uint256 indexed hatId, uint256 hatsCount, address indexed user);
}

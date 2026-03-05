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
 * @title PodCreationManagerV2
 * @dev Permissionless pod creation with exec hat-gated veto window.
 *
 * Key design:
 * - createPodProposal() is open to any caller (no onlyOwner)
 * - Admin actions (activatePod, vetoPod, deactivatePod) require caller to wear execHatId
 * - execHatId is the EXECUTIVE_POD_LEADER hat — membership is managed by the hat system,
 *   not by a hardcoded address list
 * - Per-address pod creation limit prevents spam
 * - finalizeIfVetoWindowPassed() is permissionless — anyone can call after 48h
 *
 * This contract must hold the COMMUNITY_PODS_PARENT hat so it can call
 * hatsContract.createHat() on behalf of any user.
 */
contract PodCreationManagerV2 is Ownable, ReentrancyGuard, Pausable {

    // =========================================================
    // State
    // =========================================================

    IHats public immutable hatsContract;
    uint256 public immutable parentHatId;   // COMMUNITY_PODS_PARENT hat ID
    uint256 public execHatId;               // EXECUTIVE_POD_LEADER hat ID — hat-gated auth
    IPodTreasuryFactory public treasuryFactory;
    address[] public defaultSupportedTokens;

    // Spam prevention: max pods a single address can create
    uint256 public maxPodsPerCreator = 5;
    mapping(address => uint256) public podCountByCreator;

    // Veto window: exec has this many seconds to veto after creation
    uint256 public vetoWindowSeconds = 48 hours;

    struct PodData {
        string podId;
        string name;
        string description;
        string imageURI;
        address[] podLeads;
        uint256 managementHatId;
        address treasuryContract;
        address creator;
        uint256 createdAt;
        PodStatus status;
    }

    enum PodStatus {
        PendingReview, // Created, within veto window
        Active,        // Approved / veto window passed
        Vetoed,        // Exec rejected
        Inactive       // Deactivated after activation
    }

    mapping(string => PodData) public pods;
    mapping(string => bool) public podExists;
    mapping(address => string[]) public userPods;
    string[] public allPodIds;

    // =========================================================
    // Events
    // =========================================================

    event PodProposed(
        string indexed podId,
        address indexed creator,
        address[] podLeads,
        uint256 managementHatId,
        uint256 vetoDeadline
    );

    event PodActivated(
        string indexed podId,
        address indexed activatedBy,
        uint256 timestamp
    );

    event PodVetoed(
        string indexed podId,
        address indexed vetoedBy,
        string reason,
        uint256 timestamp
    );

    event PodDeactivated(
        string indexed podId,
        uint256 timestamp
    );

    event ExecHatIdUpdated(uint256 oldHatId, uint256 newHatId);

    // =========================================================
    // Modifiers
    // =========================================================

    /// @dev Caller must wear the exec hat OR be the contract owner
    modifier onlyExec() {
        require(
            hatsContract.balanceOf(msg.sender, execHatId) > 0 || msg.sender == owner(),
            "Must wear exec hat"
        );
        _;
    }

    // =========================================================
    // Constructor
    // =========================================================

    constructor(
        address _hatsContract,
        uint256 _parentHatId,
        uint256 _execHatId,
        address _treasuryFactory,
        address[] memory _defaultSupportedTokens,
        address initialOwner
    ) Ownable(initialOwner) ReentrancyGuard() {
        require(_hatsContract != address(0), "Invalid hats contract");
        require(_parentHatId > 0, "Invalid parent hat ID");
        require(_execHatId > 0, "Invalid exec hat ID");
        require(_treasuryFactory != address(0), "Invalid treasury factory");
        require(initialOwner != address(0), "Invalid initial owner");

        hatsContract = IHats(_hatsContract);
        parentHatId = _parentHatId;
        execHatId = _execHatId;
        treasuryFactory = IPodTreasuryFactory(_treasuryFactory);
        defaultSupportedTokens = _defaultSupportedTokens;
    }

    // =========================================================
    // Pod Creation — open to any caller
    // =========================================================

    /**
     * @notice Create a pod proposal. Open to any caller.
     * The contract must hold parentHatId to call createHat successfully.
     * Pod enters PendingReview status with a 48h exec veto window.
     */
    function createPodProposal(
        string memory podId,
        string memory name,
        string memory description,
        string memory imageURI,
        address[] memory podLeads
    ) external nonReentrant whenNotPaused returns (uint256 managementHatId) {
        require(bytes(podId).length > 0, "Pod ID cannot be empty");
        require(bytes(name).length > 0, "Name cannot be empty");
        require(!podExists[podId], "Pod already exists");
        require(podLeads.length >= 1 && podLeads.length <= 5, "Invalid pod lead count");
        require(
            podCountByCreator[msg.sender] < maxPodsPerCreator,
            "Pod creation limit reached"
        );

        for (uint i = 0; i < podLeads.length; i++) {
            require(podLeads[i] != address(0), "Invalid pod lead address");
            for (uint j = i + 1; j < podLeads.length; j++) {
                require(podLeads[i] != podLeads[j], "Duplicate pod lead");
            }
        }

        // Contract must hold parentHatId for this to succeed
        string memory details = string.concat(name, " Pod Leadership");
        managementHatId = hatsContract.createHat(
            parentHatId,
            details,
            uint32(podLeads.length),
            address(1),
            address(1),
            true,
            imageURI
        );

        uint256 vetoDeadline = block.timestamp + vetoWindowSeconds;

        pods[podId] = PodData({
            podId: podId,
            name: name,
            description: description,
            imageURI: imageURI,
            podLeads: podLeads,
            managementHatId: managementHatId,
            treasuryContract: address(0),
            creator: msg.sender,
            createdAt: block.timestamp,
            status: PodStatus.PendingReview
        });

        podExists[podId] = true;
        allPodIds.push(podId);
        podCountByCreator[msg.sender]++;

        userPods[msg.sender].push(podId);
        for (uint i = 0; i < podLeads.length; i++) {
            userPods[podLeads[i]].push(podId);
        }

        emit PodProposed(podId, msg.sender, podLeads, managementHatId, vetoDeadline);
    }

    // =========================================================
    // Exec actions — exec hat required
    // =========================================================

    /**
     * @notice Activate a pod. Mints management hats to pod leads.
     * Can be called by any exec hat wearer.
     */
    function activatePod(string memory podId) external onlyExec nonReentrant {
        require(podExists[podId], "Pod does not exist");
        PodData storage pod = pods[podId];
        require(pod.status == PodStatus.PendingReview, "Pod not in review");

        pod.status = PodStatus.Active;

        uint256[] memory hatIds = new uint256[](pod.podLeads.length);
        for (uint i = 0; i < pod.podLeads.length; i++) {
            hatIds[i] = pod.managementHatId;
        }
        bool success = hatsContract.batchMintHats(hatIds, pod.podLeads);
        require(success, "Failed to mint management hats");

        emit PodActivated(podId, msg.sender, block.timestamp);
    }

    /**
     * @notice Veto a pod within the veto window.
     * Can be called by any exec hat wearer.
     */
    function vetoPod(string memory podId, string memory reason) external onlyExec {
        require(podExists[podId], "Pod does not exist");
        PodData storage pod = pods[podId];
        require(pod.status == PodStatus.PendingReview, "Pod not in review");
        require(
            block.timestamp <= pod.createdAt + vetoWindowSeconds,
            "Veto window has passed"
        );

        pod.status = PodStatus.Vetoed;
        podCountByCreator[pod.creator]--;

        emit PodVetoed(podId, msg.sender, reason, block.timestamp);
    }

    /**
     * @notice Deactivate an active pod (emergency).
     * Can be called by any exec hat wearer.
     */
    function deactivatePod(string memory podId) external onlyExec {
        require(podExists[podId], "Pod does not exist");
        PodData storage pod = pods[podId];
        require(pod.status == PodStatus.Active, "Pod not active");

        pod.status = PodStatus.Inactive;

        emit PodDeactivated(podId, block.timestamp);
    }

    // =========================================================
    // Permissionless finalization
    // =========================================================

    /**
     * @notice Auto-activate a pod after the veto window passes with no exec action.
     * Anyone can call this — no auth required.
     */
    function finalizeIfVetoWindowPassed(string memory podId) external nonReentrant {
        require(podExists[podId], "Pod does not exist");
        PodData storage pod = pods[podId];
        require(pod.status == PodStatus.PendingReview, "Pod not in review");
        require(
            block.timestamp > pod.createdAt + vetoWindowSeconds,
            "Veto window still open"
        );

        pod.status = PodStatus.Active;

        uint256[] memory hatIds = new uint256[](pod.podLeads.length);
        for (uint i = 0; i < pod.podLeads.length; i++) {
            hatIds[i] = pod.managementHatId;
        }
        bool success = hatsContract.batchMintHats(hatIds, pod.podLeads);
        require(success, "Failed to mint management hats");

        emit PodActivated(podId, msg.sender, block.timestamp);
    }

    // =========================================================
    // Owner config
    // =========================================================

    /**
     * @notice Update the exec hat ID. Only owner.
     * Use this if the exec hat is migrated to a new hat tree.
     */
    function setExecHatId(uint256 newExecHatId) external onlyOwner {
        require(newExecHatId > 0, "Invalid hat ID");
        emit ExecHatIdUpdated(execHatId, newExecHatId);
        execHatId = newExecHatId;
    }

    function setMaxPodsPerCreator(uint256 max) external onlyOwner {
        maxPodsPerCreator = max;
    }

    function setVetoWindowSeconds(uint256 seconds_) external onlyOwner {
        vetoWindowSeconds = seconds_;
    }

    function updateTreasuryFactory(address newFactory) external onlyOwner {
        require(newFactory != address(0), "Invalid factory");
        treasuryFactory = IPodTreasuryFactory(newFactory);
    }

    function updateDefaultSupportedTokens(address[] memory newTokens) external onlyOwner {
        require(newTokens.length > 0, "Must specify at least one token");
        defaultSupportedTokens = newTokens;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // =========================================================
    // Views
    // =========================================================

    function getPodData(string memory podId) external view returns (PodData memory) {
        require(podExists[podId], "Pod does not exist");
        return pods[podId];
    }

    function getAllPodIds() external view returns (string[] memory) {
        return allPodIds;
    }

    function getUserPods(address user) external view returns (string[] memory) {
        return userPods[user];
    }

    function isVetoWindowOpen(string memory podId) external view returns (bool) {
        if (!podExists[podId]) return false;
        PodData memory pod = pods[podId];
        return pod.status == PodStatus.PendingReview &&
               block.timestamp <= pod.createdAt + vetoWindowSeconds;
    }

    function getDefaultSupportedTokens() external view returns (address[] memory) {
        return defaultSupportedTokens;
    }
}

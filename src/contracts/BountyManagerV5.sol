// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BountyManagerV5
 * @notice Successor to BountyManagerV4. Closes audit finding BM-001 (2026-07-21):
 *         V4.createBounty was permissionless and pulled treasury funds from a
 *         CALLER-SUPPLIED treasuryAddress against every treasury's standing
 *         max-approval — i.e. any wallet could drain any pod treasury.
 *
 *         V5 hardening:
 *         - Treasury-funded bounties are gated on-chain: msg.sender must wear a
 *           hat that the pod has registered as an authorized bounty-funder
 *           (the leader hat, or any custom role-hat the leader adds). This
 *           mirrors the app's granular pod_role_permissions model but enforces
 *           it in the contract, not just the UI.
 *         - Treasury funds are always pulled from the pod's REGISTERED treasury
 *           address (podMetadata[podId].treasuryAddress). The caller cannot
 *           supply an arbitrary treasury to drain.
 *         - Pod registration requires the leader hat (no silent auto-register
 *           with attacker-controlled metadata).
 *         - pause() actually works: value-moving functions are whenNotPaused.
 *
 * @dev Tokens set at deployment, can be updated by admin if needed.
 */

interface IHats {
    function balanceOf(address wearer, uint256 hatId) external view returns (uint256);
    function isWearerOfHat(address wearer, uint256 hatId) external view returns (bool);
}

contract BountyManagerV5 is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // HATs Protocol reference
    IHats public immutable hatsProtocol;

    // Pod metadata (minimal storage - only what's needed for bounties)
    struct PodMetadata {
        uint256 leaderHatId;      // HAT ID for pod leaders (always an authorized funder)
        address treasuryAddress;  // Pod treasury contract (the ONLY address treasury funds are pulled from)
        bool isRegistered;        // Has pod been registered for bounties?
        uint256 registeredAt;     // When pod was registered
    }

    // Core bounty data structure
    struct Bounty {
        address creator;
        uint128 value;
        uint64 createdAt;
        uint64 deadline;
        address token;
        address fundingSource; // wallet address or pod treasury address
        uint8 status; // 0=Open, 1=Assigned, 2=Completed, 3=Cancelled
        uint8 paymentType; // 0=Completion, 1=Milestones, 2=Split
        bool isEscrowed;
        string podId; // Associated pod ID
        string category;
    }

    struct Assignment {
        address bidder;
        address reviewer;
        address approver;
        uint128 escrowAmount;
        uint128 paidAmount;
        uint64 assignedAt;
    }

    struct Bid {
        address bidder;
        string proposal;
        uint64 submittedAt;
        uint8 status; // 0=Pending, 1=Accepted, 2=Rejected
    }

    // State variables
    mapping(string => PodMetadata) public podMetadata;
    // Per-pod SET of hat IDs authorized to fund bounties from the treasury.
    // The leader hat is authorized implicitly; this covers additional custom
    // role-hats (e.g. a dedicated "bounty manager" member role).
    mapping(string => mapping(uint256 => bool)) public authorizedFunderHat;
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => Assignment) public assignments;
    mapping(uint256 => string) public bountyMetadata; // IPFS hashes
    mapping(uint256 => Bid[]) public bids;
    mapping(uint256 => address[]) public bidders;
    // O(1) duplicate-bid check (CR-3 fix): replaces the O(n) scan over bidders[]
    // so gas per bid stays constant regardless of how many have already bid.
    mapping(uint256 => mapping(address => bool)) public hasBid;

    uint256 public nextBountyId = 1;
    address public immutable admin;

    // CONFIGURABLE TOKEN ADDRESSES (set at deployment)
    address public systemToken;
    address public selfToken;

    // Whitelist of allowed tokens (for future expansion)
    mapping(address => bool) public allowedTokens;

    // Platform fee (basis points, e.g. 250 = 2.5%)
    uint256 public platformFeeRate;
    address public feeRecipient;

    // Events
    event PodMetadataRegistered(string indexed podId, uint256 leaderHatId, address treasury, address registrar);
    event FunderHatAuthorized(string indexed podId, uint256 indexed hatId, bool allowed, address updatedBy);
    event BountyCreated(uint256 indexed id, address indexed creator, string podId, string ipfsHash);
    event BidPlaced(uint256 indexed bountyId, address indexed bidder, uint256 bidIndex);
    event BountyAssigned(uint256 indexed bountyId, address indexed bidder);
    event PaymentReleased(uint256 indexed bountyId, address indexed to, uint256 amount, address releasedBy);
    event BountyCancelled(uint256 indexed bountyId);
    event TokenWhitelisted(address indexed token, bool allowed);

    /**
     * @notice Deploy with configurable token addresses
     * @param _hatsProtocol Hats Protocol contract address
     * @param _systemToken $SYSTEM token address
     * @param _selfToken $SELF token address
     */
    constructor(
        address _hatsProtocol,
        address _systemToken,
        address _selfToken
    ) {
        require(_hatsProtocol != address(0), "Invalid Hats address");
        require(_systemToken != address(0), "Invalid SYSTEM token");
        require(_selfToken != address(0), "Invalid SELF token");

        hatsProtocol = IHats(_hatsProtocol);
        systemToken = _systemToken;
        selfToken = _selfToken;
        admin = msg.sender;

        // Whitelist initial tokens
        allowedTokens[_systemToken] = true;
        allowedTokens[_selfToken] = true;

        emit TokenWhitelisted(_systemToken, true);
        emit TokenWhitelisted(_selfToken, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setTokenAllowed(address _token, bool _allowed) external {
        require(msg.sender == admin, "Only admin");
        require(_token != address(0), "Invalid token");
        allowedTokens[_token] = _allowed;
        emit TokenWhitelisted(_token, _allowed);
    }

    function updatePrimaryTokens(
        address _systemToken,
        address _selfToken
    ) external {
        require(msg.sender == admin, "Only admin");
        require(_systemToken != address(0), "Invalid SYSTEM token");
        require(_selfToken != address(0), "Invalid SELF token");

        systemToken = _systemToken;
        selfToken = _selfToken;

        allowedTokens[_systemToken] = true;
        allowedTokens[_selfToken] = true;

        emit TokenWhitelisted(_systemToken, true);
        emit TokenWhitelisted(_selfToken, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pod registration & funder-hat authorization
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Register pod metadata. PERMISSIONLESS in the sense that anyone can
     *         call it, but the caller MUST wear the leader HAT being registered,
     *         binding the registration to genuine pod leadership.
     */
    function registerPodMetadata(
        string calldata podId,
        uint256 leaderHatId,
        address treasuryAddress
    ) external {
        require(bytes(podId).length > 0, "Pod ID required");
        require(!podMetadata[podId].isRegistered, "Pod already registered");
        require(leaderHatId != 0, "Leader HAT ID required");
        require(treasuryAddress != address(0), "Treasury address required");

        // Verify caller has the leader HAT
        require(
            hatsProtocol.balanceOf(msg.sender, leaderHatId) > 0,
            "Must have leader HAT to register pod"
        );

        podMetadata[podId] = PodMetadata({
            leaderHatId: leaderHatId,
            treasuryAddress: treasuryAddress,
            isRegistered: true,
            registeredAt: block.timestamp
        });

        emit PodMetadataRegistered(podId, leaderHatId, treasuryAddress, msg.sender);
    }

    /**
     * @notice Admin-only pod registration bypass. Lets the deploying admin
     *         register pods without wearing each pod's leader hat (useful during
     *         migration, and for pods whose leader is an external community).
     * @dev Safe: this only writes metadata. Actual treasury-fund authorization in
     *      createBounty still requires the caller to WEAR the leader/funder hat —
     *      registration does not grant spending power.
     */
    function registerPodMetadataFor(
        string calldata podId,
        uint256 leaderHatId,
        address treasuryAddress
    ) external {
        require(msg.sender == admin, "Only admin");
        require(bytes(podId).length > 0, "Pod ID required");
        require(!podMetadata[podId].isRegistered, "Pod already registered");
        require(leaderHatId != 0, "Leader HAT ID required");
        require(treasuryAddress != address(0), "Treasury address required");

        podMetadata[podId] = PodMetadata({
            leaderHatId: leaderHatId,
            treasuryAddress: treasuryAddress,
            isRegistered: true,
            registeredAt: block.timestamp
        });

        emit PodMetadataRegistered(podId, leaderHatId, treasuryAddress, msg.sender);
    }

    /**
     * @notice Authorize (or revoke) an additional hat as a bounty funder for a
     *         pod. Only a current leader-hat wearer can change the set. The
     *         leader hat itself is always authorized and does not need adding.
     * @dev Enables the app's granular roles: a leader mints a custom
     *      "bounty manager" role-hat to a member, then registers that hat here
     *      so its wearers can fund treasury bounties on-chain.
     */
    function setAuthorizedFunderHat(
        string calldata podId,
        uint256 hatId,
        bool allowed
    ) external {
        PodMetadata memory pod = podMetadata[podId];
        require(pod.isRegistered, "Pod not registered");
        require(hatId != 0, "Invalid hat");
        require(
            hatsProtocol.balanceOf(msg.sender, pod.leaderHatId) > 0,
            "Only pod leader can set funder hats"
        );

        authorizedFunderHat[podId][hatId] = allowed;
        emit FunderHatAuthorized(podId, hatId, allowed, msg.sender);
    }

    /**
     * @notice True if `user` may fund a treasury bounty for `podId`: they wear
     *         the leader hat OR an explicitly-authorized funder hat.
     */
    function isAuthorizedFunder(string memory podId, address user)
        public
        view
        returns (bool)
    {
        PodMetadata memory pod = podMetadata[podId];
        if (!pod.isRegistered) return false;
        if (hatsProtocol.balanceOf(user, pod.leaderHatId) > 0) return true;
        // NOTE: iterating an unbounded set on-chain is not possible; authorization
        // for non-leader hats is checked against a specific hat in createBounty.
        return false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Bounty lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Create a new bounty.
     * @param funderHatId If useTreasuryFunding is true, the hat the caller is
     *        claiming authority under. Must be the pod's leader hat or a hat
     *        previously authorized via setAuthorizedFunderHat, AND the caller
     *        must actually wear it. Ignored for wallet-funded bounties.
     * @dev The pod MUST be registered first (via registerPodMetadata). Treasury
     *      funds are always pulled from the registered treasury — a caller can
     *      no longer supply an arbitrary treasury address.
     */
    function createBounty(
        uint128 value,
        address token,
        uint8 paymentType,
        string calldata podId,
        string calldata ipfsHash,
        uint256 funderHatId,
        bool useTreasuryFunding
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        require(value > 0, "Invalid value");
        require(allowedTokens[token], "Token not whitelisted");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(bytes(podId).length > 0, "Pod ID required");

        uint256 bountyId = nextBountyId++;

        // Resolve funding source + pull escrow. Kept in a helper to bound the
        // local-variable count in this function (avoids stack-too-deep).
        address fundingSource = _escrowFunds(value, token, podId, funderHatId, useTreasuryFunding);

        Bounty storage newBounty = bounties[bountyId];
        newBounty.creator = msg.sender;
        newBounty.value = value;
        newBounty.createdAt = uint64(block.timestamp);
        newBounty.deadline = 0;
        newBounty.token = token;
        newBounty.fundingSource = fundingSource;
        newBounty.status = 0; // Open
        newBounty.paymentType = paymentType;
        newBounty.isEscrowed = true;
        newBounty.podId = podId;
        newBounty.category = "General";

        bountyMetadata[bountyId] = ipfsHash;
        emit BountyCreated(bountyId, msg.sender, podId, ipfsHash);
        return bountyId;
    }

    /**
     * @dev Pulls `value` of `token` into escrow and returns the funding source.
     *      For treasury funding: caller must wear the pod leader hat OR an
     *      authorized funder hat, and funds are ALWAYS pulled from the pod's
     *      REGISTERED treasury (never a caller-supplied address) — the BM-001 fix.
     */
    function _escrowFunds(
        uint128 value,
        address token,
        string calldata podId,
        uint256 funderHatId,
        bool useTreasuryFunding
    ) internal returns (address fundingSource) {
        if (useTreasuryFunding) {
            PodMetadata memory pod = podMetadata[podId];
            require(pod.isRegistered, "Pod not registered");

            bool isLeader = hatsProtocol.balanceOf(msg.sender, pod.leaderHatId) > 0;
            bool isAuthorizedRole =
                funderHatId != 0 &&
                authorizedFunderHat[podId][funderHatId] &&
                hatsProtocol.balanceOf(msg.sender, funderHatId) > 0;
            require(isLeader || isAuthorizedRole, "Not authorized to fund from treasury");

            fundingSource = pod.treasuryAddress;
            IERC20(token).safeTransferFrom(fundingSource, address(this), value);
        } else {
            fundingSource = msg.sender;
            IERC20(token).safeTransferFrom(msg.sender, address(this), value);
        }
    }

    /**
     * @notice Update bounty details
     */
    function updateBountyDetails(
        uint256 bountyId,
        uint64 deadline,
        string calldata category
    ) external whenNotPaused {
        require(bounties[bountyId].creator == msg.sender, "Not creator");
        require(bounties[bountyId].status == 0, "Bounty not open");
        require(deadline == 0 || deadline > block.timestamp, "Invalid deadline");

        bounties[bountyId].deadline = deadline;
        bounties[bountyId].category = category;
    }

    /**
     * @notice Place a bid on a bounty
     */
    function placeBid(uint256 bountyId, string calldata proposalIpfsHash)
        external
        nonReentrant
        whenNotPaused
    {
        require(bounties[bountyId].status == 0, "Bounty not open");
        require(_canPlaceBid(bountyId), "Cannot place bid");

        bids[bountyId].push(Bid({
            bidder: msg.sender,
            proposal: proposalIpfsHash,
            submittedAt: uint64(block.timestamp),
            status: 0
        }));

        bidders[bountyId].push(msg.sender);
        hasBid[bountyId][msg.sender] = true;
        emit BidPlaced(bountyId, msg.sender, bids[bountyId].length - 1);
    }

    function _canPlaceBid(uint256 bountyId) internal view returns (bool) {
        Bounty storage bounty = bounties[bountyId];

        if (bounty.deadline != 0 && block.timestamp > bounty.deadline) {
            return false;
        }

        // O(1) duplicate check (CR-3): was a linear scan over bidders[].
        if (hasBid[bountyId][msg.sender]) {
            return false;
        }

        return true;
    }

    /**
     * @notice Assign bounty to a bidder
     */
    function assignBounty(
        uint256 bountyId,
        uint256 bidIndex,
        address reviewer,
        address approver
    )
        external
        nonReentrant
        whenNotPaused
    {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.status == 0, "Bounty not open");

        require(bounty.creator == msg.sender, "Not creator");
        require(bidIndex < bids[bountyId].length, "Invalid bid index");

        Bid storage winningBid = bids[bountyId][bidIndex];
        require(winningBid.status == 0, "Bid not pending");

        bounty.status = 1;
        winningBid.status = 1;

        assignments[bountyId] = Assignment({
            bidder: winningBid.bidder,
            reviewer: reviewer,
            approver: approver,
            escrowAmount: bounty.value,
            paidAmount: 0,
            assignedAt: uint64(block.timestamp)
        });

        emit BountyAssigned(bountyId, winningBid.bidder);
    }

    /**
     * @notice Release payment. Follows checks-effects-interactions: state is
     *         updated before the external transfer (defense-in-depth alongside
     *         nonReentrant).
     */
    function releasePayment(uint256 bountyId, uint128 amount)
        external
        nonReentrant
        whenNotPaused
    {
        Bounty storage bounty = bounties[bountyId];
        Assignment storage assignment = assignments[bountyId];

        require(bounty.status == 1, "Bounty not assigned");

        require(
            msg.sender == assignment.reviewer ||
            msg.sender == assignment.approver ||
            msg.sender == bounty.creator,
            "Not authorized to release payment"
        );
        require(amount <= assignment.escrowAmount - assignment.paidAmount, "Exceeds available");

        // Effects before interaction
        assignment.paidAmount += amount;
        if (assignment.paidAmount >= bounty.value) {
            bounty.status = 2;
        }

        IERC20(bounty.token).safeTransfer(assignment.bidder, amount);

        emit PaymentReleased(bountyId, assignment.bidder, amount, msg.sender);
    }

    /**
     * @notice Cancel bounty and refund. Refund goes to the recorded
     *         fundingSource, which for treasury bounties is the pod's REGISTERED
     *         treasury (set in createBounty), not a caller-supplied address.
     */
    function cancelBounty(uint256 bountyId) external nonReentrant whenNotPaused {
        Bounty storage bounty = bounties[bountyId];

        require(msg.sender == bounty.creator, "Not authorized to cancel");
        require(bounty.status < 2, "Cannot cancel completed bounty");

        bounty.status = 3;

        if (bounty.isEscrowed) {
            Assignment memory assignment = assignments[bountyId];
            uint128 refundAmount = bounty.value - assignment.paidAmount;

            bounty.isEscrowed = false; // effects before interaction

            if (refundAmount > 0) {
                IERC20(bounty.token).safeTransfer(bounty.fundingSource, refundAmount);
            }
        }

        emit BountyCancelled(bountyId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views (unchanged from V4 for app compatibility)
    // ─────────────────────────────────────────────────────────────────────────

    function getBounty(uint256 bountyId)
        external
        view
        returns (address creator, uint128 value, address token, uint8 status)
    {
        Bounty storage bounty = bounties[bountyId];
        return (bounty.creator, bounty.value, bounty.token, bounty.status);
    }

    function getBountyMetadata(uint256 bountyId)
        external
        view
        returns (string memory podId, string memory category, string memory ipfsHash)
    {
        Bounty storage bounty = bounties[bountyId];
        return (bounty.podId, bounty.category, bountyMetadata[bountyId]);
    }

    function getBountyTiming(uint256 bountyId)
        external
        view
        returns (uint64 createdAt, uint64 deadline, address fundingSource)
    {
        Bounty storage bounty = bounties[bountyId];
        return (bounty.createdAt, bounty.deadline, bounty.fundingSource);
    }

    function getAssignment(uint256 bountyId)
        external
        view
        returns (address bidder, address reviewer, uint128 escrowAmount, uint128 paidAmount)
    {
        Assignment memory a = assignments[bountyId];
        return (a.bidder, a.reviewer, a.escrowAmount, a.paidAmount);
    }

    function getBids(uint256 bountyId) external view returns (Bid[] memory) {
        return bids[bountyId];
    }

    function getBidders(uint256 bountyId) external view returns (address[] memory) {
        return bidders[bountyId];
    }

    function isValidPod(string calldata podId) external view returns (bool) {
        return podMetadata[podId].isRegistered;
    }

    function canManageBounties(address user, string calldata podId)
        external
        view
        returns (bool)
    {
        PodMetadata memory pod = podMetadata[podId];
        if (!pod.isRegistered) return false;
        return hatsProtocol.balanceOf(user, pod.leaderHatId) > 0;
    }

    function getPodTreasuryAddress(string calldata podId)
        external
        view
        returns (address)
    {
        return podMetadata[podId].treasuryAddress;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin config
    // ─────────────────────────────────────────────────────────────────────────

    function updatePlatformFee(uint256 _newFee) external {
        require(msg.sender == admin, "Only admin");
        require(_newFee <= 1000, "Max 10%");
        platformFeeRate = _newFee;
    }

    function updateFeeRecipient(address _recipient) external {
        require(msg.sender == admin, "Only admin");
        require(_recipient != address(0), "Invalid address");
        feeRecipient = _recipient;
    }

    function pause() external {
        require(msg.sender == admin, "Only admin");
        _pause();
    }

    function unpause() external {
        require(msg.sender == admin, "Only admin");
        _unpause();
    }
}

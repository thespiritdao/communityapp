// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BountyManagerV4
 * @notice Configurable token addresses for post-beta flexibility
 * @dev Tokens set at deployment, can be updated by admin if needed
 */

interface IHats {
    function balanceOf(address wearer, uint256 hatId) external view returns (uint256);
    function isWearerOfHat(address wearer, uint256 hatId) external view returns (bool);
}

contract BountyManagerV4 is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // HATs Protocol reference
    IHats public immutable hatsProtocol;

    // Pod metadata (minimal storage - only what's needed for bounties)
    struct PodMetadata {
        uint256 leaderHatId;      // HAT ID for pod leaders
        address treasuryAddress;  // Pod treasury contract
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
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => Assignment) public assignments;
    mapping(uint256 => string) public bountyMetadata; // IPFS hashes
    mapping(uint256 => Bid[]) public bids;
    mapping(uint256 => address[]) public bidders;

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
    event BountyCreated(uint256 indexed id, address indexed creator, string podId, string ipfsHash);
    event BidPlaced(uint256 indexed bountyId, address indexed bidder, uint256 bidIndex);
    event BountyAssigned(uint256 indexed bountyId, address indexed bidder);
    event PaymentReleased(uint256 indexed bountyId, address indexed to, uint256 amount);
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

    /**
     * @notice Update allowed tokens (admin only)
     * @param _token Token address to whitelist/blacklist
     * @param _allowed Whether token is allowed
     */
    function setTokenAllowed(address _token, bool _allowed) external {
        require(msg.sender == admin, "Only admin");
        require(_token != address(0), "Invalid token");
        allowedTokens[_token] = _allowed;
        emit TokenWhitelisted(_token, _allowed);
    }

    /**
     * @notice Update primary token addresses (admin only, use carefully!)
     * @param _systemToken New $SYSTEM token address
     * @param _selfToken New $SELF token address
     */
    function updatePrimaryTokens(
        address _systemToken,
        address _selfToken
    ) external {
        require(msg.sender == admin, "Only admin");
        require(_systemToken != address(0), "Invalid SYSTEM token");
        require(_selfToken != address(0), "Invalid SELF token");

        systemToken = _systemToken;
        selfToken = _selfToken;

        // Auto-whitelist new tokens
        allowedTokens[_systemToken] = true;
        allowedTokens[_selfToken] = true;

        emit TokenWhitelisted(_systemToken, true);
        emit TokenWhitelisted(_selfToken, true);
    }

    /**
     * @notice Register pod metadata (PERMISSIONLESS - anyone with leader HAT can register)
     */
    function registerPodMetadata(
        string calldata podId,
        uint256 leaderHatId,
        address treasuryAddress
    ) external {
        require(bytes(podId).length > 0, "Pod ID required");
        require(!podMetadata[podId].isRegistered, "Pod already registered");

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
     * @notice Create a new bounty with automatic pod registration
     * @dev Token must be whitelisted (systemToken, selfToken, or custom approved token)
     */
    function createBounty(
        uint128 value,
        address token,
        uint8 paymentType,
        string calldata podId,
        string calldata ipfsHash,
        uint256 leaderHatId,
        address treasuryAddress
    )
        external
        nonReentrant
        returns (uint256)
    {
        require(value > 0, "Invalid value");
        require(allowedTokens[token], "Token not whitelisted");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(bytes(podId).length > 0, "Pod ID required");

        // Auto-register pod metadata if not done yet
        if (!podMetadata[podId].isRegistered) {
            require(leaderHatId != 0, "Leader HAT ID required for new pod");
            require(treasuryAddress != address(0), "Treasury address required for new pod");

            podMetadata[podId] = PodMetadata({
                leaderHatId: leaderHatId,
                treasuryAddress: treasuryAddress,
                isRegistered: true,
                registeredAt: block.timestamp
            });

            emit PodMetadataRegistered(podId, leaderHatId, treasuryAddress, msg.sender);
        }

        uint256 bountyId = nextBountyId++;

        // Handle funding
        IERC20(token).safeTransferFrom(msg.sender, address(this), value);

        // Create bounty
        Bounty storage newBounty = bounties[bountyId];
        newBounty.creator = msg.sender;
        newBounty.value = value;
        newBounty.createdAt = uint64(block.timestamp);
        newBounty.deadline = 0;
        newBounty.token = token;
        newBounty.fundingSource = msg.sender;
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
     * @notice Set treasury funding for a bounty
     */
    function setTreasuryFunding(uint256 bountyId, string calldata podId)
        external
        nonReentrant
    {
        require(bounties[bountyId].creator == msg.sender, "Not creator");
        require(bounties[bountyId].status == 0, "Bounty not open");

        PodMetadata memory pod = podMetadata[podId];
        require(pod.isRegistered, "Pod not registered");
        require(pod.treasuryAddress != address(0), "Treasury not found");

        bounties[bountyId].fundingSource = pod.treasuryAddress;
    }

    /**
     * @notice Update bounty details
     */
    function updateBountyDetails(
        uint256 bountyId,
        uint64 deadline,
        string calldata category
    ) external {
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
        emit BidPlaced(bountyId, msg.sender, bids[bountyId].length - 1);
    }

    /**
     * @notice Internal function to check if user can place bid
     */
    function _canPlaceBid(uint256 bountyId) internal view returns (bool) {
        Bounty storage bounty = bounties[bountyId];

        if (bounty.deadline != 0 && block.timestamp > bounty.deadline) {
            return false;
        }

        address[] storage _bidders = bidders[bountyId];
        uint256 bidderCount = _bidders.length;
        for (uint i = 0; i < bidderCount; i++) {
            if (_bidders[i] == msg.sender) {
                return false;
            }
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
     * @notice Release payment
     */
    function releasePayment(uint256 bountyId, uint128 amount)
        external
        nonReentrant
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

        IERC20(bounty.token).safeTransfer(assignment.bidder, amount);

        assignment.paidAmount += amount;

        if (assignment.paidAmount >= bounty.value) {
            bounty.status = 2;
        }

        emit PaymentReleased(bountyId, assignment.bidder, amount);
    }

    /**
     * @notice Cancel bounty and refund
     */
    function cancelBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];

        require(msg.sender == bounty.creator, "Not authorized to cancel");
        require(bounty.status < 2, "Cannot cancel completed bounty");

        bounty.status = 3;

        if (bounty.isEscrowed) {
            Assignment memory assignment = assignments[bountyId];
            uint128 refundAmount = bounty.value - assignment.paidAmount;

            if (refundAmount > 0) {
                IERC20(bounty.token).safeTransfer(bounty.fundingSource, refundAmount);
            }
            bounty.isEscrowed = false;
        }

        emit BountyCancelled(bountyId);
    }

    /**
     * @notice Get bounty core data
     */
    function getBounty(uint256 bountyId)
        external
        view
        returns (
            address creator,
            uint128 value,
            address token,
            uint8 status
        )
    {
        Bounty storage bounty = bounties[bountyId];
        return (
            bounty.creator,
            bounty.value,
            bounty.token,
            bounty.status
        );
    }

    /**
     * @notice Get bounty metadata
     */
    function getBountyMetadata(uint256 bountyId)
        external
        view
        returns (
            string memory podId,
            string memory category,
            string memory ipfsHash
        )
    {
        Bounty storage bounty = bounties[bountyId];
        return (
            bounty.podId,
            bounty.category,
            bountyMetadata[bountyId]
        );
    }

    /**
     * @notice Get bounty timing info
     */
    function getBountyTiming(uint256 bountyId)
        external
        view
        returns (
            uint64 createdAt,
            uint64 deadline,
            address fundingSource
        )
    {
        Bounty storage bounty = bounties[bountyId];
        return (
            bounty.createdAt,
            bounty.deadline,
            bounty.fundingSource
        );
    }

    /**
     * @notice Get assignment details
     */
    function getAssignment(uint256 bountyId)
        external
        view
        returns (
            address bidder,
            address reviewer,
            uint128 escrowAmount,
            uint128 paidAmount
        )
    {
        Assignment memory a = assignments[bountyId];
        return (a.bidder, a.reviewer, a.escrowAmount, a.paidAmount);
    }

    /**
     * @notice Get bids for a bounty
     */
    function getBids(uint256 bountyId)
        external
        view
        returns (Bid[] memory)
    {
        return bids[bountyId];
    }

    /**
     * @notice Get bidders for a bounty
     */
    function getBidders(uint256 bountyId)
        external
        view
        returns (address[] memory)
    {
        return bidders[bountyId];
    }

    /**
     * @notice Check if pod is registered
     */
    function isValidPod(string calldata podId) external view returns (bool) {
        return podMetadata[podId].isRegistered;
    }

    /**
     * @notice Check if user can manage bounties for a pod (via HATs)
     */
    function canManageBounties(address user, string calldata podId)
        external
        view
        returns (bool)
    {
        PodMetadata memory pod = podMetadata[podId];
        if (!pod.isRegistered) return false;

        return hatsProtocol.balanceOf(user, pod.leaderHatId) > 0;
    }

    /**
     * @notice Get pod treasury address
     */
    function getPodTreasuryAddress(string calldata podId)
        external
        view
        returns (address)
    {
        return podMetadata[podId].treasuryAddress;
    }

    // Admin functions
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

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// Pod permission interface - must be defined outside the contract
interface IPodService {
    function canManageBounties(address user, string calldata podId) external view returns (bool);
    function canUsePodTreasury(address user, string calldata podId) external view returns (bool);
    function getPodTreasuryAddress(string calldata podId) external view returns (address);
    function isValidPod(string calldata podId) external view returns (bool);
}

/**
 * @title BountyManagerV2
 * @notice Pod-integrated bounty management system for SpiritDAO
 * @dev Integrates with pod role permissions and treasury funding
 */
contract BountyManagerV2 is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

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
        string podId; // Associated pod ID for permissions
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
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => Assignment) public assignments;
    mapping(uint256 => string) public bountyMetadata; // IPFS hashes
    mapping(uint256 => Bid[]) public bids;
    mapping(uint256 => address[]) public bidders;
    
    uint256 public nextBountyId = 1;
    uint256 public platformFeeRate = 250; // 2.5%
    address public feeRecipient;
    address public podServiceContract; // Contract that validates pod permissions
    
    // Token addresses
    address public constant SYSTEM_TOKEN = 0xd67e460ce56be18b573aB434b3DC962c657D8Bb5;
    address public constant SELF_TOKEN = 0x1b8d424695E63ABca04E94bA46c03f1D83e14020;

    // Events
    event BountyCreated(uint256 indexed id, address indexed creator, string podId, string ipfsHash);
    event BidPlaced(uint256 indexed bountyId, address indexed bidder, uint256 bidIndex);
    event BountyAssigned(uint256 indexed bountyId, address indexed bidder);
    event PaymentReleased(uint256 indexed bountyId, address indexed to, uint256 amount);
    event BountyCancelled(uint256 indexed bountyId);
    event PodServiceUpdated(address indexed newPodService);

    constructor(address _podServiceContract) {
        feeRecipient = msg.sender;
        podServiceContract = _podServiceContract;
    }

    modifier onlyPodManager(string calldata podId) {
        require(
            IPodService(podServiceContract).canManageBounties(msg.sender, podId),
            "No bounty management permission for this pod"
        );
        _;
    }

    modifier validPod(string calldata podId) {
        require(
            IPodService(podServiceContract).isValidPod(podId),
            "Invalid pod ID"
        );
        _;
    }

    /**
     * @notice Create a new bounty with pod integration
     * @param value Bounty value in tokens
     * @param token Token address (SYSTEM or SELF)  
     * @param paymentType 0=Completion, 1=Milestones, 2=Split
     * @param podId Associated pod ID for permissions
     * @param ipfsHash IPFS hash containing full metadata
     */
    function createBounty(
        uint128 value,
        address token,
        uint8 paymentType,
        string calldata podId,
        string calldata ipfsHash
    ) 
        external 
        validPod(podId)
        onlyPodManager(podId)
        nonReentrant 
        returns (uint256) 
    {
        require(value > 0, "Invalid value");
        require(token == SYSTEM_TOKEN || token == SELF_TOKEN, "Invalid token");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");

        uint256 bountyId = nextBountyId++;
        
        // Handle funding via internal function
        _handleBountyFunding(bountyId, value, token, podId);
        
        // Create bounty via internal function
        _createBountyStruct(bountyId, value, token, paymentType, podId);
        
        bountyMetadata[bountyId] = ipfsHash;
        emit BountyCreated(bountyId, msg.sender, podId, ipfsHash);
        return bountyId;
    }

    /**
     * @notice Internal function to handle bounty funding
     */
    function _handleBountyFunding(
        uint256 /* bountyId */,
        uint128 value,
        address token,
        string calldata /* podId */
    ) internal {
        // Default to wallet funding for now
        // Treasury funding can be added via separate function
        IERC20(token).safeTransferFrom(msg.sender, address(this), value);
    }

    /**
     * @notice Internal function to create bounty struct (optimized for stack)
     */
    function _createBountyStruct(
        uint256 bountyId,
        uint128 value,
        address token,
        uint8 paymentType,
        string calldata podId
    ) internal {
        // Create bounty in storage directly to avoid stack variables
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
    }

    /**
     * @notice Set treasury funding for a bounty (separate function to avoid stack depth)
     */
    function setTreasuryFunding(uint256 bountyId, string calldata podId) 
        external 
        onlyPodManager(podId) 
        nonReentrant 
    {
        require(bounties[bountyId].creator == msg.sender, "Not creator");
        require(bounties[bountyId].status == 0, "Bounty not open");
        
        require(
            IPodService(podServiceContract).canUsePodTreasury(msg.sender, podId),
            "No treasury access"
        );
        
        address treasuryAddr = IPodService(podServiceContract).getPodTreasuryAddress(podId);
        require(treasuryAddr != address(0), "Treasury not found");
        
        // Update funding source
        bounties[bountyId].fundingSource = treasuryAddr;
    }

    /**
     * @notice Update bounty details (separate function to avoid stack depth)
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
     * @param bountyId ID of the bounty
     * @param proposalIpfsHash IPFS hash of bid proposal
     */
    function placeBid(uint256 bountyId, string calldata proposalIpfsHash) 
        external 
        nonReentrant 
    {
        require(bounties[bountyId].status == 0, "Bounty not open");
        require(_canPlaceBid(bountyId), "Cannot place bid");
        
        // Add bid
        bids[bountyId].push(Bid({
            bidder: msg.sender,
            proposal: proposalIpfsHash,
            submittedAt: uint64(block.timestamp),
            status: 0 // Pending
        }));
        
        bidders[bountyId].push(msg.sender);
        emit BidPlaced(bountyId, msg.sender, bids[bountyId].length - 1);
    }

    /**
     * @notice Internal function to check if user can place bid (optimized)
     */
    function _canPlaceBid(uint256 bountyId) internal view returns (bool) {
        // Use storage reference to avoid stack copy
        Bounty storage bounty = bounties[bountyId];
        
        // Check deadline
        if (bounty.deadline != 0 && block.timestamp > bounty.deadline) {
            return false;
        }
        
        // Check if user already bid (use storage reference)
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
     * @param bountyId ID of the bounty
     * @param bidIndex Index of the winning bid
     * @param reviewer Address of technical reviewer
     * @param approver Address of final approver
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
        require(
            IPodService(podServiceContract).canManageBounties(msg.sender, bounty.podId),
            "No management permission"
        );
        
        require(bidIndex < bids[bountyId].length, "Invalid bid index");
        
        Bid storage winningBid = bids[bountyId][bidIndex];
        require(winningBid.status == 0, "Bid not pending");
        
        // Update bounty status
        bounty.status = 1; // Assigned
        
        // Mark winning bid as accepted
        winningBid.status = 1;
        
        // Create assignment
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
     * @notice Release payment (supports partial payments)
     * @param bountyId ID of the bounty
     * @param amount Amount to release
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
            IPodService(podServiceContract).canManageBounties(msg.sender, bounty.podId),
            "Not authorized"
        );
        require(amount <= assignment.escrowAmount - assignment.paidAmount, "Exceeds available");

        // Calculate platform fee
        uint128 fee = (amount * uint128(platformFeeRate)) / 10000;
        uint128 netAmount = amount - fee;

        // Transfer payments
        IERC20(bounty.token).safeTransfer(assignment.bidder, netAmount);
        if (fee > 0) {
            IERC20(bounty.token).safeTransfer(feeRecipient, fee);
        }

        assignment.paidAmount += amount;
        
        // Mark complete if fully paid
        if (assignment.paidAmount >= bounty.value) {
            bounty.status = 2; // Completed
        }

        emit PaymentReleased(bountyId, assignment.bidder, netAmount);
    }

    /**
     * @notice Cancel bounty and refund
     * @param bountyId ID of the bounty
     */
    function cancelBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        require(
            msg.sender == bounty.creator || 
            IPodService(podServiceContract).canManageBounties(msg.sender, bounty.podId),
            "Not authorized"
        );
        require(bounty.status < 2, "Cannot cancel completed bounty");

        bounty.status = 3; // Cancelled
        
        // Refund remaining escrow to original funding source
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
     * @notice Get bounty core data (simplified to avoid stack depth)
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
        Bounty storage bounty = bounties[bountyId]; // Use storage reference
        return (
            bounty.creator,
            bounty.value,
            bounty.token,
            bounty.status
        );
    }

    /**
     * @notice Get bounty metadata (separate function)
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
     * @notice Get bounty timing info (separate function)
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

    // Admin functions
    function updatePodService(address _newPodService) external {
        require(msg.sender == feeRecipient, "Only admin");
        podServiceContract = _newPodService;
        emit PodServiceUpdated(_newPodService);
    }

    function updatePlatformFee(uint256 _newFee) external {
        require(msg.sender == feeRecipient, "Only admin");
        require(_newFee <= 1000, "Max 10%");
        platformFeeRate = _newFee;
    }

    function updateFeeRecipient(address _recipient) external {
        require(msg.sender == feeRecipient, "Only admin");
        require(_recipient != address(0), "Invalid address");
        feeRecipient = _recipient;
    }

    function pause() external {
        require(msg.sender == feeRecipient, "Only admin");
        _pause();
    }

    function unpause() external {
        require(msg.sender == feeRecipient, "Only admin");
        _unpause();
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

// Minimal ERC1155 interface for Hats Protocol
interface IERC1155Minimal {
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

contract BountyManagerEnhanced is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant BOUNTY_CREATOR_ROLE = keccak256("BOUNTY_CREATOR_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");

    struct Milestone {
        uint256 id;
        uint256 dueDate;
        uint256 paymentAmount;
        MilestoneStatus status;
        uint256 completedAt;
        address completedBy;
    }

    struct Bounty {
        uint256 id;
        address creator;
        string title;
        string category;
        uint256 totalValue;
        address token; // SYSTEM or SELF token address
        BountyStatus status;
        address[] bidders;
        address selectedBidder;
        address technicalReviewer;
        address finalApprover;
        PaymentStructure paymentStructure;
        uint256[] milestoneIds;
        uint256 upfrontAmount;
        uint256 completionAmount;
        uint256 escrowAmount;
        bool isInEscrow;
    }

    // Struct to reduce stack depth in createBounty function
    struct CreateBountyParams {
        string title;
        string category;
        uint256 value;
        address token;
        PaymentStructure paymentStructure;
        uint256 upfrontAmount;
        uint256 completionAmount;
    }

    // Struct to reduce stack depth in milestone functions
    struct MilestoneParams {
        uint256 bountyId;
        uint256[] dueDates;
        uint256[] paymentAmounts;
    }

    enum BountyStatus {
        Open,
        InProgress,
        Completed,
        Cancelled
    }

    enum MilestoneStatus {
        Pending,
        Completed,
        Overdue
    }

    enum PaymentStructure {
        Completion,    // Pay on completion
        Milestones,    // Pay per milestone
        Split          // Upfront + completion
    }

    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => Milestone) public milestones;
    mapping(uint256 => mapping(address => bool)) public milestoneApprovals; // milestoneId => reviewer => approved

    uint256 public nextBountyId;
    uint256 public nextMilestoneId;

    IERC20 public systemToken;
    IERC20 public selfToken;

    mapping(address => uint256) public escrowBalances; // token => amount
    mapping(uint256 => uint256) public bountyEscrowAmounts; // bountyId => amount

    IERC1155Minimal public hatsContract;
    uint256 public bountyHatId;

    event BountyCreated(
        uint256 indexed id,
        address indexed creator,
        string title,
        uint256 value,
        address token,
        PaymentStructure paymentStructure
    );
    event BidPlaced(uint256 indexed bountyId, address indexed bidder);
    event BountyAssigned(uint256 indexed bountyId, address indexed bidder, address technicalReviewer, address finalApprover);
    event MilestoneCreated(uint256 indexed bountyId, uint256 indexed milestoneId, uint256 amount);
    event MilestoneApproved(uint256 indexed bountyId, uint256 indexed milestoneId, address indexed reviewer);
    event MilestoneCompleted(uint256 indexed bountyId, uint256 indexed milestoneId, address indexed bidder, uint256 amount);
    event BountyCompleted(uint256 indexed bountyId);
    event BountyCancelled(uint256 indexed bountyId);
    event EscrowFunded(uint256 indexed bountyId, uint256 amount);
    event PaymentReleased(uint256 indexed bountyId, address indexed recipient, uint256 amount);

    constructor(address _systemToken, address _selfToken, address _hatsContract, uint256 _bountyHatId) AccessControl() {
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(BOUNTY_CREATOR_ROLE, msg.sender);
        _setRoleAdmin(BOUNTY_CREATOR_ROLE, ADMIN_ROLE);
        
        systemToken = IERC20(_systemToken);
        selfToken = IERC20(_selfToken);
        hatsContract = IERC1155Minimal(_hatsContract);
        bountyHatId = _bountyHatId;
    }

    modifier onlyHatHolder() {
        require(hatsContract.balanceOf(msg.sender, bountyHatId) > 0, "Must own required hat token");
        _;
    }

    modifier onlyHatHolderWithRole(bytes32 role) {
        require(hatsContract.balanceOf(msg.sender, bountyHatId) > 0, "Must own required hat token");
        
        // Automatically grant role if hat holder doesn't have it
        if (!hasRole(role, msg.sender)) {
            _grantRole(role, msg.sender);
        }
        _;
    }

    // Refactored createBounty to reduce stack depth
    function createBounty(
        string memory _title,
        string memory _category,
        uint256 _value,
        address _token,
        PaymentStructure _paymentStructure,
        uint256 _upfrontAmount,
        uint256 _completionAmount
    ) external onlyHatHolderWithRole(BOUNTY_CREATOR_ROLE) nonReentrant {
        CreateBountyParams memory params = CreateBountyParams({
            title: _title,
            category: _category,
            value: _value,
            token: _token,
            paymentStructure: _paymentStructure,
            upfrontAmount: _upfrontAmount,
            completionAmount: _completionAmount
        });

        _validateBountyParams(params);
        uint256 bountyId = _createBountyInternal(params);
        
        emit BountyCreated(bountyId, msg.sender, params.title, params.value, params.token, params.paymentStructure);
    }

    function _validateBountyParams(CreateBountyParams memory params) internal view {
        require(params.value > 0, "Value must be > 0");
        require(params.token == address(systemToken) || params.token == address(selfToken), "Invalid token");

        if (params.paymentStructure == PaymentStructure.Split) {
            require(params.upfrontAmount + params.completionAmount == params.value, "Split amounts must equal total value");
        }
    }

    function _createBountyInternal(CreateBountyParams memory params) internal returns (uint256) {
        uint256 bountyId = nextBountyId++;
        Bounty storage bounty = bounties[bountyId];
        
        bounty.id = bountyId;
        bounty.creator = msg.sender;
        bounty.title = params.title;
        bounty.category = params.category;
        bounty.totalValue = params.value;
        bounty.token = params.token;
        bounty.status = BountyStatus.Open;
        bounty.paymentStructure = params.paymentStructure;
        bounty.upfrontAmount = params.upfrontAmount;
        bounty.completionAmount = params.completionAmount;

        return bountyId;
    }

    function placeBid(uint256 _bountyId) external nonReentrant {
        require(bounties[_bountyId].status == BountyStatus.Open, "Bounty not open");
        require(bounties[_bountyId].creator != msg.sender, "Creator cannot bid");
        
        bounties[_bountyId].bidders.push(msg.sender);
        emit BidPlaced(_bountyId, msg.sender);
    }

    function assignBounty(
        uint256 _bountyId, 
        address _bidder,
        address _technicalReviewer,
        address _finalApprover
    ) external onlyHatHolderWithRole(BOUNTY_CREATOR_ROLE) {
        Bounty storage bounty = bounties[_bountyId];
        require(bounty.status == BountyStatus.Open, "Bounty not open");
        require(_bidder != address(0) && _technicalReviewer != address(0) && _finalApprover != address(0), "Invalid address");
        require(_isBidder(_bountyId, _bidder), "Not a valid bidder");

        bounty.selectedBidder = _bidder;
        bounty.technicalReviewer = _technicalReviewer;
        bounty.finalApprover = _finalApprover;
        bounty.status = BountyStatus.InProgress;
        
        _setupEscrow(_bountyId);

        emit BountyAssigned(_bountyId, _bidder, _technicalReviewer, _finalApprover);
    }

    // Refactored createMilestones to reduce stack depth
    function createMilestones(uint256 _bountyId, uint256[] memory _dueDates, uint256[] memory _paymentAmounts) 
        external
    {
        require(bounties[_bountyId].creator == msg.sender, "Only creator can add milestones");
        require(bounties[_bountyId].status == BountyStatus.InProgress, "Bounty must be in progress");
        require(_dueDates.length == _paymentAmounts.length, "Arrays must have same length");
        
        _validateMilestoneAmounts(bounties[_bountyId].totalValue, _paymentAmounts);
        _createMilestonesInternal(_bountyId, _dueDates, _paymentAmounts);
    }

    function _createMilestonesInternal(uint256 bountyId, uint256[] memory dueDates, uint256[] memory amounts) internal {
        for (uint i = 0; i < dueDates.length; i++) {
            uint256 milestoneId = nextMilestoneId++;
            
            milestones[milestoneId].id = milestoneId;
            milestones[milestoneId].dueDate = dueDates[i];
            milestones[milestoneId].paymentAmount = amounts[i];
            milestones[milestoneId].status = MilestoneStatus.Pending;
            
            bounties[bountyId].milestoneIds.push(milestoneId);
            emit MilestoneCreated(bountyId, milestoneId, amounts[i]);
        }
    }

    function approveMilestone(uint256 _bountyId, uint256 _milestoneId) external {
        Bounty storage bounty = bounties[_bountyId];
        require(msg.sender == bounty.technicalReviewer || msg.sender == bounty.finalApprover, "Not a reviewer");
        
        Milestone storage milestone = milestones[_milestoneId];
        require(milestone.status == MilestoneStatus.Pending, "Milestone not pending");
        require(!milestoneApprovals[_milestoneId][msg.sender], "Already approved");

        milestoneApprovals[_milestoneId][msg.sender] = true;
        emit MilestoneApproved(_bountyId, _milestoneId, msg.sender);

        // Check if all reviewers have approved
        if (milestoneApprovals[_milestoneId][bounty.technicalReviewer] && 
            milestoneApprovals[_milestoneId][bounty.finalApprover]) {
            _completeMilestone(_bountyId, _milestoneId);
        }
    }

    function _completeMilestone(uint256 _bountyId, uint256 _milestoneId) internal {
        Bounty storage bounty = bounties[_bountyId];
        Milestone storage milestone = milestones[_milestoneId];

        milestone.status = MilestoneStatus.Completed;
        milestone.completedAt = block.timestamp;
        milestone.completedBy = bounty.selectedBidder;

        _processMilestonePayment(_bountyId, _milestoneId, milestone.paymentAmount);

        if (_areAllMilestonesCompleted(_bountyId)) {
            bounty.status = BountyStatus.Completed;
            emit BountyCompleted(_bountyId);
        }
    }

    function _processMilestonePayment(uint256 bountyId, uint256 milestoneId, uint256 paymentAmount) internal {
        Bounty storage bounty = bounties[bountyId];
        
        escrowBalances[bounty.token] -= paymentAmount;
        bountyEscrowAmounts[bountyId] -= paymentAmount;
        
        IERC20(bounty.token).transfer(bounty.selectedBidder, paymentAmount);

        emit MilestoneCompleted(bountyId, milestoneId, bounty.selectedBidder, paymentAmount);
        emit PaymentReleased(bountyId, bounty.selectedBidder, paymentAmount);
    }

    function approveCompletion(uint256 _bountyId) external {
        Bounty storage bounty = bounties[_bountyId];
        require(msg.sender == bounty.finalApprover, "Only final approver can complete");
        require(bounty.status == BountyStatus.InProgress, "Bounty not in progress");

        if (bounty.paymentStructure == PaymentStructure.Split || 
            bounty.paymentStructure == PaymentStructure.Completion) {
            _releaseFinalPayment(_bountyId);
        }

        bounty.status = BountyStatus.Completed;
        emit BountyCompleted(_bountyId);
    }

    function cancelBounty(uint256 _bountyId) external onlyHatHolderWithRole(ADMIN_ROLE) nonReentrant {
        require(bounties[_bountyId].status != BountyStatus.Completed, "Cannot cancel completed");
        if (bounties[_bountyId].isInEscrow) {
            _returnEscrowToCreator(_bountyId);
        }
        bounties[_bountyId].status = BountyStatus.Cancelled;
        emit BountyCancelled(_bountyId);
    }
    
    // ---- INTERNAL HELPERS ----
    
    function _setupEscrow(uint256 _bountyId) internal {
        Bounty storage bounty = bounties[_bountyId];
        uint256 escrowAmount = _calculateEscrowAmount(bounty);

        bounty.escrowAmount = escrowAmount;
        bounty.isInEscrow = true;
        escrowBalances[bounty.token] += escrowAmount;
        bountyEscrowAmounts[_bountyId] = escrowAmount;

        emit EscrowFunded(_bountyId, escrowAmount);
    }

    function _calculateEscrowAmount(Bounty storage bounty) internal view returns (uint256) {
        if (bounty.paymentStructure == PaymentStructure.Split) {
            return bounty.completionAmount;
        }
        return bounty.totalValue;
    }

    function _releaseFinalPayment(uint256 _bountyId) internal {
        Bounty storage bounty = bounties[_bountyId];
        uint256 paymentAmount = _getFinalPaymentAmount(bounty);

        require(bounty.escrowAmount >= paymentAmount, "Insufficient escrow");
        
        bounty.escrowAmount -= paymentAmount;
        escrowBalances[bounty.token] -= paymentAmount;

        IERC20(bounty.token).transfer(bounty.selectedBidder, paymentAmount);
        emit PaymentReleased(_bountyId, bounty.selectedBidder, paymentAmount);
    }

    function _getFinalPaymentAmount(Bounty storage bounty) internal view returns (uint256) {
        return bounty.paymentStructure == PaymentStructure.Split 
            ? bounty.completionAmount 
            : bounty.totalValue;
    }

    function _returnEscrowToCreator(uint256 _bountyId) internal {
        uint256 escrowed = bountyEscrowAmounts[_bountyId];
        if (escrowed > 0) {
            address tokenAddr = bounties[_bountyId].token;
            address creator = bounties[_bountyId].creator;
            
            escrowBalances[tokenAddr] -= escrowed;
            bountyEscrowAmounts[_bountyId] = 0;
            IERC20(tokenAddr).transfer(creator, escrowed);
        }
    }
    
    function _isBidder(uint256 _bountyId, address _bidder) internal view returns (bool) {
        address[] memory bidders = bounties[_bountyId].bidders;
        for (uint i = 0; i < bidders.length; i++) {
            if (bidders[i] == _bidder) return true;
        }
        return false;
    }

    function _validateMilestoneAmounts(uint256 totalValue, uint256[] memory amounts) internal pure {
        uint256 total = 0;
        for (uint i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        require(total == totalValue, "Milestone amounts must equal bounty value");
    }

    function _areAllMilestonesCompleted(uint256 _bountyId) internal view returns (bool) {
        uint256[] memory milestoneIds = bounties[_bountyId].milestoneIds;
        if (milestoneIds.length == 0) return false;

        for (uint j = 0; j < milestoneIds.length; j++) {
            if (milestones[milestoneIds[j]].status != MilestoneStatus.Completed) {
                return false;
            }
        }
        return true;
    }

    // ---- VIEW FUNCTIONS ----

    function getBounty(uint256 _bountyId) external view returns (Bounty memory) {
        return bounties[_bountyId];
    }
    
    function getMilestone(uint256 _milestoneId) external view returns (Milestone memory) {
        return milestones[_milestoneId];
    }
    
    function getBountyMilestones(uint256 _bountyId) external view returns (uint256[] memory) {
        return bounties[_bountyId].milestoneIds;
    }

    function getBountyBidders(uint256 _bountyId) external view returns (address[] memory) {
        return bounties[_bountyId].bidders;
    }

    // Admin functions
    function pause() external onlyHatHolderWithRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyHatHolderWithRole(ADMIN_ROLE) {
        _unpause();
    }
}
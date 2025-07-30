// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title EventEscrow
 * @dev Contract to handle event payments and escrow funds until completion
 * Supports $SELF and $SYSTEM tokens as payment methods
 * Funds are held in escrow until event completion, then distributed to designated pod
 */
contract EventEscrow is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    
    // Supported tokens
    IERC20 public immutable systemToken;
    IERC20 public immutable selfToken;
    
    // Event details
    struct EventInfo {
        string eventId;
        string title;
        uint256 eventDate;
        address organizer;
        address fundRecipient; // Pod address to receive funds
        uint256 priceSystem;   // Price in SYSTEM tokens
        uint256 priceSelf;     // Price in SELF tokens
        bool isActive;
        bool isCompleted;
        uint256 totalSystemCollected;
        uint256 totalSelfCollected;
        uint256 participantCount;
    }
    
    // Payment tracking
    struct PaymentInfo {
        uint256 systemAmount;
        uint256 selfAmount;
        uint256 timestamp;
        bool refunded;
    }
    
    // Storage
    mapping(string => EventInfo) public events;
    mapping(string => mapping(address => PaymentInfo)) public payments;
    mapping(string => address[]) public eventParticipants;
    
    // Events
    event EventCreated(
        string indexed eventId,
        address indexed organizer,
        address indexed fundRecipient,
        uint256 priceSystem,
        uint256 priceSelf
    );
    
    event PaymentMade(
        string indexed eventId,
        address indexed user,
        uint256 systemAmount,
        uint256 selfAmount,
        uint256 timestamp
    );
    
    event EventCompleted(
        string indexed eventId,
        uint256 totalSystemDistributed,
        uint256 totalSelfDistributed
    );
    
    event PaymentRefunded(
        string indexed eventId,
        address indexed user,
        uint256 systemAmount,
        uint256 selfAmount
    );
    
    event FundsDistributed(
        string indexed eventId,
        address indexed recipient,
        uint256 systemAmount,
        uint256 selfAmount
    );
    
    constructor(address _systemToken, address _selfToken, address initialOwner) Ownable(initialOwner) {
        require(_systemToken != address(0), "Invalid system token");
        require(_selfToken != address(0), "Invalid self token");
        require(initialOwner != address(0), "Invalid initial owner");
        systemToken = IERC20(_systemToken);
        selfToken = IERC20(_selfToken);
    }
    
    /**
     * @dev Create an event with escrow settings
     */
    function createEvent(
        string memory eventId,
        string memory title,
        uint256 eventDate,
        address organizer,
        address fundRecipient,
        uint256 priceSystem,
        uint256 priceSelf
    ) external onlyOwner {
        require(bytes(eventId).length > 0, "Event ID cannot be empty");
        require(!events[eventId].isActive, "Event already exists");
        require(organizer != address(0), "Invalid organizer");
        require(fundRecipient != address(0), "Invalid fund recipient");
        require(eventDate > block.timestamp, "Event date must be in future");
        require(priceSystem > 0 || priceSelf > 0, "At least one price must be set");
        
        events[eventId] = EventInfo({
            eventId: eventId,
            title: title,
            eventDate: eventDate,
            organizer: organizer,
            fundRecipient: fundRecipient,
            priceSystem: priceSystem,
            priceSelf: priceSelf,
            isActive: true,
            isCompleted: false,
            totalSystemCollected: 0,
            totalSelfCollected: 0,
            participantCount: 0
        });
        
        emit EventCreated(eventId, organizer, fundRecipient, priceSystem, priceSelf);
    }
    
    /**
     * @dev Make payment for event registration
     */
    function payForEvent(string memory eventId) external nonReentrant whenNotPaused {
        EventInfo storage eventInfo = events[eventId];
        require(eventInfo.isActive, "Event not active");
        require(!eventInfo.isCompleted, "Event already completed");
        require(block.timestamp < eventInfo.eventDate, "Event date has passed");
        require(payments[eventId][msg.sender].timestamp == 0, "Already paid");
        
        uint256 systemAmount = eventInfo.priceSystem;
        uint256 selfAmount = eventInfo.priceSelf;
        
        // Handle SYSTEM token payment
        if (systemAmount > 0) {
            require(
                systemToken.balanceOf(msg.sender) >= systemAmount,
                "Insufficient SYSTEM balance"
            );
            require(
                systemToken.allowance(msg.sender, address(this)) >= systemAmount,
                "Insufficient SYSTEM allowance"
            );
            systemToken.safeTransferFrom(msg.sender, address(this), systemAmount);
        }
        
        // Handle SELF token payment
        if (selfAmount > 0) {
            require(
                selfToken.balanceOf(msg.sender) >= selfAmount,
                "Insufficient SELF balance"
            );
            require(
                selfToken.allowance(msg.sender, address(this)) >= selfAmount,
                "Insufficient SELF allowance"
            );
            selfToken.safeTransferFrom(msg.sender, address(this), selfAmount);
        }
        
        // Record payment
        payments[eventId][msg.sender] = PaymentInfo({
            systemAmount: systemAmount,
            selfAmount: selfAmount,
            timestamp: block.timestamp,
            refunded: false
        });
        
        // Update event stats
        eventInfo.totalSystemCollected += systemAmount;
        eventInfo.totalSelfCollected += selfAmount;
        eventInfo.participantCount++;
        eventParticipants[eventId].push(msg.sender);
        
        emit PaymentMade(eventId, msg.sender, systemAmount, selfAmount, block.timestamp);
    }
    
    /**
     * @dev Complete event and distribute funds to recipient
     */
    function completeEvent(string memory eventId) external onlyOwner {
        EventInfo storage eventInfo = events[eventId];
        require(eventInfo.isActive, "Event not active");
        require(!eventInfo.isCompleted, "Event already completed");
        
        uint256 systemToDistribute = eventInfo.totalSystemCollected;
        uint256 selfToDistribute = eventInfo.totalSelfCollected;
        
        // Mark event as completed
        eventInfo.isCompleted = true;
        
        // Transfer funds to recipient
        if (systemToDistribute > 0) {
            systemToken.safeTransfer(eventInfo.fundRecipient, systemToDistribute);
        }
        if (selfToDistribute > 0) {
            selfToken.safeTransfer(eventInfo.fundRecipient, selfToDistribute);
        }
        
        emit EventCompleted(eventId, systemToDistribute, selfToDistribute);
        emit FundsDistributed(eventId, eventInfo.fundRecipient, systemToDistribute, selfToDistribute);
    }
    
    /**
     * @dev Cancel event and allow refunds
     */
    function cancelEvent(string memory eventId) external onlyOwner {
        EventInfo storage eventInfo = events[eventId];
        require(eventInfo.isActive, "Event not active");
        require(!eventInfo.isCompleted, "Event already completed");
        
        eventInfo.isActive = false;
    }
    
    /**
     * @dev Refund payment to user (for cancelled events)
     */
    function refundPayment(string memory eventId, address user) external onlyOwner {
        EventInfo storage eventInfo = events[eventId];
        require(!eventInfo.isActive || !eventInfo.isCompleted, "Cannot refund active event");
        
        PaymentInfo storage payment = payments[eventId][user];
        require(payment.timestamp > 0, "No payment found");
        require(!payment.refunded, "Already refunded");
        
        uint256 systemAmount = payment.systemAmount;
        uint256 selfAmount = payment.selfAmount;
        
        // Mark as refunded
        payment.refunded = true;
        
        // Update event totals
        eventInfo.totalSystemCollected -= systemAmount;
        eventInfo.totalSelfCollected -= selfAmount;
        
        // Process refunds
        if (systemAmount > 0) {
            systemToken.safeTransfer(user, systemAmount);
        }
        if (selfAmount > 0) {
            selfToken.safeTransfer(user, selfAmount);
        }
        
        emit PaymentRefunded(eventId, user, systemAmount, selfAmount);
    }
    
    /**
     * @dev Batch refund for cancelled events
     */
    function batchRefund(string memory eventId) external onlyOwner {
        EventInfo storage eventInfo = events[eventId];
        require(!eventInfo.isActive, "Event is still active");
        require(!eventInfo.isCompleted, "Event already completed");
        
        address[] memory participants = eventParticipants[eventId];
        
        for (uint256 i = 0; i < participants.length; i++) {
            address participant = participants[i];
            PaymentInfo storage payment = payments[eventId][participant];
            
            if (payment.timestamp > 0 && !payment.refunded) {
                uint256 systemAmount = payment.systemAmount;
                uint256 selfAmount = payment.selfAmount;
                
                payment.refunded = true;
                
                if (systemAmount > 0) {
                    systemToken.safeTransfer(participant, systemAmount);
                }
                if (selfAmount > 0) {
                    selfToken.safeTransfer(participant, selfAmount);
                }
                
                emit PaymentRefunded(eventId, participant, systemAmount, selfAmount);
            }
        }
        
        // Reset event totals
        eventInfo.totalSystemCollected = 0;
        eventInfo.totalSelfCollected = 0;
    }
    
    /**
     * @dev Get event participants
     */
    function getEventParticipants(string memory eventId) external view returns (address[] memory) {
        return eventParticipants[eventId];
    }
    
    /**
     * @dev Check if user has paid for event
     */
    function hasUserPaid(string memory eventId, address user) external view returns (bool) {
        return payments[eventId][user].timestamp > 0 && !payments[eventId][user].refunded;
    }
    
    /**
     * @dev Get user payment info
     */
    function getUserPayment(string memory eventId, address user) 
        external 
        view 
        returns (uint256 systemAmount, uint256 selfAmount, uint256 timestamp, bool refunded) 
    {
        PaymentInfo memory payment = payments[eventId][user];
        return (payment.systemAmount, payment.selfAmount, payment.timestamp, payment.refunded);
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
    
    /**
     * @dev Emergency withdrawal (only for stuck funds)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}
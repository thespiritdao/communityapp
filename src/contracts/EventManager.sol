// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Hats Protocol interface
interface IHats {
    function isWearerOfHat(address _user, uint256 _hatId) external view returns (bool);
}

/**
 * @title EventManager
 * @dev Simplified event management contract with integrated payments and completion NFTs
 * Replaces the complex factory pattern with a single, reliable contract
 */
contract EventManager is ERC721, ReentrancyGuard {
    
    // Event states
    enum EventStatus { Created, Active, Completed, Cancelled }
    
    // Event structure
    struct Event {
        string eventId;
        string title;
        uint256 eventDate;
        address organizer;
        address fundRecipient;
        uint256 priceSystem;
        uint256 priceSelf;
        EventStatus status;
        uint256 createdAt;
        uint256 maxAttendees;
        uint256 currentAttendees;
        bool requiresPayment;
    }
    
    // Payment tracking
    struct Payment {
        address attendee;
        uint256 amountSystem;
        uint256 priceSelf;
        uint256 timestamp;
        bool refunded;
    }
    
    // Completion certificate tracking
    struct CompletionCertificate {
        string eventId;
        address recipient;
        string metadataURI;
        uint256 mintedAt;
    }
    
    // State variables
    mapping(string => Event) public events;
    mapping(string => Payment[]) public eventPayments;
    mapping(string => address[]) public eventAttendees;
    mapping(address => string[]) public userEvents;
    mapping(uint256 => CompletionCertificate) public certificates;
    
    string[] public allEventIds;
    uint256 private _certificateCounter;
    
    // Token contracts (if using ERC20 tokens for payment)
    IERC20 public systemToken;
    IERC20 public selfToken;
    
    // Hats Protocol integration
    IHats public hatsContract;
    uint256 public eventManagementHatId;
    
    // Events
    event EventCreated(
        string indexed eventId,
        address indexed organizer,
        string title,
        uint256 eventDate,
        uint256 priceSystem,
        uint256 priceSelf
    );
    
    event AttendeeRegistered(
        string indexed eventId,
        address indexed attendee,
        uint256 amountPaid,
        uint256 timestamp
    );
    
    event EventCompleted(
        string indexed eventId,
        address indexed organizer,
        uint256 totalFunds,
        uint256 timestamp
    );
    
    event CertificateMinted(
        string indexed eventId,
        address indexed recipient,
        uint256 indexed certificateId,
        string metadataURI
    );
    
    event EventCancelled(
        string indexed eventId,
        address indexed organizer,
        uint256 refundCount
    );
    
    constructor(
        address _hatsContract,
        uint256 _eventManagementHatId,
        address _systemToken,
        address _selfToken
    ) ERC721("DAO Event Certificates", "CERT") {
        require(_hatsContract != address(0), "Invalid Hats contract address");
        hatsContract = IHats(_hatsContract);
        eventManagementHatId = _eventManagementHatId;
        systemToken = IERC20(_systemToken);
        selfToken = IERC20(_selfToken);
    }
    
    /**
     * @dev Modifier to check if caller has event management hat
     */
    modifier onlyEventManager() {
        require(
            hatsContract.isWearerOfHat(msg.sender, eventManagementHatId),
            "Must wear event management hat"
        );
        _;
    }
    
    /**
     * @dev Create a new event (simplified - no contract deployment)
     * @notice Open to all users - permission checks handled at app level
     */
    function createEvent(
        string memory eventId,
        string memory title,
        uint256 eventDate,
        address fundRecipient,
        uint256 priceSystem,
        uint256 priceSelf,
        uint256 maxAttendees
    ) external {
        require(bytes(eventId).length > 0, "Event ID required");
        require(bytes(events[eventId].eventId).length == 0, "Event exists");
        require(bytes(title).length > 0, "Title required");
        require(eventDate > block.timestamp, "Event must be in future");
        require(fundRecipient != address(0), "Invalid fund recipient");
        
        bool requiresPayment = (priceSystem > 0 || priceSelf > 0);
        
        events[eventId] = Event({
            eventId: eventId,
            title: title,
            eventDate: eventDate,
            organizer: msg.sender,
            fundRecipient: fundRecipient,
            priceSystem: priceSystem,
            priceSelf: priceSelf,
            status: EventStatus.Created,
            createdAt: block.timestamp,
            maxAttendees: maxAttendees,
            currentAttendees: 0,
            requiresPayment: requiresPayment
        });
        
        allEventIds.push(eventId);
        userEvents[msg.sender].push(eventId);
        
        emit EventCreated(eventId, msg.sender, title, eventDate, priceSystem, priceSelf);
    }
    
    /**
     * @dev Register for an event (with ERC20 token payment if required)
     */
    function registerForEvent(string memory eventId) external nonReentrant {
        Event storage eventData = events[eventId];
        require(bytes(eventData.eventId).length > 0, "Event not found");
        require(eventData.status == EventStatus.Created, "Event not available");
        require(block.timestamp < eventData.eventDate, "Event has started");
        
        // Check if already registered
        address[] memory attendees = eventAttendees[eventId];
        for (uint i = 0; i < attendees.length; i++) {
            require(attendees[i] != msg.sender, "Already registered");
        }
        
        // Check capacity
        if (eventData.maxAttendees > 0) {
            require(eventData.currentAttendees < eventData.maxAttendees, "Event full");
        }
        
        uint256 totalPaid = 0;
        
        // Handle ERC20 token payments
        if (eventData.requiresPayment) {
            // Handle SYSTEM token payment
            if (eventData.priceSystem > 0) {
                require(
                    systemToken.allowance(msg.sender, address(this)) >= eventData.priceSystem,
                    "Insufficient SYSTEM token allowance"
                );
                require(
                    systemToken.balanceOf(msg.sender) >= eventData.priceSystem,
                    "Insufficient SYSTEM token balance"
                );
                require(
                    systemToken.transferFrom(msg.sender, address(this), eventData.priceSystem),
                    "SYSTEM token transfer failed"
                );
                totalPaid += eventData.priceSystem;
            }
            
            // Handle SELF token payment
            if (eventData.priceSelf > 0) {
                require(
                    selfToken.allowance(msg.sender, address(this)) >= eventData.priceSelf,
                    "Insufficient SELF token allowance"
                );
                require(
                    selfToken.balanceOf(msg.sender) >= eventData.priceSelf,
                    "Insufficient SELF token balance"
                );
                require(
                    selfToken.transferFrom(msg.sender, address(this), eventData.priceSelf),
                    "SELF token transfer failed"
                );
                totalPaid += eventData.priceSelf;
            }
            
            // Track payment
            eventPayments[eventId].push(Payment({
                attendee: msg.sender,
                amountSystem: eventData.priceSystem,
                priceSelf: eventData.priceSelf,
                timestamp: block.timestamp,
                refunded: false
            }));
        }
        
        // Register attendee
        eventAttendees[eventId].push(msg.sender);
        eventData.currentAttendees++;
        userEvents[msg.sender].push(eventId);
        
        emit AttendeeRegistered(eventId, msg.sender, totalPaid, block.timestamp);
    }
    
    /**
     * @dev Complete event (funds already distributed during registration)
     */
    function completeEvent(string memory eventId) external {
        Event storage eventData = events[eventId];
        require(bytes(eventData.eventId).length > 0, "Event not found");
        require(
            msg.sender == eventData.organizer || 
            hatsContract.isWearerOfHat(msg.sender, eventManagementHatId), 
            "Only organizer or event manager"
        );
        require(eventData.status == EventStatus.Created, "Event not active");
        require(block.timestamp >= eventData.eventDate, "Event not started");
        
        eventData.status = EventStatus.Completed;
        
        // Calculate and distribute funds to recipient
        uint256 totalSystemTokens = 0;
        uint256 totalSelfTokens = 0;
        Payment[] memory payments = eventPayments[eventId];
        
        for (uint i = 0; i < payments.length; i++) {
            if (!payments[i].refunded) {
                totalSystemTokens += payments[i].amountSystem;
                totalSelfTokens += payments[i].priceSelf;
            }
        }
        
        // Transfer accumulated tokens to fund recipient
        if (totalSystemTokens > 0) {
            require(
                systemToken.transfer(eventData.fundRecipient, totalSystemTokens),
                "SYSTEM token distribution failed"
            );
        }
        
        if (totalSelfTokens > 0) {
            require(
                selfToken.transfer(eventData.fundRecipient, totalSelfTokens),
                "SELF token distribution failed"
            );
        }
        
        emit EventCompleted(eventId, eventData.organizer, totalSystemTokens + totalSelfTokens, block.timestamp);
    }
    
    /**
     * @dev Cancel event and refund attendees
     */
    function cancelEvent(string memory eventId) external nonReentrant {
        Event storage eventData = events[eventId];
        require(bytes(eventData.eventId).length > 0, "Event not found");
        require(
            msg.sender == eventData.organizer || 
            hatsContract.isWearerOfHat(msg.sender, eventManagementHatId), 
            "Only organizer or event manager"
        );
        require(eventData.status == EventStatus.Created, "Cannot cancel");
        
        eventData.status = EventStatus.Cancelled;
        
        // Process ERC20 token refunds
        Payment[] storage payments = eventPayments[eventId];
        uint256 refundCount = 0;
        
        for (uint i = 0; i < payments.length; i++) {
            if (!payments[i].refunded) {
                payments[i].refunded = true;
                
                // Refund SYSTEM tokens
                if (payments[i].amountSystem > 0) {
                    require(
                        systemToken.transfer(payments[i].attendee, payments[i].amountSystem),
                        "SYSTEM token refund failed"
                    );
                }
                
                // Refund SELF tokens  
                if (payments[i].priceSelf > 0) {
                    require(
                        selfToken.transfer(payments[i].attendee, payments[i].priceSelf),
                        "SELF token refund failed"
                    );
                }
                
                refundCount++;
            }
        }
        
        emit EventCancelled(eventId, eventData.organizer, refundCount);
    }
    
    /**
     * @dev Mint completion certificate to attendee
     */
    function mintCompletionCertificate(
        string memory eventId,
        address recipient,
        string memory metadataURI
    ) external returns (uint256) {
        Event storage eventData = events[eventId];
        require(bytes(eventData.eventId).length > 0, "Event not found");
        require(
            msg.sender == eventData.organizer || 
            hatsContract.isWearerOfHat(msg.sender, eventManagementHatId), 
            "Only organizer or event manager"
        );
        require(eventData.status == EventStatus.Completed, "Event not completed");
        
        // Verify recipient attended event
        bool attended = false;
        address[] memory attendees = eventAttendees[eventId];
        for (uint i = 0; i < attendees.length; i++) {
            if (attendees[i] == recipient) {
                attended = true;
                break;
            }
        }
        require(attended, "Recipient did not attend");
        
        _certificateCounter++;
        uint256 certificateId = _certificateCounter;
        
        certificates[certificateId] = CompletionCertificate({
            eventId: eventId,
            recipient: recipient,
            metadataURI: metadataURI,
            mintedAt: block.timestamp
        });
        
        _mint(recipient, certificateId);
        
        emit CertificateMinted(eventId, recipient, certificateId, metadataURI);
        
        return certificateId;
    }
    
    /**
     * @dev Batch mint certificates to multiple attendees
     * Call mintCompletionCertificate for each recipient individually
     */
    function batchMintCertificates(
        string memory eventId,
        address[] memory recipients,
        string[] memory metadataURIs
    ) external {
        require(recipients.length == metadataURIs.length, "Array length mismatch");
        
        Event storage eventData = events[eventId];
        require(bytes(eventData.eventId).length > 0, "Event not found");
        require(
            msg.sender == eventData.organizer || 
            hatsContract.isWearerOfHat(msg.sender, eventManagementHatId), 
            "Only organizer or event manager"
        );
        require(eventData.status == EventStatus.Completed, "Event not completed");
        
        // Mint certificates directly without calling other function
        for (uint i = 0; i < recipients.length; i++) {
            // Verify recipient attended event
            bool attended = false;
            address[] memory attendees = eventAttendees[eventId];
            for (uint j = 0; j < attendees.length; j++) {
                if (attendees[j] == recipients[i]) {
                    attended = true;
                    break;
                }
            }
            require(attended, "Recipient did not attend");
            
            _certificateCounter++;
            uint256 certificateId = _certificateCounter;
            
            certificates[certificateId] = CompletionCertificate({
                eventId: eventId,
                recipient: recipients[i],
                metadataURI: metadataURIs[i],
                mintedAt: block.timestamp
            });
            
            _mint(recipients[i], certificateId);
            
            emit CertificateMinted(eventId, recipients[i], certificateId, metadataURIs[i]);
        }
    }
    
    // View functions
    function getEvent(string memory eventId) external view returns (Event memory) {
        require(bytes(events[eventId].eventId).length > 0, "Event not found");
        return events[eventId];
    }
    
    function getEventAttendees(string memory eventId) external view returns (address[] memory) {
        return eventAttendees[eventId];
    }
    
    function getUserEvents(address user) external view returns (string[] memory) {
        return userEvents[user];
    }
    
    function getAllEvents() external view returns (string[] memory) {
        return allEventIds;
    }
    
    function getEventPayments(string memory eventId) external view returns (Payment[] memory) {
        return eventPayments[eventId];
    }
    
    function isRegisteredForEvent(string memory eventId, address user) external view returns (bool) {
        address[] memory attendees = eventAttendees[eventId];
        for (uint i = 0; i < attendees.length; i++) {
            if (attendees[i] == user) {
                return true;
            }
        }
        return false;
    }
    
    // Override tokenURI to return certificate metadata
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Certificate does not exist");
        return certificates[tokenId].metadataURI;
    }
    
    // Emergency functions - only for event managers
    function withdrawEmergencyTokens(address tokenAddress) external onlyEventManager {
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            require(token.transfer(msg.sender, balance), "Emergency withdrawal failed");
        }
    }
    
    function updateTokenAddresses(address _systemToken, address _selfToken) external onlyEventManager {
        systemToken = IERC20(_systemToken);
        selfToken = IERC20(_selfToken);
    }
    
    function updateHatsConfig(address _hatsContract, uint256 _eventManagementHatId) external onlyEventManager {
        hatsContract = IHats(_hatsContract);
        eventManagementHatId = _eventManagementHatId;
    }
}
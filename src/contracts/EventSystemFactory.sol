// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./EventRegistrationNFTFactory.sol";
import "./EventCompletionNFTFactory.sol";
import "./EventEscrow.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EventSystemFactory
 * @dev Master factory contract that coordinates the entire event system deployment
 * This is the main contract your app should interact with for creating complete event systems
 */
contract EventSystemFactory is Ownable {
    
    // Factory contract addresses
    EventRegistrationNFTFactory public immutable registrationFactory;
    EventCompletionNFTFactory public immutable completionFactory;
    EventEscrow public immutable eventEscrow;
    
    // Track complete event systems
    struct EventSystem {
        string eventId;
        string eventTitle;
        uint256 eventDate;
        address eventOrganizer;
        address registrationContract;
        address completionContract;
        bool escrowCreated;
        uint256 createdAt;
    }
    
    mapping(string => EventSystem) public eventSystems;
    string[] public allEventIds;
    
    // Events
    event CompleteEventSystemCreated(
        string indexed eventId,
        address indexed eventOrganizer,
        address registrationContract,
        address completionContract,
        uint256 timestamp
    );
    
    constructor(
        address _registrationFactory,
        address _completionFactory,
        address _eventEscrow,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_registrationFactory != address(0), "Invalid registration factory");
        require(_completionFactory != address(0), "Invalid completion factory");
        require(_eventEscrow != address(0), "Invalid event escrow");
        
        registrationFactory = EventRegistrationNFTFactory(_registrationFactory);
        completionFactory = EventCompletionNFTFactory(_completionFactory);
        eventEscrow = EventEscrow(_eventEscrow);
    }
    
    /**
     * @dev Create a complete event system with all necessary contracts
     * This is the main function your app should call when a user creates an event
     * @param eventId Unique identifier for the event
     * @param eventTitle Human-readable event name
     * @param eventDate Unix timestamp of event date
     * @param eventOrganizer Address of the event organizer (gets contract ownership)
     * @param fundRecipient Address to receive funds (typically a Pod address)
     * @param priceSystem Price in SYSTEM tokens (can be 0)
     * @param priceSelf Price in SELF tokens (can be 0)
     * @return registrationContract Address of deployed registration NFT contract
     * @return completionContract Address of deployed completion NFT contract
     */
    function createCompleteEventSystem(
        string memory eventId,
        string memory eventTitle,
        uint256 eventDate,
        address eventOrganizer,
        address fundRecipient,
        uint256 priceSystem,
        uint256 priceSelf
    ) public onlyOwner returns (address registrationContract, address completionContract) {
        require(bytes(eventId).length > 0, "Event ID cannot be empty");
        require(bytes(eventSystems[eventId].eventId).length == 0, "Event already exists");
        require(eventOrganizer != address(0), "Invalid event organizer");
        require(eventDate > block.timestamp, "Event date must be in future");
        require(priceSystem > 0 || priceSelf > 0, "At least one price must be set");
        
        // 1. Deploy registration NFT contract
        registrationContract = registrationFactory.createEventRegistrationSystem(
            eventId,
            eventTitle,
            eventDate,
            eventOrganizer
        );
        
        // 2. Deploy completion NFT contract
        completionContract = completionFactory.createEventCompletionSystem(
            eventId,
            eventTitle,
            eventDate,
            eventOrganizer,
            fundRecipient,
            priceSystem,
            priceSelf
        );
        
        // 3. Create event in escrow system - TEMPORARILY DISABLED FOR DEBUGGING
        // eventEscrow.createEvent(
        //     eventId,
        //     eventTitle,
        //     eventDate,
        //     eventOrganizer,
        //     fundRecipient,
        //     priceSystem,
        //     priceSelf
        // );
        
        // 4. Store the complete event system info
        eventSystems[eventId] = EventSystem({
            eventId: eventId,
            eventTitle: eventTitle,
            eventDate: eventDate,
            eventOrganizer: eventOrganizer,
            registrationContract: registrationContract,
            completionContract: completionContract,
            escrowCreated: false, // Changed to false since escrow is disabled
            createdAt: block.timestamp
        });
        
        allEventIds.push(eventId);
        
        emit CompleteEventSystemCreated(
            eventId,
            eventOrganizer,
            registrationContract,
            completionContract,
            block.timestamp
        );
        
        return (registrationContract, completionContract);
    }
    
    /**
     * @dev Create event system with default pricing (free event)
     * @param eventId Unique identifier for the event
     * @param eventTitle Human-readable event name
     * @param eventDate Unix timestamp of event date
     * @param eventOrganizer Address of the event organizer
     * @param fundRecipient Address to receive any future funds
     */
    function createFreeEventSystem(
        string memory eventId,
        string memory eventTitle,
        uint256 eventDate,
        address eventOrganizer,
        address fundRecipient
    ) external onlyOwner returns (address registrationContract, address completionContract) {
        // Create with minimal pricing (1 wei to satisfy escrow requirements)
        return createCompleteEventSystem(
            eventId,
            eventTitle,
            eventDate,
            eventOrganizer,
            fundRecipient,
            1, // 1 wei in SYSTEM tokens
            0  // 0 SELF tokens
        );
    }
    
    /**
     * @dev Get complete event system information
     * @param eventId The event identifier
     * @return system Complete EventSystem struct
     */
    function getEventSystem(string memory eventId) external view returns (EventSystem memory system) {
        require(bytes(eventSystems[eventId].eventId).length > 0, "Event system not found");
        return eventSystems[eventId];
    }
    
    /**
     * @dev Get all contract addresses for an event
     * @param eventId The event identifier
     * @return registrationContract Address of registration NFT contract
     * @return completionContract Address of completion NFT contract
     * @return escrowContract Address of escrow contract (same for all events)
     */
    function getEventContracts(string memory eventId) 
        external 
        view 
        returns (
            address registrationContract,
            address completionContract,
            address escrowContract
        ) 
    {
        EventSystem memory system = eventSystems[eventId];
        require(bytes(system.eventId).length > 0, "Event system not found");
        
        return (
            system.registrationContract,
            system.completionContract,
            address(eventEscrow)
        );
    }
    
    /**
     * @dev Check if an event system exists
     * @param eventId The event identifier
     * @return exists True if event system exists
     */
    function hasEventSystem(string memory eventId) external view returns (bool exists) {
        return bytes(eventSystems[eventId].eventId).length > 0;
    }
    
    /**
     * @dev Get all created event IDs
     * @return eventIds Array of all event IDs
     */
    function getAllEventIds() external view returns (string[] memory eventIds) {
        return allEventIds;
    }
    
    /**
     * @dev Get total number of created events
     * @return count Total event count
     */
    function getEventCount() external view returns (uint256 count) {
        return allEventIds.length;
    }
    
    /**
     * @dev Get events created by a specific organizer
     * @param organizer Address of the event organizer
     * @return organizerEvents Array of event IDs created by this organizer
     */
    function getEventsByOrganizer(address organizer) external view returns (string[] memory organizerEvents) {
        require(organizer != address(0), "Invalid organizer address");
        
        // Count events by this organizer
        uint256 count = 0;
        for (uint256 i = 0; i < allEventIds.length; i++) {
            if (eventSystems[allEventIds[i]].eventOrganizer == organizer) {
                count++;
            }
        }
        
        // Create result array
        organizerEvents = new string[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < allEventIds.length; i++) {
            if (eventSystems[allEventIds[i]].eventOrganizer == organizer) {
                organizerEvents[index] = allEventIds[i];
                index++;
            }
        }
        
        return organizerEvents;
    }
    
    /**
     * @dev Get factory contract addresses
     * @return regFactory Address of registration factory
     * @return compFactory Address of completion factory  
     * @return escrow Address of escrow contract
     */
    function getFactoryAddresses() external view returns (
        address regFactory,
        address compFactory,
        address escrow
    ) {
        return (
            address(registrationFactory),
            address(completionFactory),
            address(eventEscrow)
        );
    }

    // DEBUG FUNCTIONS - Remove after fixing deployment issue
    
    event DebugLog(string message, address contractAddress);
    event DebugTimestamp(string message, uint256 timestamp);
    
    /**
     * @dev Debug function to test registration factory deployment only
     */
    function debugRegistrationDeployment(
        string memory eventId,
        string memory eventTitle,
        uint256 eventDate,
        address eventOrganizer
    ) external onlyOwner returns (address) {
        emit DebugTimestamp("Current block timestamp", block.timestamp);
        emit DebugTimestamp("Provided event date", eventDate);
        
        address registrationContract = registrationFactory.createEventRegistrationSystem(
            eventId,
            eventTitle,
            eventDate,
            eventOrganizer
        );
        
        emit DebugLog("Registration contract deployed", registrationContract);
        return registrationContract;
    }
    
    /**
     * @dev Debug function to test completion factory deployment only
     */
    function debugCompletionDeployment(
        string memory eventId,
        string memory eventTitle,
        uint256 eventDate,
        address eventOrganizer,
        address fundRecipient
    ) external onlyOwner returns (address) {
        emit DebugTimestamp("Current block timestamp", block.timestamp);
        emit DebugTimestamp("Provided event date", eventDate);
        
        address completionContract = completionFactory.createEventCompletionSystem(
            eventId,
            eventTitle,
            eventDate,
            eventOrganizer,
            fundRecipient,
            1, // minimal price
            0
        );
        
        emit DebugLog("Completion contract deployed", completionContract);
        return completionContract;
    }
    
    /**
     * @dev Debug function to test with relaxed validation
     */
    function debugCreateFreeEventRelaxed(
        string memory eventId,
        string memory eventTitle,
        uint256 eventDate,
        address eventOrganizer,
        address fundRecipient
    ) external onlyOwner returns (address registrationContract, address completionContract) {
        require(bytes(eventId).length > 0, "Event ID cannot be empty");
        require(eventOrganizer != address(0), "Invalid event organizer");
        // REMOVED: event date validation temporarily
        // REMOVED: pricing validation temporarily
        
        emit DebugTimestamp("Starting deployment with timestamp", block.timestamp);
        emit DebugTimestamp("Event date provided", eventDate);
        
        // 1. Deploy registration NFT contract
        registrationContract = registrationFactory.createEventRegistrationSystem(
            eventId,
            eventTitle,
            eventDate,
            eventOrganizer
        );
        emit DebugLog("Registration deployed", registrationContract);
        
        // 2. Deploy completion NFT contract  
        completionContract = completionFactory.createEventCompletionSystem(
            eventId,
            eventTitle,
            eventDate,
            eventOrganizer,
            fundRecipient,
            1, // 1 wei in SYSTEM tokens
            0  // 0 SELF tokens
        );
        emit DebugLog("Completion deployed", completionContract);
        
        // Skip escrow creation for debugging
        // Skip storage for debugging
        
        return (registrationContract, completionContract);
    }
    
    /**
     * @dev Test timestamp validation specifically
     */
    function testTimestampValidation(uint256 eventDate) external view returns (bool isValid, uint256 currentTime, uint256 difference) {
        currentTime = block.timestamp;
        isValid = eventDate > currentTime;
        difference = eventDate > currentTime ? eventDate - currentTime : currentTime - eventDate;
        return (isValid, currentTime, difference);
    }
    
    /**
     * @dev Test string parameter generation (what factory passes to NFT)
     */
    function debugStringGeneration(
        string memory eventTitle
    ) external pure returns (
        string memory tokenName,
        string memory tokenSymbol,
        uint256 tokenNameLength,
        uint256 tokenSymbolLength
    ) {
        tokenName = string(abi.encodePacked(eventTitle, " Registration"));
        tokenSymbol = "EVENTREG";
        tokenNameLength = bytes(tokenName).length;
        tokenSymbolLength = bytes(tokenSymbol).length;
        
        return (tokenName, tokenSymbol, tokenNameLength, tokenSymbolLength);
    }
    
    /**
     * @dev Test all parameter validations that NFT constructor checks
     */
    function debugParameterValidation(
        string memory eventId,
        string memory eventTitle,
        uint256 eventDate,
        address eventOrganizer
    ) external view returns (
        bool eventIdValid,
        bool eventTitleValid,
        bool tokenNameValid,
        bool tokenSymbolValid,
        bool eventDateValid,
        bool organizerValid,
        string memory tokenName,
        string memory tokenSymbol
    ) {
        // Test each validation that NFT constructor performs
        eventIdValid = bytes(eventId).length > 0;
        eventTitleValid = bytes(eventTitle).length > 0;
        eventDateValid = eventDate > block.timestamp;
        organizerValid = eventOrganizer != address(0);
        
        // Generate the strings that factory would pass
        tokenName = string(abi.encodePacked(eventTitle, " Registration"));
        tokenSymbol = "EVENTREG";
        
        tokenNameValid = bytes(tokenName).length > 0;
        tokenSymbolValid = bytes(tokenSymbol).length > 0;
        
        return (
            eventIdValid,
            eventTitleValid,
            tokenNameValid,
            tokenSymbolValid,
            eventDateValid,
            organizerValid,
            tokenName,
            tokenSymbol
        );
    }
    
    /**
     * @dev Try deployment with minimal parameters to isolate OpenZeppelin constructor issues
     */
    function debugMinimalNFTDeploy() external onlyOwner returns (address) {
        // Test with absolute minimal parameters
        return registrationFactory.createEventRegistrationSystem(
            "test",           // minimal eventId
            "Test",           // minimal eventTitle  
            block.timestamp + 3600, // 1 hour from now
            msg.sender        // use caller as organizer
        );
    }
}
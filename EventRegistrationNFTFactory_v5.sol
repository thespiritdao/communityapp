// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EventRegistrationNFT} from "./EventRegistrationNFT.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EventRegistrationNFTFactory
 * @dev Factory contract to deploy EventRegistrationNFT contracts - OpenZeppelin v5 Compatible
 * Enhanced with proper error handling and validation
 */
contract EventRegistrationNFTFactory is Ownable {
    
    // Track deployed contracts
    mapping(string => address) public eventContracts;
    address[] public allEventContracts;
    
    // Custom errors for better debugging
    error EmptyEventId();
    error EmptyEventTitle();
    error InvalidEventDate();
    error InvalidEventOrganizer();
    error EventContractAlreadyExists();
    error ContractDeploymentFailed();
    error InvalidTokenName();
    error InvalidTokenSymbol();
    
    // Events
    event EventRegistrationContractDeployed(
        string indexed eventId,
        address indexed contractAddress,
        address indexed deployer,
        string eventTitle,
        uint256 eventDate
    );
    
    event ContractDeploymentAttempted(
        string indexed eventId,
        address indexed deployer,
        bool success
    );
    
    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert InvalidEventOrganizer();
    }
    
    /**
     * @dev Deploy a new EventRegistrationNFT contract for an event
     * @param eventId Unique identifier for the event
     * @param eventTitle Human-readable event name
     * @param eventDate Unix timestamp of event date
     * @param tokenName Name for the ERC721 collection
     * @param tokenSymbol Symbol for the ERC721 collection
     * @param eventOwner Address that will own the deployed contract
     * @return contractAddress Address of the newly deployed contract
     */
    function deployEventRegistrationContract(
        string memory eventId,
        string memory eventTitle,
        uint256 eventDate,
        string memory tokenName,
        string memory tokenSymbol,
        address eventOwner
    ) public onlyOwner returns (address contractAddress) {
        // Enhanced parameter validation
        if (bytes(eventId).length == 0) revert EmptyEventId();
        if (bytes(eventTitle).length == 0) revert EmptyEventTitle();
        if (bytes(tokenName).length == 0) revert InvalidTokenName();
        if (bytes(tokenSymbol).length == 0) revert InvalidTokenSymbol();
        if (eventContracts[eventId] != address(0)) revert EventContractAlreadyExists();
        if (eventDate <= block.timestamp) revert InvalidEventDate();
        if (eventOwner == address(0)) revert InvalidEventOrganizer();
        
        emit ContractDeploymentAttempted(eventId, msg.sender, false);
        
        try new EventRegistrationNFT(
            eventId,
            eventTitle,
            eventDate,
            tokenName,
            tokenSymbol,
            eventOwner
        ) returns (EventRegistrationNFT newContract) {
            contractAddress = address(newContract);
            
            // Verify deployment succeeded
            if (contractAddress == address(0)) revert ContractDeploymentFailed();
            
            // Store the contract reference
            eventContracts[eventId] = contractAddress;
            allEventContracts.push(contractAddress);
            
            emit EventRegistrationContractDeployed(
                eventId,
                contractAddress,
                msg.sender,
                eventTitle,
                eventDate
            );
            
            emit ContractDeploymentAttempted(eventId, msg.sender, true);
            
            return contractAddress;
            
        } catch Error(string memory reason) {
            emit ContractDeploymentAttempted(eventId, msg.sender, false);
            revert(string(abi.encodePacked("Deployment failed: ", reason)));
        } catch (bytes memory lowLevelData) {
            emit ContractDeploymentAttempted(eventId, msg.sender, false);
            if (lowLevelData.length == 0) {
                revert ContractDeploymentFailed();
            } else {
                assembly {
                    revert(add(32, lowLevelData), mload(lowLevelData))
                }
            }
        }
    }
    
    /**
     * @dev Deploy registration contract and transfer ownership to event organizer
     * This is the main function the EventSystemFactory calls
     */
    function createEventRegistrationSystem(
        string memory eventId,
        string memory eventTitle,
        uint256 eventDate,
        address eventOrganizer
    ) external onlyOwner returns (address contractAddress) {
        if (eventOrganizer == address(0)) revert InvalidEventOrganizer();
        
        // Generate standard token name and symbol with validation
        string memory tokenName = string(abi.encodePacked(eventTitle, " Registration"));
        string memory tokenSymbol = "EVENTREG";
        
        // Additional validation after concatenation
        if (bytes(tokenName).length == 0) revert InvalidTokenName();
        
        return deployEventRegistrationContract(
            eventId,
            eventTitle,
            eventDate,
            tokenName,
            tokenSymbol,
            eventOrganizer
        );
    }
    
    /**
     * @dev Mint a registration token for a specific event
     * @param eventId The event identifier
     * @param recipient Address to mint the token to
     * @param tokenURI Metadata URI for the token
     * @return tokenId The minted token ID
     */
    function mintRegistrationTokenForEvent(
        string memory eventId,
        address recipient,
        string memory tokenURI
    ) external onlyOwner returns (uint256 tokenId) {
        address contractAddress = eventContracts[eventId];
        if (contractAddress == address(0)) revert EventContractAlreadyExists();
        if (recipient == address(0)) revert InvalidEventOrganizer();
        
        EventRegistrationNFT eventContract = EventRegistrationNFT(contractAddress);
        
        // Get token ID before minting
        uint256 totalBefore = eventContract.totalRegistrations();
        
        eventContract.mintRegistrationToken(recipient, tokenURI);
        
        // Calculate token ID (assuming sequential minting)
        tokenId = eventContract.getUserTokenId(recipient);
        
        return tokenId;
    }
    
    /**
     * @dev Burn a registration token for a specific event
     * @param eventId The event identifier
     * @param tokenId Token ID to burn
     */
    function burnRegistrationTokenForEvent(
        string memory eventId,
        uint256 tokenId
    ) external onlyOwner {
        address contractAddress = eventContracts[eventId];
        if (contractAddress == address(0)) revert EventContractAlreadyExists();
        
        EventRegistrationNFT eventContract = EventRegistrationNFT(contractAddress);
        eventContract.burnRegistrationToken(tokenId);
    }
    
    /**
     * @dev Check if a user is registered for an event
     */
    function isUserRegisteredForEvent(
        string memory eventId,
        address user
    ) external view returns (bool) {
        address contractAddress = eventContracts[eventId];
        if (contractAddress == address(0)) return false;
        
        EventRegistrationNFT eventContract = EventRegistrationNFT(contractAddress);
        return eventContract.isUserRegistered(user);
    }
    
    /**
     * @dev Get total registrations for an event
     */
    function getTotalRegistrationsForEvent(
        string memory eventId
    ) external view returns (uint256) {
        address contractAddress = eventContracts[eventId];
        if (contractAddress == address(0)) return 0;
        
        EventRegistrationNFT eventContract = EventRegistrationNFT(contractAddress);
        return eventContract.totalRegistrations();
    }
    
    /**
     * @dev Get the contract address for a specific event
     */
    function getEventContract(string memory eventId) external view returns (address contractAddress) {
        return eventContracts[eventId];
    }
    
    /**
     * @dev Check if an event has a deployed contract
     */
    function hasEventContract(string memory eventId) external view returns (bool exists) {
        return eventContracts[eventId] != address(0);
    }
    
    /**
     * @dev Get all deployed contract addresses
     */
    function getAllEventContracts() external view returns (address[] memory contracts) {
        return allEventContracts;
    }
    
    /**
     * @dev Get the number of deployed contracts
     */
    function getEventContractCount() external view returns (uint256 count) {
        return allEventContracts.length;
    }
}
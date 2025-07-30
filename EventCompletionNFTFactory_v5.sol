// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EventCompletionNFT} from "./EventCompletionNFT.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EventCompletionNFTFactory
 * @dev Factory contract to deploy EventCompletionNFT contracts - OpenZeppelin v5 Compatible
 * Enhanced with proper error handling and validation
 */
contract EventCompletionNFTFactory is Ownable {
    
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
    error InvalidBaseURI();
    error EmptyRecipientsArray();
    error MismatchedArrayLengths();
    
    // Events
    event EventCompletionContractDeployed(
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
     * @dev Deploy a new EventCompletionNFT contract for an event
     */
    function deployEventCompletionContract(
        string memory eventId,
        string memory eventTitle,
        uint256 eventDate,
        string memory tokenName,
        string memory tokenSymbol,
        string memory baseTokenURI,
        address eventOwner
    ) public onlyOwner returns (address contractAddress) {
        // Enhanced parameter validation
        if (bytes(eventId).length == 0) revert EmptyEventId();
        if (bytes(eventTitle).length == 0) revert EmptyEventTitle();
        if (bytes(tokenName).length == 0) revert InvalidTokenName();
        if (bytes(tokenSymbol).length == 0) revert InvalidTokenSymbol();
        if (bytes(baseTokenURI).length == 0) revert InvalidBaseURI();
        if (eventContracts[eventId] != address(0)) revert EventContractAlreadyExists();
        if (eventDate <= block.timestamp) revert InvalidEventDate();
        if (eventOwner == address(0)) revert InvalidEventOrganizer();
        
        emit ContractDeploymentAttempted(eventId, msg.sender, false);
        
        try new EventCompletionNFT(
            eventId,
            eventTitle,
            eventDate,
            tokenName,
            tokenSymbol,
            baseTokenURI,
            eventOwner
        ) returns (EventCompletionNFT newContract) {
            contractAddress = address(newContract);
            
            // Verify deployment succeeded
            if (contractAddress == address(0)) revert ContractDeploymentFailed();
            
            // Store the contract reference
            eventContracts[eventId] = contractAddress;
            allEventContracts.push(contractAddress);
            
            emit EventCompletionContractDeployed(
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
     * @dev Deploy completion contract and transfer ownership to event organizer
     * This is the main function the EventSystemFactory calls
     */
    function createEventCompletionSystem(
        string memory eventId,
        string memory eventTitle,
        uint256 eventDate,
        address eventOrganizer,
        address fundRecipient,
        uint256 priceSystem,
        uint256 priceSelf
    ) external onlyOwner returns (address contractAddress) {
        if (eventOrganizer == address(0)) revert InvalidEventOrganizer();
        
        // Generate standard token name, symbol, and base URI
        string memory tokenName = string(abi.encodePacked(eventTitle, " Certificate"));
        string memory tokenSymbol = "EVENTCERT";
        string memory baseTokenURI = "https://api.spiritdao.org/events/completion/";
        
        // Additional validation after concatenation
        if (bytes(tokenName).length == 0) revert InvalidTokenName();
        
        return deployEventCompletionContract(
            eventId,
            eventTitle,
            eventDate,
            tokenName,
            tokenSymbol,
            baseTokenURI,
            eventOrganizer
        );
    }
    
    /**
     * @dev Mint a completion token for a specific event
     */
    function mintCompletionTokenForEvent(
        string memory eventId,
        address recipient
    ) external onlyOwner returns (uint256 tokenId) {
        address contractAddress = eventContracts[eventId];
        if (contractAddress == address(0)) revert EventContractAlreadyExists();
        if (recipient == address(0)) revert InvalidEventOrganizer();
        
        EventCompletionNFT eventContract = EventCompletionNFT(contractAddress);
        
        // Generate default tokenURI and metadata
        string memory tokenURI = string(abi.encodePacked(
            "https://api.spiritdao.org/events/completion/",
            eventId,
            "/",
            addressToString(recipient)
        ));
        string memory metadata = "Event completion certificate";
        
        eventContract.mintCompletionToken(recipient, tokenURI, metadata);
        
        tokenId = eventContract.getUserCompletionTokenId(recipient);
        return tokenId;
    }
    
    /**
     * @dev Batch mint completion tokens for multiple users
     */
    function batchMintCompletionTokensForEvent(
        string memory eventId,
        address[] memory recipients
    ) external onlyOwner {
        if (recipients.length == 0) revert EmptyRecipientsArray();
        
        address contractAddress = eventContracts[eventId];
        if (contractAddress == address(0)) revert EventContractAlreadyExists();
        
        EventCompletionNFT eventContract = EventCompletionNFT(contractAddress);
        
        // Generate arrays for batch minting
        string[] memory tokenURIs = new string[](recipients.length);
        string[] memory metadataArray = new string[](recipients.length);
        
        for (uint256 i = 0; i < recipients.length; i++) {
            tokenURIs[i] = string(abi.encodePacked(
                "https://api.spiritdao.org/events/completion/",
                eventId,
                "/",
                addressToString(recipients[i])
            ));
            metadataArray[i] = "Event completion certificate";
        }
        
        eventContract.batchMintCompletionTokens(recipients, tokenURIs, metadataArray);
    }
    
    /**
     * @dev Update token metadata for a specific event
     */
    function updateTokenMetadataForEvent(
        string memory eventId,
        uint256 tokenId,
        string memory metadata
    ) external onlyOwner {
        address contractAddress = eventContracts[eventId];
        if (contractAddress == address(0)) revert EventContractAlreadyExists();
        
        EventCompletionNFT eventContract = EventCompletionNFT(contractAddress);
        eventContract.updateTokenMetadata(tokenId, metadata);
    }
    
    /**
     * @dev Check if a user has completed an event
     */
    function hasUserCompletedEvent(
        string memory eventId,
        address user
    ) external view returns (bool) {
        address contractAddress = eventContracts[eventId];
        if (contractAddress == address(0)) return false;
        
        EventCompletionNFT eventContract = EventCompletionNFT(contractAddress);
        return eventContract.hasUserCompleted(user);
    }
    
    /**
     * @dev Get total completions for an event
     */
    function getTotalCompletionsForEvent(
        string memory eventId
    ) external view returns (uint256) {
        address contractAddress = eventContracts[eventId];
        if (contractAddress == address(0)) return 0;
        
        EventCompletionNFT eventContract = EventCompletionNFT(contractAddress);
        return eventContract.totalCompletions();
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
    
    /**
     * @dev Helper function to convert address to string
     */
    function addressToString(address _addr) internal pure returns (string memory) {
        bytes32 value = bytes32(uint256(uint160(_addr)));
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = '0';
        str[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            str[2+i*2] = alphabet[uint8(value[i + 12] >> 4)];
            str[3+i*2] = alphabet[uint8(value[i + 12] & 0x0f)];
        }
        return string(str);
    }
}
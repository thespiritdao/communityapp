// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EventRegistrationNFT
 * @dev ERC721 contract for event registration tokens - Fixed OpenZeppelin v5 Compatibility
 */
contract EventRegistrationNFT is ERC721, ERC721URIStorage, Ownable {
    
    uint256 private _tokenIdCounter;
    
    // Event details
    string public eventId;
    string public eventTitle;
    uint256 public eventDate;
    
    // Mapping from user address to token ID (one token per user per event)
    mapping(address => uint256) public userTokens;
    mapping(uint256 => address) public tokenHolders;
    
    // Event registration tracking
    mapping(address => bool) public registeredUsers;
    uint256 public totalRegistrations;
    
    // Custom errors for better debugging
    error InvalidEventId();
    error InvalidEventTitle();
    error InvalidTokenName();
    error InvalidTokenSymbol();
    error InvalidEventDate();
    error InvalidInitialOwner();
    error UserAlreadyRegistered();
    error UserNotRegistered();
    error InvalidRecipient();
    
    event UserRegistered(address indexed user, uint256 tokenId, uint256 timestamp);
    event UserUnregistered(address indexed user, uint256 tokenId, uint256 timestamp);
    
    constructor(
        string memory _eventId,
        string memory _eventTitle,
        uint256 _eventDate,
        string memory _tokenName,
        string memory _tokenSymbol,
        address initialOwner
    ) ERC721(_tokenName, _tokenSymbol) Ownable(initialOwner) {
        // Enhanced validation with proper error handling
        
        // Check for empty strings - more robust validation
        require(bytes(_eventId).length > 0, "Empty event ID");
        require(bytes(_eventTitle).length > 0, "Empty event title");
        require(bytes(_tokenName).length > 0, "Empty token name");
        require(bytes(_tokenSymbol).length > 0, "Empty token symbol");
        
        // Date validation with buffer for blockchain timing
        require(_eventDate > block.timestamp - 300, "Event date too old"); // 5 minute buffer
        
        // Address validation
        require(initialOwner != address(0), "Zero address owner");
        
        eventId = _eventId;
        eventTitle = _eventTitle;
        eventDate = _eventDate;
    }
    
    /**
     * @dev Mint a registration token to a user
     */
    function mintRegistrationToken(address to, string memory _tokenURI) public onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(!registeredUsers[to], "User already registered");
        
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        
        userTokens[to] = tokenId;
        tokenHolders[tokenId] = to;
        registeredUsers[to] = true;
        totalRegistrations++;
        
        emit UserRegistered(to, tokenId, block.timestamp);
    }
    
    /**
     * @dev Burn a registration token (for cancellation)
     */
    function burnRegistrationToken(uint256 tokenId) public onlyOwner {
        address holder = tokenHolders[tokenId];
        require(holder != address(0), "Invalid token");
        require(registeredUsers[holder], "User not registered");
        
        _burn(tokenId);
        
        delete userTokens[holder];
        delete tokenHolders[tokenId];
        registeredUsers[holder] = false;
        totalRegistrations--;
        
        emit UserUnregistered(holder, tokenId, block.timestamp);
    }
    
    /**
     * @dev Check if a user is registered for this event
     */
    function isUserRegistered(address user) public view returns (bool) {
        return registeredUsers[user];
    }
    
    /**
     * @dev Get token ID for a registered user
     */
    function getUserTokenId(address user) public view returns (uint256) {
        return userTokens[user];
    }
    
    // Required overrides for ERC721URIStorage
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
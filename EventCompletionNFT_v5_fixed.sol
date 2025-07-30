// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EventCompletionNFT
 * @dev ERC721 contract for event completion tokens - Fixed OpenZeppelin v5 Compatibility
 */
contract EventCompletionNFT is ERC721, ERC721URIStorage, Ownable {
    
    uint256 private _tokenIdCounter;
    
    // Event details
    string public eventId;
    string public eventTitle;
    uint256 public eventDate;
    address public fundRecipient;
    uint256 public priceSystem;
    uint256 public priceSelf;
    
    // Completion tracking
    mapping(address => uint256) public completionTokens;
    mapping(uint256 => address) public tokenHolders;
    mapping(address => bool) public completedUsers;
    uint256 public totalCompletions;
    
    event UserCompleted(address indexed user, uint256 tokenId, uint256 timestamp);
    
    constructor(
        string memory _eventId,
        string memory _eventTitle,
        uint256 _eventDate,
        string memory _tokenName,
        string memory _tokenSymbol,
        address initialOwner,
        address _fundRecipient,
        uint256 _priceSystem,
        uint256 _priceSelf
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
        require(_fundRecipient != address(0), "Zero address fund recipient");
        
        eventId = _eventId;
        eventTitle = _eventTitle;
        eventDate = _eventDate;
        fundRecipient = _fundRecipient;
        priceSystem = _priceSystem;
        priceSelf = _priceSelf;
    }
    
    /**
     * @dev Mint a completion token to a user
     */
    function mintCompletionToken(address to, string memory _tokenURI) public onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(!completedUsers[to], "User already completed");
        
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        
        completionTokens[to] = tokenId;
        tokenHolders[tokenId] = to;
        completedUsers[to] = true;
        totalCompletions++;
        
        emit UserCompleted(to, tokenId, block.timestamp);
    }
    
    /**
     * @dev Check if a user has completed this event
     */
    function isUserCompleted(address user) public view returns (bool) {
        return completedUsers[user];
    }
    
    /**
     * @dev Get completion token ID for a user
     */
    function getUserCompletionTokenId(address user) public view returns (uint256) {
        return completionTokens[user];
    }
    
    // Required overrides for ERC721URIStorage
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
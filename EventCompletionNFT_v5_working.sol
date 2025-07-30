// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EventCompletionNFT
 * @dev ERC721 contract for event completion certificates - Fixed OpenZeppelin v5 Compatible
 */
contract EventCompletionNFT is ERC721, ERC721URIStorage, Ownable {
    
    uint256 private _tokenIdCounter;
    
    // Event details
    string public eventId;
    string public eventTitle;
    uint256 public eventDate;
    uint256 public completionDate;
    address public fundRecipient;
    uint256 public priceSystem;
    uint256 public priceSelf;
    
    // Completion tracking
    mapping(address => uint256) public userCompletionTokens;
    mapping(uint256 => address) public tokenOriginalHolders;
    mapping(address => bool) public completedUsers;
    uint256 public totalCompletions;
    
    // Additional metadata
    string public baseTokenURI;
    mapping(uint256 => string) public tokenMetadata;
    
    event UserCompleted(address indexed user, uint256 tokenId, uint256 timestamp);
    event TokenMetadataUpdated(uint256 indexed tokenId, string metadata);
    
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
        // Fixed validation with require statements
        require(bytes(_eventId).length > 0, "Empty event ID");
        require(bytes(_eventTitle).length > 0, "Empty event title");
        require(bytes(_tokenName).length > 0, "Empty token name");
        require(bytes(_tokenSymbol).length > 0, "Empty token symbol");
        require(_eventDate > block.timestamp - 300, "Event date too old"); // 5 minute buffer
        require(initialOwner != address(0), "Zero address owner");
        require(_fundRecipient != address(0), "Zero address fund recipient");
        
        eventId = _eventId;
        eventTitle = _eventTitle;
        eventDate = _eventDate;
        fundRecipient = _fundRecipient;
        priceSystem = _priceSystem;
        priceSelf = _priceSelf;
        completionDate = block.timestamp;
        baseTokenURI = "";
    }
    
    /**
     * @dev Mint a completion certificate to a user
     * @param to Address to mint the token to
     * @param _tokenURI Metadata URI for the token
     */
    function mintCompletionToken(
        address to, 
        string memory _tokenURI
    ) public onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(!completedUsers[to], "User already completed");
        
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        
        userCompletionTokens[to] = tokenId;
        tokenOriginalHolders[tokenId] = to;
        completedUsers[to] = true;
        totalCompletions++;
        
        emit UserCompleted(to, tokenId, block.timestamp);
    }
    
    /**
     * @dev Mint completion certificate with metadata
     * @param to Address to mint the token to
     * @param _tokenURI Metadata URI for the token
     * @param metadata Additional metadata for the completion
     */
    function mintCompletionTokenWithMetadata(
        address to, 
        string memory _tokenURI,
        string memory metadata
    ) public onlyOwner {
        require(bytes(metadata).length > 0, "Empty metadata");
        
        mintCompletionToken(to, _tokenURI);
        
        uint256 tokenId = userCompletionTokens[to];
        tokenMetadata[tokenId] = metadata;
        emit TokenMetadataUpdated(tokenId, metadata);
    }
    
    /**
     * @dev Batch mint completion tokens for multiple users
     * @param recipients Array of addresses to mint tokens to
     * @param _tokenURIs Array of metadata URIs for the tokens
     */
    function batchMintCompletionTokens(
        address[] memory recipients,
        string[] memory _tokenURIs
    ) public onlyOwner {
        require(recipients.length == _tokenURIs.length, "Mismatched array lengths");
        require(recipients.length > 0, "Empty recipients array");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            if (!completedUsers[recipients[i]] && recipients[i] != address(0)) {
                mintCompletionToken(recipients[i], _tokenURIs[i]);
            }
        }
    }
    
    /**
     * @dev Update token metadata (for post-event customization)
     * @param tokenId Token ID to update
     * @param newTokenURI New metadata URI
     * @param newMetadata New additional metadata
     */
    function updateTokenMetadata(
        uint256 tokenId, 
        string memory newTokenURI,
        string memory newMetadata
    ) public onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(bytes(newMetadata).length > 0, "Empty metadata");
        
        _setTokenURI(tokenId, newTokenURI);
        tokenMetadata[tokenId] = newMetadata;
        emit TokenMetadataUpdated(tokenId, newMetadata);
    }
    
    /**
     * @dev Check if a user has completed this event
     */
    function hasUserCompleted(address user) public view returns (bool) {
        return completedUsers[user];
    }
    
    /**
     * @dev Get completion token ID for a user
     */
    function getUserCompletionTokenId(address user) public view returns (uint256) {
        return userCompletionTokens[user];
    }
    
    /**
     * @dev Get original holder of a token
     */
    function getTokenOriginalHolder(uint256 tokenId) public view returns (address) {
        return tokenOriginalHolders[tokenId];
    }
    
    /**
     * @dev Set base URI for tokens
     */
    function setBaseURI(string memory newBaseURI) public onlyOwner {
        baseTokenURI = newBaseURI;
    }
    
    /**
     * @dev Get token metadata
     */
    function getTokenMetadata(uint256 tokenId) public view returns (string memory) {
        return tokenMetadata[tokenId];
    }
    
    /**
     * @dev Override _baseURI to return our base URI
     */
    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }
    
    // Required overrides for ERC721URIStorage
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
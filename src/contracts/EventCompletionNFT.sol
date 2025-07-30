// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EventCompletionNFT
 * @dev ERC721 contract for event completion certificates - OpenZeppelin v5 Compatible
 * Tokens are minted when users successfully complete/attend events
 * These are transferable collectibles (unlike registration tokens)
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
        // Fixed validation with require statements for better v5 compatibility
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
     * @param metadata Additional metadata for the completion
     */
    function mintCompletionToken(
        address to, 
        string memory _tokenURI,
        string memory metadata
    ) public onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(!completedUsers[to], "User already completed");
        require(bytes(metadata).length > 0, "Empty metadata");
        
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        
        userCompletionTokens[to] = tokenId;
        tokenOriginalHolders[tokenId] = to;
        completedUsers[to] = true;
        tokenMetadata[tokenId] = metadata;
        totalCompletions++;
        
        emit UserCompleted(to, tokenId, block.timestamp);
        emit TokenMetadataUpdated(tokenId, metadata);
    }
    
    /**
     * @dev Batch mint completion tokens for multiple users
     * @param recipients Array of addresses to mint tokens to
     * @param _tokenURIs Array of metadata URIs for the tokens
     * @param metadataArray Array of additional metadata
     */
    function batchMintCompletionTokens(
        address[] memory recipients,
        string[] memory _tokenURIs,
        string[] memory metadataArray
    ) public onlyOwner {
        require(recipients.length == _tokenURIs.length, "Mismatched array lengths");
        require(recipients.length == metadataArray.length, "Mismatched metadata length");
        require(recipients.length > 0, "Empty recipients array");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            if (!completedUsers[recipients[i]] && recipients[i] != address(0)) {
                mintCompletionToken(recipients[i], _tokenURIs[i], metadataArray[i]);
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
     * @param user Address to check
     */
    function hasUserCompleted(address user) public view returns (bool) {
        return completedUsers[user];
    }
    
    /**
     * @dev Get completion token ID for a user
     * @param user Address to check
     */
    function getUserCompletionTokenId(address user) public view returns (uint256) {
        return userCompletionTokens[user];
    }
    
    /**
     * @dev Get original holder of a token (useful for tracking transfers)
     * @param tokenId Token ID to check
     */
    function getTokenOriginalHolder(uint256 tokenId) public view returns (address) {
        return tokenOriginalHolders[tokenId];
    }
    
    /**
     * @dev Get all completion holders (original holders only)
     */
    function getCompletionHolders() public view returns (address[] memory) {
        address[] memory holders = new address[](totalCompletions);
        uint256 counter = 0;
        
        for (uint256 i = 0; i < _tokenIdCounter; i++) {
            if (_ownerOf(i) != address(0)) {
                holders[counter] = tokenOriginalHolders[i];
                counter++;
            }
        }
        
        return holders;
    }
    
    /**
     * @dev Set base URI for tokens
     * @param newBaseURI New base URI
     */
    function setBaseURI(string memory newBaseURI) public onlyOwner {
        baseTokenURI = newBaseURI;
    }
    
    /**
     * @dev Get token metadata
     * @param tokenId Token ID to get metadata for
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
    
    // Override required functions - removed _burn override due to v5 compatibility
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
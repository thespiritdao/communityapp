// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title EventCompletionNFT
 * @dev ERC721 contract for event completion certificates - OpenZeppelin v5 Compatible
 * Tokens are minted when users successfully complete/attend events
 * These are transferable collectibles (unlike registration tokens)
 */
contract EventCompletionNFT is ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    
    Counters.Counter private _tokenIdCounter;
    
    // Event details
    string public eventId;
    string public eventTitle;
    uint256 public eventDate;
    uint256 public completionDate;
    
    // Completion tracking
    mapping(address => uint256) public userCompletionTokens;
    mapping(uint256 => address) public tokenOriginalHolders;
    mapping(address => bool) public completedUsers;
    uint256 public totalCompletions;
    
    // Additional metadata
    string public baseTokenURI;
    mapping(uint256 => string) public tokenMetadata;
    
    // Custom errors for better debugging
    error InvalidEventId();
    error InvalidEventTitle();
    error InvalidTokenName();
    error InvalidTokenSymbol();
    error InvalidBaseTokenURI();
    error InvalidEventDate();
    error InvalidInitialOwner();
    error UserAlreadyCompleted();
    error UserNotCompleted();
    error InvalidRecipient();
    error EmptyMetadata();
    
    event UserCompleted(address indexed user, uint256 tokenId, uint256 timestamp);
    event TokenMetadataUpdated(uint256 indexed tokenId, string metadata);
    
    constructor(
        string memory _eventId,
        string memory _eventTitle,
        uint256 _eventDate,
        string memory _tokenName,
        string memory _tokenSymbol,
        string memory _baseTokenURI,
        address initialOwner
    ) ERC721(_tokenName, _tokenSymbol) Ownable(initialOwner) {
        // OpenZeppelin v5 compatible validation
        if (bytes(_eventId).length == 0) revert InvalidEventId();
        if (bytes(_eventTitle).length == 0) revert InvalidEventTitle();
        if (bytes(_tokenName).length == 0) revert InvalidTokenName();
        if (bytes(_tokenSymbol).length == 0) revert InvalidTokenSymbol();
        if (bytes(_baseTokenURI).length == 0) revert InvalidBaseTokenURI();
        if (_eventDate <= block.timestamp) revert InvalidEventDate();
        if (initialOwner == address(0)) revert InvalidInitialOwner();
        
        eventId = _eventId;
        eventTitle = _eventTitle;
        eventDate = _eventDate;
        baseTokenURI = _baseTokenURI;
        completionDate = block.timestamp;
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
        if (to == address(0)) revert InvalidRecipient();
        if (completedUsers[to]) revert UserAlreadyCompleted();
        if (bytes(metadata).length == 0) revert EmptyMetadata();
        
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        
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
     * @dev Batch mint completion certificates to multiple users
     * @param recipients Array of addresses to mint tokens to
     * @param tokenURIs Array of metadata URIs
     * @param metadataArray Array of additional metadata
     */
    function batchMintCompletionTokens(
        address[] memory recipients,
        string[] memory tokenURIs,
        string[] memory metadataArray
    ) public onlyOwner {
        require(recipients.length == tokenURIs.length, "Mismatched array lengths");
        require(recipients.length == metadataArray.length, "Mismatched metadata length");
        require(recipients.length > 0, "Empty recipients array");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] != address(0) && !completedUsers[recipients[i]]) {
                mintCompletionToken(recipients[i], tokenURIs[i], metadataArray[i]);
            }
        }
    }
    
    /**
     * @dev Update metadata for a token
     * @param tokenId Token ID to update
     * @param metadata New metadata
     */
    function updateTokenMetadata(uint256 tokenId, string memory metadata) public onlyOwner {
        if (!_exists(tokenId)) revert InvalidRecipient();
        if (bytes(metadata).length == 0) revert EmptyMetadata();
        
        tokenMetadata[tokenId] = metadata;
        emit TokenMetadataUpdated(tokenId, metadata);
    }
    
    /**
     * @dev Check if a user has completed this event
     * @param user Address to check
     * @return bool Completion status
     */
    function hasUserCompleted(address user) public view returns (bool) {
        return completedUsers[user];
    }
    
    /**
     * @dev Get completion token ID for a user
     * @param user Address to check
     * @return uint256 Token ID (0 if not completed)
     */
    function getUserCompletionTokenId(address user) public view returns (uint256) {
        return userCompletionTokens[user];
    }
    
    /**
     * @dev Get original holder of a token
     * @param tokenId Token ID to check
     * @return address Original holder
     */
    function getTokenOriginalHolder(uint256 tokenId) public view returns (address) {
        return tokenOriginalHolders[tokenId];
    }
    
    // Required overrides for ERC721URIStorage
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
    
    // Internal function check
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}
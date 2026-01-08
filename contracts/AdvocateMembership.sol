// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title AdvocateMembership
 * @dev ERC-721 NFT with voting capabilities for SpiritDAO governance
 *
 * Features:
 * - Soulbound (non-transferable) membership NFTs
 * - Voting power delegation for governance
 * - Auto-delegation option for seamless onboarding
 * - Multiple member types (Standard, Premium, etc.)
 * - Enumerable for tracking all tokens
 */
contract AdvocateMembership is ERC721, ERC721Enumerable, ERC721Votes, Ownable {
    using Strings for uint256;

    // ============================================================
    // State Variables
    // ============================================================

    /// @notice Maximum number of NFTs that can be minted
    uint256 public constant MAX_SUPPLY = 10000;

    /// @notice Base URI for token metadata
    string private _baseTokenURI;

    /// @notice Whether auto-delegation is enabled for new mints
    bool public autoDelegationEnabled;

    /// @notice Counter for token IDs
    uint256 private _tokenIdCounter;

    /// @notice Member type enum
    enum MemberType {
        STANDARD,
        PREMIUM,
        FOUNDING,
        HONORARY
    }

    /// @notice Struct to store member information
    struct MemberInfo {
        MemberType memberType;
        uint256 joinTimestamp;
    }

    /// @notice Mapping from token ID to member info
    mapping(uint256 => MemberInfo) public memberInfo;

    // ============================================================
    // Events
    // ============================================================

    event AutoDelegationEnabled(bool enabled);
    event AutoDelegationPerformed(address indexed delegatee, uint256 tokenId);
    event TokenBurned(uint256 indexed tokenId, address indexed previousOwner);

    /// @dev ERC-4906: Metadata Update events
    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    // ============================================================
    // Constructor
    // ============================================================

    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseTokenURI_
    )
        ERC721(name_, symbol_)
        EIP712(name_, "1") // ✅ Required for ERC721Votes (EIP712 base)
        Ownable(msg.sender)
    {
        _baseTokenURI = baseTokenURI_;
        autoDelegationEnabled = false;
        _tokenIdCounter = 1; // Start token IDs at 1
    }

    // ============================================================
    // Minting Functions
    // ============================================================

    /**
     * @notice Mint a new Advocate NFT
     * @param to Address to mint to
     * @param memberType Type of membership
     * @param uri Token-specific URI (currently unused; tokenURI uses base + tokenId)
     */
    function mint(
        address to,
        MemberType memberType,
        string calldata uri
    ) external onlyOwner {
        uri; // silence unused var warning (kept for future per-token URI design)

        require(_tokenIdCounter <= MAX_SUPPLY, "Max supply reached");

        uint256 tokenId = _tokenIdCounter++;
        _safeMint(to, tokenId);

        memberInfo[tokenId] = MemberInfo({
            memberType: memberType,
            joinTimestamp: block.timestamp
        });

        // Auto-delegate if enabled
        if (autoDelegationEnabled) {
            _delegate(to, to);
            emit AutoDelegationPerformed(to, tokenId);
        }
    }

    /**
     * @notice Batch mint multiple NFTs
     * @param recipients Array of addresses to mint to
     * @param memberTypes Array of member types (must match recipients length)
     */
    function batchMint(
        address[] calldata recipients,
        MemberType[] calldata memberTypes
    ) external onlyOwner {
        require(recipients.length == memberTypes.length, "Array length mismatch");
        require(_tokenIdCounter + recipients.length - 1 <= MAX_SUPPLY, "Exceeds max supply");

        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 tokenId = _tokenIdCounter++;

            _safeMint(recipients[i], tokenId);

            memberInfo[tokenId] = MemberInfo({
                memberType: memberTypes[i],
                joinTimestamp: block.timestamp
            });

            if (autoDelegationEnabled) {
                _delegate(recipients[i], recipients[i]);
                emit AutoDelegationPerformed(recipients[i], tokenId);
            }
        }
    }

    // ============================================================
    // Burning Functions
    // ============================================================

    /**
     * @notice Burn an NFT (only owner of token can burn)
     * @param tokenId Token ID to burn
     */
    function burn(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        address previousOwner = ownerOf(tokenId);

        _burn(tokenId);
        delete memberInfo[tokenId];

        emit TokenBurned(tokenId, previousOwner);
    }

    // ============================================================
    // Delegation Functions
    // ============================================================

    /**
     * @notice Delegate voting power to another address
     * @param delegatee Address to delegate to
     */
    function delegateVotingPower(address delegatee) external {
        _delegate(msg.sender, delegatee);
    }

    /**
     * @notice Get current delegate for an account
     * @param account Address to check
     * @return Current delegate address
     */
    function getCurrentDelegate(address account) external view returns (address) {
        return delegates(account);
    }

    /**
     * @notice Get voting power for an account
     * @param account Address to check
     * @return Current voting power
     */
    function getVotingPower(address account) external view returns (uint256) {
        return getVotes(account);
    }

    /**
     * @notice Get past voting power at a specific block
     * @param account Address to check
     * @param blockNumber Block number to check
     * @return Voting power at that block
     */
    function getPastVotingPower(
        address account,
        uint256 blockNumber
    ) external view returns (uint256) {
        return getPastVotes(account, blockNumber);
    }

    // ============================================================
    // Admin Functions
    // ============================================================

    /**
     * @notice Enable or disable auto-delegation for new mints
     * @param enabled Whether to enable auto-delegation
     */
    function setAutoDelegationEnabled(bool enabled) external onlyOwner {
        autoDelegationEnabled = enabled;
        emit AutoDelegationEnabled(enabled);
    }

    /**
     * @notice Set base URI for token metadata
     * @param newBaseURI New base URI
     */
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;

        if (_tokenIdCounter > 1) {
            emit BatchMetadataUpdate(1, _tokenIdCounter - 1);
        }
    }

    // ============================================================
    // Metadata Functions
    // ============================================================

    /**
     * @notice Get base URI
     * @return Base URI string
     */
    function baseTokenURI() external view returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @dev Override to return base URI + token ID
     */
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @dev Override tokenURI to return base URI + token ID
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireOwned(tokenId);

        string memory baseURI = _baseURI();
        return bytes(baseURI).length > 0
            ? string(abi.encodePacked(baseURI, tokenId.toString()))
            : "";
    }

    // ============================================================
    // Soulbound (Non-Transferable) Implementation
    // ============================================================

    /**
     * @dev Disable approvals (soulbound)
     */
    function approve(address, uint256) public pure override(ERC721, IERC721) {
        revert("Soulbound: Token is non-transferable");
    }

    /**
     * @dev Disable approvals (soulbound)
     */
    function setApprovalForAll(address, bool) public pure override(ERC721, IERC721) {
        revert("Soulbound: Token is non-transferable");
    }

    /**
     * @dev No approvals exist (soulbound)
     */
    function getApproved(uint256) public pure override(ERC721, IERC721) returns (address) {
        return address(0);
    }

    /**
     * @dev No operator approvals (soulbound)
     */
    function isApprovedForAll(address, address) public pure override(ERC721, IERC721) returns (bool) {
        return false;
    }

    // ============================================================
    // Required Overrides
    // ============================================================

    /**
     * @dev OZ v5 uses _update for mint/transfer/burn.
     * Enforce soulbound by reverting if it's a transfer (from != 0 && to != 0).
     * Mint: from == 0, Burn: to == 0 are allowed.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable, ERC721Votes) returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert("Soulbound: Token is non-transferable");
        }
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable, ERC721Votes) {
        super._increaseBalance(account, value);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

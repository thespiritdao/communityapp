// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Votes.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title ProofOfCuriosityV2
 * @notice Soulbound ERC721Votes token — issued to registered SpiritDAO members.
 *         Carries voting power for DAO Governor; holders are auto-self-delegated on mint.
 *         Replaces the original ProofOfCuriosity.sol which lacked IVotes support.
 */
contract ProofOfCuriosityV2 is ERC721Votes, Ownable {
    using Strings for uint256;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error Soulbound();
    error AlreadyHoldsToken();
    error Unauthorized();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Minted(address indexed recipient, uint256 indexed tokenId, address indexed minter);
    event Revoked(address indexed holder, uint256 indexed tokenId);

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(address => bool) public authorizedMinters;
    string private _baseTokenURI;
    uint256 private _nextTokenId = 1;

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyMinter() {
        if (!authorizedMinters[msg.sender]) revert Unauthorized();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner, string memory baseURI)
        ERC721("Proof of Curiosity", "POC")
        EIP712("Proof of Curiosity", "1")
        Ownable(initialOwner)
    {
        _baseTokenURI = baseURI;
    }

    // -------------------------------------------------------------------------
    // Minting
    // -------------------------------------------------------------------------

    /**
     * @notice Mint one token to `recipient`. Reverts if recipient already holds one.
     * @dev Auto-delegates voting power to the recipient on mint.
     */
    function mint(address recipient) external onlyMinter returns (uint256) {
        if (balanceOf(recipient) > 0) revert AlreadyHoldsToken();

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        _safeMint(recipient, tokenId);
        _delegate(recipient, recipient);

        emit Minted(recipient, tokenId, msg.sender);
        return tokenId;
    }

    /**
     * @notice Mint tokens to multiple recipients in a single call.
     * @dev Skips zero addresses and addresses that already hold a token.
     *      Auto-delegates voting power to each recipient on mint.
     * @return successCount The number of tokens actually minted.
     */
    function batchMint(address[] calldata recipients) external onlyMinter returns (uint256 successCount) {
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];

            if (recipient == address(0)) continue;
            if (balanceOf(recipient) > 0) continue;

            uint256 tokenId = _nextTokenId;
            _nextTokenId++;

            _safeMint(recipient, tokenId);
            _delegate(recipient, recipient);

            emit Minted(recipient, tokenId, msg.sender);
            successCount++;
        }
    }

    // -------------------------------------------------------------------------
    // Revocation
    // -------------------------------------------------------------------------

    /**
     * @notice Burn (revoke) the token held by `holder`. Only callable by owner.
     */
    function revoke(address holder) external onlyOwner {
        uint256 tokenId = tokenOfHolder(holder);
        emit Revoked(holder, tokenId);
        _burn(tokenId);
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    function setMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
    }

    function setBaseURI(string calldata baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /**
     * @notice Returns true if `account` currently holds a token.
     */
    function hasToken(address account) external view returns (bool) {
        return balanceOf(account) > 0;
    }

    /**
     * @notice Returns the tokenId held by `holder`. Reverts if they hold none.
     * @dev Iterates from token 1 up to _nextTokenId — acceptable because one-per-address.
     */
    function tokenOfHolder(address holder) public view returns (uint256) {
        for (uint256 i = 1; i < _nextTokenId; i++) {
            if (_ownerOf(i) == holder) return i;
        }
        revert("ProofOfCuriosityV2: holder has no token");
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string(abi.encodePacked(_baseTokenURI, tokenId.toString()));
    }

    // -------------------------------------------------------------------------
    // Soulbound — block all transfers
    // -------------------------------------------------------------------------

    /**
     * @dev Override ERC721's internal _update hook.
     *      Mints (from == address(0)) and burns (to == address(0)) are allowed.
     *      Any transfer between two non-zero addresses is blocked.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Votes)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function transferFrom(address, address, uint256) public pure override {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert Soulbound();
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // -------------------------------------------------------------------------
    // Interface support
    // -------------------------------------------------------------------------

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Votes)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

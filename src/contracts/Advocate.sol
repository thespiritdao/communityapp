// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Advocate
 * @author SpiritDAO
 * @notice Soulbound ERC-721 membership token — the governance credential for SpiritDAO.
 *
 * @dev Airdropped automatically when a member's first donation is confirmed by the
 *      Executive Pod. Holding this token enables:
 *        - All Proof of Curiosity permissions (inherited at the app layer)
 *        - DAO-wide governance voting on constitutional proposals
 *        - Participation in EP-level decision making
 *
 *      Non-transferable: transferFrom / safeTransferFrom / approve are blocked.
 *      Authorized minters are managed by the owner (no hardcoded addresses).
 *      Contract address is stored in the DB (access_tokens table) — never hardcoded in app code.
 *
 *      Structurally identical to ProofOfCuriosity but kept as a separate contract
 *      so each token type has its own on-chain identity, supply, and metadata.
 */

contract Advocate {
    // ============================================================
    // ERC-721 STORAGE
    // ============================================================

    string public constant name   = "Advocate";
    string public constant symbol = "ADV";

    /// @dev tokenId => owner
    mapping(uint256 => address) private _owners;

    /// @dev owner => token count (max 1 per address)
    mapping(address => uint256) private _balances;

    /// @dev owner => tokenId (one per address)
    mapping(address => uint256) private _tokenOfOwner;

    /// @dev running token ID counter
    uint256 private _nextTokenId = 1;

    /// @dev base URI for token metadata
    string private _baseTokenURI;

    // ============================================================
    // ACCESS CONTROL
    // ============================================================

    address public owner;
    mapping(address => bool) public authorizedMinters;

    // ============================================================
    // EVENTS
    // ============================================================

    /// @dev ERC-721 required events
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    /// @dev SpiritDAO events
    event Minted(address indexed recipient, uint256 indexed tokenId, address indexed minter);
    event Revoked(address indexed holder, uint256 indexed tokenId, address indexed revoker);
    event MinterUpdated(address indexed minter, bool authorized);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event BaseURIUpdated(string newBaseURI);

    // ============================================================
    // ERRORS
    // ============================================================

    error Unauthorized();
    error Soulbound();
    error AlreadyHoldsToken();
    error TokenDoesNotExist();
    error InvalidAddress();
    error ZeroAddressRecipient();

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /**
     * @param _initialOwner  Contract owner (can manage minters and revoke tokens)
     * @param _baseURI       IPFS or HTTPS base URI for token metadata
     */
    constructor(address _initialOwner, string memory _baseURI) {
        if (_initialOwner == address(0)) revert InvalidAddress();
        owner = _initialOwner;
        _baseTokenURI = _baseURI;

        // Owner is an authorized minter by default
        authorizedMinters[_initialOwner] = true;
        emit MinterUpdated(_initialOwner, true);
    }

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyMinter() {
        if (!authorizedMinters[msg.sender]) revert Unauthorized();
        _;
    }

    // ============================================================
    // MINTING
    // ============================================================

    /**
     * @notice Mint one Advocate token to a recipient.
     * @dev    Each address may only hold one token. Reverts if already held.
     * @param  recipient  Address to receive the token.
     */
    function mint(address recipient) external onlyMinter returns (uint256 tokenId) {
        if (recipient == address(0)) revert ZeroAddressRecipient();
        if (_balances[recipient] > 0) revert AlreadyHoldsToken();

        tokenId = _nextTokenId++;
        _owners[tokenId] = recipient;
        _balances[recipient] = 1;
        _tokenOfOwner[recipient] = tokenId;

        emit Transfer(address(0), recipient, tokenId);
        emit Minted(recipient, tokenId, msg.sender);
    }

    /**
     * @notice Batch mint tokens to multiple recipients (gas-efficient airdrop).
     * @dev    Skips any address that already holds a token or is zero address.
     * @param  recipients  Array of addresses to receive tokens.
     * @return successCount  Number of tokens successfully minted.
     */
    function batchMint(address[] calldata recipients)
        external
        onlyMinter
        returns (uint256 successCount)
    {
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            if (recipient == address(0)) continue;
            if (_balances[recipient] > 0) continue;

            uint256 tokenId = _nextTokenId++;
            _owners[tokenId] = recipient;
            _balances[recipient] = 1;
            _tokenOfOwner[recipient] = tokenId;

            emit Transfer(address(0), recipient, tokenId);
            emit Minted(recipient, tokenId, msg.sender);
            successCount++;
        }
    }

    // ============================================================
    // REVOCATION (owner only — e.g. fraud, serious misconduct)
    // ============================================================

    /**
     * @notice Revoke (burn) a token from a holder.
     * @dev    Reserved for exceptional cases only. Emits Transfer to zero address.
     * @param  holder  Address whose token to revoke.
     */
    function revoke(address holder) external onlyOwner {
        if (holder == address(0)) revert InvalidAddress();
        uint256 tokenId = _tokenOfOwner[holder];
        if (_owners[tokenId] != holder) revert TokenDoesNotExist();

        delete _owners[tokenId];
        delete _balances[holder];
        delete _tokenOfOwner[holder];

        emit Transfer(holder, address(0), tokenId);
        emit Revoked(holder, tokenId, msg.sender);
    }

    // ============================================================
    // SOULBOUND — block all transfers
    // ============================================================

    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert Soulbound();
    }

    function approve(address, uint256) external pure {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }

    function getApproved(uint256) external pure returns (address) {
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    // ============================================================
    // ERC-721 VIEW FUNCTIONS
    // ============================================================

    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert InvalidAddress();
        return _balances[account];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert TokenDoesNotExist();
        return tokenOwner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        return string(abi.encodePacked(_baseTokenURI, _toString(tokenId)));
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @notice Returns true if the contract implements the given interface.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x5b5e139f || // ERC-721Metadata
            interfaceId == 0x01ffc9a7;   // ERC-165
    }

    // ============================================================
    // SPIRITDAO VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Returns true if the address holds an Advocate token.
     */
    function hasToken(address account) external view returns (bool) {
        return _balances[account] > 0;
    }

    /**
     * @notice Returns the tokenId held by an address, or 0 if none.
     */
    function tokenOf(address account) external view returns (uint256) {
        return _tokenOfOwner[account];
    }

    // ============================================================
    // ADMIN
    // ============================================================

    function setMinter(address minter, bool authorized) external onlyOwner {
        if (minter == address(0)) revert InvalidAddress();
        authorizedMinters[minter] = authorized;
        emit MinterUpdated(minter, authorized);
    }

    function batchSetMinters(address[] calldata minters, bool authorized) external onlyOwner {
        for (uint256 i = 0; i < minters.length; i++) {
            if (minters[i] == address(0)) continue;
            authorizedMinters[minters[i]] = authorized;
            emit MinterUpdated(minters[i], authorized);
        }
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address old = owner;
        owner = newOwner;
        emit OwnershipTransferred(old, newOwner);
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

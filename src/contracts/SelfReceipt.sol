// File: src/contracts/SelfReceipt.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SelfReceipt
/// @notice Soulbound redemption receipts — proof that a wallet burned $SELF for
/// a good, ticket, or perk. Fulfillment plumbing, NOT money and NOT prestige.
///
/// Per docs/spec-self-soulbound-redesign.md (D-18):
///  - Separate contract from SelfEpochs (spendable) and SelfPrestige (legacy),
///    because receipts have a distinct lifecycle: they never expire, are never
///    spendable, and key off-chain fulfillment (shipping, door scan).
///  - SOULBOUND: only mint (from 0) and burn (to 0). A receipt cannot be sold
///    or transferred — it stays bound to the redeemer (solves misdirected-merch:
///    you cannot acquire someone else's claim).
///  - Each receipt id is unique (a monotonic counter), amount always 1 — it is
///    a non-fungible proof, not a balance.
///  - MINTER_ROLE → SelfPayment (mints a receipt when $SELF is burned).
///  - FULFILLER_ROLE → the fulfillment backend: marks a receipt fulfilled and
///    may burn it on completion (e.g. ticket scanned, item shipped). Receipts
///    are soulbound "until fulfilled" only in the sense that fulfillment is the
///    role-gated terminal action; holders can never move them at any point.
contract SelfReceipt is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant FULFILLER_ROLE = keccak256("FULFILLER_ROLE");

    /// @notice Monotonic receipt id counter (id 0 is never used).
    uint256 public nextReceiptId = 1;

    struct Receipt {
        address redeemer;
        string productId;     // off-chain product/ticket/perk identifier
        uint256 hoursPaid;    // total $SELF burned (1e18 = 1 hour), for the record
        uint224 communityId;  // dominant provenance of the burned $SELF (for audit)
        uint64 redeemedAt;    // block timestamp at redemption
        bool fulfilled;       // set true by FULFILLER_ROLE on completion
    }

    /// @notice receiptId → details.
    mapping(uint256 => Receipt) public receipts;

    event ReceiptMinted(
        uint256 indexed receiptId,
        address indexed redeemer,
        string productId,
        uint256 hoursPaid,
        uint224 communityId
    );
    event ReceiptFulfilled(uint256 indexed receiptId, address indexed by);
    event ReceiptBurned(uint256 indexed receiptId);

    /// @param admin   DEFAULT_ADMIN_ROLE holder (Exec multisig/timelock).
    /// @param uri_    ERC-1155 metadata URI template.
    constructor(address admin, string memory uri_) ERC1155(uri_) {
        require(admin != address(0), "SelfReceipt: admin zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─── Soulbinding ──────────────────────────────────────────────────────────

    /// @dev Allow only mint (from==0) and burn (to==0); revert all transfers.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        require(from == address(0) || to == address(0), "RECEIPT: soulbound");
        super._update(from, to, ids, values);
    }

    // ─── Minting (MINTER_ROLE → SelfPayment) ──────────────────────────────────

    /// @notice Mint a redemption receipt to `redeemer`. Returns the new id.
    function mintReceipt(
        address redeemer,
        string calldata productId,
        uint256 hoursPaid,
        uint224 communityId,
        uint64 redeemedAt
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        require(redeemer != address(0), "SelfReceipt: redeemer zero");
        uint256 id = nextReceiptId++;
        receipts[id] = Receipt({
            redeemer: redeemer,
            productId: productId,
            hoursPaid: hoursPaid,
            communityId: communityId,
            redeemedAt: redeemedAt,
            fulfilled: false
        });
        _mint(redeemer, id, 1, "");
        emit ReceiptMinted(id, redeemer, productId, hoursPaid, communityId);
        return id;
    }

    // ─── Fulfillment (FULFILLER_ROLE → backend) ───────────────────────────────

    /// @notice Mark a receipt fulfilled (item shipped / ticket honored).
    function markFulfilled(uint256 receiptId) external onlyRole(FULFILLER_ROLE) {
        require(receipts[receiptId].redeemer != address(0), "SelfReceipt: no receipt");
        require(!receipts[receiptId].fulfilled, "SelfReceipt: already fulfilled");
        receipts[receiptId].fulfilled = true;
        emit ReceiptFulfilled(receiptId, msg.sender);
    }

    /// @notice Burn a receipt on completion (e.g. single-use ticket consumed).
    function burnReceipt(uint256 receiptId) external onlyRole(FULFILLER_ROLE) {
        Receipt storage r = receipts[receiptId];
        require(r.redeemer != address(0), "SelfReceipt: no receipt");
        _burn(r.redeemer, receiptId, 1);
        emit ReceiptBurned(receiptId);
    }

    function setURI(string calldata newuri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newuri);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

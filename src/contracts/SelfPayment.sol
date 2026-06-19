// File: src/contracts/SelfPayment.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ISelfEpochsBurn {
    function batchBurn(
        address holder,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external;
    function isLive(uint256 id) external view returns (bool);
    function communityOf(uint256 id) external pure returns (uint224);
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function lockedOf(address holder, uint256 id) external view returns (uint256);
}

interface ISelfReceiptMint {
    function mintReceipt(
        address redeemer,
        string calldata productId,
        uint256 hoursPaid,
        uint224 communityId,
        uint64 redeemedAt
    ) external returns (uint256);
}

/// @title SelfPayment
/// @notice The ONE shared burn-to-pay primitive for $SELF (D-12). Marketplace,
/// event ticketing, and access-gated bounties all route their $SELF leg here.
///
/// Per docs/spec-self-soulbound-redesign.md §4:
///  - Soulbound $SELF has no transfer, so "pay with $SELF" = BURN epoch ids +
///    mint a soulbound SelfReceipt. No proceeds go anywhere (burn only).
///  - FIFO id selection (oldest-live epoch first) is computed OFF-CHAIN and
///    passed in as `ids`/`amounts`: ERC-1155 has no holder→ids enumeration, so
///    on-chain enumeration is impossible/expensive. The contract VALIDATES the
///    supplied ids (live, accepted provenance, weighted sum >= price) rather
///    than discovering them — trust-minimized without being gas-prohibitive.
///  - Provenance/recognition weighting (D-6, D-10): each id's community is
///    weighted by `recognitionWeightBps[listingCommunity][idCommunity]`. The
///    listing's own community defaults to 1.0x; foreign communities default to
///    0 (must be explicitly recognized). Weighting is applied to how much each
///    burned hour COUNTS toward the price, never a transfer/conversion.
///  - Per-listing policy is expressed by the caller choosing which provenance
///    weights apply (hardcore-exclusive = only own community recognized;
///    open-sink = all at 1.0x; provenance-discount = foreign at <1.0x).
///
/// 1e18 = 1 hour. WEIGHT_DENOMINATOR basis points (10000 = 1.0x).
contract SelfPayment is AccessControl, ReentrancyGuard {
    bytes32 public constant RECOGNITION_ADMIN_ROLE = keccak256("RECOGNITION_ADMIN_ROLE");

    uint256 public constant WEIGHT_DENOMINATOR = 10_000; // bps; 10000 = 1.0x

    ISelfEpochsBurn public immutable selfEpochs;
    ISelfReceiptMint public immutable selfReceipt;

    /// @notice recognition weight (bps) a listing-community grants to a
    /// source-community's $SELF. recognitionWeightBps[listing][source].
    /// Default 0 (foreign $SELF counts for nothing until explicitly recognized).
    mapping(uint224 => mapping(uint224 => uint256)) public recognitionWeightBps;

    event RecognitionWeightSet(
        uint224 indexed listingCommunity,
        uint224 indexed sourceCommunity,
        uint256 weightBps
    );
    event PaidWithSelf(
        address indexed payer,
        uint224 indexed listingCommunity,
        string productId,
        uint256 weightedHoursPaid,
        uint256 rawHoursBurned,
        uint256 receiptId
    );

    constructor(address _selfEpochs, address _selfReceipt, address admin) {
        require(_selfEpochs != address(0), "SelfPayment: epochs zero");
        require(_selfReceipt != address(0), "SelfPayment: receipt zero");
        require(admin != address(0), "SelfPayment: admin zero");
        selfEpochs = ISelfEpochsBurn(_selfEpochs);
        selfReceipt = ISelfReceiptMint(_selfReceipt);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RECOGNITION_ADMIN_ROLE, admin);
    }

    // ─── Recognition weights (federation layer) ───────────────────────────────

    /// @notice Set how much a listing-community recognizes a source-community's
    /// $SELF (bps; 10000 = full, 5000 = half, 0 = not accepted).
    function setRecognitionWeight(
        uint224 listingCommunity,
        uint224 sourceCommunity,
        uint256 weightBps
    ) external onlyRole(RECOGNITION_ADMIN_ROLE) {
        require(weightBps <= WEIGHT_DENOMINATOR, "SelfPayment: weight > 1.0x");
        recognitionWeightBps[listingCommunity][sourceCommunity] = weightBps;
        emit RecognitionWeightSet(listingCommunity, sourceCommunity, weightBps);
    }

    /// @notice Effective weight for a source community against a listing: a
    /// listing always recognizes its OWN community at 1.0x; others per the map.
    function effectiveWeightBps(uint224 listingCommunity, uint224 sourceCommunity)
        public
        view
        returns (uint256)
    {
        if (listingCommunity == sourceCommunity) return WEIGHT_DENOMINATOR;
        return recognitionWeightBps[listingCommunity][sourceCommunity];
    }

    // ─── Burn-to-pay ──────────────────────────────────────────────────────────

    /// @notice Pay for `productId` by burning the caller's $SELF.
    /// @param listingCommunity  The community the listing belongs to (sets which
    ///        provenance weights apply). Pass the seller's community id.
    /// @param productId         Off-chain product/ticket/perk identifier.
    /// @param requiredHours     Price in weighted hours (1e18 = 1 hour).
    /// @param ids               $SELF epoch ids to burn, OLDEST-LIVE FIRST (FIFO),
    ///        computed off-chain. Must all be live and owned by the caller.
    /// @param amounts           Raw amount to burn from each id (1e18 = 1 hour).
    /// @return receiptId        The minted soulbound receipt id.
    ///
    /// Validation: every id must be live; its unlocked balance must cover the
    /// burn; the WEIGHTED sum of burned hours must be >= requiredHours. Locked
    /// holdings (staking seam) are excluded — they cannot be spent.
    /// @dev Tally result for the supplied ids — kept in a struct so payWithSelf's
    /// stack stays shallow (avoids "stack too deep" without requiring viaIR).
    struct Tally {
        uint256 weightedHours;
        uint256 rawHours;
        uint224 dominantCommunity;
    }

    function payWithSelf(
        uint224 listingCommunity,
        string calldata productId,
        uint256 requiredHours,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external nonReentrant returns (uint256 receiptId) {
        require(ids.length == amounts.length, "SelfPayment: length mismatch");
        require(ids.length > 0, "SelfPayment: no ids");
        require(requiredHours > 0, "SelfPayment: zero price");

        Tally memory t = _tally(listingCommunity, ids, amounts);
        require(t.weightedHours >= requiredHours, "SelfPayment: underpaid");

        // Burn the supplied ids (SelfPayment holds BURNER_ROLE on SelfEpochs).
        selfEpochs.batchBurn(msg.sender, ids, amounts);

        // Mint the soulbound receipt to the payer.
        receiptId = selfReceipt.mintReceipt(
            msg.sender,
            productId,
            t.rawHours,
            t.dominantCommunity,
            uint64(block.timestamp)
        );

        emit PaidWithSelf(
            msg.sender,
            listingCommunity,
            productId,
            t.weightedHours,
            t.rawHours,
            receiptId
        );
    }

    /// @dev Validate each supplied id (live, unlocked balance sufficient,
    /// provenance accepted) and accumulate weighted/raw hours + dominant
    /// provenance. Reverts on any invalid id.
    function _tally(
        uint224 listingCommunity,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) internal view returns (Tally memory t) {
        uint256 dominantWeighted = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            require(amounts[i] > 0, "SelfPayment: zero amount");
            require(selfEpochs.isLive(ids[i]), "SelfPayment: id expired");

            // Spendable = balance minus locked (staking-locked is unburnable).
            require(
                amounts[i]
                    <= selfEpochs.balanceOf(msg.sender, ids[i])
                        - selfEpochs.lockedOf(msg.sender, ids[i]),
                "SelfPayment: insufficient unlocked"
            );

            uint224 srcCommunity = selfEpochs.communityOf(ids[i]);
            uint256 w = effectiveWeightBps(listingCommunity, srcCommunity);
            require(w > 0, "SelfPayment: provenance not accepted");

            uint256 weighted = (amounts[i] * w) / WEIGHT_DENOMINATOR;
            t.weightedHours += weighted;
            t.rawHours += amounts[i];

            if (weighted > dominantWeighted) {
                dominantWeighted = weighted;
                t.dominantCommunity = srcCommunity;
            }
        }
    }
}

// File: src/contracts/SelfPaymentV2.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev SelfEpochsV2 interface — note decayFactorBps replaces v1's isLive.
interface ISelfEpochsV2 {
    function batchBurn(
        address holder,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external;
    function decayFactorBps(uint256 id) external view returns (uint256);
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

/// @title SelfPaymentV2
/// @notice The ONE shared burn-to-pay primitive for $SELF, updated for the
/// slow-decay token (SelfEpochsV2). See docs/spec-self-decay-redesign.md +
/// docs/self-decay-calibration.md.
///
/// WHAT CHANGED FROM V1: v1 charged against (rawAmount × recognitionWeight) and
/// rejected expired ids via isLive. v2 charges against
/// (rawAmount × recognitionWeight × DECAY FACTOR) — so aging holdings are worth
/// less at spend time, exactly as the decay model intends. The raw tokens are
/// still burned (decay fades value, not the underlying units); the *value*
/// credited toward the price is decayed.
///
/// Unchanged: soulbound burn-to-pay → mint receipt; FIFO ids computed off-chain
/// & validated here (no on-chain enumeration); provenance recognition weighting
/// (own community 1.0x, foreign per the admin-set map).
///
/// 1e18 = 1 hour. WEIGHT_DENOMINATOR / BPS basis points (10000 = 1.0x / 100%).
contract SelfPaymentV2 is AccessControl, ReentrancyGuard {
    bytes32 public constant RECOGNITION_ADMIN_ROLE = keccak256("RECOGNITION_ADMIN_ROLE");

    uint256 public constant WEIGHT_DENOMINATOR = 10_000; // recognition bps
    uint256 public constant BPS = 10_000;                // decay bps

    ISelfEpochsV2 public immutable selfEpochs;
    ISelfReceiptMint public immutable selfReceipt;

    /// recognition weight (bps) a listing-community grants a source-community's
    /// $SELF. Default 0 (foreign $SELF counts for nothing until recognized).
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
        uint256 weightedHoursPaid, // decayed + recognition-weighted value applied to price
        uint256 rawHoursBurned,    // raw $SELF units burned
        uint256 receiptId
    );

    constructor(address _selfEpochs, address _selfReceipt, address admin) {
        require(_selfEpochs != address(0), "SelfPaymentV2: epochs zero");
        require(_selfReceipt != address(0), "SelfPaymentV2: receipt zero");
        require(admin != address(0), "SelfPaymentV2: admin zero");
        selfEpochs = ISelfEpochsV2(_selfEpochs);
        selfReceipt = ISelfReceiptMint(_selfReceipt);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RECOGNITION_ADMIN_ROLE, admin);
    }

    // ─── Recognition weights (federation layer) ───────────────────────────────

    function setRecognitionWeight(
        uint224 listingCommunity,
        uint224 sourceCommunity,
        uint256 weightBps
    ) external onlyRole(RECOGNITION_ADMIN_ROLE) {
        require(weightBps <= WEIGHT_DENOMINATOR, "SelfPaymentV2: weight > 1.0x");
        recognitionWeightBps[listingCommunity][sourceCommunity] = weightBps;
        emit RecognitionWeightSet(listingCommunity, sourceCommunity, weightBps);
    }

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
    /// @param listingCommunity  Community the listing belongs to (sets weights).
    /// @param productId         Off-chain product/ticket/perk identifier.
    /// @param requiredHours     Price in DECAYED+weighted hours (1e18 = 1 hour).
    /// @param ids               $SELF epoch ids to burn, OLDEST-FIRST (FIFO, most
    ///        decayed first), computed off-chain. Owned + unlocked by caller.
    /// @param amounts           RAW amount to burn from each id (1e18 = 1 hour).
    /// @return receiptId        The minted soulbound receipt id.
    ///
    /// The credited value = Σ amounts[i] × recognitionWeight × decayFactor. It
    /// must be >= requiredHours. Raw `amounts` are burned regardless of decay.
    function payWithSelf(
        uint224 listingCommunity,
        string calldata productId,
        uint256 requiredHours,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external nonReentrant returns (uint256 receiptId) {
        require(ids.length == amounts.length, "SelfPaymentV2: length mismatch");
        require(ids.length > 0, "SelfPaymentV2: no ids");
        require(requiredHours > 0, "SelfPaymentV2: zero price");

        Tally memory t = _tally(listingCommunity, ids, amounts);
        require(t.weightedHours >= requiredHours, "SelfPaymentV2: underpaid");

        selfEpochs.batchBurn(msg.sender, ids, amounts);

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

    /// @dev Struct keeps payWithSelf's stack shallow (no "stack too deep").
    struct Tally {
        uint256 weightedHours; // decayed + recognition-weighted value
        uint256 rawHours;      // raw units burned
        uint224 dominantCommunity;
    }

    /// @dev Validate each id and accumulate the DECAYED, recognition-weighted
    /// value plus raw units + dominant provenance. Reverts on any invalid id.
    function _tally(
        uint224 listingCommunity,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) internal view returns (Tally memory t) {
        uint256 dominantWeighted = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            require(amounts[i] > 0, "SelfPaymentV2: zero amount");

            // Decay: a fully-decayed id contributes no value (factor 0).
            uint256 decay = selfEpochs.decayFactorBps(ids[i]);
            require(decay > 0, "SelfPaymentV2: id fully decayed");

            // Spendable (raw) = balance minus locked (staking-locked unburnable).
            require(
                amounts[i]
                    <= selfEpochs.balanceOf(msg.sender, ids[i])
                        - selfEpochs.lockedOf(msg.sender, ids[i]),
                "SelfPaymentV2: insufficient unlocked"
            );

            uint224 srcCommunity = selfEpochs.communityOf(ids[i]);
            uint256 w = effectiveWeightBps(listingCommunity, srcCommunity);
            require(w > 0, "SelfPaymentV2: provenance not accepted");

            // value = raw × recognitionWeight × decayFactor
            uint256 weighted = (amounts[i] * w * decay) / (WEIGHT_DENOMINATOR * BPS);
            t.weightedHours += weighted;
            t.rawHours += amounts[i];

            if (weighted > dominantWeighted) {
                dominantWeighted = weighted;
                t.dominantCommunity = srcCommunity;
            }
        }
    }
}

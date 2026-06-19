// File: src/contracts/SelfPrestige.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SelfPrestige  ("Tenure")
/// @notice Permanent, soulbound ecosystem-wide TENURE standing. A wallet's
/// cumulative lifetime $SELF contribution (across ALL communities) maps to one
/// of five bands. Tenure is a gating/identity signal — never spendable, never
/// expires, only levels up.
///
/// Per docs/spec-self-soulbound-redesign.md (D-19b, D-21, supersedes D-18/D-19):
///  - ECOSYSTEM-WIDE: one band per member, summed across all participation
///    (NOT per-community — that dimension was dropped 2026-06-16).
///  - OPTION B: counts ALL $SELF ever earned, not only expired-unspent.
///    Spending does not reduce Tenure. The backend records hours at EARN time.
///  - FIVE bands (lifetime hours): Curious 0–10, Resident 10–50, Mainstay
///    50–250, Pillar 250–600, Elder 600+.
///  - TIER 1 ("Curious") is a MEMBERSHIP FLOOR: any member is at least Curious
///    (tier 1) with 0 hours. The contract therefore floors the computed tier to
///    1 for any address the JANITOR has touched / that holds a badge. Display of
///    "Curious" for brand-new members who have no on-chain record yet is handled
///    by the frontend (Proof-of-Curiosity holders show as Curious by default).
///  - Tier band NAMES are NOT stored on-chain (frontend-only); the contract
///    stores only the tier NUMBER (0..5) and lifetime hours.
///  - JANITOR_ROLE (the off-chain earn-recording job, paymaster-sponsored) calls
///    addLifetimeHours; it is the only writer.
///
/// Token id is fixed (ECOSYSTEM_ID = 0) — a single ecosystem-wide badge whose
/// balance encodes the current tier number (1..5).
contract SelfPrestige is ERC1155, AccessControl {
    bytes32 public constant JANITOR_ROLE = keccak256("JANITOR_ROLE");
    bytes32 public constant TIER_ADMIN_ROLE = keccak256("TIER_ADMIN_ROLE");

    uint8 public constant MAX_TIER = 5; // 0=none,1=Curious,2=Resident,3=Mainstay,4=Pillar,5=Elder
    uint256 public constant ECOSYSTEM_ID = 0; // single ecosystem-wide badge id

    /// @notice Cumulative lifetime contributed hours per wallet (ecosystem-wide).
    /// 1e18 = 1 hour. Monotonically increasing (Option B: all earned hours).
    mapping(address => uint256) public lifetimeHours;

    // Cumulative hours thresholds for tiers 2..5. Index k = hours to reach tier
    // (k+2). Tier 1 (Curious) is the membership floor (no hours required).
    // e.g. [10h, 50h, 250h, 600h] -> Resident@10, Mainstay@50, Pillar@250, Elder@600.
    uint256[4] public tierThresholds;

    event LifetimeHoursAdded(address indexed wallet, uint256 added, uint256 newTotal);
    event TierChanged(address indexed wallet, uint8 oldTier, uint8 newTier);
    event TierThresholdsSet(uint256[4] thresholds);

    /// @param admin       DEFAULT_ADMIN_ROLE + TIER_ADMIN_ROLE holder.
    /// @param uri_        ERC-1155 metadata URI template (cosmetic; setURI later).
    /// @param thresholds  Tiers 2..5 cumulative-hours thresholds (1e18 = 1h).
    constructor(
        address admin,
        string memory uri_,
        uint256[4] memory thresholds
    ) ERC1155(uri_) {
        require(admin != address(0), "SelfPrestige: admin zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TIER_ADMIN_ROLE, admin);
        tierThresholds = thresholds;
        emit TierThresholdsSet(thresholds);
    }

    // ─── Soulbinding ──────────────────────────────────────────────────────────

    /// @dev Only mint (from==0) and burn (to==0); badges never transfer.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        require(from == address(0) || to == address(0), "PRESTIGE: soulbound");
        super._update(from, to, ids, values);
    }

    // ─── Recording contribution (JANITOR_ROLE → earn-time recorder) ───────────

    /// @notice Add `hoursToAdd` of earned $SELF to a wallet's lifetime total
    /// (Option B: called at EARN time, all earned hours count), recomputing the
    /// ecosystem tier and minting the badge-tier delta up if it changed.
    function addLifetimeHours(address wallet, uint256 hoursToAdd)
        external
        onlyRole(JANITOR_ROLE)
    {
        require(wallet != address(0), "SelfPrestige: wallet zero");
        require(hoursToAdd > 0, "SelfPrestige: zero hours");
        _addLifetimeHours(wallet, hoursToAdd);
    }

    /// @notice Batch variant for recording a batch of earnings.
    function batchAddLifetimeHours(
        address[] calldata wallets,
        uint256[] calldata hoursToAdd
    ) external onlyRole(JANITOR_ROLE) {
        uint256 n = wallets.length;
        require(hoursToAdd.length == n, "SelfPrestige: length mismatch");
        for (uint256 i = 0; i < n; i++) {
            if (wallets[i] == address(0) || hoursToAdd[i] == 0) continue;
            _addLifetimeHours(wallets[i], hoursToAdd[i]);
        }
    }

    function _addLifetimeHours(address wallet, uint256 hoursToAdd) internal {
        uint8 oldTier = tierOf(wallet);
        uint256 newTotal = lifetimeHours[wallet] + hoursToAdd;
        lifetimeHours[wallet] = newTotal;
        emit LifetimeHoursAdded(wallet, hoursToAdd, newTotal);

        uint8 newTier = _tierForHours(newTotal);
        if (newTier > oldTier) {
            // Badge balance encodes the tier number; mint the delta up (tiers
            // only increase given monotonic hours).
            _mint(wallet, ECOSYSTEM_ID, newTier - oldTier, "");
            emit TierChanged(wallet, oldTier, newTier);
        }
    }

    // ─── Tier math ────────────────────────────────────────────────────────────

    /// @notice Current on-chain tier (0..5) for a wallet. Note tier 1 "Curious"
    /// is a membership floor enforced by the frontend for PoC holders; on-chain
    /// a wallet reads tier 1 once it has any recorded hours (or a minted badge).
    function tierOf(address wallet) public view returns (uint8) {
        return _tierForHours(lifetimeHours[wallet]);
    }

    /// @dev Hours → tier. Tier 1 (Curious) at >=0 recorded participation; tiers
    /// 2..5 at the configured thresholds. A wallet with literally 0 recorded
    /// hours returns 0 here (no on-chain record yet); the frontend shows such
    /// PoC-holding members as "Curious" (the membership floor).
    function _tierForHours(uint256 totalHours) internal view returns (uint8) {
        uint8 tier = totalHours > 0 ? 1 : 0; // Curious floor once any hours exist
        for (uint8 k = 0; k < 4; k++) {
            if (tierThresholds[k] > 0 && totalHours >= tierThresholds[k]) {
                tier = k + 2; // thresholds index 0 → tier 2 (Resident), ... → tier 5 (Elder)
            }
        }
        return tier;
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function setTierThresholds(uint256[4] calldata thresholds)
        external
        onlyRole(TIER_ADMIN_ROLE)
    {
        tierThresholds = thresholds;
        emit TierThresholdsSet(thresholds);
    }

    function getTierThresholds() external view returns (uint256[4] memory) {
        return tierThresholds;
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

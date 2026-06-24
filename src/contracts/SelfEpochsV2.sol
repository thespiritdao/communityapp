// File: src/contracts/SelfEpochsV2.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SelfEpochsV2
/// @notice Soulbound, SLOW-DECAYING $SELF participation token (replaces the
/// cliff-expiry SelfEpochs v1). See docs/spec-self-decay-redesign.md.
///
/// WHAT CHANGED FROM V1: v1 had binary cliff-expiry (full value for K epochs,
/// then 0). v2 has LINEAR DECAY: a holding minted in epoch E retains
/// `1 - (age / horizon)` of its value, fading evenly to 0 over `decayHorizon`
/// epochs (default 8 quarters = 2 years). No cliff; value changes smoothly.
///
/// WHY: $SELF must stay spendable AND reflect RECENT participation, while still
/// letting sustained contributors accumulate toward premium rewards (e.g. a
/// retreat). Linear decay gives an activity-proportional plateau (~R×T/2 for a
/// steady earner R): the active accumulate, the inactive erode below big-ticket
/// prices within ~a year. Tenure (SelfPrestige) remains PERMANENT and never
/// decays — that's the legacy record; this is the spendable layer.
///
/// DESIGN (unchanged from v1 except the value curve):
///  - SOULBOUND: only mint (from 0) and burn (to 0); no transfers (D-1).
///  - Token id encodes (communityId, epoch): id = (communityId << 32) | epoch.
///    Provenance + age both read straight off the id (D-5).
///  - EPOCH-GRANULAR decay: decay steps once per epoch (quarter), not per
///    second — so it's a cheap read-time computation from (currentEpoch - E),
///    no per-mint timestamps, no loops.
///  - MINTER_ROLE → SelfMinter; BURNER_ROLE → SelfPayment/clawback;
///    EPOCH_ADMIN_ROLE → Exec (advance epoch, set horizon); LOCKER_ROLE →
///    future staking seam.
///
/// 1e18 base unit = 1 verified participation-hour.
contract SelfEpochsV2 is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant EPOCH_ADMIN_ROLE = keccak256("EPOCH_ADMIN_ROLE");
    bytes32 public constant LOCKER_ROLE = keccak256("LOCKER_ROLE");

    /// @notice Basis-point denominator for decay factors (10000 = 100% = full value).
    uint256 public constant BPS = 10_000;

    /// @notice Current global epoch (quarter counter). Advanced by EPOCH_ADMIN_ROLE.
    uint32 public currentEpoch;

    /// @notice Linear decay horizon, in epochs. A holding fades from full value
    /// (at its mint epoch) to ZERO over this many epochs. Default 8 (2 years).
    /// EPOCH_ADMIN_ROLE-settable; tuning it reshapes the accumulation plateau.
    uint32 public decayHorizon;

    /// @notice Locked amount per (holder, id) — staking seam. Locked holdings are
    /// decay-exempt AND unburnable until unlocked.
    mapping(address => mapping(uint256 => uint256)) public lockedOf;

    event EpochAdvanced(uint32 indexed newEpoch);
    event DecayHorizonSet(uint32 decayHorizon);
    event Locked(address indexed holder, uint256 indexed id, uint256 amount);
    event Unlocked(address indexed holder, uint256 indexed id, uint256 amount);

    /// @param admin           DEFAULT_ADMIN_ROLE + EPOCH_ADMIN_ROLE holder.
    /// @param uri_            ERC-1155 metadata URI template.
    /// @param initialEpoch    Starting global epoch.
    /// @param initialHorizon  Decay horizon in epochs (e.g. 8 = linear fade to 0 over 2 years).
    constructor(
        address admin,
        string memory uri_,
        uint32 initialEpoch,
        uint32 initialHorizon
    ) ERC1155(uri_) {
        require(admin != address(0), "SelfEpochsV2: admin zero");
        require(initialHorizon > 0, "SelfEpochsV2: horizon zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(EPOCH_ADMIN_ROLE, admin);
        currentEpoch = initialEpoch;
        decayHorizon = initialHorizon;
    }

    // ─── Id encoding ──────────────────────────────────────────────────────────

    function encodeId(uint224 communityId, uint32 epoch) public pure returns (uint256) {
        return (uint256(communityId) << 32) | uint256(epoch);
    }

    function communityOf(uint256 id) public pure returns (uint224) {
        return uint224(id >> 32);
    }

    function epochOf(uint256 id) public pure returns (uint32) {
        return uint32(id);
    }

    // ─── Decay (the v2 core) ───────────────────────────────────────────────────

    /// @notice Remaining value fraction (in BPS) of a holding minted in `id`'s
    /// epoch, given the current epoch. Linear: 100% at mint, 0% at/after horizon.
    ///   age = currentEpoch - epochOf(id)
    ///   factor = max(0, 1 - age/horizon)  →  in bps: BPS - age*BPS/horizon
    function decayFactorBps(uint256 id) public view returns (uint256) {
        uint32 e = epochOf(id);
        if (e >= currentEpoch) return BPS; // freshly minted (or future-dated): full value
        uint256 age = uint256(currentEpoch - e);
        if (age >= decayHorizon) return 0; // fully decayed
        return BPS - (age * BPS) / decayHorizon;
    }

    /// @notice Decayed (current spendable) value of a holder's position in `id`.
    /// This is what gating/payment should read — NOT raw balanceOf.
    function decayedBalanceOf(address holder, uint256 id) public view returns (uint256) {
        uint256 raw = balanceOf(holder, id);
        if (raw == 0) return 0;
        return (raw * decayFactorBps(id)) / BPS;
    }

    /// @notice Raw (undecayed) amount still held for an id. The underlying tokens
    /// are not destroyed by decay — only their *value* fades. burn() and the
    /// soulbound/lock checks operate on raw amounts; value math uses the factor.
    function rawBalanceOf(address holder, uint256 id) external view returns (uint256) {
        return balanceOf(holder, id);
    }

    // ─── Soulbinding + lock guard (unchanged from v1) ──────────────────────────

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        require(from == address(0) || to == address(0), "SELF: soulbound");
        if (to == address(0) && from != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                uint256 unlocked = balanceOf(from, ids[i]) - lockedOf[from][ids[i]];
                require(values[i] <= unlocked, "SELF: amount locked");
            }
        }
        super._update(from, to, ids, values);
    }

    // ─── Minting (MINTER_ROLE → SelfMinter) ───────────────────────────────────

    function mint(
        address to,
        uint224 communityId,
        uint32 epoch,
        uint256 amount,
        bytes calldata data
    ) external onlyRole(MINTER_ROLE) {
        _mint(to, encodeId(communityId, epoch), amount, data);
    }

    function batchMint(
        address[] calldata to,
        uint224[] calldata communityIds,
        uint32[] calldata epochs,
        uint256[] calldata amounts,
        bytes calldata data
    ) external onlyRole(MINTER_ROLE) {
        uint256 n = to.length;
        require(
            communityIds.length == n && epochs.length == n && amounts.length == n,
            "SelfEpochsV2: length mismatch"
        );
        for (uint256 i = 0; i < n; i++) {
            _mint(to[i], encodeId(communityIds[i], epochs[i]), amounts[i], data);
        }
    }

    // ─── Burning (BURNER_ROLE → SelfPayment / clawback) ───────────────────────
    // NOTE: burn operates on RAW amounts. SelfPayment computes how much raw to
    // burn so that the DECAYED value burned equals the price (see SelfPayment v2).

    function burn(address holder, uint256 id, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(holder, id, amount);
    }

    function batchBurn(
        address holder,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external onlyRole(BURNER_ROLE) {
        _burnBatch(holder, ids, amounts);
    }

    // ─── Locking seam (LOCKER_ROLE → future staking) ──────────────────────────

    function lock(address holder, uint256 id, uint256 amount) external onlyRole(LOCKER_ROLE) {
        require(lockedOf[holder][id] + amount <= balanceOf(holder, id), "SELF: over-lock");
        lockedOf[holder][id] += amount;
        emit Locked(holder, id, amount);
    }

    function unlock(address holder, uint256 id, uint256 amount) external onlyRole(LOCKER_ROLE) {
        require(amount <= lockedOf[holder][id], "SELF: under-lock");
        lockedOf[holder][id] -= amount;
        emit Unlocked(holder, id, amount);
    }

    // ─── Epoch administration (EPOCH_ADMIN_ROLE → Exec) ───────────────────────

    function advanceEpoch() external onlyRole(EPOCH_ADMIN_ROLE) {
        currentEpoch += 1;
        emit EpochAdvanced(currentEpoch);
    }

    /// @notice Set the linear decay horizon (epochs). Applies going forward to
    /// the read-time factor for ALL holdings (it's not stamped per token), so
    /// raising it slows everyone's decay, lowering it speeds it. Change rarely.
    function setDecayHorizon(uint32 newHorizon) external onlyRole(EPOCH_ADMIN_ROLE) {
        require(newHorizon > 0, "SelfEpochsV2: horizon zero");
        decayHorizon = newHorizon;
        emit DecayHorizonSet(newHorizon);
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

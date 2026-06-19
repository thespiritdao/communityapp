// File: src/contracts/SelfEpochs.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SelfEpochs
/// @notice Soulbound, time-bound $SELF participation token.
///
/// $SELF is verified human time, recorded where it was spent, that fades unless
/// renewed — and it never becomes money. See docs/spec-self-soulbound-redesign.md.
///
/// Design (per spec):
///  - SOULBOUND: only mint (from 0) and burn (to 0). No transfers, ever (D-1).
///  - Token id encodes (communityId, epoch): id = (communityId << 32) | epoch (D-5).
///    `epoch` is a global quarter counter (D-16); `communityId` is a stable per-pod
///    uint. Provenance + expiry are both readable straight off the id.
///  - EXPIRY at read time: an id is live iff `currentEpoch - epoch < K` (D-17).
///    `liveBalanceOf` ignores expired ids; gating/payment never depend on a sweep.
///  - Minting is the SelfMinter contract's job (MINTER_ROLE); burning is the
///    SelfPayment / clawback path's job (BURNER_ROLE). Never an EOA.
///  - STAKING SEAM (D-15): a per-(holder,id) lock can be set by LOCKER_ROLE. Locked
///    holdings are exempt from expiry AND cannot be burned for payment — the future
///    "lock $SELF for governance voice" feature plugs in here with no re-architecture.
///    No staking logic lives here yet; only the seam.
///
/// 1e18 base unit = 1 verified participation-hour. SelfMinter rounds credited
/// amounts to the minute (1e18/60) before minting (D-7); this contract stores
/// full precision and is agnostic to rounding.
contract SelfEpochs is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant EPOCH_ADMIN_ROLE = keccak256("EPOCH_ADMIN_ROLE");
    bytes32 public constant LOCKER_ROLE = keccak256("LOCKER_ROLE");

    /// @notice Current global epoch (quarter counter). Advanced by EPOCH_ADMIN_ROLE.
    uint32 public currentEpoch;

    /// @notice Lifetime in epochs: an id minted in epoch E is live while
    /// `currentEpoch - E < lifetimeEpochs`. Settable by EPOCH_ADMIN_ROLE; changes
    /// apply going forward only (never retroactively shorten already-earned $SELF
    /// beyond what the live formula already implies at the time of the change).
    uint32 public lifetimeEpochs;

    /// @notice Locked amount per (holder, id). Locked ≤ balanceOf(holder, id).
    /// Locked holdings are expiry-exempt and unburnable until unlocked (staking seam).
    mapping(address => mapping(uint256 => uint256)) public lockedOf;

    event EpochAdvanced(uint32 indexed newEpoch);
    event LifetimeEpochsSet(uint32 lifetimeEpochs);
    event Locked(address indexed holder, uint256 indexed id, uint256 amount);
    event Unlocked(address indexed holder, uint256 indexed id, uint256 amount);

    /// @param admin            DEFAULT_ADMIN_ROLE + EPOCH_ADMIN_ROLE holder (Exec multisig/timelock).
    /// @param uri_             ERC-1155 metadata URI template.
    /// @param initialEpoch     Starting global epoch.
    /// @param initialLifetime  K — epochs an id stays live (e.g. 2 quarters).
    constructor(
        address admin,
        string memory uri_,
        uint32 initialEpoch,
        uint32 initialLifetime
    ) ERC1155(uri_) {
        require(admin != address(0), "SelfEpochs: admin zero");
        require(initialLifetime > 0, "SelfEpochs: lifetime zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(EPOCH_ADMIN_ROLE, admin);
        currentEpoch = initialEpoch;
        lifetimeEpochs = initialLifetime;
    }

    // ─── Id encoding ──────────────────────────────────────────────────────────

    /// @notice Compose a token id from (communityId, epoch).
    function encodeId(uint224 communityId, uint32 epoch) public pure returns (uint256) {
        return (uint256(communityId) << 32) | uint256(epoch);
    }

    /// @notice Extract the community id from a token id.
    function communityOf(uint256 id) public pure returns (uint224) {
        return uint224(id >> 32);
    }

    /// @notice Extract the epoch from a token id.
    function epochOf(uint256 id) public pure returns (uint32) {
        return uint32(id);
    }

    /// @notice True if an id's epoch is still within the live window.
    function isLive(uint256 id) public view returns (bool) {
        uint32 e = epochOf(id);
        if (e > currentEpoch) return true; // future-dated (shouldn't happen) — treat as live
        return (currentEpoch - e) < lifetimeEpochs;
    }

    // ─── Soulbinding ──────────────────────────────────────────────────────────

    /// @dev OZ v5 routes mint/burn/transfer through _update. Allow only mint
    /// (from==0) and burn (to==0). Any holder→holder movement reverts, which
    /// covers safeTransferFrom and safeBatchTransferFrom. Also block burning a
    /// locked holding (staking seam): a burn from a holder cannot exceed the
    /// holder's unlocked amount for that id.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        require(from == address(0) || to == address(0), "SELF: soulbound");

        // Burn path (to == 0, from != 0): cannot burn locked holdings.
        if (to == address(0) && from != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                uint256 unlocked = balanceOf(from, ids[i]) - lockedOf[from][ids[i]];
                require(values[i] <= unlocked, "SELF: amount locked");
            }
        }
        super._update(from, to, ids, values);
    }

    // ─── Minting (MINTER_ROLE → SelfMinter) ───────────────────────────────────

    /// @notice Mint `amount` of $SELF for (communityId, epoch) to `to`.
    /// Caller (SelfMinter) is responsible for budget/cap/attestation enforcement;
    /// this contract only enforces soulbound + role.
    function mint(
        address to,
        uint224 communityId,
        uint32 epoch,
        uint256 amount,
        bytes calldata data
    ) external onlyRole(MINTER_ROLE) {
        _mint(to, encodeId(communityId, epoch), amount, data);
    }

    /// @notice Batch mint across (recipient, community, epoch, amount) tuples.
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
            "SelfEpochs: length mismatch"
        );
        for (uint256 i = 0; i < n; i++) {
            _mint(to[i], encodeId(communityIds[i], epochs[i]), amounts[i], data);
        }
    }

    // ─── Burning (BURNER_ROLE → SelfPayment / clawback) ───────────────────────

    /// @notice Burn `amount` of a specific id from `holder` (redemption/payment).
    /// Reverts if the amount is locked (see _update). FIFO-by-epoch selection is
    /// the caller's responsibility — SelfPayment iterates oldest-live ids first.
    function burn(
        address holder,
        uint256 id,
        uint256 amount
    ) external onlyRole(BURNER_ROLE) {
        _burn(holder, id, amount);
    }

    /// @notice Batch burn (SelfPayment FIFO redemption, clawback of a fraud mint).
    function batchBurn(
        address holder,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external onlyRole(BURNER_ROLE) {
        _burnBatch(holder, ids, amounts);
    }

    // ─── Locking seam (LOCKER_ROLE → future staking) ──────────────────────────

    /// @notice Lock `amount` of (holder,id) — expiry-exempt + unburnable until unlocked.
    function lock(address holder, uint256 id, uint256 amount) external onlyRole(LOCKER_ROLE) {
        require(lockedOf[holder][id] + amount <= balanceOf(holder, id), "SELF: over-lock");
        lockedOf[holder][id] += amount;
        emit Locked(holder, id, amount);
    }

    /// @notice Release a previously locked amount of (holder,id).
    function unlock(address holder, uint256 id, uint256 amount) external onlyRole(LOCKER_ROLE) {
        require(amount <= lockedOf[holder][id], "SELF: under-lock");
        lockedOf[holder][id] -= amount;
        emit Unlocked(holder, id, amount);
    }

    // ─── Epoch administration (EPOCH_ADMIN_ROLE → Exec) ───────────────────────

    /// @notice Advance the global epoch (quarter rollover). Prestige conversion of
    /// newly-expired ids is handled off-chain by the janitor reading isLive().
    function advanceEpoch() external onlyRole(EPOCH_ADMIN_ROLE) {
        currentEpoch += 1;
        emit EpochAdvanced(currentEpoch);
    }

    /// @notice Set K (lifetime in epochs). Applies going forward.
    function setLifetimeEpochs(uint32 newLifetime) external onlyRole(EPOCH_ADMIN_ROLE) {
        require(newLifetime > 0, "SelfEpochs: lifetime zero");
        lifetimeEpochs = newLifetime;
        emit LifetimeEpochsSet(newLifetime);
    }

    /// @notice Update the metadata URI.
    function setURI(string calldata newuri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newuri);
    }

    // ─── ERC165 ───────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

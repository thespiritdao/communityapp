// File: src/contracts/SelfMinter.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAgentRegistry.sol";

/// @dev Minimal interface to SelfEpochs (the soulbound $SELF token).
interface ISelfEpochs {
    function mint(
        address to,
        uint224 communityId,
        uint32 epoch,
        uint256 amount,
        bytes calldata data
    ) external;

    function batchMint(
        address[] calldata to,
        uint224[] calldata communityIds,
        uint32[] calldata epochs,
        uint256[] calldata amounts,
        bytes calldata data
    ) external;

    function currentEpoch() external view returns (uint32);
}

/// @title SelfMinter
/// @notice The sole minter of $SELF (holds MINTER_ROLE on SelfEpochs).
///
/// Per docs/spec-self-soulbound-redesign.md §3:
///  - Communities NEVER mint. The protocol mints against ATTESTED platform
///    actions (event check-ins, approved bounties, votes, verification, role
///    service). The backend computes who-earned-what against the budget +
///    attestation ledger (Supabase) and submits batches here.
///  - Budgets, per-member caps, diminishing returns, and the hour anchor are
///    enforced OFF-CHAIN in the ledger (so policy evolves without redeploys).
///    This contract enforces only: caller authorization + replay protection.
///  - ATTESTOR_ROLE is the backend attestation signer (a server-held key whose
///    operations are paymaster-sponsored, never a user EOA). It is NOT given
///    MINTER_ROLE on SelfEpochs directly — only THIS contract holds that — so
///    the mint surface is one auditable choke point.
///  - Each batch carries a unique `batchId`; re-submitting a consumed id
///    reverts (idempotency / replay protection for retried sponsored ops).
///
/// 1e18 = 1 verified participation-hour. The backend rounds to the minute
/// (1e18/60) before submitting (D-7); this contract is unit-agnostic.
contract SelfMinter is AccessControl, ReentrancyGuard {
    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");

    ISelfEpochs public immutable selfEpochs;

    /// @notice Consumed batch ids — replay protection for retried sponsored ops.
    mapping(bytes32 => bool) public consumedBatches;

    /// @notice Congregant guard: registered AI agents accrue no $SELF/Tenure.
    ///         Optional (guard active once set by admin) so existing deploy
    ///         flows are unchanged. See AgentRegistry / Congregant architecture.
    IAgentRegistry public agentRegistry;

    event SelfMinted(
        bytes32 indexed batchId,
        address indexed to,
        uint224 indexed communityId,
        uint32 epoch,
        uint256 amount,
        bytes32 sourceRef
    );
    event BatchProcessed(bytes32 indexed batchId, uint256 itemCount);

    /// @param _selfEpochs  Deployed SelfEpochs contract (this contract must be
    ///                     granted MINTER_ROLE on it after deployment).
    /// @param admin        DEFAULT_ADMIN_ROLE holder (Exec multisig/timelock).
    /// @param attestor     Initial ATTESTOR_ROLE holder (backend signer).
    constructor(address _selfEpochs, address admin, address attestor) {
        require(_selfEpochs != address(0), "SelfMinter: epochs zero");
        require(admin != address(0), "SelfMinter: admin zero");
        require(attestor != address(0), "SelfMinter: attestor zero");
        selfEpochs = ISelfEpochs(_selfEpochs);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ATTESTOR_ROLE, attestor);
    }

    /// @notice Set the AgentRegistry used to refuse minting to AI agents
    function setAgentRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        agentRegistry = IAgentRegistry(registry);
    }

    function _revertIfAgent(address account) internal view {
        require(
            address(agentRegistry) == address(0) || !agentRegistry.isRegistered(account),
            "SelfMinter: agent excluded"
        );
    }

    /// @notice One mint instruction within a batch. `sourceRef` ties the mint
    /// to its attestation (event/bounty/proposal id hash) for the audit trail.
    struct MintItem {
        address to;
        uint224 communityId;
        uint32 epoch;
        uint256 amount;
        bytes32 sourceRef;
    }

    /// @notice Mint a batch of $SELF. Only the attestation signer may call.
    /// @param batchId  Unique id for this batch (replay protection).
    /// @param items    Per-recipient mint instructions.
    function mintBatch(bytes32 batchId, MintItem[] calldata items)
        external
        onlyRole(ATTESTOR_ROLE)
        nonReentrant
    {
        require(batchId != bytes32(0), "SelfMinter: batchId zero");
        require(!consumedBatches[batchId], "SelfMinter: batch consumed");
        require(items.length > 0, "SelfMinter: empty batch");
        consumedBatches[batchId] = true;

        for (uint256 i = 0; i < items.length; i++) {
            MintItem calldata it = items[i];
            require(it.to != address(0), "SelfMinter: recipient zero");
            require(it.amount > 0, "SelfMinter: amount zero");
            _revertIfAgent(it.to);

            selfEpochs.mint(it.to, it.communityId, it.epoch, it.amount, "");

            emit SelfMinted(
                batchId,
                it.to,
                it.communityId,
                it.epoch,
                it.amount,
                it.sourceRef
            );
        }

        emit BatchProcessed(batchId, items.length);
    }

    /// @notice Mint a single attested award (convenience for one-off mints).
    function mintOne(
        bytes32 batchId,
        address to,
        uint224 communityId,
        uint32 epoch,
        uint256 amount,
        bytes32 sourceRef
    ) external onlyRole(ATTESTOR_ROLE) nonReentrant {
        require(batchId != bytes32(0), "SelfMinter: batchId zero");
        require(!consumedBatches[batchId], "SelfMinter: batch consumed");
        require(to != address(0), "SelfMinter: recipient zero");
        require(amount > 0, "SelfMinter: amount zero");
        _revertIfAgent(to);
        consumedBatches[batchId] = true;

        selfEpochs.mint(to, communityId, epoch, amount, "");

        emit SelfMinted(batchId, to, communityId, epoch, amount, sourceRef);
        emit BatchProcessed(batchId, 1);
    }
}

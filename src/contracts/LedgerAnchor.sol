// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title LedgerAnchor
 * @author SpiritDAO
 * @notice Periodic Merkle-root anchoring of the platform activity ledger
 *
 * @dev Congregant architecture, Phase 6 ("the ledger as field instrument"):
 * the public activity ledger — in which human and artificial acts are
 * commensurable entries — is a research instrument for the community itself.
 * An instrument the operator could silently edit is not trustworthy, so a
 * Merkle root over each period's events is committed here, making the ledger
 * tamper-EVIDENT: any later mutation of an anchored event no longer matches
 * its root.
 *
 * Leaf formula (documented for independent verification, see also
 * /api/explorer/export):
 *   leaf = keccak256(utf8("{id}|{type}|{actor}|{actor_type}|{created_at}"))
 * Pairwise keccak256 with odd leaf promoted; root of empty period = 0x0.
 *
 * Anchoring is restricted (owner / authorized backend) — a wrong root from a
 * stranger would pollute the record. Verification is permissionless.
 */

contract LedgerAnchor {
    struct Anchor {
        bytes32 merkleRoot;
        uint64 periodStart; // unix seconds, inclusive
        uint64 periodEnd;   // unix seconds, exclusive
        uint32 eventCount;
        uint64 anchoredAt;
    }

    address public owner;
    mapping(address => bool) public authorizedCallers;

    Anchor[] public anchors;

    event LedgerAnchored(
        uint256 indexed index,
        bytes32 merkleRoot,
        uint64 periodStart,
        uint64 periodEnd,
        uint32 eventCount
    );
    event CallerAuthorized(address indexed caller, bool authorized);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error InvalidAddress();
    error InvalidPeriod();

    constructor(address _initialOwner) {
        if (_initialOwner == address(0)) revert InvalidAddress();
        owner = _initialOwner;
        authorizedCallers[_initialOwner] = true;
        emit CallerAuthorized(_initialOwner, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAuthorized() {
        if (msg.sender != owner && !authorizedCallers[msg.sender]) revert Unauthorized();
        _;
    }

    /// @notice Anchor a period's ledger Merkle root
    function anchor(
        bytes32 merkleRoot,
        uint64 periodStart,
        uint64 periodEnd,
        uint32 eventCount
    ) external onlyAuthorized returns (uint256 index) {
        if (periodEnd <= periodStart) revert InvalidPeriod();

        index = anchors.length;
        anchors.push(
            Anchor({
                merkleRoot: merkleRoot,
                periodStart: periodStart,
                periodEnd: periodEnd,
                eventCount: eventCount,
                anchoredAt: uint64(block.timestamp)
            })
        );
        emit LedgerAnchored(index, merkleRoot, periodStart, periodEnd, eventCount);
    }

    function anchorCount() external view returns (uint256) {
        return anchors.length;
    }

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        if (caller == address(0)) revert InvalidAddress();
        authorizedCallers[caller] = authorized;
        emit CallerAuthorized(caller, authorized);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

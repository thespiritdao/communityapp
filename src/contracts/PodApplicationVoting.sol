// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PodApplicationVoting
 * @notice On-chain voting for pod membership applications
 * @dev Uses Hats Protocol for permission verification
 *
 * Architecture:
 * - Pod leaders cast votes on-chain for membership applications
 * - Each vote emits an event with transaction hash recorded in database
 * - HAT-based permission system ensures only authorized voters
 * - Gasless transactions via Coinbase paymaster (contract whitelisting)
 *
 * Integration:
 * - Frontend: Uses CDP Smart Accounts + sendUserOperation()
 * - Database: pod_application_votes table stores transaction_hash
 * - Permissions: Requires pod leader HAT to vote
 */

interface IHats {
    /**
     * @notice Check if a user is wearing a specific HAT
     * @param user Address to check
     * @param hatId HAT ID to verify
     * @return bool True if user is wearing the HAT
     */
    function isWearerOfHat(address user, uint256 hatId) external view returns (bool);
}

contract PodApplicationVoting {
    // ============================================================
    // STORAGE
    // ============================================================

    /// @notice Hats Protocol contract address
    IHats public immutable hatsProtocol;

    /// @notice Mapping to prevent double voting: applicationId => voter => hasVoted
    mapping(bytes32 => mapping(address => bool)) public hasVoted;

    /// @notice Vote count per application: applicationId => (approveCount, rejectCount)
    mapping(bytes32 => VoteCount) public voteCounts;

    struct VoteCount {
        uint256 approvals;
        uint256 rejections;
    }

    // ============================================================
    // EVENTS
    // ============================================================

    /**
     * @notice Emitted when a vote is cast
     * @param applicationId Unique identifier for the application (UUID from database)
     * @param voter Address of the voter
     * @param podLeaderHatId HAT ID used to authorize the vote
     * @param approved True for approve, false for reject
     * @param timestamp Block timestamp
     */
    event VoteCast(
        bytes32 indexed applicationId,
        address indexed voter,
        uint256 indexed podLeaderHatId,
        bool approved,
        uint256 timestamp
    );

    // ============================================================
    // ERRORS
    // ============================================================

    error NotAuthorized(address voter, uint256 requiredHatId);
    error AlreadyVoted(bytes32 applicationId, address voter);
    error InvalidApplicationId();

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /**
     * @notice Initialize the voting contract
     * @param _hatsProtocol Address of the Hats Protocol contract on Base mainnet
     */
    constructor(address _hatsProtocol) {
        require(_hatsProtocol != address(0), "Invalid Hats Protocol address");
        hatsProtocol = IHats(_hatsProtocol);
    }

    // ============================================================
    // EXTERNAL FUNCTIONS
    // ============================================================

    /**
     * @notice Cast a vote on a pod membership application
     * @dev Requires caller to wear the specified pod leader HAT
     * @param applicationId Unique identifier for the application (UUID from database, converted to bytes32)
     * @param podLeaderHatId HAT ID required to vote (e.g., Executive Pod Leader HAT)
     * @param approved True to approve the application, false to reject
     *
     * Requirements:
     * - Caller must wear the podLeaderHatId HAT
     * - Caller must not have already voted on this application
     * - applicationId must not be zero
     *
     * Emits:
     * - VoteCast event with all vote details
     */
    function castVote(
        bytes32 applicationId,
        uint256 podLeaderHatId,
        bool approved
    ) external {
        // Validation
        if (applicationId == bytes32(0)) {
            revert InvalidApplicationId();
        }

        // Check if voter wears the required HAT
        if (!hatsProtocol.isWearerOfHat(msg.sender, podLeaderHatId)) {
            revert NotAuthorized(msg.sender, podLeaderHatId);
        }

        // Check if voter has already voted on this application
        if (hasVoted[applicationId][msg.sender]) {
            revert AlreadyVoted(applicationId, msg.sender);
        }

        // Record the vote
        hasVoted[applicationId][msg.sender] = true;

        // Update vote counts
        if (approved) {
            voteCounts[applicationId].approvals++;
        } else {
            voteCounts[applicationId].rejections++;
        }

        // Emit event for frontend/database integration
        emit VoteCast(
            applicationId,
            msg.sender,
            podLeaderHatId,
            approved,
            block.timestamp
        );
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Check if an address has voted on a specific application
     * @param applicationId Application identifier
     * @param voter Address to check
     * @return bool True if the voter has already voted
     */
    function getHasVoted(bytes32 applicationId, address voter) external view returns (bool) {
        return hasVoted[applicationId][voter];
    }

    /**
     * @notice Get vote counts for an application
     * @param applicationId Application identifier
     * @return approvals Number of approve votes
     * @return rejections Number of reject votes
     */
    function getVoteCounts(bytes32 applicationId) external view returns (uint256 approvals, uint256 rejections) {
        VoteCount memory counts = voteCounts[applicationId];
        return (counts.approvals, counts.rejections);
    }

    /**
     * @notice Check if a voter can vote on an application
     * @param applicationId Application identifier
     * @param voter Address of potential voter
     * @param podLeaderHatId HAT ID required to vote
     * @return canVote True if voter is authorized and hasn't voted yet
     */
    function canVote(
        bytes32 applicationId,
        address voter,
        uint256 podLeaderHatId
    ) external view returns (bool) {
        // Must wear the required HAT
        bool wearsHat = hatsProtocol.isWearerOfHat(voter, podLeaderHatId);

        // Must not have already voted
        bool alreadyVoted = hasVoted[applicationId][voter];

        return wearsHat && !alreadyVoted;
    }
}

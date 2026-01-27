// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title PodGovernance
 * @notice Records pod-level governance votes on-chain for transparency
 * @dev This contract does NOT control voting logic - that's handled by the app
 *      It serves as a permanent, transparent record of votes with pod-specific permissions
 *
 * Architecture:
 * 1. User votes in app → cryptographic signature generated
 * 2. App validates pod-specific permissions (governanceParticipation)
 * 3. Vote stored in DB (immediate, for real-time tallies)
 * 4. Vote posted to this contract (batched, for transparency)
 * 5. When proposal closes → aggregate to IPFS and post hash
 */
contract PodGovernance is Ownable {
    // Advocate NFT contract (required to vote)
    IERC721 public immutable advocateToken;

    // Authorized vote recorder (backend service)
    address public voteRecorder;

    // Vote support values (same as Governor)
    uint8 public constant AGAINST = 0;
    uint8 public constant FOR = 1;
    uint8 public constant ABSTAIN = 2;

    /**
     * @notice Emitted when a pod-level vote is recorded
     * @param proposalId The on-chain proposal ID
     * @param podId The pod this vote belongs to (UUID)
     * @param voter The address of the voter
     * @param support The vote (0=against, 1=for, 2=abstain)
     * @param signature Cryptographic signature proving vote authenticity
     * @param timestamp Block timestamp
     */
    event PodVoteRecorded(
        bytes32 indexed proposalId,
        bytes32 indexed podId,
        address indexed voter,
        uint8 support,
        bytes signature,
        uint256 timestamp
    );

    /**
     * @notice Emitted when votes are aggregated to IPFS
     * @param proposalId The proposal ID
     * @param ipfsHash The IPFS hash containing all votes
     * @param voteCount Total number of votes aggregated
     * @param timestamp Block timestamp
     */
    event VotesAggregated(
        bytes32 indexed proposalId,
        string ipfsHash,
        uint256 voteCount,
        uint256 timestamp
    );

    /**
     * @notice Emitted when a proposal's voting period ends
     * @param proposalId The proposal ID
     * @param result The final result (approved/rejected)
     * @param forVotes Total for votes
     * @param againstVotes Total against votes
     * @param abstainVotes Total abstain votes
     */
    event ProposalFinalized(
        bytes32 indexed proposalId,
        string result,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes
    );

    // Track which proposals have votes recorded (prevent duplicates)
    mapping(bytes32 => mapping(address => bool)) public hasVoted;

    constructor(address _advocateToken, address _voteRecorder) Ownable(msg.sender) {
        advocateToken = IERC721(_advocateToken);
        voteRecorder = _voteRecorder;
    }

    modifier onlyVoteRecorder() {
        require(msg.sender == voteRecorder, "PodGovernance: caller is not vote recorder");
        _;
    }

    /**
     * @notice Record a single vote on-chain
     * @dev Only callable by authorized vote recorder (gasless via CDP)
     * @param proposalId The proposal being voted on
     * @param podId The pod this vote belongs to
     * @param voter The voter's address
     * @param support The vote (0/1/2)
     * @param signature Cryptographic signature
     */
    function recordVote(
        bytes32 proposalId,
        bytes32 podId,
        address voter,
        uint8 support,
        bytes calldata signature
    ) external onlyVoteRecorder {
        require(support <= ABSTAIN, "PodGovernance: invalid vote value");
        require(!hasVoted[proposalId][voter], "PodGovernance: already voted");
        require(advocateToken.balanceOf(voter) > 0, "PodGovernance: not an Advocate");

        hasVoted[proposalId][voter] = true;

        emit PodVoteRecorded(
            proposalId,
            podId,
            voter,
            support,
            signature,
            block.timestamp
        );
    }

    /**
     * @notice Record multiple votes in a batch (gas efficient)
     * @param proposalId The proposal ID
     * @param podIds Array of pod IDs
     * @param voters Array of voter addresses
     * @param supportValues Array of vote values
     * @param signatures Array of signatures
     */
    function recordVoteBatch(
        bytes32 proposalId,
        bytes32[] calldata podIds,
        address[] calldata voters,
        uint8[] calldata supportValues,
        bytes[] calldata signatures
    ) external onlyVoteRecorder {
        require(
            podIds.length == voters.length &&
            voters.length == supportValues.length &&
            supportValues.length == signatures.length,
            "PodGovernance: array length mismatch"
        );

        for (uint256 i = 0; i < voters.length; i++) {
            require(supportValues[i] <= ABSTAIN, "PodGovernance: invalid vote value");
            require(!hasVoted[proposalId][voters[i]], "PodGovernance: already voted");
            require(advocateToken.balanceOf(voters[i]) > 0, "PodGovernance: not an Advocate");

            hasVoted[proposalId][voters[i]] = true;

            emit PodVoteRecorded(
                proposalId,
                podIds[i],
                voters[i],
                supportValues[i],
                signatures[i],
                block.timestamp
            );
        }
    }

    /**
     * @notice Post aggregated votes to IPFS
     * @dev Called when proposal closes
     * @param proposalId The proposal ID
     * @param ipfsHash The IPFS hash (from Pinata)
     * @param voteCount Total number of votes
     */
    function aggregateVotes(
        bytes32 proposalId,
        string calldata ipfsHash,
        uint256 voteCount
    ) external onlyVoteRecorder {
        require(bytes(ipfsHash).length > 0, "PodGovernance: empty IPFS hash");

        emit VotesAggregated(proposalId, ipfsHash, voteCount, block.timestamp);
    }

    /**
     * @notice Finalize proposal with results
     * @param proposalId The proposal ID
     * @param result The final result (e.g., "approved", "rejected")
     * @param forVotes Total for votes
     * @param againstVotes Total against votes
     * @param abstainVotes Total abstain votes
     */
    function finalizeProposal(
        bytes32 proposalId,
        string calldata result,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes
    ) external onlyVoteRecorder {
        emit ProposalFinalized(
            proposalId,
            result,
            forVotes,
            againstVotes,
            abstainVotes
        );
    }

    /**
     * @notice Update the vote recorder address
     * @param _voteRecorder New vote recorder address
     */
    function setVoteRecorder(address _voteRecorder) external onlyOwner {
        require(_voteRecorder != address(0), "PodGovernance: zero address");
        voteRecorder = _voteRecorder;
    }

    /**
     * @notice Check if an address has voted on a proposal
     * @param proposalId The proposal ID
     * @param voter The voter address
     * @return Whether they have voted
     */
    function hasVotedOnProposal(bytes32 proposalId, address voter) external view returns (bool) {
        return hasVoted[proposalId][voter];
    }
}

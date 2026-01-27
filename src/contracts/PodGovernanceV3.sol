// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title PodGovernance V3 - Simplified for AA Wallets
 * @notice Gasless on-chain governance optimized for CDP Embedded Wallets (Account Abstraction)
 * @dev Uses msg.sender directly - no EIP-712 signatures needed
 *
 * Architecture:
 * 1. User votes in app → App validates pod permissions
 * 2. Vote submitted via CDP (gasless, using sendUserOperation)
 * 3. Contract validates: Advocate token ownership + not voted yet
 * 4. Vote recorded permanently on-chain
 * 5. CDP sponsors all gas costs
 */
contract PodGovernanceV3 {
    // Advocate NFT contract (required to vote)
    IERC721 public immutable advocateToken;

    // Vote support values (same as Governor)
    uint8 public constant AGAINST = 0;
    uint8 public constant FOR = 1;
    uint8 public constant ABSTAIN = 2;

    /**
     * @notice Emitted when a pod-level vote is recorded
     */
    event PodVoteRecorded(
        bytes32 indexed proposalId,
        bytes32 indexed podId,
        address indexed voter,
        uint8 support,
        uint256 timestamp
    );

    /**
     * @notice Emitted when votes are aggregated to IPFS
     */
    event VotesAggregated(
        bytes32 indexed proposalId,
        string ipfsHash,
        uint256 voteCount,
        uint256 timestamp
    );

    /**
     * @notice Emitted when a proposal is finalized
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

    constructor(address _advocateToken) {
        advocateToken = IERC721(_advocateToken);
    }

    /**
     * @notice Record a vote on-chain (GASLESS via CDP)
     * @dev Called by user's AA wallet via CDP sendUserOperation
     * @param proposalId The proposal being voted on (UUID as bytes32)
     * @param podId The pod this vote belongs to (UUID as bytes32)
     * @param support The vote (0=against, 1=for, 2=abstain)
     */
    function recordVote(
        bytes32 proposalId,
        bytes32 podId,
        uint8 support
    ) external {
        require(support <= ABSTAIN, "PodGovernance: invalid vote value");

        // msg.sender is the AA wallet (smart contract wallet from CDP)
        address voter = msg.sender;

        // Validate voter
        require(!hasVoted[proposalId][voter], "PodGovernance: already voted");
        require(advocateToken.balanceOf(voter) > 0, "PodGovernance: not an Advocate");

        // Record vote
        hasVoted[proposalId][voter] = true;

        emit PodVoteRecorded(
            proposalId,
            podId,
            voter,
            support,
            block.timestamp
        );
    }

    /**
     * @notice Post aggregated votes to IPFS
     * @dev Called when proposal closes (can be called by anyone)
     * @param proposalId The proposal ID
     * @param ipfsHash The IPFS hash (from Pinata)
     * @param voteCount Total number of votes
     */
    function aggregateVotes(
        bytes32 proposalId,
        string calldata ipfsHash,
        uint256 voteCount
    ) external {
        require(bytes(ipfsHash).length > 0, "PodGovernance: empty IPFS hash");
        emit VotesAggregated(proposalId, ipfsHash, voteCount, block.timestamp);
    }

    /**
     * @notice Finalize proposal with results
     * @dev Can be called by anyone with correct data
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
    ) external {
        emit ProposalFinalized(
            proposalId,
            result,
            forVotes,
            againstVotes,
            abstainVotes
        );
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

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";

/**
 * @title DAOGovernor
 * @dev Governance contract for DAO that uses MembershipNFT as voting token
 */
contract DAOGovernor is 
    Governor, 
    GovernorSettings, 
    GovernorCountingSimple, 
    GovernorVotes, 
    GovernorVotesQuorumFraction,
    GovernorTimelockControl 
{
    // Optional: Store proposals with additional metadata
    struct ProposalMetadata {
        string title;
        string forumThreadId;
        address proposer;
        uint256 proposalId;
        uint256 createdAt;
    }
    
    // Mapping to store proposal metadata
    mapping(uint256 => ProposalMetadata) public proposalMetadata;
    
    // Events for better frontend integration
    event ProposalCreatedWithMetadata(
        uint256 proposalId,
        address proposer,
        string title,
        string forumThreadId,
        uint256 createdAt
    );
    
    constructor(
        IVotes _token,
        TimelockController _timelock,
        string memory _name,
        uint48 _votingDelay,
        uint32 _votingPeriod,
        uint256 _proposalThreshold,
        uint256 _quorumPercentage
    )
        Governor(_name)
        GovernorSettings(
            _votingDelay, // Voting delay in blocks
            _votingPeriod, // Voting period in blocks
            _proposalThreshold // Proposal threshold (minimum voting power required)
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(_quorumPercentage) // Quorum as percentage
        GovernorTimelockControl(_timelock)
    {}
    
    /**
     * @dev Create a proposal with additional metadata
     * The OpenZeppelin Governor contract includes a `propose` function already, but we can
     * add this custom function to capture more metadata like title and forum thread ID
     */
    function proposeWithMetadata(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        string memory title,
        string memory forumThreadId
    ) public returns (uint256) {
        // Use the standard propose function to create the proposal
        uint256 proposalId = propose(targets, values, calldatas, description);
        
        // Store additional metadata
        proposalMetadata[proposalId] = ProposalMetadata({
            title: title,
            forumThreadId: forumThreadId,
            proposer: msg.sender,
            proposalId: proposalId,
            createdAt: block.timestamp
        });
        
        // Emit event with metadata for easier frontend integration
        emit ProposalCreatedWithMetadata(
            proposalId,
            msg.sender,
            title,
            forumThreadId,
            block.timestamp
        );
        
        return proposalId;
    }

    // The following functions are overrides required by Solidity
    
    function votingDelay() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber) public view override(Governor, GovernorVotesQuorumFraction) returns (uint256) {
        return super.quorum(blockNumber);
    }

    function state(uint256 proposalId) public view override(Governor, GovernorTimelockControl) returns (ProposalState) {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId) public view override(Governor, GovernorTimelockControl) returns (bool) {
        return super.proposalNeedsQueuing(proposalId);
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    // Add missing _executor() override
    function _executor() internal view override(Governor, GovernorTimelockControl) returns (address) {
        return super._executor();
    }

    function _queueOperations(
        uint256 proposalId, 
        address[] memory targets, 
        uint256[] memory values, 
        bytes[] memory calldatas, 
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId, 
        address[] memory targets, 
        uint256[] memory values, 
        bytes[] memory calldatas, 
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets, 
        uint256[] memory values, 
        bytes[] memory calldatas, 
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// OpenZeppelin Governor core and extensions
import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @title DAO_Governor
/// @notice On-chain governance with NFT-gated proposals and votes, plus forum-thread linkage.
contract DAO_Governor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    /// @notice NFT contract implementing `ERC721Votes` (i.e. `IVotes`)
    IVotes public immutable advocateToken;

    /// @notice Mapping from proposal ID to an associated forum-thread ID
    mapping(uint256 => string) private _forumThreadIds;
    event ForumThreadLinked(uint256 indexed proposalId, string forumThreadId);

    constructor(
        IVotes             tokenAddress,
        TimelockController timelock,
        uint48             votingDelayBlocks,
        uint32             votingPeriodBlocks,
        uint256            quorumFraction,
        uint256            proposalThresholdTokens
    )
        Governor("DAO_Governor")
        GovernorSettings(votingDelayBlocks, votingPeriodBlocks, proposalThresholdTokens)
        GovernorVotes(tokenAddress)
        GovernorVotesQuorumFraction(quorumFraction)
        GovernorTimelockControl(timelock)
    {
        require(address(tokenAddress) != address(0), "Invalid token address");
        advocateToken = tokenAddress;
    }

    /// @notice Only NFT holders may propose
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override(Governor) returns (uint256) {
        require(
            advocateToken.getVotes(msg.sender) > 0,
            "Must hold an Advocate NFT to propose"
        );

        uint256 proposalId = super.propose(targets, values, calldatas, description);

        // Pull out any "Forum Discussion: THREAD_ID" and store it on-chain
        string memory threadId = _parseForumThreadId(description);
        if (bytes(threadId).length > 0) {
            _forumThreadIds[proposalId] = threadId;
            emit ForumThreadLinked(proposalId, threadId);
        }

        return proposalId;
    }

    /// @notice Retrieve the on-chain stored forum thread ID
    function getForumThreadId(uint256 proposalId)
        external
        view
        returns (string memory)
    {
        return _forumThreadIds[proposalId];
    }

    /// @dev Helper to find "Forum Discussion: …" in the description
    function _parseForumThreadId(string memory description)
        internal
        pure
        returns (string memory)
    {
        bytes memory desc = bytes(description);
        bytes memory marker = bytes("Forum Discussion: ");
        uint256 descLen = desc.length;
        uint256 markLen = marker.length;

        for (uint256 i = 0; i + markLen <= descLen; i++) {
            bool matchMarker = true;
            for (uint256 j = 0; j < markLen; j++) {
                if (desc[i + j] != marker[j]) {
                    matchMarker = false;
                    break;
                }
            }
            if (matchMarker) {
                uint256 start = i + markLen;
                uint256 len;
                while (start + len < descLen && desc[start + len] != bytes1("\n")) {
                    len++;
                }
                bytes memory idBytes = new bytes(len);
                for (uint256 k = 0; k < len; k++) {
                    idBytes[k] = desc[start + k];
                }
                return string(idBytes);
            }
        }
        return "";
    }

    /// @notice Block non-holders from even calling the vote functions
    function _canVote(uint256 proposalId, address account)
        internal
        view
        override(Governor, GovernorCountingSimple)
        returns (bool)
    {
        return
            advocateToken.getPastVotes(account, block.number) > 0 &&
            Governor._canVote(proposalId, account);
    }

    // Boilerplate overrides to satisfy Solidity's linearization requirements
    
    function votingDelay()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(Governor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
    
    // Required overrides for functions with multiple implementations in parent contracts
    
    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }
    
    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
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
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IHats {
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function hatSupply(uint256 hatId) external view returns (uint32);
}

/**
 * @title PodTreasuryV2WithVoting
 * @dev Enhanced treasury contract with majority voting and proxy support
 *
 * PRODUCTION VERSION with Multi-Sig Security:
 * - Maintains all existing single-sig functions for backward compatibility
 * - Adds proposal-based majority voting system
 * - Simple majority (>50%) of management hat holders required
 * - Proposals auto-execute when majority threshold reached
 * - Proxy pattern maintained for Coinbase Paymaster whitelisting
 */
contract PodTreasuryV2WithVoting is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IHats public immutable hatsContract;
    uint256 public immutable managementHatId;
    string public podId;
    address public authorizedProxy;

    mapping(address => uint256) public tokenBalances;
    address[] public supportedTokens;

    // ============================================================================
    // PROPOSAL SYSTEM - NEW MULTI-SIG FUNCTIONALITY
    // ============================================================================

    enum ProposalType {
        Distribution,           // Distribute tokens to recipients
        EmergencyWithdraw,      // Emergency withdrawal
        AddToken               // Add supported token
    }

    enum ProposalStatus {
        Pending,               // Awaiting approvals
        Executed,              // Successfully executed
        Cancelled              // Cancelled by proposer
    }

    struct Proposal {
        uint256 id;
        ProposalType proposalType;
        ProposalStatus status;
        address proposer;
        uint256 createdAt;
        uint256 executedAt;

        // Distribution data
        address token;
        address[] recipients;
        uint256[] amounts;
        string reason;

        // Emergency withdraw data
        address emergencyRecipient;
        uint256 emergencyAmount;

        // Token management data
        address newToken;

        // Approval tracking
        uint256 approvalCount;
        mapping(address => bool) hasApproved;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    uint256[] public activeProposalIds;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event FundsReceived(address indexed token, uint256 amount, address from);
    event FundsDistributed(address indexed token, uint256 amount, address to, string reason);
    event ProxyAuthorized(address indexed proxy);

    // Proposal events
    event ProposalCreated(
        uint256 indexed proposalId,
        ProposalType indexed proposalType,
        address indexed proposer,
        uint256 timestamp
    );

    event ProposalApproved(
        uint256 indexed proposalId,
        address indexed approver,
        uint256 approvalCount,
        uint256 requiredApprovals
    );

    event ProposalExecuted(
        uint256 indexed proposalId,
        ProposalType indexed proposalType,
        uint256 timestamp
    );

    event ProposalCancelled(
        uint256 indexed proposalId,
        address indexed canceller,
        uint256 timestamp
    );


    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyPodManagers() {
        require(
            hatsContract.balanceOf(msg.sender, managementHatId) > 0,
            "Only pod managers can execute"
        );
        _;
    }

    modifier onlyPodManagersOrProxy() {
        require(
            hatsContract.balanceOf(msg.sender, managementHatId) > 0 ||
            (authorizedProxy != address(0) && msg.sender == authorizedProxy),
            "Only pod managers or authorized proxy can execute"
        );
        _;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(
        address _hatsContract,
        uint256 _managementHatId,
        string memory _podId,
        address[] memory _supportedTokens,
        address _authorizedProxy,
        address _bountyManager
    ) ReentrancyGuard() {
        require(_hatsContract != address(0), "Invalid hats contract");
        require(_managementHatId > 0, "Invalid management hat ID");
        require(bytes(_podId).length > 0, "Pod ID cannot be empty");

        hatsContract = IHats(_hatsContract);
        managementHatId = _managementHatId;
        podId = _podId;
        authorizedProxy = _authorizedProxy;

        for (uint i = 0; i < _supportedTokens.length; i++) {
            require(_supportedTokens[i] != address(0), "Invalid token address");
            supportedTokens.push(_supportedTokens[i]);
            if (_bountyManager != address(0)) {
                IERC20(_supportedTokens[i]).approve(_bountyManager, type(uint256).max);
            }
        }

        if (_authorizedProxy != address(0)) {
            emit ProxyAuthorized(_authorizedProxy);
        }
    }

    // ============================================================================
    // PROPOSAL FUNCTIONS - NEW MULTI-SIG SYSTEM
    // ============================================================================

    /**
     * @dev Propose a token distribution (requires majority approval to execute)
     */
    function proposeDistribution(
        address token,
        address[] memory recipients,
        uint256[] memory amounts,
        string memory reason
    ) external onlyPodManagers nonReentrant returns (uint256) {
        require(token != address(0), "Invalid token address");
        require(recipients.length > 0, "No recipients provided");
        require(recipients.length == amounts.length, "Arrays length mismatch");
        require(bytes(reason).length > 0, "Reason cannot be empty");

        uint256 proposalId = proposalCount++;
        Proposal storage proposal = proposals[proposalId];

        proposal.id = proposalId;
        proposal.proposalType = ProposalType.Distribution;
        proposal.status = ProposalStatus.Pending;
        proposal.proposer = msg.sender;
        proposal.createdAt = block.timestamp;
        proposal.token = token;
        proposal.recipients = recipients;
        proposal.amounts = amounts;
        proposal.reason = reason;

        activeProposalIds.push(proposalId);

        // Auto-approve for proposer
        proposal.hasApproved[msg.sender] = true;
        proposal.approvalCount = 1;

        emit ProposalCreated(proposalId, ProposalType.Distribution, msg.sender, block.timestamp);
        emit ProposalApproved(proposalId, msg.sender, 1, getRequiredApprovals());

        // Check if auto-executable (single manager case)
        if (proposal.approvalCount >= getRequiredApprovals()) {
            _executeDistributionProposal(proposalId);
        }

        return proposalId;
    }

    /**
     * @dev Approve a proposal (auto-executes when majority reached)
     */
    function approveProposal(uint256 proposalId) external onlyPodManagers nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Pending, "Proposal not pending");
        require(!proposal.hasApproved[msg.sender], "Already approved");

        proposal.hasApproved[msg.sender] = true;
        proposal.approvalCount++;

        uint256 required = getRequiredApprovals();

        emit ProposalApproved(proposalId, msg.sender, proposal.approvalCount, required);

        // Auto-execute when majority reached
        if (proposal.approvalCount >= required) {
            if (proposal.proposalType == ProposalType.Distribution) {
                _executeDistributionProposal(proposalId);
            } else if (proposal.proposalType == ProposalType.EmergencyWithdraw) {
                _executeEmergencyWithdrawProposal(proposalId);
            } else if (proposal.proposalType == ProposalType.AddToken) {
                _executeAddTokenProposal(proposalId);
            }
        }
    }

    /**
     * @dev Cancel a proposal (proposer only, before execution)
     */
    function cancelProposal(uint256 proposalId) external nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.proposer == msg.sender, "Only proposer can cancel");
        require(proposal.status == ProposalStatus.Pending, "Proposal not pending");

        proposal.status = ProposalStatus.Cancelled;
        _removeFromActiveProposals(proposalId);

        emit ProposalCancelled(proposalId, msg.sender, block.timestamp);
    }

    /**
     * @dev Get required number of approvals (simple majority)
     */
    function getRequiredApprovals() public view returns (uint256) {
        uint32 totalManagers = hatsContract.hatSupply(managementHatId);
        require(totalManagers > 0, "No managers exist");

        // Simple majority: more than 50%
        return (uint256(totalManagers) / 2) + 1;
    }

    /**
     * @dev Get proposal details
     */
    function getProposal(uint256 proposalId) external view returns (
        ProposalType proposalType,
        ProposalStatus status,
        address proposer,
        uint256 createdAt,
        uint256 approvalCount,
        uint256 requiredApprovals,
        address token,
        address[] memory recipients,
        uint256[] memory amounts,
        string memory reason
    ) {
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.proposalType,
            proposal.status,
            proposal.proposer,
            proposal.createdAt,
            proposal.approvalCount,
            getRequiredApprovals(),
            proposal.token,
            proposal.recipients,
            proposal.amounts,
            proposal.reason
        );
    }

    /**
     * @dev Get all active proposal IDs
     */
    function getActiveProposals() external view returns (uint256[] memory) {
        return activeProposalIds;
    }

    /**
     * @dev Check if address has approved a proposal
     */
    function hasApprovedProposal(uint256 proposalId, address approver) external view returns (bool) {
        return proposals[proposalId].hasApproved[approver];
    }

    // ============================================================================
    // INTERNAL PROPOSAL EXECUTION
    // ============================================================================

    function _executeDistributionProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Pending, "Proposal not pending");

        proposal.status = ProposalStatus.Executed;
        proposal.executedAt = block.timestamp;
        _removeFromActiveProposals(proposalId);

        uint256 totalAmount = 0;
        for (uint i = 0; i < proposal.amounts.length; i++) {
            totalAmount += proposal.amounts[i];
        }

        uint256 actualBalance = IERC20(proposal.token).balanceOf(address(this));
        require(actualBalance >= totalAmount, "Insufficient balance");

        tokenBalances[proposal.token] = actualBalance >= totalAmount ?
            (tokenBalances[proposal.token] >= totalAmount ? tokenBalances[proposal.token] - totalAmount : 0) :
            0;

        for (uint i = 0; i < proposal.recipients.length; i++) {
            IERC20(proposal.token).safeTransfer(proposal.recipients[i], proposal.amounts[i]);
            emit FundsDistributed(proposal.token, proposal.amounts[i], proposal.recipients[i], proposal.reason);
        }

        emit ProposalExecuted(proposalId, ProposalType.Distribution, block.timestamp);
    }

    function _executeEmergencyWithdrawProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Pending, "Proposal not pending");

        proposal.status = ProposalStatus.Executed;
        proposal.executedAt = block.timestamp;
        _removeFromActiveProposals(proposalId);

        uint256 actualBalance = IERC20(proposal.token).balanceOf(address(this));
        require(actualBalance >= proposal.emergencyAmount, "Insufficient balance");

        IERC20(proposal.token).safeTransfer(proposal.emergencyRecipient, proposal.emergencyAmount);

        tokenBalances[proposal.token] = actualBalance >= proposal.emergencyAmount ?
            (tokenBalances[proposal.token] >= proposal.emergencyAmount ? tokenBalances[proposal.token] - proposal.emergencyAmount : 0) :
            0;

        emit FundsDistributed(proposal.token, proposal.emergencyAmount, proposal.emergencyRecipient, "Emergency withdrawal (multi-sig approved)");
        emit ProposalExecuted(proposalId, ProposalType.EmergencyWithdraw, block.timestamp);
    }

    function _executeAddTokenProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Pending, "Proposal not pending");

        proposal.status = ProposalStatus.Executed;
        proposal.executedAt = block.timestamp;
        _removeFromActiveProposals(proposalId);

        supportedTokens.push(proposal.newToken);

        emit ProposalExecuted(proposalId, ProposalType.AddToken, block.timestamp);
    }

    function _removeFromActiveProposals(uint256 proposalId) internal {
        for (uint i = 0; i < activeProposalIds.length; i++) {
            if (activeProposalIds[i] == proposalId) {
                activeProposalIds[i] = activeProposalIds[activeProposalIds.length - 1];
                activeProposalIds.pop();
                break;
            }
        }
    }

    // ============================================================================
    // EXISTING FUNCTIONS - BACKWARD COMPATIBILITY
    // These work in testing mode or via proxy
    // ============================================================================

    function setAuthorizedProxy(address _proxy) external onlyPodManagers {
        authorizedProxy = _proxy;
        emit ProxyAuthorized(_proxy);
    }

    function receiveTokens(address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenBalances[token] += amount;

        emit FundsReceived(token, amount, msg.sender);
    }

    /**
     * @dev Direct distribution — callable by hat holders or the authorized proxy
     */
    function distributeTokens(
        address token,
        address[] memory recipients,
        uint256[] memory amounts,
        string memory reason
    ) external onlyPodManagersOrProxy nonReentrant {
        require(token != address(0), "Invalid token address");
        require(recipients.length > 0, "No recipients provided");
        require(recipients.length == amounts.length, "Arrays length mismatch");

        uint256 totalAmount = 0;
        for (uint i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }

        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        require(actualBalance >= totalAmount, "Insufficient balance");

        tokenBalances[token] = actualBalance >= totalAmount ?
            (tokenBalances[token] >= totalAmount ? tokenBalances[token] - totalAmount : 0) :
            0;

        for (uint i = 0; i < recipients.length; i++) {
            IERC20(token).safeTransfer(recipients[i], amounts[i]);
            emit FundsDistributed(token, amounts[i], recipients[i], reason);
        }
    }

    function distributeTokensEvenly(
        address token,
        address[] memory recipients,
        uint256 totalAmount,
        string memory reason
    ) external onlyPodManagersOrProxy nonReentrant {
        require(token != address(0), "Invalid token address");
        require(recipients.length > 0, "No recipients provided");
        require(totalAmount > 0, "Total amount must be greater than 0");

        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        require(actualBalance >= totalAmount, "Insufficient balance");

        uint256 amountPerRecipient = totalAmount / recipients.length;
        uint256 remainder = totalAmount % recipients.length;

        tokenBalances[token] = actualBalance >= totalAmount ?
            (tokenBalances[token] >= totalAmount ? tokenBalances[token] - totalAmount : 0) :
            0;

        for (uint i = 0; i < recipients.length; i++) {
            uint256 amount = amountPerRecipient;
            if (i == 0) {
                amount += remainder;
            }

            IERC20(token).safeTransfer(recipients[i], amount);
            emit FundsDistributed(token, amount, recipients[i], reason);
        }
    }

    function emergencyWithdraw(
        address token,
        address recipient,
        uint256 amount
    ) external onlyPodManagersOrProxy nonReentrant {
        require(token != address(0), "Invalid token address");
        require(recipient != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be greater than 0");

        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        require(actualBalance >= amount, "Insufficient balance");

        IERC20(token).safeTransfer(recipient, amount);

        tokenBalances[token] = actualBalance >= amount ?
            (tokenBalances[token] >= amount ? tokenBalances[token] - amount : 0) :
            0;

        emit FundsDistributed(token, amount, recipient, "Emergency withdrawal");
    }

    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function getInternalBalance(address token) external view returns (uint256) {
        return tokenBalances[token];
    }

    function syncTokenBalance(address token) external onlyPodManagers {
        require(token != address(0), "Invalid token address");
        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        tokenBalances[token] = actualBalance;
        emit FundsReceived(token, actualBalance, address(this));
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    function addSupportedToken(address token) external onlyPodManagers {
        require(token != address(0), "Invalid token address");

        for (uint i = 0; i < supportedTokens.length; i++) {
            require(supportedTokens[i] != token, "Token already supported");
        }

        supportedTokens.push(token);
    }

    function isPodManager(address account) external view returns (bool) {
        return hatsContract.balanceOf(account, managementHatId) > 0;
    }
}

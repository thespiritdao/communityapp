// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ZHatsProtocol {
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function hatSupply(uint256 hatId) external view returns (uint32);
}

/**
 * @title PodTreasuryV3
 * @dev Multi-sig treasury with configurable approval threshold (basis points).
 *      All value-moving actions by hat holders go through the proposal/voting
 *      flow; only an authorized proxy (server-orchestrated) may call the
 *      direct paths used by paymaster-sponsored flows.
 *
 * Floor of 50%+1 enforced on every threshold change. Required approvals are
 * computed at execution time (not snapshotted at creation) so changes to
 * hat supply or threshold during a proposal's lifetime are respected.
 */
contract PodTreasuryV3 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant THRESHOLD_FLOOR_BPS = 5001;
    uint256 public constant THRESHOLD_CEILING_BPS = 10000;

    ZHatsProtocol public immutable hatsContract;
    uint256 public immutable managementHatId;
    address public immutable bountyManager;
    string public podId;
    address public authorizedProxy;
    uint256 public thresholdBps;

    mapping(address => uint256) public tokenBalances;
    address[] public supportedTokens;

    enum ProposalType {
        Distribution,
        EmergencyWithdraw,
        AddToken,
        ThresholdChange,
        SetProxy,
        RevokeBountyApproval
    }

    enum ProposalStatus {
        Pending,
        Executed,
        Cancelled
    }

    struct Proposal {
        uint256 id;
        ProposalType proposalType;
        ProposalStatus status;
        address proposer;
        uint256 createdAt;
        uint256 executedAt;

        address token;
        address[] recipients;
        uint256[] amounts;
        string reason;

        address emergencyRecipient;
        uint256 emergencyAmount;

        address newToken;

        uint256 newThresholdBps;

        address newProxy;

        uint256 approvalCount;
        mapping(address => bool) hasApproved;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    uint256[] public activeProposalIds;

    event FundsReceived(address indexed token, uint256 amount, address from);
    event FundsDistributed(address indexed token, uint256 amount, address to, string reason);
    event ProxyAuthorized(address indexed proxy);
    event ThresholdChanged(uint256 oldBps, uint256 newBps);
    event BountyApprovalRevoked(address indexed token);
    event BalanceSynced(address indexed token, uint256 oldBalance, uint256 newBalance);

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

    modifier onlyPodManagers() {
        require(
            hatsContract.balanceOf(msg.sender, managementHatId) > 0,
            "Only pod managers"
        );
        _;
    }

    modifier onlyAuthorizedProxy() {
        require(
            authorizedProxy != address(0) && msg.sender == authorizedProxy,
            "Only authorized proxy"
        );
        _;
    }

    constructor(
        address _hatsContract,
        uint256 _managementHatId,
        string memory _podId,
        address[] memory _supportedTokens,
        address _authorizedProxy,
        address _bountyManager,
        uint256 _initialThresholdBps
    ) ReentrancyGuard() {
        require(_hatsContract != address(0), "Invalid hats contract");
        require(_managementHatId > 0, "Invalid management hat ID");
        require(bytes(_podId).length > 0, "Pod ID cannot be empty");
        require(
            _initialThresholdBps >= THRESHOLD_FLOOR_BPS &&
            _initialThresholdBps <= THRESHOLD_CEILING_BPS,
            "Threshold out of range"
        );

        hatsContract = ZHatsProtocol(_hatsContract);
        managementHatId = _managementHatId;
        podId = _podId;
        authorizedProxy = _authorizedProxy;
        bountyManager = _bountyManager;
        thresholdBps = _initialThresholdBps;

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
    // PROPOSAL CREATION
    // ============================================================================

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

        uint256 proposalId = _createProposal(ProposalType.Distribution);
        Proposal storage proposal = proposals[proposalId];
        proposal.token = token;
        proposal.recipients = recipients;
        proposal.amounts = amounts;
        proposal.reason = reason;

        _maybeAutoExecute(proposalId);
        return proposalId;
    }

    function proposeEmergencyWithdraw(
        address token,
        address recipient,
        uint256 amount
    ) external onlyPodManagers nonReentrant returns (uint256) {
        require(token != address(0), "Invalid token address");
        require(recipient != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be greater than 0");

        uint256 proposalId = _createProposal(ProposalType.EmergencyWithdraw);
        Proposal storage proposal = proposals[proposalId];
        proposal.token = token;
        proposal.emergencyRecipient = recipient;
        proposal.emergencyAmount = amount;

        _maybeAutoExecute(proposalId);
        return proposalId;
    }

    function proposeAddToken(address newToken) external onlyPodManagers nonReentrant returns (uint256) {
        require(newToken != address(0), "Invalid token address");
        for (uint i = 0; i < supportedTokens.length; i++) {
            require(supportedTokens[i] != newToken, "Token already supported");
        }

        uint256 proposalId = _createProposal(ProposalType.AddToken);
        proposals[proposalId].newToken = newToken;

        _maybeAutoExecute(proposalId);
        return proposalId;
    }

    function proposeThresholdChange(uint256 newThresholdBps)
        external
        onlyPodManagers
        nonReentrant
        returns (uint256)
    {
        require(
            newThresholdBps >= THRESHOLD_FLOOR_BPS &&
            newThresholdBps <= THRESHOLD_CEILING_BPS,
            "Threshold out of range"
        );
        require(newThresholdBps != thresholdBps, "No change");

        uint256 proposalId = _createProposal(ProposalType.ThresholdChange);
        proposals[proposalId].newThresholdBps = newThresholdBps;

        _maybeAutoExecute(proposalId);
        return proposalId;
    }

    function proposeSetProxy(address newProxy)
        external
        onlyPodManagers
        nonReentrant
        returns (uint256)
    {
        require(newProxy != address(0), "Invalid proxy");
        require(newProxy != authorizedProxy, "No change");

        uint256 proposalId = _createProposal(ProposalType.SetProxy);
        proposals[proposalId].newProxy = newProxy;

        _maybeAutoExecute(proposalId);
        return proposalId;
    }

    function proposeRevokeBountyApproval(address token)
        external
        onlyPodManagers
        nonReentrant
        returns (uint256)
    {
        require(token != address(0), "Invalid token address");
        require(bountyManager != address(0), "No bounty manager set");

        uint256 proposalId = _createProposal(ProposalType.RevokeBountyApproval);
        proposals[proposalId].token = token;

        _maybeAutoExecute(proposalId);
        return proposalId;
    }

    // ============================================================================
    // APPROVAL / CANCEL
    // ============================================================================

    function approveProposal(uint256 proposalId) external onlyPodManagers nonReentrant {
        require(proposalId < proposalCount, "Invalid proposal");
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Pending, "Proposal not pending");
        require(!proposal.hasApproved[msg.sender], "Already approved");

        proposal.hasApproved[msg.sender] = true;
        proposal.approvalCount++;

        uint256 required = getRequiredApprovals();
        emit ProposalApproved(proposalId, msg.sender, proposal.approvalCount, required);

        if (proposal.approvalCount >= required) {
            _executeProposal(proposalId);
        }
    }

    function cancelProposal(uint256 proposalId) external onlyPodManagers nonReentrant {
        require(proposalId < proposalCount, "Invalid proposal");
        Proposal storage proposal = proposals[proposalId];
        require(proposal.proposer == msg.sender, "Only proposer can cancel");
        require(proposal.status == ProposalStatus.Pending, "Proposal not pending");

        proposal.status = ProposalStatus.Cancelled;
        _removeFromActiveProposals(proposalId);

        emit ProposalCancelled(proposalId, msg.sender, block.timestamp);
    }

    // ============================================================================
    // THRESHOLD MATH
    // ============================================================================

    function getRequiredApprovals() public view returns (uint256) {
        return _computeRequiredApprovals(thresholdBps);
    }

    function _computeRequiredApprovals(uint256 _thresholdBps) internal view returns (uint256) {
        uint32 totalManagers = hatsContract.hatSupply(managementHatId);
        require(totalManagers > 0, "No managers exist");

        uint256 required = (uint256(totalManagers) * _thresholdBps + 9999) / 10000;
        uint256 majorityFloor = (uint256(totalManagers) / 2) + 1;
        if (required < majorityFloor) {
            required = majorityFloor;
        }
        if (required > totalManagers) {
            required = totalManagers;
        }
        return required;
    }

    // ============================================================================
    // INTERNAL PROPOSAL MACHINERY
    // ============================================================================

    function _createProposal(ProposalType pType) internal returns (uint256) {
        uint256 proposalId = proposalCount++;
        Proposal storage proposal = proposals[proposalId];

        proposal.id = proposalId;
        proposal.proposalType = pType;
        proposal.status = ProposalStatus.Pending;
        proposal.proposer = msg.sender;
        proposal.createdAt = block.timestamp;
        proposal.hasApproved[msg.sender] = true;
        proposal.approvalCount = 1;

        activeProposalIds.push(proposalId);

        uint256 required = getRequiredApprovals();
        emit ProposalCreated(proposalId, pType, msg.sender, block.timestamp);
        emit ProposalApproved(proposalId, msg.sender, 1, required);

        return proposalId;
    }

    function _maybeAutoExecute(uint256 proposalId) internal {
        if (proposals[proposalId].approvalCount >= getRequiredApprovals()) {
            _executeProposal(proposalId);
        }
    }

    function _executeProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Pending, "Proposal not pending");
        require(proposal.approvalCount >= getRequiredApprovals(), "Below current threshold");

        if (proposal.proposalType == ProposalType.Distribution) {
            _executeDistributionProposal(proposalId);
        } else if (proposal.proposalType == ProposalType.EmergencyWithdraw) {
            _executeEmergencyWithdrawProposal(proposalId);
        } else if (proposal.proposalType == ProposalType.AddToken) {
            _executeAddTokenProposal(proposalId);
        } else if (proposal.proposalType == ProposalType.ThresholdChange) {
            _executeThresholdChangeProposal(proposalId);
        } else if (proposal.proposalType == ProposalType.SetProxy) {
            _executeSetProxyProposal(proposalId);
        } else if (proposal.proposalType == ProposalType.RevokeBountyApproval) {
            _executeRevokeBountyApprovalProposal(proposalId);
        }
    }

    function _executeDistributionProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];

        proposal.status = ProposalStatus.Executed;
        proposal.executedAt = block.timestamp;
        _removeFromActiveProposals(proposalId);

        uint256 totalAmount = 0;
        for (uint i = 0; i < proposal.amounts.length; i++) {
            totalAmount += proposal.amounts[i];
        }

        uint256 actualBalance = IERC20(proposal.token).balanceOf(address(this));
        require(actualBalance >= totalAmount, "Insufficient balance");

        tokenBalances[proposal.token] = tokenBalances[proposal.token] >= totalAmount
            ? tokenBalances[proposal.token] - totalAmount
            : 0;

        for (uint i = 0; i < proposal.recipients.length; i++) {
            IERC20(proposal.token).safeTransfer(proposal.recipients[i], proposal.amounts[i]);
            emit FundsDistributed(proposal.token, proposal.amounts[i], proposal.recipients[i], proposal.reason);
        }

        emit ProposalExecuted(proposalId, ProposalType.Distribution, block.timestamp);
    }

    function _executeEmergencyWithdrawProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];

        proposal.status = ProposalStatus.Executed;
        proposal.executedAt = block.timestamp;
        _removeFromActiveProposals(proposalId);

        uint256 actualBalance = IERC20(proposal.token).balanceOf(address(this));
        require(actualBalance >= proposal.emergencyAmount, "Insufficient balance");

        IERC20(proposal.token).safeTransfer(proposal.emergencyRecipient, proposal.emergencyAmount);

        tokenBalances[proposal.token] = tokenBalances[proposal.token] >= proposal.emergencyAmount
            ? tokenBalances[proposal.token] - proposal.emergencyAmount
            : 0;

        emit FundsDistributed(proposal.token, proposal.emergencyAmount, proposal.emergencyRecipient, "Emergency withdrawal (multi-sig approved)");
        emit ProposalExecuted(proposalId, ProposalType.EmergencyWithdraw, block.timestamp);
    }

    function _executeAddTokenProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];

        proposal.status = ProposalStatus.Executed;
        proposal.executedAt = block.timestamp;
        _removeFromActiveProposals(proposalId);

        supportedTokens.push(proposal.newToken);
        if (bountyManager != address(0)) {
            IERC20(proposal.newToken).approve(bountyManager, type(uint256).max);
        }

        emit ProposalExecuted(proposalId, ProposalType.AddToken, block.timestamp);
    }

    function _executeThresholdChangeProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];

        proposal.status = ProposalStatus.Executed;
        proposal.executedAt = block.timestamp;
        _removeFromActiveProposals(proposalId);

        uint256 oldBps = thresholdBps;
        thresholdBps = proposal.newThresholdBps;

        emit ThresholdChanged(oldBps, proposal.newThresholdBps);
        emit ProposalExecuted(proposalId, ProposalType.ThresholdChange, block.timestamp);
    }

    function _executeSetProxyProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];

        proposal.status = ProposalStatus.Executed;
        proposal.executedAt = block.timestamp;
        _removeFromActiveProposals(proposalId);

        authorizedProxy = proposal.newProxy;

        emit ProxyAuthorized(proposal.newProxy);
        emit ProposalExecuted(proposalId, ProposalType.SetProxy, block.timestamp);
    }

    function _executeRevokeBountyApprovalProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];

        proposal.status = ProposalStatus.Executed;
        proposal.executedAt = block.timestamp;
        _removeFromActiveProposals(proposalId);

        IERC20(proposal.token).approve(bountyManager, 0);

        emit BountyApprovalRevoked(proposal.token);
        emit ProposalExecuted(proposalId, ProposalType.RevokeBountyApproval, block.timestamp);
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
    // VIEW FUNCTIONS
    // ============================================================================

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
        string memory reason,
        uint256 newThresholdBps,
        address newProxy
    ) {
        require(proposalId < proposalCount, "Invalid proposal");
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
            proposal.reason,
            proposal.newThresholdBps,
            proposal.newProxy
        );
    }

    function getActiveProposals() external view returns (uint256[] memory) {
        return activeProposalIds;
    }

    function hasApprovedProposal(uint256 proposalId, address approver) external view returns (bool) {
        return proposals[proposalId].hasApproved[approver];
    }

    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function getInternalBalance(address token) external view returns (uint256) {
        return tokenBalances[token];
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    function isPodManager(address account) external view returns (bool) {
        return hatsContract.balanceOf(account, managementHatId) > 0;
    }

    // ============================================================================
    // PROXY-ONLY DIRECT PATHS
    // Used by paymaster-sponsored server flows that bundle distributions
    // server-side. Manager-initiated value movements must use proposals.
    // ============================================================================

    function receiveTokens(address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenBalances[token] += amount;

        emit FundsReceived(token, amount, msg.sender);
    }

    function distributeTokens(
        address token,
        address[] memory recipients,
        uint256[] memory amounts,
        string memory reason
    ) external onlyAuthorizedProxy nonReentrant {
        require(token != address(0), "Invalid token address");
        require(recipients.length > 0, "No recipients provided");
        require(recipients.length == amounts.length, "Arrays length mismatch");

        uint256 totalAmount = 0;
        for (uint i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }

        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        require(actualBalance >= totalAmount, "Insufficient balance");

        tokenBalances[token] = tokenBalances[token] >= totalAmount
            ? tokenBalances[token] - totalAmount
            : 0;

        for (uint i = 0; i < recipients.length; i++) {
            IERC20(token).safeTransfer(recipients[i], amounts[i]);
            emit FundsDistributed(token, amounts[i], recipients[i], reason);
        }
    }

    function syncTokenBalance(address token) external onlyAuthorizedProxy {
        require(token != address(0), "Invalid token address");
        uint256 oldBalance = tokenBalances[token];
        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        tokenBalances[token] = actualBalance;
        emit BalanceSynced(token, oldBalance, actualBalance);
    }
}

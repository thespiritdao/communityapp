// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IHats {
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

interface IPodTreasury {
    function distributeTokens(
        address token,
        address[] memory recipients,
        uint256[] memory amounts,
        string memory reason
    ) external;
    
    function distributeTokensEvenly(
        address token,
        address[] memory recipients,
        uint256 totalAmount,
        string memory reason
    ) external;
    
    function receiveTokens(address token, uint256 amount) external;
    
    function emergencyWithdraw(
        address token,
        address recipient,
        uint256 amount
    ) external;
    
    function addSupportedToken(address token) external;

    function syncTokenBalance(address token) external;

    function setAuthorizedProxy(address proxy) external;

    function managementHatId() external view returns (uint256);
    function hatsContract() external view returns (address);

    // NEW: Voting/Proposal functions
    function proposeDistribution(
        address token,
        address[] memory recipients,
        uint256[] memory amounts,
        string memory reason
    ) external returns (uint256);

    function approveProposal(uint256 proposalId) external;

    function cancelProposal(uint256 proposalId) external;

    function getRequiredApprovals() external view returns (uint256);

    function hasApprovedProposal(uint256 proposalId, address approver) external view returns (bool);
}

interface IPodTreasuryFactory {
    function getTreasuryForPod(string memory podId) external view returns (address);
    function isPodTreasuryDeployed(string memory podId) external view returns (bool);
}

/**
 * @title TreasuryProxy
 * @dev Proxy contract for all pod treasury operations
 * 
 * This contract acts as a single entry point for all treasury operations,
 * solving the Coinbase Smart Wallet sponsorship whitelist scaling issue.
 * Only this contract needs to be whitelisted, not individual treasuries.
 */
contract TreasuryProxy is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    IPodTreasuryFactory public treasuryFactory; // Now mutable
    
    event ProxyDistributeTokens(
        string indexed podId,
        address indexed treasury,
        address indexed token,
        address[] recipients,
        uint256[] amounts,
        string reason,
        address executor
    );
    
    event ProxyDistributeTokensEvenly(
        string indexed podId,
        address indexed treasury,
        address indexed token,
        address[] recipients,
        uint256 totalAmount,
        string reason,
        address executor
    );
    
    event ProxyReceiveTokens(
        string indexed podId,
        address indexed treasury,
        address indexed token,
        uint256 amount,
        address executor
    );
    
    event ProxyEmergencyWithdraw(
        string indexed podId,
        address indexed treasury,
        address indexed token,
        address recipient,
        uint256 amount,
        address executor
    );
    
    event TreasuryFactoryUpdated(
        address indexed oldFactory,
        address indexed newFactory,
        address updater
    );
    
    constructor(address _treasuryFactory, address _owner) Ownable(_owner) {
        require(_treasuryFactory != address(0), "Invalid treasury factory");
        treasuryFactory = IPodTreasuryFactory(_treasuryFactory);
    }
    
    /**
     * @dev Validates treasury exists for pod (authorization is handled by treasury contract)
     */
    modifier validPodTreasury(string memory podId) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        require(treasury != address(0), "Treasury not found for pod");
        _;
    }
    
    /**
     * @dev Proxy function for treasury token distribution
     * Authorization handled by treasury contract directly
     */
    function proxyDistributeTokens(
        string memory podId,
        address token,
        address[] memory recipients,
        uint256[] memory amounts,
        string memory reason
    ) external nonReentrant validPodTreasury(podId) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        
        // Forward the call to the actual treasury
        IPodTreasury(treasury).distributeTokens(token, recipients, amounts, reason);
        
        emit ProxyDistributeTokens(podId, treasury, token, recipients, amounts, reason, msg.sender);
    }
    
    /**
     * @dev Proxy function for equal token distribution
     * Authorization handled by treasury contract directly
     */
    function proxyDistributeTokensEvenly(
        string memory podId,
        address token,
        address[] memory recipients,
        uint256 totalAmount,
        string memory reason
    ) external nonReentrant validPodTreasury(podId) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        
        // Forward the call to the actual treasury
        IPodTreasury(treasury).distributeTokensEvenly(token, recipients, totalAmount, reason);
        
        emit ProxyDistributeTokensEvenly(podId, treasury, token, recipients, totalAmount, reason, msg.sender);
    }
    
    /**
     * @dev Proxy function for receiving tokens into treasury
     */
    function proxyReceiveTokens(
        string memory podId,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(treasuryFactory.isPodTreasuryDeployed(podId), "Treasury not deployed for pod");
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        
        // Transfer tokens from sender to this proxy first
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Approve treasury to spend the tokens
        IERC20(token).safeIncreaseAllowance(treasury, amount);
        
        // Forward the call to the actual treasury
        IPodTreasury(treasury).receiveTokens(token, amount);
        
        emit ProxyReceiveTokens(podId, treasury, token, amount, msg.sender);
    }
    
    /**
     * @dev Proxy function for emergency withdrawal
     * Authorization handled by treasury contract directly
     */
    function proxyEmergencyWithdraw(
        string memory podId,
        address token,
        address recipient,
        uint256 amount
    ) external nonReentrant validPodTreasury(podId) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        
        // Forward the call to the actual treasury
        IPodTreasury(treasury).emergencyWithdraw(token, recipient, amount);
        
        emit ProxyEmergencyWithdraw(podId, treasury, token, recipient, amount, msg.sender);
    }
    
    /**
     * @dev Proxy function for adding supported tokens
     * Authorization handled by treasury contract directly
     */
    function proxyAddSupportedToken(
        string memory podId,
        address token
    ) external nonReentrant validPodTreasury(podId) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        
        // Forward the call to the actual treasury
        IPodTreasury(treasury).addSupportedToken(token);
    }
    
    /**
     * @dev Proxy function for syncing token balances
     * Authorization handled by treasury contract directly
     */
    function proxySyncTokenBalance(
        string memory podId,
        address token
    ) external nonReentrant validPodTreasury(podId) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        
        // Forward the call to the actual treasury
        IPodTreasury(treasury).syncTokenBalance(token);
    }
    
    /**
     * @dev Proxy function for setting authorized proxy (CRITICAL FOR BOOTSTRAPPING)
     * This solves the chicken-and-egg problem: we need to authorize the proxy through the proxy
     * Authorization handled by treasury contract directly
     */
    function proxySetAuthorizedProxy(
        string memory podId,
        address proxyAddress
    ) external nonReentrant validPodTreasury(podId) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        
        // Forward the call to the actual treasury
        IPodTreasury(treasury).setAuthorizedProxy(proxyAddress);
    }
    
    /**
     * @dev Proxy function for single-recipient token distribution (SPONSORSHIP OPTIMIZED)
     * Mirrors the working proxyReceiveTokens pattern with simple arguments
     * Authorization handled by treasury contract directly
     */
    function proxyDistributeSingle(
        string memory podId,
        address token,
        address recipient,
        uint256 amount,
        string memory reason
    ) external nonReentrant validPodTreasury(podId) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        
        // Create arrays for the existing distributeTokens function
        address[] memory recipients = new address[](1);
        recipients[0] = recipient;
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        
        // Forward the call to the actual treasury
        IPodTreasury(treasury).distributeTokens(token, recipients, amounts, reason);
        
        emit ProxyDistributeTokens(podId, treasury, token, recipients, amounts, reason, msg.sender);
    }
    
    /**
     * @dev Get treasury address for a pod
     */
    function getTreasuryForPod(string memory podId) external view returns (address) {
        return treasuryFactory.getTreasuryForPod(podId);
    }
    
    /**
     * @dev Check if treasury is deployed for pod
     */
    function isPodTreasuryDeployed(string memory podId) external view returns (bool) {
        return treasuryFactory.isPodTreasuryDeployed(podId);
    }
    
    /**
     * @dev Update the treasury factory reference (owner only)
     * This allows updating the factory reference after deployment
     */
    function updateTreasuryFactory(address _newFactory) external onlyOwner {
        require(_newFactory != address(0), "Invalid factory address");
        address oldFactory = address(treasuryFactory);
        treasuryFactory = IPodTreasuryFactory(_newFactory);
        emit TreasuryFactoryUpdated(oldFactory, _newFactory, msg.sender);
    }
    
    /**
     * @dev Emergency function to recover stuck tokens (owner only)
     */
    function emergencyRecoverTokens(
        address token,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(recipient, amount);
    }

    // ============================================================================
    // NEW: PROPOSAL SYSTEM PROXY FUNCTIONS (Multi-Sig Support)
    // ============================================================================

    /**
     * @dev Proxy function for proposing a distribution (requires majority approval)
     */
    function proxyProposeDistribution(
        string memory podId,
        address token,
        address[] memory recipients,
        uint256[] memory amounts,
        string memory reason
    ) external nonReentrant validPodTreasury(podId) returns (uint256) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);

        // Forward the call to the actual treasury
        uint256 proposalId = IPodTreasury(treasury).proposeDistribution(token, recipients, amounts, reason);

        return proposalId;
    }

    /**
     * @dev Proxy function for approving a proposal
     */
    function proxyApproveProposal(
        string memory podId,
        uint256 proposalId
    ) external nonReentrant validPodTreasury(podId) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);

        // Forward the call to the actual treasury
        IPodTreasury(treasury).approveProposal(proposalId);
    }

    /**
     * @dev Proxy function for cancelling a proposal
     */
    function proxyCancelProposal(
        string memory podId,
        uint256 proposalId
    ) external nonReentrant validPodTreasury(podId) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);

        // Forward the call to the actual treasury
        IPodTreasury(treasury).cancelProposal(proposalId);
    }

    /**
     * @dev Get required approvals for a pod's treasury
     */
    function getRequiredApprovalsForPod(string memory podId) external view returns (uint256) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        require(treasury != address(0), "Treasury not found for pod");

        return IPodTreasury(treasury).getRequiredApprovals();
    }

    /**
     * @dev Check if address has approved a proposal
     */
    function hasApprovedProposalForPod(
        string memory podId,
        uint256 proposalId,
        address approver
    ) external view returns (bool) {
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        require(treasury != address(0), "Treasury not found for pod");

        return IPodTreasury(treasury).hasApprovedProposal(proposalId, approver);
    }
}

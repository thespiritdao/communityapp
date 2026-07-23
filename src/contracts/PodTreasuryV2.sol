// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ⚠️ DEPRECATED / RETIRED (2026-07-22) — DO NOT DEPLOY.
// Legacy single-signer treasury, superseded by PodTreasuryV3 (multi-sig proposal
// flow). No live pod uses this and no app code imports it. The old
// "TODO: change to multi-signature" is resolved by using V3, not by patching V2.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IHats {
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

/**
 * @title PodTreasuryV2
 * @dev Enhanced treasury contract with proxy support
 * 
 * Key Changes:
 * - Added authorizedProxy address
 * - New modifier onlyPodManagersOrProxy for proxy calls
 * - Separate functions for proxy calls that validate original user
 */
contract PodTreasuryV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    IHats public immutable hatsContract;
    uint256 public immutable managementHatId;
    string public podId;
    address public authorizedProxy; // New: authorized proxy contract
    
    mapping(address => uint256) public tokenBalances;
    address[] public supportedTokens;
    
    event FundsReceived(address indexed token, uint256 amount, address from);
    event FundsDistributed(address indexed token, uint256 amount, address to, string reason);
    event ProxyAuthorized(address indexed proxy);
    
    // TODO: PRODUCTION SECURITY - Change to multi-signature (3+ signers)
    // Currently using single signer for testing purposes
    // In production, treasury operations should require multiple pod leader signatures
    modifier onlyPodManagers() {
        require(
            hatsContract.balanceOf(msg.sender, managementHatId) > 0,
            "Only pod managers can execute"
        );
        _;
    }
    
    // New modifier for proxy-compatible operations
    modifier onlyPodManagersOrProxy() {
        require(
            hatsContract.balanceOf(msg.sender, managementHatId) > 0 || 
            (authorizedProxy != address(0) && msg.sender == authorizedProxy),
            "Only pod managers or authorized proxy can execute"
        );
        _;
    }
    
    constructor(
        address _hatsContract,
        uint256 _managementHatId,
        string memory _podId,
        address[] memory _supportedTokens,
        address _authorizedProxy // New parameter (kept for backwards compatibility but not needed)
    ) ReentrancyGuard() {
        require(_hatsContract != address(0), "Invalid hats contract");
        require(_managementHatId > 0, "Invalid management hat ID");
        require(bytes(_podId).length > 0, "Pod ID cannot be empty");
        
        hatsContract = IHats(_hatsContract);
        managementHatId = _managementHatId;
        podId = _podId;
        authorizedProxy = _authorizedProxy; // Kept for backwards compatibility
        
        // Initialize supported tokens array
        for (uint i = 0; i < _supportedTokens.length; i++) {
            require(_supportedTokens[i] != address(0), "Invalid token address");
            supportedTokens.push(_supportedTokens[i]);
        }
        
        if (_authorizedProxy != address(0)) {
            emit ProxyAuthorized(_authorizedProxy);
        }
    }
    
    /**
     * @dev Update authorized proxy (pod managers only)
     */
    function setAuthorizedProxy(address _proxy) external onlyPodManagers {
        authorizedProxy = _proxy;
        emit ProxyAuthorized(_proxy);
    }
    
    /**
     * @dev Receive tokens into the treasury
     * Anyone can deposit tokens, but only pod managers can distribute them
     */
    function receiveTokens(address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenBalances[token] += amount;
        
        emit FundsReceived(token, amount, msg.sender);
    }
    
    /**
     * @dev Distribute tokens to multiple recipients (pod managers or authorized proxy)
     * Smart Wallet compatible - checks msg.sender for HAT authorization or proxy authorization
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
        require(bytes(reason).length > 0, "Reason cannot be empty");
        
        uint256 totalAmount = 0;
        for (uint i = 0; i < amounts.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient address");
            require(amounts[i] > 0, "Amount must be greater than 0");
            totalAmount += amounts[i];
        }
        
        // Use actual ERC20 balance instead of just internal accounting
        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        require(actualBalance >= totalAmount, "Insufficient balance");
        
        // Sync internal accounting with actual balance after distribution
        tokenBalances[token] = actualBalance >= totalAmount ? 
            (tokenBalances[token] >= totalAmount ? tokenBalances[token] - totalAmount : 0) :
            0;
        
        for (uint i = 0; i < recipients.length; i++) {
            IERC20(token).safeTransfer(recipients[i], amounts[i]);
            emit FundsDistributed(token, amounts[i], recipients[i], reason);
        }
    }
    
    /**
     * @dev Distribute tokens equally to multiple recipients (pod managers or authorized proxy)
     * Smart Wallet compatible - checks msg.sender for HAT authorization or proxy authorization
     */
    function distributeTokensEvenly(
        address token,
        address[] memory recipients,
        uint256 totalAmount,
        string memory reason
    ) external onlyPodManagersOrProxy nonReentrant {
        require(token != address(0), "Invalid token address");
        require(recipients.length > 0, "No recipients provided");
        require(totalAmount > 0, "Total amount must be greater than 0");
        require(bytes(reason).length > 0, "Reason cannot be empty");
        
        // Use actual ERC20 balance instead of just internal accounting
        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        require(actualBalance >= totalAmount, "Insufficient balance");
        
        uint256 amountPerRecipient = totalAmount / recipients.length;
        uint256 remainder = totalAmount % recipients.length;
        
        // Sync internal accounting with actual balance after distribution
        tokenBalances[token] = actualBalance >= totalAmount ? 
            (tokenBalances[token] >= totalAmount ? tokenBalances[token] - totalAmount : 0) :
            0;
        
        for (uint i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient address");
            
            uint256 amount = amountPerRecipient;
            // Give remainder to the first recipient
            if (i == 0) {
                amount += remainder;
            }
            
            IERC20(token).safeTransfer(recipients[i], amount);
            emit FundsDistributed(token, amount, recipients[i], reason);
        }
    }
    
    /**
     * @dev Get token balance held by treasury (uses actual ERC20 balance)
     */
    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
    
    /**
     * @dev Get internal accounting balance (for debugging)
     */
    function getInternalBalance(address token) external view returns (uint256) {
        return tokenBalances[token];
    }
    
    /**
     * @dev Sync internal accounting with actual ERC20 balance
     */
    function syncTokenBalance(address token) external onlyPodManagers {
        require(token != address(0), "Invalid token address");
        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        tokenBalances[token] = actualBalance;
        emit FundsReceived(token, actualBalance, address(this));
    }
    
    /**
     * @dev Get all supported token addresses
     */
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }
    
    /**
     * @dev Add supported token (pod managers only)
     */
    function addSupportedToken(address token) external onlyPodManagers {
        require(token != address(0), "Invalid token address");
        
        // Check if token already exists
        for (uint i = 0; i < supportedTokens.length; i++) {
            require(supportedTokens[i] != token, "Token already supported");
        }
        
        supportedTokens.push(token);
    }
    
    /**
     * @dev Check if address is a pod manager
     */
    function isPodManager(address account) external view returns (bool) {
        return hatsContract.balanceOf(account, managementHatId) > 0;
    }
    
    /**
     * @dev Emergency withdrawal function (pod managers or authorized proxy)
     * Smart Wallet compatible - checks msg.sender for HAT authorization or proxy authorization
     */
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
        
        // Update internal accounting
        tokenBalances[token] = actualBalance >= amount ? 
            (tokenBalances[token] >= amount ? tokenBalances[token] - amount : 0) :
            0;
            
        emit FundsDistributed(token, amount, recipient, "Emergency withdrawal");
    }
}

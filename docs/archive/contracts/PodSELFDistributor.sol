// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ⚠️ DEPRECATED / RETIRED (2026-07-22) — DO NOT USE OR REDEPLOY.
// Superseded by SelfMinter.mintBatch for all live $SELF issuance. This contract
// has ZERO app callsites, is NOT on the Coinbase paymaster whitelist, and its
// proxy branch uses tx.origin (audit SELF-V2-001 / H-1 — a phishing anti-pattern,
// harmless here only because it is dead). Kept for on-chain reference of the
// already-deployed 0x8a80eC4e... address; no new integration should target it.

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IHats {
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

interface IPodTreasuryFactory {
    function getTreasuryForPod(string memory podId) external view returns (address);
    function isPodTreasuryDeployed(string memory podId) external view returns (bool);
}

interface IPodTreasury {
    function managementHatId() external view returns (uint256);
    function hatsContract() external view returns (address);
}

interface ISELFToken {
    // Standard ERC20 functions
    function balanceOf(address account) external view returns (uint256);
    
    // Special distribution functions (if available)
    function mint(address to, uint256 amount) external;
    function distribute(address to, uint256 amount, uint256 expiry) external;
    function transfer(address to, uint256 amount) external returns (bool);
    
    // Admin functions (if available)
    function setDistributor(address distributor, bool authorized) external;
}

/**
 * @title PodSELFDistributor
 * @dev Specialized contract for distributing non-transferable SELF tokens
 * 
 * This contract handles SELF token distribution for pods, supporting:
 * - Time-bound distributions for events
 * - Pod manager permission validation
 * - Sponsored transactions via Treasury Proxy
 * - Multiple distribution mechanisms (mint, special transfer, etc.)
 */
contract PodSELFDistributor is Ownable, ReentrancyGuard {
    
    IPodTreasuryFactory public treasuryFactory;
    ISELFToken public immutable selfToken;
    address public authorizedProxy; // Treasury proxy for sponsored transactions
    
    // Distribution tracking
    struct Distribution {
        string podId;
        address recipient;
        uint256 amount;
        uint256 timestamp;
        uint256 expiry; // 0 for no expiry
        string reason;
        address distributor;
    }
    
    mapping(bytes32 => Distribution) public distributions;
    mapping(string => uint256) public podDistributionCount;
    mapping(address => uint256) public userDistributionCount;
    
    // Events
    event SELFDistributed(
        bytes32 indexed distributionId,
        string indexed podId,
        address indexed recipient,
        uint256 amount,
        uint256 expiry,
        string reason,
        address distributor
    );
    
    event SELFBatchDistributed(
        string indexed podId,
        uint256 recipientCount,
        uint256 totalAmount,
        uint256 expiry,
        string reason,
        address distributor
    );
    
    event ProxyAuthorized(address indexed proxy);
    event DistributionMethodUpdated(string method);
    event TreasuryFactoryUpdated(address indexed oldFactory, address indexed newFactory);
    
    // Distribution method configuration
    enum DistributionMethod {
        MINT,           // Use mint function
        TRANSFER,       // Use standard transfer (if allowed)
        SPECIAL_DIST    // Use special distribute function
    }
    
    DistributionMethod public distributionMethod = DistributionMethod.TRANSFER;
    
    /**
     * @dev Validates caller has management permissions for the pod
     */
    modifier onlyPodManagerOrProxy(string memory podId) {
        if (msg.sender == authorizedProxy) {
            // Proxy call - validate tx.origin has pod management permissions
            require(_validatePodManager(podId, tx.origin), "Only pod managers can distribute SELF tokens");
        } else {
            // Direct call - validate msg.sender has pod management permissions
            require(_validatePodManager(podId, msg.sender), "Only pod managers can distribute SELF tokens");
        }
        _;
    }
    
    constructor(
        address _treasuryFactory,
        address _selfToken,
        address _owner,
        address _authorizedProxy
    ) Ownable(_owner) {
        require(_treasuryFactory != address(0), "Invalid treasury factory");
        require(_selfToken != address(0), "Invalid SELF token address");
        
        treasuryFactory = IPodTreasuryFactory(_treasuryFactory);
        selfToken = ISELFToken(_selfToken);
        authorizedProxy = _authorizedProxy;
        
        if (_authorizedProxy != address(0)) {
            emit ProxyAuthorized(_authorizedProxy);
        }
    }
    
    /**
     * @dev Set authorized proxy (owner only)
     */
    function setAuthorizedProxy(address _proxy) external onlyOwner {
        authorizedProxy = _proxy;
        emit ProxyAuthorized(_proxy);
    }

    /**
     * @dev Update treasury factory (owner only) — used to point at a new
     * factory version (e.g. V2 → V3) without redeploying this contract.
     */
    function updateTreasuryFactory(address _treasuryFactory) external onlyOwner {
        require(_treasuryFactory != address(0), "Invalid treasury factory");
        address oldFactory = address(treasuryFactory);
        treasuryFactory = IPodTreasuryFactory(_treasuryFactory);
        emit TreasuryFactoryUpdated(oldFactory, _treasuryFactory);
    }
    
    /**
     * @dev Set distribution method (owner only)
     */
    function setDistributionMethod(DistributionMethod _method) external onlyOwner {
        distributionMethod = _method;
        
        string memory methodName;
        if (_method == DistributionMethod.MINT) methodName = "MINT";
        else if (_method == DistributionMethod.TRANSFER) methodName = "TRANSFER";
        else methodName = "SPECIAL_DIST";
        
        emit DistributionMethodUpdated(methodName);
    }
    
    /**
     * @dev Distribute SELF tokens to a single recipient
     */
    function distributeSELF(
        string memory podId,
        address recipient,
        uint256 amount,
        uint256 expiry, // 0 for no expiry, timestamp for time-bound
        string memory reason
    ) external nonReentrant onlyPodManagerOrProxy(podId) {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(bytes(reason).length > 0, "Reason cannot be empty");
        
        // Generate unique distribution ID
        bytes32 distributionId = keccak256(abi.encodePacked(
            podId, recipient, amount, expiry, reason, block.timestamp, msg.sender
        ));
        
        // Execute distribution based on configured method
        _executeSELFDistribution(recipient, amount, expiry);
        
        // Record distribution
        distributions[distributionId] = Distribution({
            podId: podId,
            recipient: recipient,
            amount: amount,
            timestamp: block.timestamp,
            expiry: expiry,
            reason: reason,
            distributor: msg.sender == authorizedProxy ? tx.origin : msg.sender
        });
        
        // Update counters
        podDistributionCount[podId]++;
        userDistributionCount[recipient]++;
        
        emit SELFDistributed(distributionId, podId, recipient, amount, expiry, reason, 
                           msg.sender == authorizedProxy ? tx.origin : msg.sender);
    }
    
    /**
     * @dev Distribute SELF tokens to multiple recipients
     */
    function batchDistributeSELF(
        string memory podId,
        address[] memory recipients,
        uint256[] memory amounts,
        uint256 expiry, // Same expiry for all recipients
        string memory reason
    ) external nonReentrant onlyPodManagerOrProxy(podId) {
        require(recipients.length > 0, "No recipients provided");
        require(recipients.length == amounts.length, "Arrays length mismatch");
        require(bytes(reason).length > 0, "Reason cannot be empty");
        
        uint256 totalAmount = 0;
        
        for (uint i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient address");
            require(amounts[i] > 0, "Amount must be greater than 0");
            
            // Execute individual distribution
            _executeSELFDistribution(recipients[i], amounts[i], expiry);
            
            // Generate and record distribution
            bytes32 distributionId = keccak256(abi.encodePacked(
                podId, recipients[i], amounts[i], expiry, reason, block.timestamp, msg.sender, i
            ));
            
            distributions[distributionId] = Distribution({
                podId: podId,
                recipient: recipients[i],
                amount: amounts[i],
                timestamp: block.timestamp,
                expiry: expiry,
                reason: reason,
                distributor: msg.sender == authorizedProxy ? tx.origin : msg.sender
            });
            
            userDistributionCount[recipients[i]]++;
            totalAmount += amounts[i];
            
            emit SELFDistributed(distributionId, podId, recipients[i], amounts[i], expiry, reason,
                               msg.sender == authorizedProxy ? tx.origin : msg.sender);
        }
        
        podDistributionCount[podId] += recipients.length;
        
        emit SELFBatchDistributed(podId, recipients.length, totalAmount, expiry, reason,
                                msg.sender == authorizedProxy ? tx.origin : msg.sender);
    }
    
    /**
     * @dev Get distribution details by ID
     */
    function getDistribution(bytes32 distributionId) external view returns (Distribution memory) {
        return distributions[distributionId];
    }
    
    /**
     * @dev Check if user is a pod manager
     */
    function isPodManager(string memory podId, address account) external view returns (bool) {
        return _validatePodManager(podId, account);
    }
    
    /**
     * @dev Internal function to validate pod management permissions
     */
    function _validatePodManager(string memory podId, address account) internal view returns (bool) {
        // Get treasury for pod
        address treasury = treasuryFactory.getTreasuryForPod(podId);
        if (treasury == address(0)) return false;

        try IPodTreasury(treasury).managementHatId() returns (uint256 managementHatId) {
            address hatsContract = IPodTreasury(treasury).hatsContract();
            return IHats(hatsContract).balanceOf(account, managementHatId) > 0;
        } catch {
            return false;
        }
    }
    
    /**
     * @dev Internal function to execute SELF token distribution
     * Tries different methods based on configuration
     */
    function _executeSELFDistribution(address recipient, uint256 amount, uint256 expiry) internal {
        if (distributionMethod == DistributionMethod.MINT) {
            // Try mint function
            selfToken.mint(recipient, amount);
        } else if (distributionMethod == DistributionMethod.SPECIAL_DIST) {
            // Try special distribute function with expiry
            selfToken.distribute(recipient, amount, expiry);
        } else {
            // Default: try standard transfer from this contract
            // Note: This assumes the contract holds SELF tokens or has special transfer permissions
            bool success = selfToken.transfer(recipient, amount);
            require(success, "SELF token transfer failed");
        }
    }
    
    /**
     * @dev Emergency function to recover stuck tokens (owner only)
     */
    function emergencyRecoverTokens(
        address token,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        
        ISELFToken(token).transfer(recipient, amount);
    }
}

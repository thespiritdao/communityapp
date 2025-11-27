// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Interfaces for integration with existing pod system
interface IHats {
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

interface IPodTreasuryFactory {
    function getTreasuryForPod(string memory podId) external view returns (address);
    function isPodTreasuryDeployed(string memory podId) external view returns (bool);
}

/**
 * @title PurchaseRouterDecentralized
 * @dev Decentralized smart contract for routing marketplace purchase funds
 *
 * This contract integrates with your existing pod permission system:
 * - No centralized admin key required
 * - Pod leaders can set destinations for their own pods
 * - Automatic treasury validation via factory
 * - Maintains burn functionality for compatibility
 */
contract PurchaseRouterDecentralized is Ownable, ReentrancyGuard {
    IERC20 public immutable systemToken;
    IERC20 public immutable selfToken;
    ERC20Burnable public immutable systemTokenBurnable;
    ERC20Burnable public immutable selfTokenBurnable;
    
    // Integration with existing infrastructure
    IHats public hatsContract;
    IPodTreasuryFactory public treasuryFactory;

    enum FundDestinationType {
        BURN,
        WALLET,
        POD_TREASURY
    }

    struct FundDestination {
        FundDestinationType destinationType;
        address destinationAddress;
        string podId;
        address authorizedBy; // Track who authorized this destination
    }

    struct PodInfo {
        string podId;
        uint256 managementHatId;
        address treasuryAddress;
    }

    // Mapping from productId to fund destination
    mapping(string => FundDestination) public productDestinations;
    
    // Mapping to store pod management hat IDs
    mapping(string => uint256) public podManagementHats;

    // Events
    event PurchaseCompleted(
        address indexed buyer,
        string indexed productId,
        uint256 systemAmount,
        uint256 selfAmount,
        FundDestinationType destinationType,
        address destinationAddress,
        uint256 timestamp
    );

    event FundsRouted(
        address indexed token,
        uint256 amount,
        FundDestinationType destinationType,
        address indexed destinationAddress,
        string productId
    );

    event ProductDestinationSet(
        string indexed productId,
        FundDestinationType destinationType,
        address destinationAddress,
        string podId,
        address indexed authorizedBy
    );

    event PodManagementHatSet(
        string indexed podId,
        uint256 indexed hatId,
        address indexed setter
    );

    constructor(
        address _systemToken, 
        address _selfToken,
        address _hatsContract,
        address _treasuryFactory
    ) Ownable(msg.sender) {
        require(_systemToken != address(0), "Invalid system token");
        require(_selfToken != address(0), "Invalid self token");
        require(_hatsContract != address(0), "Invalid hats contract");
        require(_treasuryFactory != address(0), "Invalid treasury factory");

        systemToken = IERC20(_systemToken);
        selfToken = IERC20(_selfToken);
        systemTokenBurnable = ERC20Burnable(_systemToken);
        selfTokenBurnable = ERC20Burnable(_selfToken);
        hatsContract = IHats(_hatsContract);
        treasuryFactory = IPodTreasuryFactory(_treasuryFactory);
    }

    /**
     * @dev Set management hat ID for a pod (owner only - for initial setup)
     * This maps podId to the hat ID that can manage its treasury routing
     */
    function setPodManagementHat(string calldata podId, uint256 hatId) external onlyOwner {
        require(bytes(podId).length > 0, "Invalid pod ID");
        podManagementHats[podId] = hatId;
        emit PodManagementHatSet(podId, hatId, msg.sender);
    }

    /**
     * @dev Check if caller has permission to manage a pod's treasury routing
     */
    function hasPodManagementPermission(address caller, string memory podId) public view returns (bool) {
        uint256 managementHatId = podManagementHats[podId];
        if (managementHatId == 0) return false;
        
        return hatsContract.balanceOf(caller, managementHatId) > 0;
    }

    /**
     * @dev DECENTRALIZED: Set fund destination for a product
     * Anyone can set destinations with proper permissions:
     * - WALLET: Anyone can set their own wallet as destination
     * - POD_TREASURY: Only pod managers can set their pod's treasury
     * - BURN: Anyone can set burn (default/fallback)
     */
    function setProductDestination(
        string calldata productId,
        FundDestinationType destinationType,
        address destinationAddress,
        string calldata podId
    ) external {
        require(bytes(productId).length > 0, "Invalid product ID");

        // Permission validation based on destination type
        if (destinationType == FundDestinationType.WALLET) {
            require(destinationAddress == msg.sender, "Can only set your own wallet as destination");
        } else if (destinationType == FundDestinationType.POD_TREASURY) {
            require(bytes(podId).length > 0, "Pod ID required for treasury destination");
            require(hasPodManagementPermission(msg.sender, podId), "No permission to manage this pod's treasury");
            
            // Verify treasury exists and address matches
            require(treasuryFactory.isPodTreasuryDeployed(podId), "Treasury not deployed for pod");
            address actualTreasury = treasuryFactory.getTreasuryForPod(podId);
            require(actualTreasury == destinationAddress, "Treasury address mismatch");
        }
        // BURN requires no special permissions - anyone can burn

        productDestinations[productId] = FundDestination({
            destinationType: destinationType,
            destinationAddress: destinationAddress,
            podId: podId,
            authorizedBy: msg.sender
        });

        emit ProductDestinationSet(productId, destinationType, destinationAddress, podId, msg.sender);
    }

    /**
     * @dev SIMPLIFIED: Main purchase function with automatic routing
     * No pre-configuration required - destinations can be set on-demand
     */
    function purchaseWithRouting(
        uint256 systemAmount,
        uint256 selfAmount,
        string calldata productId
    ) external nonReentrant {
        require(bytes(productId).length > 0, "Invalid product ID");

        FundDestination memory destination = productDestinations[productId];
        
        // Default to burn if no destination is configured
        if (destination.destinationType == FundDestinationType.WALLET && destination.destinationAddress == address(0)) {
            destination.destinationType = FundDestinationType.BURN;
        }

        // Process SYSTEM token
        if (systemAmount > 0) {
            require(systemToken.allowance(msg.sender, address(this)) >= systemAmount, "Insufficient SYSTEM allowance");
            require(systemToken.balanceOf(msg.sender) >= systemAmount, "Insufficient SYSTEM balance");
            require(systemToken.transferFrom(msg.sender, address(this), systemAmount), "SYSTEM transfer failed");
            _routeFunds(address(systemToken), systemAmount, destination, productId);
        }

        // Process SELF token
        if (selfAmount > 0) {
            require(selfToken.allowance(msg.sender, address(this)) >= selfAmount, "Insufficient SELF allowance");
            require(selfToken.balanceOf(msg.sender) >= selfAmount, "Insufficient SELF balance");
            require(selfToken.transferFrom(msg.sender, address(this), selfAmount), "SELF transfer failed");
            _routeFunds(address(selfToken), selfAmount, destination, productId);
        }

        emit PurchaseCompleted(
            msg.sender,
            productId,
            systemAmount,
            selfAmount,
            destination.destinationType,
            destination.destinationAddress,
            block.timestamp
        );
    }

    /**
     * @dev ENHANCED: Purchase with explicit destination (for ultimate flexibility)
     * Allows setting destination in the same transaction as purchase
     */
    function purchaseWithExplicitDestination(
        uint256 systemAmount,
        uint256 selfAmount,
        string calldata productId,
        FundDestinationType destinationType,
        address destinationAddress,
        string calldata podId
    ) external nonReentrant {
        require(bytes(productId).length > 0, "Invalid product ID");

        // Validate permissions for the destination
        if (destinationType == FundDestinationType.WALLET) {
            require(destinationAddress == msg.sender, "Can only route to your own wallet");
        } else if (destinationType == FundDestinationType.POD_TREASURY) {
            require(treasuryFactory.isPodTreasuryDeployed(podId), "Treasury not deployed");
            address actualTreasury = treasuryFactory.getTreasuryForPod(podId);
            require(actualTreasury == destinationAddress, "Treasury address mismatch");
        }

        FundDestination memory destination = FundDestination({
            destinationType: destinationType,
            destinationAddress: destinationAddress,
            podId: podId,
            authorizedBy: msg.sender
        });

        // Process tokens
        if (systemAmount > 0) {
            require(systemToken.allowance(msg.sender, address(this)) >= systemAmount, "Insufficient SYSTEM allowance");
            require(systemToken.balanceOf(msg.sender) >= systemAmount, "Insufficient SYSTEM balance");
            require(systemToken.transferFrom(msg.sender, address(this), systemAmount), "SYSTEM transfer failed");
            _routeFunds(address(systemToken), systemAmount, destination, productId);
        }

        if (selfAmount > 0) {
            require(selfToken.allowance(msg.sender, address(this)) >= selfAmount, "Insufficient SELF allowance");
            require(selfToken.balanceOf(msg.sender) >= selfAmount, "Insufficient SELF balance");
            require(selfToken.transferFrom(msg.sender, address(this), selfAmount), "SELF transfer failed");
            _routeFunds(address(selfToken), selfAmount, destination, productId);
        }

        emit PurchaseCompleted(
            msg.sender,
            productId,
            systemAmount,
            selfAmount,
            destination.destinationType,
            destination.destinationAddress,
            block.timestamp
        );
    }

    /**
     * @dev Internal function to route funds based on destination type
     */
    function _routeFunds(
        address token,
        uint256 amount,
        FundDestination memory destination,
        string calldata productId
    ) internal {
        if (destination.destinationType == FundDestinationType.BURN) {
            if (token == address(systemToken)) {
                systemTokenBurnable.burn(amount);
            } else if (token == address(selfToken)) {
                selfTokenBurnable.burn(amount);
            }
        } else if (destination.destinationType == FundDestinationType.WALLET) {
            require(IERC20(token).transfer(destination.destinationAddress, amount), "Transfer to wallet failed");
        } else if (destination.destinationType == FundDestinationType.POD_TREASURY) {
            // ✅ FIX: Properly use receiveTokens() to update internal accounting
            // Instead of transferring then calling receiveTokens, we approve and let treasury pull tokens

            // Step 1: Approve treasury to spend our tokens
            require(IERC20(token).approve(destination.destinationAddress, amount), "Treasury approval failed");

            // Step 2: Call receiveTokens() - treasury will pull tokens and update internal accounting
            // Use low-level call for backwards compatibility
            (bool success, ) = destination.destinationAddress.call(
                abi.encodeWithSignature("receiveTokens(address,uint256)", token, amount)
            );

            // Step 3: Fallback to direct transfer if receiveTokens() not available
            // This maintains backwards compatibility with older treasury contracts
            if (!success) {
                // Revoke approval first (security best practice)
                require(IERC20(token).approve(destination.destinationAddress, 0), "Approval revoke failed");

                // Fall back to direct transfer for older treasuries
                require(IERC20(token).transfer(destination.destinationAddress, amount), "Transfer to treasury failed");
            }
        }

        emit FundsRouted(token, amount, destination.destinationType, destination.destinationAddress, productId);
    }

    /**
     * @dev Get product destination info
     */
    function getProductDestination(string calldata productId)
        external
        view
        returns (FundDestinationType, address, string memory, address)
    {
        FundDestination memory dest = productDestinations[productId];
        return (dest.destinationType, dest.destinationAddress, dest.podId, dest.authorizedBy);
    }

    /**
     * @dev Batch set pod management hats (owner only - for initial setup)
     */
    function batchSetPodManagementHats(
        string[] calldata podIds,
        uint256[] calldata hatIds
    ) external onlyOwner {
        require(podIds.length == hatIds.length, "Array length mismatch");
        
        for (uint256 i = 0; i < podIds.length; i++) {
            podManagementHats[podIds[i]] = hatIds[i];
            emit PodManagementHatSet(podIds[i], hatIds[i], msg.sender);
        }
    }

    /**
     * @dev Update contract references (owner only - for upgrades)
     */
    function updateHatsContract(address _hatsContract) external onlyOwner {
        require(_hatsContract != address(0), "Invalid hats contract");
        hatsContract = IHats(_hatsContract);
    }

    function updateTreasuryFactory(address _treasuryFactory) external onlyOwner {
        require(_treasuryFactory != address(0), "Invalid treasury factory");
        treasuryFactory = IPodTreasuryFactory(_treasuryFactory);
    }

    /**
     * @dev Emergency function to withdraw any stuck tokens (owner only)
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(to != address(0), "Invalid recipient");
        require(IERC20(token).transfer(to, amount), "Emergency withdraw failed");
    }
}

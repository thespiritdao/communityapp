// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PurchaseRouter
 * @dev Smart contract for routing marketplace purchase funds to different destinations
 *
 * This contract replaces the simple burn mechanism with configurable fund routing:
 * - burn: Permanently burn tokens (legacy behavior)
 * - wallet: Send tokens to a specific wallet address
 * - pod_treasury: Send tokens to a pod treasury contract
 */
contract PurchaseRouter is Ownable, ReentrancyGuard {
    IERC20 public immutable systemToken;
    IERC20 public immutable selfToken;
    ERC20Burnable public immutable systemTokenBurnable;
    ERC20Burnable public immutable selfTokenBurnable;

    enum FundDestinationType {
        BURN,
        WALLET,
        POD_TREASURY
    }

    struct FundDestination {
        FundDestinationType destinationType;
        address destinationAddress;
        string podId;
    }

    // Mapping from productId to fund destination
    mapping(string => FundDestination) public productDestinations;

    // Mapping to track authorized pod treasuries
    mapping(address => bool) public authorizedTreasuries;

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
        string podId
    );

    event TreasuryAuthorized(address indexed treasury, bool authorized);

    constructor(address _systemToken, address _selfToken, address _initialOwner)
        Ownable(_initialOwner) // <-- OZ v5: must forward initial owner
    {
        require(_systemToken != address(0), "Invalid system token");
        require(_selfToken != address(0), "Invalid self token");

        systemToken = IERC20(_systemToken);
        selfToken = IERC20(_selfToken);
        systemTokenBurnable = ERC20Burnable(_systemToken);
        selfTokenBurnable = ERC20Burnable(_selfToken);
    }

    /**
     * @dev Set fund destination for a product (only owner can call)
     */
    function setProductDestination(
        string calldata productId,
        FundDestinationType destinationType,
        address destinationAddress,
        string calldata podId
    ) external onlyOwner {
        require(bytes(productId).length > 0, "Invalid product ID");

        if (destinationType == FundDestinationType.WALLET) {
            require(destinationAddress != address(0), "Invalid destination address for wallet");
        } else if (destinationType == FundDestinationType.POD_TREASURY) {
            require(destinationAddress != address(0), "Invalid destination address for treasury");
            require(authorizedTreasuries[destinationAddress], "Treasury not authorized");
        }

        productDestinations[productId] = FundDestination({
            destinationType: destinationType,
            destinationAddress: destinationAddress,
            podId: podId
        });

        emit ProductDestinationSet(productId, destinationType, destinationAddress, podId);
    }

    /**
     * @dev Authorize or deauthorize a treasury contract
     */
    function setTreasuryAuthorization(address treasury, bool authorized) external onlyOwner {
        require(treasury != address(0), "Invalid treasury address");
        authorizedTreasuries[treasury] = authorized;
        emit TreasuryAuthorized(treasury, authorized);
    }

    /**
     * @dev Main purchase function with fund routing
     */
    function purchaseWithRouting(
        uint256 systemAmount,
        uint256 selfAmount,
        string calldata productId
    ) external nonReentrant {
        require(bytes(productId).length > 0, "Invalid product ID");

        FundDestination memory destination = productDestinations[productId];
        require(
            destination.destinationType == FundDestinationType.BURN ||
            destination.destinationAddress != address(0),
            "No destination set for product"
        );

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

            // Step 3 (H-3 fix): ALWAYS revoke the approval afterward — on success as
            // well as failure. Previously the success path left a standing approval;
            // if a treasury ever pulled less than `amount`, the residual approval
            // could be drained later if that treasury were compromised. Revoking
            // unconditionally leaves zero standing approval.
            require(IERC20(token).approve(destination.destinationAddress, 0), "Approval revoke failed");

            // Fallback: if receiveTokens() wasn't available, transfer directly
            // (backwards compatibility with older treasury contracts).
            if (!success) {
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
        returns (FundDestinationType, address, string memory)
    {
        FundDestination memory dest = productDestinations[productId];
        return (dest.destinationType, dest.destinationAddress, dest.podId);
    }

    /**
     * @dev Emergency function to withdraw any stuck tokens (only owner)
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(to != address(0), "Invalid recipient");
        require(IERC20(token).transfer(to, amount), "Emergency withdraw failed");
    }

    /**
     * @dev Batch set multiple product destinations (gas optimization)
     */
    function batchSetProductDestinations(
        string[] calldata productIds,
        FundDestinationType[] calldata destinationTypes,
        address[] calldata destinationAddresses,
        string[] calldata podIds
    ) external onlyOwner {
        require(
            productIds.length == destinationTypes.length &&
            productIds.length == destinationAddresses.length &&
            productIds.length == podIds.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < productIds.length; i++) {
            require(bytes(productIds[i]).length > 0, "Invalid product ID");

            if (destinationTypes[i] == FundDestinationType.WALLET) {
                require(destinationAddresses[i] != address(0), "Invalid destination address for wallet");
            } else if (destinationTypes[i] == FundDestinationType.POD_TREASURY) {
                require(destinationAddresses[i] != address(0), "Invalid destination address for treasury");
                require(authorizedTreasuries[destinationAddresses[i]], "Treasury not authorized");
            }

            productDestinations[productIds[i]] = FundDestination({
                destinationType: destinationTypes[i],
                destinationAddress: destinationAddresses[i],
                podId: podIds[i]
            });

            emit ProductDestinationSet(productIds[i], destinationTypes[i], destinationAddresses[i], podIds[i]);
        }
    }
}

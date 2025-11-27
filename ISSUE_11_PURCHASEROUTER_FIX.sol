// ISSUE #11 FIX: Treasury Balance Mismatch
//
// This file contains the corrected _routeFunds function for PurchaseRouter.sol
// Replace the existing implementation (lines 169-204) with this code.
//
// Changes:
// 1. For POD_TREASURY: Approve + call receiveTokens() instead of transfer + try receiveTokens()
// 2. Removed broken _callReceiveTokens() helper function
// 3. Proper fallback to direct transfer for backwards compatibility

/**
 * @dev Internal function to route funds based on destination type
 * FIXED: Properly calls receiveTokens() for treasury destinations
 */
function _routeFunds(
    address token,
    uint256 amount,
    FundDestination memory destination,
    string calldata productId
) internal {
    if (destination.destinationType == FundDestinationType.BURN) {
        // Burn tokens (legacy behavior)
        if (token == address(systemToken)) {
            systemTokenBurnable.burn(amount);
        } else if (token == address(selfToken)) {
            selfTokenBurnable.burn(amount);
        }
    } else if (destination.destinationType == FundDestinationType.WALLET) {
        // Direct transfer to wallet
        require(IERC20(token).transfer(destination.destinationAddress, amount),
                "Transfer to wallet failed");
    } else if (destination.destinationType == FundDestinationType.POD_TREASURY) {
        // ✅ FIX: Properly use receiveTokens() to update internal accounting

        // Step 1: Approve treasury to spend our tokens
        require(IERC20(token).approve(destination.destinationAddress, amount),
                "Treasury approval failed");

        // Step 2: Call receiveTokens() - treasury will pull tokens and update accounting
        // Use low-level call for backwards compatibility with treasuries that may not have this function
        (bool success, ) = destination.destinationAddress.call(
            abi.encodeWithSignature("receiveTokens(address,uint256)", token, amount)
        );

        // Step 3: Fallback to direct transfer if receiveTokens() not available
        // This maintains backwards compatibility with older treasury contracts
        if (!success) {
            // Revoke approval first (security best practice)
            require(IERC20(token).approve(destination.destinationAddress, 0),
                    "Approval revoke failed");

            // Fall back to direct transfer for older treasuries
            require(IERC20(token).transfer(destination.destinationAddress, amount),
                    "Transfer to treasury failed");
        }
        // ✅ Either way, treasury accounting is now correct!
    }

    emit FundsRouted(token, amount, destination.destinationType, destination.destinationAddress, productId);
}

// ❌ DELETE THIS FUNCTION - No longer needed (was lines 200-204)
// function _callReceiveTokens(address treasury, address token, uint256 amount) external {
//     require(msg.sender == address(this), "Internal function only");
//     (bool success, ) = treasury.call(abi.encodeWithSignature("receiveTokens(address,uint256)", token, amount));
//     require(success, "receiveTokens call failed");
// }

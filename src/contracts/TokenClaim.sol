// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TokenClaim
/// @notice Permanently removes $SYSTEM tokens from circulation and emits a ClaimRequest event.
/// @dev Uses transferFrom to send tokens to the dead address (0x000...dEaD) instead of burnFrom,
///      which is functionally equivalent to burning but works regardless of whether the token
///      implements ERC20Burnable. The Executive Pod monitors ClaimRequest events and issues
///      fiat payouts off-chain via ACH / wire.
contract TokenClaim is ReentrancyGuard {
    IERC20 public immutable systemToken;

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Emitted when a user removes tokens to request a fiat payout.
    /// @param claimant     Address that sent the tokens.
    /// @param amount       Number of $SYSTEM tokens removed (in wei, 18 decimals).
    /// @param payoutRef    Arbitrary reference string (UUID from backend).
    /// @param timestamp    Block timestamp of the transfer.
    event ClaimRequest(
        address indexed claimant,
        uint256 amount,
        string payoutRef,
        uint256 timestamp
    );

    error ZeroAmount();
    error EmptyPayoutRef();
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(address _systemToken) {
        require(_systemToken != address(0), "TokenClaim: invalid token address");
        systemToken = IERC20(_systemToken);
    }

    /// @notice Transfer `amount` of the caller's $SYSTEM tokens to the dead address.
    /// @dev    Caller must first approve this contract for `amount` via the token contract.
    ///         The transfer is irreversible. No on-chain payout is issued by this function.
    /// @param amount     Number of $SYSTEM tokens to remove (in wei, 18 decimals).
    /// @param payoutRef  Backend-generated UUID linking this to the claim record in the DB.
    function burnForClaim(uint256 amount, string calldata payoutRef) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (bytes(payoutRef).length == 0) revert EmptyPayoutRef();
        if (systemToken.balanceOf(msg.sender) < amount) revert InsufficientBalance();
        if (systemToken.allowance(msg.sender, address(this)) < amount) revert InsufficientAllowance();

        // Transfer to dead address — permanent, no burnFrom required
        systemToken.transferFrom(msg.sender, DEAD_ADDRESS, amount);

        emit ClaimRequest(msg.sender, amount, payoutRef, block.timestamp);
    }
}

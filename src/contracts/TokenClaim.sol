// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBurnable is IERC20 {
    function burn(uint256 amount) external;
    function burnFrom(address account, uint256 amount) external;
}

/// @title TokenClaim
/// @notice Burns $SYSTEM tokens on behalf of the caller and emits a ClaimRequest event.
/// @dev The Executive Pod monitors ClaimRequest events and issues fiat payouts off-chain.
///      There is no on-chain payout — the burn is permanent and the payout is handled
///      via ACH / wire once the Executive Pod approves the request.
contract TokenClaim is ReentrancyGuard {
    IBurnable public immutable systemToken;

    /// @notice Emitted when a user burns tokens to request a fiat payout.
    /// @param claimant     Address that burned the tokens.
    /// @param amount       Number of $SYSTEM tokens burned (in wei, 18 decimals).
    /// @param payoutRef    Arbitrary reference string (e.g., email or UUID from backend).
    /// @param timestamp    Block timestamp of the burn.
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
        systemToken = IBurnable(_systemToken);
    }

    /// @notice Burn `amount` of the caller's $SYSTEM tokens and emit a ClaimRequest.
    /// @dev    Caller must first approve this contract for `amount` via the token contract.
    ///         The burn is irreversible. No on-chain payout is issued by this function.
    /// @param amount     Number of $SYSTEM tokens to burn (in wei, 18 decimals).
    /// @param payoutRef  Backend-generated reference ID (UUID) linking this burn to the
    ///                   claim record in the database. Generated before calling this function.
    function burnForClaim(uint256 amount, string calldata payoutRef) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (bytes(payoutRef).length == 0) revert EmptyPayoutRef();
        if (systemToken.balanceOf(msg.sender) < amount) revert InsufficientBalance();
        if (systemToken.allowance(msg.sender, address(this)) < amount) revert InsufficientAllowance();

        // Burn tokens from caller — requires prior approval
        systemToken.burnFrom(msg.sender, amount);

        emit ClaimRequest(msg.sender, amount, payoutRef, block.timestamp);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title HatMinter
 * @author SpiritDAO
 * @notice Mints Beta Tester hats to new users during onboarding
 *
 * @dev This contract:
 * - Wears the Executive Pod Leader hat (granted by DAO admin)
 * - Mints Beta Tester hats to eligible users
 * - Is whitelisted with Coinbase Paymaster for gas-free operations
 * - Can only be called by authorized backend addresses
 *
 * Benefits:
 * - Zero gas costs (sponsored by paymaster)
 * - No private keys to manage
 * - Transparent on-chain logic
 * - Revocable permissions via hat system
 */

interface IHats {
    function mintHat(uint256 hatId, address wearer) external returns (bool);
    function isWearerOfHat(address user, uint256 hatId) external view returns (bool);
}

contract HatMinter {
    // ============================================================
    // STORAGE
    // ============================================================

    /// @notice Hats Protocol contract address (Base: 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137)
    IHats public immutable hatsProtocol;

    /// @notice Beta Tester hat ID (30-day testing hat)
    uint256 public immutable betaTesterHatId;

    /// @notice Executive Pod Leader hat ID (permanent admin hat)
    uint256 public immutable executiveLeaderHatId;

    /// @notice Authorized backend addresses that can call mint functions
    mapping(address => bool) public authorizedCallers;

    /// @notice Contract owner (can add/remove authorized callers)
    address public owner;

    // ============================================================
    // EVENTS
    // ============================================================

    event BetaTesterHatMinted(address indexed recipient, uint256 hatId, address indexed caller);
    event ExecutiveLeaderHatMinted(address indexed recipient, uint256 hatId, address indexed caller);
    event CallerAuthorized(address indexed caller, bool authorized);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ============================================================
    // ERRORS
    // ============================================================

    error Unauthorized();
    error AlreadyWearingHat();
    error MintFailed();
    error InvalidAddress();

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /**
     * @param _hatsProtocol Address of Hats Protocol contract
     * @param _betaTesterHatId Hat ID for Beta Testers
     * @param _executiveLeaderHatId Hat ID for Executive Pod Leaders
     * @param _initialOwner Initial owner of the contract
     */
    constructor(
        address _hatsProtocol,
        uint256 _betaTesterHatId,
        uint256 _executiveLeaderHatId,
        address _initialOwner
    ) {
        if (_hatsProtocol == address(0) || _initialOwner == address(0)) {
            revert InvalidAddress();
        }

        hatsProtocol = IHats(_hatsProtocol);
        betaTesterHatId = _betaTesterHatId;
        executiveLeaderHatId = _executiveLeaderHatId;
        owner = _initialOwner;

        // Authorize deployer initially
        authorizedCallers[_initialOwner] = true;
        emit CallerAuthorized(_initialOwner, true);
    }

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert Unauthorized();
        _;
    }

    // ============================================================
    // MINTING FUNCTIONS
    // ============================================================

    /**
     * @notice Mint Beta Tester hat to a new user
     * @param recipient Address to receive the Beta Tester hat
     *
     * @dev Can only be called by authorized addresses (backend)
     *      Gas fees sponsored by Coinbase Paymaster
     */
    function mintBetaTesterHat(address recipient) external onlyAuthorized returns (bool) {
        if (recipient == address(0)) revert InvalidAddress();

        // Check if already wearing the hat
        if (hatsProtocol.isWearerOfHat(recipient, betaTesterHatId)) {
            revert AlreadyWearingHat();
        }

        // Mint the hat
        bool success = hatsProtocol.mintHat(betaTesterHatId, recipient);
        if (!success) revert MintFailed();

        emit BetaTesterHatMinted(recipient, betaTesterHatId, msg.sender);
        return true;
    }

    /**
     * @notice Mint Executive Pod Leader hat to a first user
     * @param recipient Address to receive the Executive Leader hat
     *
     * @dev Can only be called by authorized addresses (backend)
     *      Used for founding members
     */
    function mintExecutiveLeaderHat(address recipient) external onlyAuthorized returns (bool) {
        if (recipient == address(0)) revert InvalidAddress();

        // Check if already wearing the hat
        if (hatsProtocol.isWearerOfHat(recipient, executiveLeaderHatId)) {
            revert AlreadyWearingHat();
        }

        // Mint the hat
        bool success = hatsProtocol.mintHat(executiveLeaderHatId, recipient);
        if (!success) revert MintFailed();

        emit ExecutiveLeaderHatMinted(recipient, executiveLeaderHatId, msg.sender);
        return true;
    }

    /**
     * @notice Batch mint Beta Tester hats (gas efficient for airdrops)
     * @param recipients Array of addresses to receive hats
     */
    function batchMintBetaTesterHats(address[] calldata recipients)
        external
        onlyAuthorized
        returns (uint256 successCount)
    {
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];

            // Skip if invalid or already wearing
            if (recipient == address(0)) continue;
            if (hatsProtocol.isWearerOfHat(recipient, betaTesterHatId)) continue;

            // Try to mint (don't revert on individual failures)
            try hatsProtocol.mintHat(betaTesterHatId, recipient) returns (bool success) {
                if (success) {
                    successCount++;
                    emit BetaTesterHatMinted(recipient, betaTesterHatId, msg.sender);
                }
            } catch {
                // Continue on failure
                continue;
            }
        }
    }

    // ============================================================
    // ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Authorize or deauthorize an address to call mint functions
     * @param caller Address to authorize/deauthorize
     * @param authorized True to authorize, false to deauthorize
     */
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        if (caller == address(0)) revert InvalidAddress();
        authorizedCallers[caller] = authorized;
        emit CallerAuthorized(caller, authorized);
    }

    /**
     * @notice Batch authorize multiple addresses
     * @param callers Array of addresses to authorize
     */
    function batchAuthorizeCallers(address[] calldata callers) external onlyOwner {
        for (uint256 i = 0; i < callers.length; i++) {
            if (callers[i] == address(0)) continue;
            authorizedCallers[callers[i]] = true;
            emit CallerAuthorized(callers[i], true);
        }
    }

    /**
     * @notice Transfer contract ownership
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Check if an address is authorized to call mint functions
     * @param caller Address to check
     */
    function isAuthorizedCaller(address caller) external view returns (bool) {
        return authorizedCallers[caller];
    }

    /**
     * @notice Check if this contract wears the Executive Pod Leader hat
     * @dev This contract must wear this hat to mint Beta Tester hats
     */
    function hasAdminHat() external view returns (bool) {
        return hatsProtocol.isWearerOfHat(address(this), executiveLeaderHatId);
    }

    /**
     * @notice Check if an address already wears the Beta Tester hat
     * @param user Address to check
     */
    function hasBetaTesterHat(address user) external view returns (bool) {
        return hatsProtocol.isWearerOfHat(user, betaTesterHatId);
    }

    /**
     * @notice Check if an address already wears the Executive Leader hat
     * @param user Address to check
     */
    function hasExecutiveLeaderHat(address user) external view returns (bool) {
        return hatsProtocol.isWearerOfHat(user, executiveLeaderHatId);
    }
}

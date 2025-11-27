// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title TimeBasedToggleModule
 * @notice A Hats Protocol Toggle Module that automatically deactivates hats based on time
 * @dev Implements IHatsToggle interface for automatic time-based hat expiration
 *
 * Key Features:
 * - Hats automatically become unwearable after expiration timestamp
 * - No manual revocation needed - fully on-chain enforcement
 * - Achieves same elegance as Agreement signatures
 * - Each hat can have its own expiration timestamp
 * - Only hat admins can set/update expiration times
 *
 * Integration:
 * - Deploy this contract once
 * - When creating a hat with time restrictions, set this contract as the toggle module
 * - Call setHatExpiration() to set the expiration timestamp
 * - Hat will automatically become inactive when block.timestamp > expiration
 */

interface IHatsToggle {
    /// @notice Returns the active status of a hat
    /// @param hatId The id of the hat in question
    /// @return status True if the hat is active, false otherwise
    function getHatStatus(uint256 hatId) external view returns (bool status);
}

interface IHats {
    /// @notice Checks if an address is an admin of a given hat
    /// @param user The address to check
    /// @param hatId The id of the hat
    /// @return isAdmin True if the address is an admin, false otherwise
    function isAdminOfHat(address user, uint256 hatId) external view returns (bool isAdmin);
}

contract TimeBasedToggleModule is IHatsToggle {

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a hat's expiration is set or updated
    event HatExpirationSet(uint256 indexed hatId, uint256 expiration, address indexed admin);

    /// @notice Emitted when a hat's start time is set or updated
    event HatStartTimeSet(uint256 indexed hatId, uint256 startTime, address indexed admin);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when caller is not an admin of the hat
    error NotHatAdmin();

    /// @notice Thrown when expiration time is in the past
    error ExpirationInPast();

    /// @notice Thrown when start time is after expiration time
    error InvalidTimeRange();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The Hats Protocol contract
    IHats public immutable HATS;

    /// @notice Mapping of hat ID to expiration timestamp
    /// @dev If set to 0, hat never expires (always active based on time)
    mapping(uint256 => uint256) public hatExpirations;

    /// @notice Mapping of hat ID to start timestamp
    /// @dev If set to 0, hat is active immediately (no start delay)
    mapping(uint256 => uint256) public hatStartTimes;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param _hats Address of the Hats Protocol contract
    constructor(address _hats) {
        HATS = IHats(_hats);
    }

    /*//////////////////////////////////////////////////////////////
                            TOGGLE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the active status of a hat based on current time
    /// @dev Implements IHatsToggle interface
    /// @param hatId The id of the hat in question
    /// @return status True if current time is within valid window, false otherwise
    function getHatStatus(uint256 hatId) external view override returns (bool status) {
        uint256 startTime = hatStartTimes[hatId];
        uint256 expiration = hatExpirations[hatId];
        uint256 currentTime = block.timestamp;

        // Check start time (if set)
        if (startTime > 0 && currentTime < startTime) {
            return false; // Not started yet
        }

        // Check expiration (if set)
        if (expiration > 0 && currentTime >= expiration) {
            return false; // Expired
        }

        // Within valid time window (or no restrictions)
        return true;
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Set the expiration timestamp for a hat
    /// @dev Only callable by hat admins
    /// @param hatId The id of the hat
    /// @param expiration The Unix timestamp when the hat should expire (0 = never expires)
    function setHatExpiration(uint256 hatId, uint256 expiration) external {
        // Verify caller is admin of this hat
        if (!HATS.isAdminOfHat(msg.sender, hatId)) {
            revert NotHatAdmin();
        }

        // Validate expiration is not in the past (unless clearing it)
        if (expiration > 0 && expiration <= block.timestamp) {
            revert ExpirationInPast();
        }

        // Validate expiration is after start time (if both are set)
        uint256 startTime = hatStartTimes[hatId];
        if (startTime > 0 && expiration > 0 && expiration <= startTime) {
            revert InvalidTimeRange();
        }

        hatExpirations[hatId] = expiration;

        emit HatExpirationSet(hatId, expiration, msg.sender);
    }

    /// @notice Set the start timestamp for a hat
    /// @dev Only callable by hat admins
    /// @param hatId The id of the hat
    /// @param startTime The Unix timestamp when the hat should become active (0 = active immediately)
    function setHatStartTime(uint256 hatId, uint256 startTime) external {
        // Verify caller is admin of this hat
        if (!HATS.isAdminOfHat(msg.sender, hatId)) {
            revert NotHatAdmin();
        }

        // Validate start time is before expiration (if both are set)
        uint256 expiration = hatExpirations[hatId];
        if (expiration > 0 && startTime > 0 && startTime >= expiration) {
            revert InvalidTimeRange();
        }

        hatStartTimes[hatId] = startTime;

        emit HatStartTimeSet(hatId, startTime, msg.sender);
    }

    /// @notice Set both start time and expiration in a single transaction
    /// @dev Only callable by hat admins
    /// @param hatId The id of the hat
    /// @param startTime The Unix timestamp when the hat should become active (0 = active immediately)
    /// @param expiration The Unix timestamp when the hat should expire (0 = never expires)
    function setHatTimeWindow(uint256 hatId, uint256 startTime, uint256 expiration) external {
        // Verify caller is admin of this hat
        if (!HATS.isAdminOfHat(msg.sender, hatId)) {
            revert NotHatAdmin();
        }

        // Validate time range
        if (expiration > 0 && expiration <= block.timestamp) {
            revert ExpirationInPast();
        }

        if (startTime > 0 && expiration > 0 && startTime >= expiration) {
            revert InvalidTimeRange();
        }

        hatStartTimes[hatId] = startTime;
        hatExpirations[hatId] = expiration;

        emit HatStartTimeSet(hatId, startTime, msg.sender);
        emit HatExpirationSet(hatId, expiration, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get the time window for a hat
    /// @param hatId The id of the hat
    /// @return startTime The start timestamp (0 if none set)
    /// @return expiration The expiration timestamp (0 if none set)
    /// @return isActive Whether the hat is currently active based on time
    /// @return timeUntilExpiration Seconds until expiration (0 if expired or no expiration)
    function getHatTimeWindow(uint256 hatId) external view returns (
        uint256 startTime,
        uint256 expiration,
        bool isActive,
        uint256 timeUntilExpiration
    ) {
        startTime = hatStartTimes[hatId];
        expiration = hatExpirations[hatId];
        isActive = this.getHatStatus(hatId);

        if (expiration > 0 && block.timestamp < expiration) {
            timeUntilExpiration = expiration - block.timestamp;
        } else {
            timeUntilExpiration = 0;
        }
    }

    /// @notice Check if a hat has expired
    /// @param hatId The id of the hat
    /// @return expired True if hat has passed its expiration time
    function isHatExpired(uint256 hatId) external view returns (bool expired) {
        uint256 expiration = hatExpirations[hatId];
        return expiration > 0 && block.timestamp >= expiration;
    }

    /// @notice Check if a hat has started
    /// @param hatId The id of the hat
    /// @return started True if current time is past the start time (or no start time set)
    function isHatStarted(uint256 hatId) external view returns (bool started) {
        uint256 startTime = hatStartTimes[hatId];
        return startTime == 0 || block.timestamp >= startTime;
    }
}

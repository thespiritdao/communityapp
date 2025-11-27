// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IHats.sol";
import "./interfaces/IHatsToggle.sol";

/**
 * @title SimpleToggleModule
 * @notice A simple toggle module that allows specific HAT wearers to toggle other HATs
 * @dev Allows Executive Pod Leaders to toggle Executive Pod Member HATs
 */
contract SimpleToggleModule is IHatsToggle {
    /*//////////////////////////////////////////////////////////////
                               STORAGE
    //////////////////////////////////////////////////////////////*/
    
    IHats public immutable HATS;
    
    // Mapping of target HAT ID => controller HAT ID
    mapping(uint256 => uint256) public hatControllers;
    
    // Mapping of target HAT ID => current status
    mapping(uint256 => bool) public hatStatus;
    
    /*//////////////////////////////////////////////////////////////
                               EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event HatControllerSet(uint256 indexed targetHat, uint256 indexed controllerHat);
    event HatToggled(uint256 indexed hatId, bool newStatus, address toggledBy);
    
    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    
    constructor(address _hats) {
        HATS = IHats(_hats);
    }
    
    /*//////////////////////////////////////////////////////////////
                             TOGGLE LOGIC
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Set which HAT can control a target HAT
     * @param targetHat The HAT that will be controlled
     * @param controllerHat The HAT that can toggle the target HAT
     */
    function setHatController(uint256 targetHat, uint256 controllerHat) external {
        // Only the admin of the target HAT can set its controller
        require(HATS.isAdminOfHat(msg.sender, targetHat), "Not admin of target hat");
        
        hatControllers[targetHat] = controllerHat;
        emit HatControllerSet(targetHat, controllerHat);
    }
    
    /**
     * @notice Check if a HAT should be active
     * @param _hatId The HAT to check
     * @param _wearer The wearer to check (not used in this simple implementation)
     * @return eligible Whether the HAT should be active
     */
    function getHatStatus(uint256 _hatId, address _wearer) external view returns (bool eligible) {
        return hatStatus[_hatId];
    }
    
    /**
     * @notice Toggle a HAT's status
     * @param hatId The HAT to toggle
     * @param newStatus The new status for the HAT
     */
    function toggleHat(uint256 hatId, bool newStatus) external {
        uint256 controllerHat = hatControllers[hatId];
        require(controllerHat != 0, "No controller set for this hat");
        require(HATS.isWearerOfHat(msg.sender, controllerHat), "Not authorized to toggle this hat");
        
        hatStatus[hatId] = newStatus;
        emit HatToggled(hatId, newStatus, msg.sender);
    }
    
    /*//////////////////////////////////////////////////////////////
                         IHATS TOGGLE INTERFACE
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Required by IHatsToggle - returns the HAT's status
     */
    function getHatStatus(uint256 _hatId) external view returns (bool eligible) {
        return hatStatus[_hatId];
    }
}
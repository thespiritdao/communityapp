// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IHats.sol";
import "./IHatsEligibility.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC1155.sol";

/**
 * @title EligibilityModule
 * @notice HATS Protocol eligibility module that enforces multiple criteria types
 * @dev Supports token balance, NFT ownership, agreement signing, time-based, reputation, and staking requirements
 */
contract EligibilityModule is IHatsEligibility, Ownable {
    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event CriterionAdded(uint256 indexed hatId, uint8 criterionType, bytes32 criterionHash);
    event CriterionRemoved(uint256 indexed hatId, bytes32 criterionHash);
    event EligibilityChecked(uint256 indexed hatId, address indexed wearer, bool eligible);
    event AgreementSigned(address indexed signer, bytes32 indexed agreementHash, uint256 timestamp);
    event ReputationScoreUpdated(address indexed user, uint256 newScore);

    /*//////////////////////////////////////////////////////////////
                                ENUMS
    //////////////////////////////////////////////////////////////*/
    
    enum CriterionType {
        TOKEN_BALANCE,     // 0: ERC20 token balance requirement
        NFT_OWNERSHIP,     // 1: ERC721/ERC1155 ownership requirement  
        AGREEMENT_SIGNED,  // 2: Signed agreement requirement
        TIME_BASED,        // 3: Time window restriction
        REPUTATION_SCORE,  // 4: Minimum reputation score
        STAKING           // 5: Staked token requirement
    }

    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    struct TokenBalanceCriterion {
        address contractAddress;
        uint256 minimumAmount;
        bool isActive;
    }
    
    struct NFTOwnershipCriterion {
        address contractAddress;
        uint256 tokenId; // 0 means any token
        bool isERC1155;
        bool isActive;
    }
    
    struct AgreementCriterion {
        bytes32 agreementHash;
        bool isActive;
    }
    
    struct TimeCriterion {
        uint256 validFrom;
        uint256 validUntil;
        bool isActive;
    }
    
    struct ReputationCriterion {
        address scoringContract;
        uint256 minimumScore;
        bool isActive;
    }
    
    struct StakingCriterion {
        address stakingPool;
        uint256 minimumStaked;
        bool isActive;
    }

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    
    /// @notice The Hats Protocol contract
    IHats public immutable HATS;
    
    /// @notice Mapping from hatId to criterion type to criterion hash to criterion data
    mapping(uint256 => mapping(uint8 => mapping(bytes32 => bytes))) public criteria;
    
    /// @notice Mapping from hatId to array of active criterion hashes
    mapping(uint256 => bytes32[]) public hatCriteria;
    
    /// @notice Mapping from agreement hash to signer to signed status
    mapping(bytes32 => mapping(address => bool)) public agreementSignatures;
    
    /// @notice Mapping from user address to reputation score
    mapping(address => uint256) public reputationScores;
    
    /// @notice Mapping from hatId to whether all criteria must be met (true) or any (false)
    mapping(uint256 => bool) public requireAllCriteria;

    /*//////////////////////////////////////////////////////////////
                               ERRORS
    //////////////////////////////////////////////////////////////*/
    
    error NotAuthorized();
    error InvalidCriterion();
    error CriterionNotFound();
    error HatNotEligible();

    /*//////////////////////////////////////////////////////////////
                             MODIFIERS
    //////////////////////////////////////////////////////////////*/
    
    modifier onlyHatAdmin(uint256 hatId) {
        if (!HATS.isAdminOfHat(msg.sender, hatId)) {
            revert NotAuthorized();
        }
        _;
    }

    /*//////////////////////////////////////////////////////////////
                             CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _hats) Ownable(msg.sender) {
        HATS = IHats(_hats);
    }

    /*//////////////////////////////////////////////////////////////
                        ELIGIBILITY FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Check if an address is eligible for a hat
     * @param _wearer The address to check eligibility for
     * @param _hatId The hat ID to check eligibility for
     * @return eligible Whether the address is eligible
     * @return standing Whether the address is in good standing (always true for this module)
     */
    function getWearerStatus(address _wearer, uint256 _hatId)
        external
        view
        override
        returns (bool eligible, bool standing)
    {
        standing = true; // This module doesn't track standing
        eligible = _checkEligibility(_wearer, _hatId);

        return (eligible, standing);
    }

    /**
     * @notice Internal function to check eligibility against all criteria
     * @param _wearer The address to check
     * @param _hatId The hat ID to check for
     * @return Whether the address meets the eligibility requirements
     */
    function _checkEligibility(address _wearer, uint256 _hatId) internal view returns (bool) {
        bytes32[] memory criteriaHashes = hatCriteria[_hatId];
        
        if (criteriaHashes.length == 0) {
            return true; // No criteria means open eligibility
        }
        
        bool requireAll = requireAllCriteria[_hatId];
        uint256 passedCriteria = 0;
        
        for (uint256 i = 0; i < criteriaHashes.length; i++) {
            bytes32 criterionHash = criteriaHashes[i];
            bool passed = false;
            
            // Check each criterion type
            for (uint8 criterionType = 0; criterionType <= 5; criterionType++) {
                if (criteria[_hatId][criterionType][criterionHash].length > 0) {
                    passed = _evaluateCriterion(_wearer, _hatId, criterionType, criterionHash);
                    break;
                }
            }
            
            if (passed) {
                passedCriteria++;
                if (!requireAll) {
                    return true; // Any criterion passed, and we don't require all
                }
            } else if (requireAll) {
                return false; // Required criterion failed
            }
        }
        
        return requireAll ? (passedCriteria == criteriaHashes.length) : (passedCriteria > 0);
    }
    
    /**
     * @notice Evaluate a specific criterion
     * @param _wearer The address to check
     * @param _hatId The hat ID
     * @param _criterionType The type of criterion (0-5)
     * @param _criterionHash The hash of the criterion
     * @return Whether the criterion is met
     */
    function _evaluateCriterion(
        address _wearer,
        uint256 _hatId,
        uint8 _criterionType,
        bytes32 _criterionHash
    ) internal view returns (bool) {
        bytes memory criterionData = criteria[_hatId][_criterionType][_criterionHash];
        
        if (_criterionType == uint8(CriterionType.TOKEN_BALANCE)) {
            TokenBalanceCriterion memory criterion = abi.decode(criterionData, (TokenBalanceCriterion));
            if (!criterion.isActive) return false;
            
            return IERC20(criterion.contractAddress).balanceOf(_wearer) >= criterion.minimumAmount;
            
        } else if (_criterionType == uint8(CriterionType.NFT_OWNERSHIP)) {
            NFTOwnershipCriterion memory criterion = abi.decode(criterionData, (NFTOwnershipCriterion));
            if (!criterion.isActive) return false;
            
            if (criterion.isERC1155) {
                if (criterion.tokenId == 0) {
                    // Check if user owns any token - this would require additional logic
                    return true; // Simplified for now
                } else {
                    return IERC1155(criterion.contractAddress).balanceOf(_wearer, criterion.tokenId) > 0;
                }
            } else {
                if (criterion.tokenId == 0) {
                    return IERC721(criterion.contractAddress).balanceOf(_wearer) > 0;
                } else {
                    try IERC721(criterion.contractAddress).ownerOf(criterion.tokenId) returns (address owner) {
                        return owner == _wearer;
                    } catch {
                        return false;
                    }
                }
            }
            
        } else if (_criterionType == uint8(CriterionType.AGREEMENT_SIGNED)) {
            AgreementCriterion memory criterion = abi.decode(criterionData, (AgreementCriterion));
            if (!criterion.isActive) return false;
            
            return agreementSignatures[criterion.agreementHash][_wearer];
            
        } else if (_criterionType == uint8(CriterionType.TIME_BASED)) {
            TimeCriterion memory criterion = abi.decode(criterionData, (TimeCriterion));
            if (!criterion.isActive) return false;
            
            uint256 currentTime = block.timestamp;
            return currentTime >= criterion.validFrom && 
                   (criterion.validUntil == 0 || currentTime <= criterion.validUntil);
                   
        } else if (_criterionType == uint8(CriterionType.REPUTATION_SCORE)) {
            ReputationCriterion memory criterion = abi.decode(criterionData, (ReputationCriterion));
            if (!criterion.isActive) return false;
            
            if (criterion.scoringContract != address(0)) {
                // Call external scoring contract (would need interface)
                return true; // Simplified for now
            } else {
                return reputationScores[_wearer] >= criterion.minimumScore;
            }
            
        } else if (_criterionType == uint8(CriterionType.STAKING)) {
            StakingCriterion memory criterion = abi.decode(criterionData, (StakingCriterion));
            if (!criterion.isActive) return false;
            
            // Would need staking pool interface to check staked amount
            return true; // Simplified for now
        }
        
        return false;
    }

    /*//////////////////////////////////////////////////////////////
                       CRITERION MANAGEMENT
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Add a token balance criterion to a hat
     * @param _hatId The hat ID
     * @param _contractAddress The token contract address
     * @param _minimumAmount The minimum token balance required
     * @param _requireAll Whether all criteria must be met
     */
    function addTokenBalanceCriterion(
        uint256 _hatId,
        address _contractAddress,
        uint256 _minimumAmount,
        bool _requireAll
    ) external onlyHatAdmin(_hatId) {
        TokenBalanceCriterion memory criterion = TokenBalanceCriterion({
            contractAddress: _contractAddress,
            minimumAmount: _minimumAmount,
            isActive: true
        });
        
        bytes32 criterionHash = keccak256(abi.encodePacked(_contractAddress, _minimumAmount));
        criteria[_hatId][uint8(CriterionType.TOKEN_BALANCE)][criterionHash] = abi.encode(criterion);
        hatCriteria[_hatId].push(criterionHash);
        requireAllCriteria[_hatId] = _requireAll;
        
        emit CriterionAdded(_hatId, uint8(CriterionType.TOKEN_BALANCE), criterionHash);
    }
    
    /**
     * @notice Add an NFT ownership criterion to a hat
     * @param _hatId The hat ID
     * @param _contractAddress The NFT contract address
     * @param _tokenId The specific token ID (0 for any token)
     * @param _isERC1155 Whether the contract is ERC1155
     * @param _requireAll Whether all criteria must be met
     */
    function addNFTOwnershipCriterion(
        uint256 _hatId,
        address _contractAddress,
        uint256 _tokenId,
        bool _isERC1155,
        bool _requireAll
    ) external onlyHatAdmin(_hatId) {
        NFTOwnershipCriterion memory criterion = NFTOwnershipCriterion({
            contractAddress: _contractAddress,
            tokenId: _tokenId,
            isERC1155: _isERC1155,
            isActive: true
        });
        
        bytes32 criterionHash = keccak256(abi.encodePacked(_contractAddress, _tokenId, _isERC1155));
        criteria[_hatId][uint8(CriterionType.NFT_OWNERSHIP)][criterionHash] = abi.encode(criterion);
        hatCriteria[_hatId].push(criterionHash);
        requireAllCriteria[_hatId] = _requireAll;
        
        emit CriterionAdded(_hatId, uint8(CriterionType.NFT_OWNERSHIP), criterionHash);
    }
    
    /**
     * @notice Add an agreement signing criterion to a hat
     * @param _hatId The hat ID
     * @param _agreementHash The hash of the agreement that must be signed
     * @param _requireAll Whether all criteria must be met
     */
    function addAgreementCriterion(
        uint256 _hatId,
        bytes32 _agreementHash,
        bool _requireAll
    ) external onlyHatAdmin(_hatId) {
        AgreementCriterion memory criterion = AgreementCriterion({
            agreementHash: _agreementHash,
            isActive: true
        });
        
        bytes32 criterionHash = _agreementHash;
        criteria[_hatId][uint8(CriterionType.AGREEMENT_SIGNED)][criterionHash] = abi.encode(criterion);
        hatCriteria[_hatId].push(criterionHash);
        requireAllCriteria[_hatId] = _requireAll;
        
        emit CriterionAdded(_hatId, uint8(CriterionType.AGREEMENT_SIGNED), criterionHash);
    }
    
    /**
     * @notice Add a time-based criterion to a hat
     * @param _hatId The hat ID
     * @param _validFrom The timestamp when the criterion becomes valid (0 for immediate)
     * @param _validUntil The timestamp when the criterion expires (0 for no expiration)
     * @param _requireAll Whether all criteria must be met
     */
    function addTimeCriterion(
        uint256 _hatId,
        uint256 _validFrom,
        uint256 _validUntil,
        bool _requireAll
    ) external onlyHatAdmin(_hatId) {
        require(_validUntil == 0 || _validUntil > _validFrom, "Invalid time range");
        
        TimeCriterion memory criterion = TimeCriterion({
            validFrom: _validFrom,
            validUntil: _validUntil,
            isActive: true
        });
        
        bytes32 criterionHash = keccak256(abi.encodePacked(_validFrom, _validUntil));
        criteria[_hatId][uint8(CriterionType.TIME_BASED)][criterionHash] = abi.encode(criterion);
        hatCriteria[_hatId].push(criterionHash);
        requireAllCriteria[_hatId] = _requireAll;
        
        emit CriterionAdded(_hatId, uint8(CriterionType.TIME_BASED), criterionHash);
    }

    /**
     * @notice Sign an agreement
     * @param _agreementHash The hash of the agreement being signed
     */
    function signAgreement(bytes32 _agreementHash) external {
        agreementSignatures[_agreementHash][msg.sender] = true;
        emit AgreementSigned(msg.sender, _agreementHash, block.timestamp);
    }
    
    /**
     * @notice Update a user's reputation score (only owner)
     * @param _user The user address
     * @param _score The new reputation score
     */
    function updateReputationScore(address _user, uint256 _score) external onlyOwner {
        reputationScores[_user] = _score;
        emit ReputationScoreUpdated(_user, _score);
    }
    
    /**
     * @notice Remove a criterion from a hat
     * @param _hatId The hat ID
     * @param _criterionType The criterion type
     * @param _criterionHash The criterion hash
     */
    function removeCriterion(
        uint256 _hatId,
        uint8 _criterionType,
        bytes32 _criterionHash
    ) external onlyHatAdmin(_hatId) {
        delete criteria[_hatId][_criterionType][_criterionHash];
        
        // Remove from hatCriteria array
        bytes32[] storage hashes = hatCriteria[_hatId];
        for (uint256 i = 0; i < hashes.length; i++) {
            if (hashes[i] == _criterionHash) {
                hashes[i] = hashes[hashes.length - 1];
                hashes.pop();
                break;
            }
        }
        
        emit CriterionRemoved(_hatId, _criterionHash);
    }

    /*//////////////////////////////////////////////////////////////
                           VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /**
     * @notice Get all criteria for a hat
     * @param _hatId The hat ID
     * @return An array of criterion hashes
     */
    function getHatCriteria(uint256 _hatId) external view returns (bytes32[] memory) {
        return hatCriteria[_hatId];
    }
    
    /**
     * @notice Check if a user has signed an agreement
     * @param _agreementHash The agreement hash
     * @param _user The user address
     * @return Whether the user has signed the agreement
     */
    function hasSignedAgreement(bytes32 _agreementHash, address _user) external view returns (bool) {
        return agreementSignatures[_agreementHash][_user];
    }
    
    /**
     * @notice Get a user's reputation score
     * @param _user The user address
     * @return The user's reputation score
     */
    function getUserReputationScore(address _user) external view returns (uint256) {
        return reputationScores[_user];
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// ============================================================================
// INTERFACES (included directly for Remix compatibility)
// ============================================================================

interface IHatsEligibility {
    /**
     * @notice Returns the eligibility and standing status for a wearer
     * @param _wearer The address to check
     * @param _hatId The HAT ID to check eligibility for
     * @return eligible Whether the wearer is eligible for the HAT
     * @return standing Whether the wearer is in good standing
     */
    function getWearerStatus(address _wearer, uint256 _hatId)
        external
        view
        returns (bool eligible, bool standing);
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
}

// ============================================================================
// MAIN CONTRACT
// ============================================================================

contract MultiCriteriaEligibilityModule is IHatsEligibility {
    // Criterion types
    enum CriterionType {
        TOKEN_BALANCE,
        TIME_BASED,
        AGREEMENT_SIGNED,
        CREDENTIAL_OWNERSHIP,
        REPUTATION_SCORE,
        STAKING
    }

    struct TimeCriterion {
        uint256 validFrom;
        uint256 validUntil;
        bool requireAll;
    }

    struct TokenBalanceCriterion {
        address tokenContract;
        uint256 minimumAmount;
        bool requireAll;
    }

    struct AgreementCriterion {
        bytes32 agreementHash;
        bool requireAll;
    }

    struct CredentialCriterion {
        address credentialContract;
        uint256 tokenId;
        bool requireAll;
    }

    // Storage: hatId => criterionHash => criterion data
    mapping(uint256 => mapping(bytes32 => TimeCriterion)) public timeCriteria;
    mapping(uint256 => mapping(bytes32 => TokenBalanceCriterion)) public tokenBalanceCriteria;
    mapping(uint256 => mapping(bytes32 => AgreementCriterion)) public agreementCriteria;
    mapping(uint256 => mapping(bytes32 => CredentialCriterion)) public credentialCriteria;

    // Track active criteria for each HAT
    mapping(uint256 => bytes32[]) public activeCriteriaHashes;
    mapping(uint256 => CriterionType[]) public activeCriteriaTypes;

    // Track agreement signatures
    mapping(address => mapping(bytes32 => bool)) public agreementSignatures;

    // Admin management
    address public immutable hatsProtocol;
    mapping(uint256 => address) public hatAdmins;

    event TimeCriterionAdded(uint256 indexed hatId, uint256 validFrom, uint256 validUntil);
    event TokenBalanceCriterionAdded(uint256 indexed hatId, address indexed tokenContract, uint256 minimumAmount);
    event AgreementCriterionAdded(uint256 indexed hatId, bytes32 indexed agreementHash);
    event CredentialCriterionAdded(uint256 indexed hatId, address indexed credentialContract, uint256 tokenId);
    event AgreementSigned(address indexed signer, bytes32 indexed agreementHash);
    event CriteriaCleared(uint256 indexed hatId);

    modifier onlyHatAdmin(uint256 _hatId) {
        require(
            msg.sender == hatAdmins[_hatId] || msg.sender == address(this),
            "Only HAT admin can manage criteria"
        );
        _;
    }

    constructor(address _hatsProtocol) {
        hatsProtocol = _hatsProtocol;
    }

    /**
     * @notice Set the admin for a HAT (one-time setup per HAT)
     */
    function setHatAdmin(uint256 _hatId, address _admin) external {
        require(hatAdmins[_hatId] == address(0), "Admin already set");
        hatAdmins[_hatId] = _admin;
    }

    /**
     * @notice Clear all criteria for a HAT
     */
    function clearAllCriteria(uint256 _hatId) external onlyHatAdmin(_hatId) {
        delete activeCriteriaHashes[_hatId];
        delete activeCriteriaTypes[_hatId];
        emit CriteriaCleared(_hatId);
    }

    /**
     * @notice Add a time-based criterion
     */
    function addTimeCriterion(
        uint256 _hatId,
        uint256 _validFrom,
        uint256 _validUntil,
        bool _requireAll
    ) external onlyHatAdmin(_hatId) {
        bytes32 hash = keccak256(abi.encodePacked(_validFrom, _validUntil));
        timeCriteria[_hatId][hash] = TimeCriterion(_validFrom, _validUntil, _requireAll);
        activeCriteriaHashes[_hatId].push(hash);
        activeCriteriaTypes[_hatId].push(CriterionType.TIME_BASED);

        emit TimeCriterionAdded(_hatId, _validFrom, _validUntil);
    }

    /**
     * @notice Add a token balance criterion
     */
    function addTokenBalanceCriterion(
        uint256 _hatId,
        address _tokenContract,
        uint256 _minimumAmount,
        bool _requireAll
    ) external onlyHatAdmin(_hatId) {
        bytes32 hash = keccak256(abi.encodePacked(_tokenContract, _minimumAmount));
        tokenBalanceCriteria[_hatId][hash] = TokenBalanceCriterion(_tokenContract, _minimumAmount, _requireAll);
        activeCriteriaHashes[_hatId].push(hash);
        activeCriteriaTypes[_hatId].push(CriterionType.TOKEN_BALANCE);

        emit TokenBalanceCriterionAdded(_hatId, _tokenContract, _minimumAmount);
    }

    /**
     * @notice Add an agreement signing criterion
     */
    function addAgreementCriterion(
        uint256 _hatId,
        bytes32 _agreementHash,
        bool _requireAll
    ) external onlyHatAdmin(_hatId) {
        agreementCriteria[_hatId][_agreementHash] = AgreementCriterion(_agreementHash, _requireAll);
        activeCriteriaHashes[_hatId].push(_agreementHash);
        activeCriteriaTypes[_hatId].push(CriterionType.AGREEMENT_SIGNED);

        emit AgreementCriterionAdded(_hatId, _agreementHash);
    }

    /**
     * @notice Add a credential ownership criterion (NFT/HAT)
     */
    function addCredentialCriterion(
        uint256 _hatId,
        address _credentialContract,
        uint256 _tokenId,
        bool _requireAll
    ) external onlyHatAdmin(_hatId) {
        bytes32 hash = keccak256(abi.encodePacked(_credentialContract, _tokenId));
        credentialCriteria[_hatId][hash] = CredentialCriterion(_credentialContract, _tokenId, _requireAll);
        activeCriteriaHashes[_hatId].push(hash);
        activeCriteriaTypes[_hatId].push(CriterionType.CREDENTIAL_OWNERSHIP);

        emit CredentialCriterionAdded(_hatId, _credentialContract, _tokenId);
    }

    /**
     * @notice User signs an agreement on-chain
     */
    function signAgreement(bytes32 _agreementHash) external {
        agreementSignatures[msg.sender][_agreementHash] = true;
        emit AgreementSigned(msg.sender, _agreementHash);
    }

    /**
     * @notice IHatsEligibility implementation - Check if wearer is eligible
     */
    function getWearerStatus(address _wearer, uint256 _hatId)
        external
        view
        override
        returns (bool eligible, bool standing)
    {
        // No criteria = eligible by default
        if (activeCriteriaHashes[_hatId].length == 0) {
            return (true, true);
        }

        // Check all criteria
        bool allPassed = true;

        for (uint256 i = 0; i < activeCriteriaTypes[_hatId].length; i++) {
            CriterionType criterionType = activeCriteriaTypes[_hatId][i];
            bytes32 hash = activeCriteriaHashes[_hatId][i];

            if (criterionType == CriterionType.TIME_BASED) {
                TimeCriterion memory criterion = timeCriteria[_hatId][hash];
                bool passed = block.timestamp >= criterion.validFrom &&
                             block.timestamp <= criterion.validUntil;
                if (!passed && criterion.requireAll) {
                    return (false, true); // Not eligible but in good standing
                }
                allPassed = allPassed && passed;

            } else if (criterionType == CriterionType.TOKEN_BALANCE) {
                TokenBalanceCriterion memory criterion = tokenBalanceCriteria[_hatId][hash];
                uint256 balance = IERC20(criterion.tokenContract).balanceOf(_wearer);
                bool passed = balance >= criterion.minimumAmount;
                if (!passed && criterion.requireAll) {
                    return (false, true);
                }
                allPassed = allPassed && passed;

            } else if (criterionType == CriterionType.AGREEMENT_SIGNED) {
                AgreementCriterion memory criterion = agreementCriteria[_hatId][hash];
                bool passed = agreementSignatures[_wearer][criterion.agreementHash];
                if (!passed && criterion.requireAll) {
                    return (false, true);
                }
                allPassed = allPassed && passed;

            } else if (criterionType == CriterionType.CREDENTIAL_OWNERSHIP) {
                CredentialCriterion memory criterion = credentialCriteria[_hatId][hash];
                bool passed = IERC721(criterion.credentialContract).ownerOf(criterion.tokenId) == _wearer;
                if (!passed && criterion.requireAll) {
                    return (false, true);
                }
                allPassed = allPassed && passed;
            }
        }

        return (allPassed, true);
    }
}

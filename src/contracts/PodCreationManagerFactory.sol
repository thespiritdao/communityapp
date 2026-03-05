// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PodCreationManagerV2.sol";

/**
 * @title PodCreationManagerFactory
 * @dev Deploys a PodCreationManagerV2 instance per pod.
 *
 * Deploy this factory once. When a pod is activated, the review API calls
 * deployManager() to create a self-sovereign PodCreationManagerV2 for that pod.
 *
 * The deployed manager uses:
 *   parentHatId = pod's management hat (so it can createHat under it)
 *   execHatId   = pod's management hat (so pod leaders gate sub-pod approval)
 *
 * The factory owner must transfer the pod's management hat admin rights to each
 * deployed manager — or the Hats Protocol must recognise the manager as an admin
 * of the parentHat. In practice, the COMMUNITY_PODS_PARENT admin (the top-level
 * manager) mints child hats; individual pod managers need hat admin rights granted
 * by the parent manager or the top-hat admin.
 */
contract PodCreationManagerFactory {

    address public immutable hatsContract;
    address public immutable treasuryFactory;
    address public owner;

    // podUUID => deployed manager address
    mapping(string => address) public managerForPod;

    event ManagerDeployed(
        string indexed podUUID,
        address indexed manager,
        uint256 parentHatId,
        uint256 execHatId
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _hatsContract, address _treasuryFactory) {
        require(_hatsContract != address(0), "Invalid hats contract");
        require(_treasuryFactory != address(0), "Invalid treasury factory");
        hatsContract = _hatsContract;
        treasuryFactory = _treasuryFactory;
        owner = msg.sender;
    }

    /**
     * @notice Deploy a PodCreationManagerV2 for a pod.
     * @param podUUID         Off-chain UUID of the pod (for lookup).
     * @param parentHatId     The pod's management hat — new sub-pods created under it.
     * @param execHatId       Hat that gates sub-pod approval (same as parentHatId for self-sovereign pods).
     * @param defaultTokens   Default supported tokens for pod treasuries.
     * @param managerOwner    Address that will own the deployed manager (typically the admin wallet).
     */
    function deployManager(
        string memory podUUID,
        uint256 parentHatId,
        uint256 execHatId,
        address[] memory defaultTokens,
        address managerOwner
    ) external onlyOwner returns (address manager) {
        require(managerForPod[podUUID] == address(0), "Manager already deployed");
        require(parentHatId > 0, "Invalid parent hat");
        require(execHatId > 0, "Invalid exec hat");
        require(managerOwner != address(0), "Invalid owner");

        manager = address(new PodCreationManagerV2(
            hatsContract,
            parentHatId,
            execHatId,
            treasuryFactory,
            defaultTokens,
            managerOwner
        ));

        managerForPod[podUUID] = manager;

        emit ManagerDeployed(podUUID, manager, parentHatId, execHatId);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }
}

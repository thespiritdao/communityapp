// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AgentRegistry
 * @author SpiritDAO
 * @notice On-chain registry of artificial members ("congregants") of SpiritDAO pods
 *
 * @dev This contract is the single on-chain source of truth for "this address
 * belongs to an AI agent, not a human member." It exists so that the agent's
 * exclusion from governance standing is a property of shared infrastructure
 * rather than backend policy:
 *
 * - Token contracts (Proof of Curiosity, $SELF, Advocate) can guard their mint
 *   paths with `isRegistered(recipient)` to refuse issuing standing to agents.
 * - Hats eligibility modules can return ineligible for registered addresses.
 * - Anyone can verify on Basescan that a given agent address is registered and
 *   that it holds no vote, hat, or standing token.
 *
 * Registration is PERMANENT by design: `isRegistered` never becomes false once
 * set, because an address that ever belonged to a machine never becomes a
 * human member. `isAgent` additionally reflects operational status — a pod may
 * deactivate its agent (subscription lapse, retirement) without erasing the
 * historical record.
 *
 * Admin model (mirrors HatMinter):
 * - Wearers of the Executive Pod Leader hat may register/deactivate agents,
 *   so constitutional control follows the hat, not a key.
 * - `authorizedCallers` lets the backend service wallet operate gaslessly via
 *   the Coinbase Paymaster (whitelist this contract after deployment).
 */

interface IHats {
    function isWearerOfHat(address user, uint256 hatId) external view returns (bool);
}

contract AgentRegistry {
    // ============================================================
    // STORAGE
    // ============================================================

    /// @notice Hats Protocol contract address (Base: 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137)
    IHats public immutable hatsProtocol;

    /// @notice Executive Pod Leader hat ID — wearers may administer the registry
    uint256 public immutable adminHatId;

    /// @notice Contract owner (can add/remove authorized callers)
    address public owner;

    /// @notice Authorized backend addresses that can call admin functions
    mapping(address => bool) public authorizedCallers;

    struct Agent {
        /// @dev Pod UUID (32 hex chars) left-padded into bytes32
        bytes32 podId;
        bool registered;
        bool active;
        uint64 registeredAt;
    }

    mapping(address => Agent) private agents;

    /// @notice One active agent address per pod
    mapping(bytes32 => address) public agentForPod;

    /// @notice All addresses ever registered (append-only, for enumeration)
    address[] public agentList;

    // ============================================================
    // EVENTS
    // ============================================================

    event AgentRegistered(address indexed agent, bytes32 indexed podId, address indexed caller);
    event AgentDeactivated(address indexed agent, bytes32 indexed podId, address indexed caller);
    event AgentReactivated(address indexed agent, bytes32 indexed podId, address indexed caller);
    event CallerAuthorized(address indexed caller, bool authorized);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ============================================================
    // ERRORS
    // ============================================================

    error Unauthorized();
    error InvalidAddress();
    error AlreadyRegistered();
    error NotRegistered();
    error PodAlreadyHasAgent();

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    /**
     * @param _hatsProtocol Address of Hats Protocol contract
     * @param _adminHatId Executive Pod Leader hat ID
     * @param _initialOwner Initial owner of the contract
     */
    constructor(address _hatsProtocol, uint256 _adminHatId, address _initialOwner) {
        if (_hatsProtocol == address(0) || _initialOwner == address(0)) {
            revert InvalidAddress();
        }

        hatsProtocol = IHats(_hatsProtocol);
        adminHatId = _adminHatId;
        owner = _initialOwner;

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

    /// @dev Owner, authorized backend, or Executive Pod Leader hat wearer
    modifier onlyAdmin() {
        if (
            msg.sender != owner &&
            !authorizedCallers[msg.sender] &&
            !hatsProtocol.isWearerOfHat(msg.sender, adminHatId)
        ) revert Unauthorized();
        _;
    }

    // ============================================================
    // REGISTRY FUNCTIONS
    // ============================================================

    /**
     * @notice Register an address as a pod's AI agent
     * @param agent The agent's wallet address (CDP smart account)
     * @param podId Pod UUID as bytes32 (32 hex chars, left-padded)
     */
    function registerAgent(address agent, bytes32 podId) external onlyAdmin {
        if (agent == address(0)) revert InvalidAddress();
        if (agents[agent].registered) revert AlreadyRegistered();

        address existing = agentForPod[podId];
        if (existing != address(0) && agents[existing].active) revert PodAlreadyHasAgent();

        agents[agent] = Agent({
            podId: podId,
            registered: true,
            active: true,
            registeredAt: uint64(block.timestamp)
        });
        agentForPod[podId] = agent;
        agentList.push(agent);

        emit AgentRegistered(agent, podId, msg.sender);
    }

    /**
     * @notice Deactivate a pod's agent (subscription lapse, retirement, key rotation)
     * @dev Does NOT clear `isRegistered` — the address remains permanently
     *      flagged as artificial for mint guards and eligibility modules.
     */
    function deactivateAgent(address agent) external onlyAdmin {
        Agent storage a = agents[agent];
        if (!a.registered) revert NotRegistered();

        a.active = false;
        if (agentForPod[a.podId] == agent) {
            agentForPod[a.podId] = address(0);
        }

        emit AgentDeactivated(agent, a.podId, msg.sender);
    }

    /**
     * @notice Reactivate a previously deactivated agent (e.g. subscription renewed)
     */
    function reactivateAgent(address agent) external onlyAdmin {
        Agent storage a = agents[agent];
        if (!a.registered) revert NotRegistered();

        address existing = agentForPod[a.podId];
        if (existing != address(0) && existing != agent && agents[existing].active) {
            revert PodAlreadyHasAgent();
        }

        a.active = true;
        agentForPod[a.podId] = agent;

        emit AgentReactivated(agent, a.podId, msg.sender);
    }

    // ============================================================
    // ADMIN FUNCTIONS
    // ============================================================

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        if (caller == address(0)) revert InvalidAddress();
        authorizedCallers[caller] = authorized;
        emit CallerAuthorized(caller, authorized);
    }

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
     * @notice Is this address a currently operating agent?
     * @dev Use for operational checks (may this agent act right now?).
     */
    function isAgent(address account) external view returns (bool) {
        return agents[account].active;
    }

    /**
     * @notice Has this address EVER been registered as an agent?
     * @dev Use for constitutional exclusion (mint guards, eligibility modules).
     *      Never reverts to false once set.
     */
    function isRegistered(address account) external view returns (bool) {
        return agents[account].registered;
    }

    /**
     * @notice Full registration record for an address
     */
    function agentInfo(address account)
        external
        view
        returns (bytes32 podId, bool registered, bool active, uint64 registeredAt)
    {
        Agent storage a = agents[account];
        return (a.podId, a.registered, a.active, a.registeredAt);
    }

    /// @notice Number of addresses ever registered
    function agentCount() external view returns (uint256) {
        return agentList.length;
    }
}

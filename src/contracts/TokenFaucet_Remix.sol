// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TokenFaucet (Remix-Compatible Version)
 * @notice Allows users to claim SYSTEM and SELF tokens once every 24 hours
 * @dev Designed to be whitelisted on Coinbase Paymaster for gasless claims
 *
 * DEPLOYMENT INSTRUCTIONS FOR REMIX:
 * 1. Copy this entire file into Remix
 * 2. Compile with Solidity 0.8.20
 * 3. Deploy to Base Mainnet with:
 *    - _systemToken: 0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
 *    - _selfToken: 0x1b8d424695E63ABca04E94bA46c03f1D83e14020
 * 4. After deployment, whitelist claimTokens() on Coinbase Paymaster
 * 5. Fund the contract with tokens using fund-faucet.ts script
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
}

abstract contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        _transferOwnership(initialOwner);
    }

    modifier onlyOwner() {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

contract TokenFaucet is Ownable, ReentrancyGuard {
    // Token contracts
    IERC20 public immutable systemToken;
    IERC20 public immutable selfToken;

    // Claim amounts (in wei, 10 tokens = 10e18)
    uint256 public systemClaimAmount = 10 ether;
    uint256 public selfClaimAmount = 10 ether;

    // Cooldown period (24 hours)
    uint256 public constant COOLDOWN_PERIOD = 24 hours;

    // Track last claim time for each user
    mapping(address => uint256) public lastClaimTime;

    // Events
    event TokensClaimed(
        address indexed user,
        uint256 systemAmount,
        uint256 selfAmount,
        uint256 timestamp
    );
    event ClaimAmountsUpdated(uint256 systemAmount, uint256 selfAmount);
    event TokensDeposited(address indexed token, uint256 amount);
    event EmergencyWithdraw(address indexed token, uint256 amount);

    /**
     * @notice Initialize faucet with token addresses
     * @param _systemToken Address of SYSTEM token
     * @param _selfToken Address of SELF token
     */
    constructor(
        address _systemToken,
        address _selfToken
    ) Ownable(msg.sender) {
        require(_systemToken != address(0), "Invalid SYSTEM token address");
        require(_selfToken != address(0), "Invalid SELF token address");

        systemToken = IERC20(_systemToken);
        selfToken = IERC20(_selfToken);
    }

    /**
     * @notice Claim tokens (callable by anyone, once per 24 hours)
     * @dev This is the function to whitelist on Coinbase Paymaster
     */
    function claimTokens() external nonReentrant {
        address user = msg.sender;

        // Check cooldown period
        require(
            block.timestamp >= lastClaimTime[user] + COOLDOWN_PERIOD,
            "Claim cooldown active. Please wait 24 hours between claims."
        );

        // Check faucet has enough tokens
        require(
            systemToken.balanceOf(address(this)) >= systemClaimAmount,
            "Insufficient SYSTEM tokens in faucet"
        );
        require(
            selfToken.balanceOf(address(this)) >= selfClaimAmount,
            "Insufficient SELF tokens in faucet"
        );

        // Update last claim time
        lastClaimTime[user] = block.timestamp;

        // Transfer tokens
        require(
            systemToken.transfer(user, systemClaimAmount),
            "SYSTEM token transfer failed"
        );
        require(
            selfToken.transfer(user, selfClaimAmount),
            "SELF token transfer failed"
        );

        emit TokensClaimed(user, systemClaimAmount, selfClaimAmount, block.timestamp);
    }

    /**
     * @notice Get time remaining until user can claim again
     * @param user Address to check
     * @return seconds until next claim (0 if can claim now)
     */
    function getTimeUntilNextClaim(address user) external view returns (uint256) {
        uint256 nextClaimTime = lastClaimTime[user] + COOLDOWN_PERIOD;

        if (block.timestamp >= nextClaimTime) {
            return 0;
        }

        return nextClaimTime - block.timestamp;
    }

    /**
     * @notice Check if user can claim now
     * @param user Address to check
     * @return true if user can claim
     */
    function canClaim(address user) external view returns (bool) {
        return block.timestamp >= lastClaimTime[user] + COOLDOWN_PERIOD;
    }

    /**
     * @notice Get faucet token balances
     * @return systemBalance Balance of SYSTEM tokens
     * @return selfBalance Balance of SELF tokens
     */
    function getFaucetBalances() external view returns (uint256 systemBalance, uint256 selfBalance) {
        systemBalance = systemToken.balanceOf(address(this));
        selfBalance = selfToken.balanceOf(address(this));
    }

    /**
     * @notice Update claim amounts (owner only)
     * @param _systemAmount New SYSTEM claim amount
     * @param _selfAmount New SELF claim amount
     */
    function updateClaimAmounts(
        uint256 _systemAmount,
        uint256 _selfAmount
    ) external onlyOwner {
        require(_systemAmount > 0, "Invalid SYSTEM amount");
        require(_selfAmount > 0, "Invalid SELF amount");

        systemClaimAmount = _systemAmount;
        selfClaimAmount = _selfAmount;

        emit ClaimAmountsUpdated(_systemAmount, _selfAmount);
    }

    /**
     * @notice Fund faucet with tokens (anyone can fund)
     * @param token Token address (SYSTEM or SELF)
     * @param amount Amount to deposit
     */
    function fundFaucet(address token, uint256 amount) external {
        require(
            token == address(systemToken) || token == address(selfToken),
            "Invalid token address"
        );
        require(amount > 0, "Amount must be greater than 0");

        IERC20(token).transferFrom(msg.sender, address(this), amount);

        emit TokensDeposited(token, amount);
    }

    /**
     * @notice Emergency withdraw (owner only)
     * @param token Token address to withdraw
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        uint256 amount
    ) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");

        IERC20(token).transfer(owner(), amount);

        emit EmergencyWithdraw(token, amount);
    }
}

# SystemTokenV2 Migration: Complete Redeployment Plan

## Critical Clarification

**ONE SystemToken contract for the entire ecosystem** - everything must use the same token to maintain 1:1 fiat peg.

You're absolutely right - having two SystemToken contracts defeats the purpose of a unified token.

## Contracts That MUST Be Updated

### Contracts with Update Functions ✅ (No Redeploy)

| Contract | Address | Update Function | Status |
|----------|---------|----------------|--------|
| **BountyManagerV4** | `0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2` | `updatePrimaryTokens()` | ✅ Call function |
| **EventManager** | `0x5e77aD7dD2C93E19aad6ab3c0a8829b729fEA3F9` | `updateTokenAddresses()` | ✅ Call function |

### Contracts with Immutable Addresses ⚠️ (Must Redeploy)

| Contract | Address | Token Storage | Status |
|----------|---------|---------------|--------|
| **TokenFaucet** | `0x189aA1FA8CC41A26944A0957015d9902057c1dbA` | `immutable` | ⚠️ Must redeploy |
| **PurchaseRouter** | `0xCd39D4AE4fcf91e49591396Fd9f62019878f0b78` | `immutable` | ⚠️ Must redeploy |
| **PurchaseRouterDecentralized** | `0x2A2A62f313354f41E4bD0ff61bAd4DE85db722c9` | `immutable` | ⚠️ Must redeploy |

## Why Redeployment is Required

### TokenFaucet

```solidity
IERC20 public immutable systemToken;  // ← Cannot change!

constructor(address _systemToken, address _selfToken) {
    systemToken = IERC20(_systemToken);  // ← Set once, forever
}
```

**Impact if not redeployed:**
- Faucet would distribute OLD SystemToken V1
- Users would receive wrong token
- 1:1 fiat peg broken

### PurchaseRouter

```solidity
IERC20 public immutable systemToken;  // ← Cannot change!

constructor(...) {
    systemToken = IERC20(_systemToken);  // ← Set once, forever
}
```

**Impact if not redeployed:**
- Market would accept OLD SystemToken V1
- Purchase/burn mechanisms use wrong token
- 1:1 fiat peg broken

## Complete Migration Plan

### Phase 1: Deploy New Contracts

**1.1 Deploy SystemTokenV2**
```javascript
const SystemTokenV2 = await ethers.getContractFactory("SystemTokenV2");
const systemTokenV2 = await SystemTokenV2.deploy(
  0, // Initial supply (already minted in V1)
  treasuryAddress,
  "0x3bc1A0Ad72417f2d411118085256fC53CBdDd137", // Hats Protocol
  "0x0000008800010000000000000000000000000000000000000000000000000000" // Exec Hat
);
```

**1.2 Redeploy TokenFaucet**
```javascript
const TokenFaucet = await ethers.getContractFactory("TokenFaucet");
const faucet = await TokenFaucet.deploy(
  systemTokenV2.address, // ← New SystemTokenV2
  selfTokenAddress
);
```

**1.3 Redeploy PurchaseRouter**
```javascript
const PurchaseRouter = await ethers.getContractFactory("PurchaseRouter");
const purchaseRouter = await PurchaseRouter.deploy(
  systemTokenV2.address, // ← New SystemTokenV2
  selfTokenAddress,
  // ... other params
);
```

**1.4 Redeploy PurchaseRouterDecentralized**
```javascript
const PurchaseRouterDecentralized = await ethers.getContractFactory("PurchaseRouterDecentralized");
const purchaseRouterDecentralized = await PurchaseRouterDecentralized.deploy(
  systemTokenV2.address, // ← New SystemTokenV2
  selfTokenAddress,
  // ... other params
);
```

### Phase 2: Update Existing Contracts

**2.1 Update BountyManagerV4**
```javascript
// Connect to deployed contract
const bountyManager = await ethers.getContractAt(
  "BountyManagerV4",
  "0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2"
);

// Update token addresses
await bountyManager.updatePrimaryTokens(
  systemTokenV2.address,
  selfTokenAddress
);

// Whitelist new token
await bountyManager.setTokenAllowed(systemTokenV2.address, true);
```

**2.2 Update EventManager**
```javascript
// Connect to deployed contract
const eventManager = await ethers.getContractAt(
  "EventManager",
  "0x5e77aD7dD2C93E19aad6ab3c0a8829b729fEA3F9"
);

// Update token addresses
await eventManager.updateTokenAddresses(
  systemTokenV2.address,
  selfTokenAddress
);
```

### Phase 3: Update CDP Paymaster

**Add to Whitelist:**
1. SystemTokenV2 contract address
2. Functions:
   - `mint(address,uint256)`
   - Any other functions that need gasless support

**Also whitelist NEW contracts:**
1. New TokenFaucet address
   - Function: `claimTokens()`
2. New PurchaseRouter address
   - Relevant functions

### Phase 4: Update Environment Variables

```bash
# Old
NEXT_PUBLIC_SYSTEM_TOKEN=0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
NEXT_PUBLIC_TOKEN_FAUCET=0x189aA1FA8CC41A26944A0957015d9902057c1dbA
NEXT_PUBLIC_PURCHASE_ROUTER=0xCd39D4AE4fcf91e49591396Fd9f62019878f0b78
NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED=0x2A2A62f313354f41E4bD0ff61bAd4DE85db722c9

# New
NEXT_PUBLIC_SYSTEM_TOKEN=0x[NEW_SYSTEMTOKENV2_ADDRESS]
NEXT_PUBLIC_TOKEN_FAUCET=0x[NEW_FAUCET_ADDRESS]
NEXT_PUBLIC_PURCHASE_ROUTER=0x[NEW_PURCHASE_ROUTER_ADDRESS]
NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED=0x[NEW_PURCHASE_ROUTER_DECENTRALIZED_ADDRESS]
```

### Phase 5: Token Migration (Critical!)

**Problem:** Users have balances in SystemToken V1

**Solution Options:**

#### Option A: Parallel Operation (Recommended)
1. Keep V1 balances valid
2. All NEW minting goes to V2
3. Users can:
   - Spend existing V1 tokens (contracts accept both temporarily)
   - Receive new V2 tokens from donations/bounties/faucet
4. Gradually phase out V1

**Implementation:**
- Contracts temporarily accept BOTH tokens
- Add dual-token support in frontend
- Migrate over 30-60 days

#### Option B: Hard Migration
1. Deploy migration contract
2. Users exchange V1 → V2 (1:1)
3. Burn V1, mint equivalent V2
4. Requires user action

**Implementation:**
```solidity
contract SystemTokenMigration {
    function migrate(uint256 amount) external {
        systemTokenV1.transferFrom(msg.sender, address(this), amount);
        systemTokenV1.burn(amount);
        systemTokenV2.mint(msg.sender, amount);
    }
}
```

#### Option C: Snapshot & Airdrop
1. Snapshot all V1 balances at specific block
2. Mint equivalent V2 to all holders
3. Disable V1 minting
4. Users have both until V1 phased out

**Recommendation:** Option A (Parallel Operation) for smoothest UX

### Phase 6: Testing Checklist

- [ ] Deploy SystemTokenV2 to testnet
- [ ] Deploy all dependent contracts to testnet
- [ ] Test minting with Executive Hat
- [ ] Test faucet claims
- [ ] Test bounty creation with $SYSTEM
- [ ] Test event registration with $SYSTEM
- [ ] Test market purchases with $SYSTEM
- [ ] Test token transfers
- [ ] Test Hat revocation → mint permission lost
- [ ] Deploy to mainnet
- [ ] Update all contracts
- [ ] Update CDP Paymaster whitelist
- [ ] Update frontend env vars
- [ ] Deploy frontend
- [ ] Monitor for 48 hours

## Contracts Summary

### Must Redeploy (4 contracts)
1. ✅ SystemTokenV2 (new contract)
2. ✅ TokenFaucet (immutable token address)
3. ✅ PurchaseRouter (immutable token address)
4. ✅ PurchaseRouterDecentralized (immutable token address)

### Can Update via Function (2 contracts)
1. ✅ BountyManagerV4 → `updatePrimaryTokens()`
2. ✅ EventManager → `updateTokenAddresses()`

### Total: 4 new deployments + 2 function calls

## Cost Estimate

**Gas Costs (Base mainnet, ~0.5 gwei):**
- SystemTokenV2 deployment: ~$2-3
- TokenFaucet deployment: ~$1-2
- PurchaseRouter deployment: ~$1-2
- PurchaseRouterDecentralized deployment: ~$1-2
- BountyManager update: ~$0.50
- EventManager update: ~$0.50

**Total: ~$8-10 in gas**

**Time Estimate:**
- Preparation & testing: 2-3 days
- Deployment: 2-3 hours
- Migration period: 30-60 days (parallel operation)

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Users lose V1 balances | High | Low | Parallel operation / Migration contract |
| Faucet distributes wrong token | High | High if not redeployed | **MUST redeploy** |
| Market accepts wrong token | High | High if not redeployed | **MUST redeploy** |
| Frontend shows wrong balances | Medium | Medium | Test thoroughly |
| CDP paymaster not updated | Medium | Medium | Update whitelist |
| Contracts not updated | High | Low | Checklist + verification |

## Conclusion

**Yes, you're right** - we need ONE unified SystemToken contract.

**This means:**
- ✅ Deploy SystemTokenV2
- ✅ Redeploy 4 contracts that have immutable token addresses
- ✅ Update 2 contracts via admin functions
- ✅ Implement token migration strategy for existing holders

**It's more work than just updating functions, but necessary to maintain token unity.**

The good news: Your key contracts (BountyManager, EventManager) were designed with upgrade functions, which minimizes the impact!

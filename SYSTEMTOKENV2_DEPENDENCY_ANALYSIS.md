# SystemTokenV2 Migration: Complete Dependency Analysis

## Contract Dependency Map

```
SystemToken (V1)
├── BountyManagerV4 ✅ Has updatePrimaryTokens()
│   └── No other contracts depend on BountyManagerV4
│
├── EventManager ✅ Has updateTokenAddresses()
│   └── No other contracts depend on EventManager
│
├── TokenFaucet ⚠️ Immutable (must redeploy)
│   └── No other contracts depend on TokenFaucet
│   └── Frontend references via env var
│
├── PurchaseRouter ⚠️ Immutable (must redeploy)
│   ├── Has product destination mappings (on-chain state)
│   ├── Has authorized treasuries (on-chain state)
│   └── Backend API calls it via env var
│   └── Frontend references via env var
│   └── NO other contracts reference it
│
└── PurchaseRouterDecentralized ⚠️ Immutable (must redeploy)
    ├── Has product destination mappings (on-chain state)
    ├── Has authorized treasuries (on-chain state)
    └── Backend API calls it via env var
    └── Frontend references via env var
    └── NO other contracts reference it
```

## Critical Finding: PurchaseRouter State Migration

### Problem

PurchaseRouter has **on-chain state** that will be lost if we just redeploy:

```solidity
// Mapping from productId to fund destination
mapping(string => FundDestination) public productDestinations;

// Mapping to track authorized pod treasuries
mapping(address => bool) public authorizedTreasuries;
```

### Impact

If you have products configured with destinations (burn/wallet/pod_treasury), redeploying PurchaseRouter **loses these configurations**.

**Questions to answer:**
1. How many products have destinations configured?
2. How many treasuries are authorized?
3. Can we export this data and re-configure after deployment?

### Solution Options

#### Option A: Export & Re-import State (Recommended if many products)

**Before Migration:**
1. Query all `ProductDestinationSet` events from current contract
2. Query all `TreasuryAuthorized` events from current contract
3. Save to database or JSON file

**After Migration:**
4. Deploy new PurchaseRouter with SystemTokenV2
5. Re-set all product destinations via `setProductDestination()`
6. Re-authorize all treasuries via `setTreasuryAuthorization()`

**Implementation:**
```javascript
// Step 1: Export existing state
const exportPurchaseRouterState = async () => {
  const productEvents = await publicClient.getContractEvents({
    address: OLD_PURCHASE_ROUTER,
    abi: purchaseRouterABI,
    eventName: 'ProductDestinationSet',
    fromBlock: deploymentBlock,
    toBlock: 'latest'
  });

  const treasuryEvents = await publicClient.getContractEvents({
    address: OLD_PURCHASE_ROUTER,
    abi: purchaseRouterABI,
    eventName: 'TreasuryAuthorized',
    fromBlock: deploymentBlock,
    toBlock: 'latest'
  });

  return {
    products: productEvents.map(e => e.args),
    treasuries: treasuryEvents.map(e => e.args)
  };
};

// Step 2: Re-import to new contract
const importPurchaseRouterState = async (state, newContract) => {
  // Re-authorize treasuries first
  for (const treasury of state.treasuries) {
    await newContract.setTreasuryAuthorization(
      treasury.treasury,
      treasury.authorized
    );
  }

  // Then set product destinations
  for (const product of state.products) {
    await newContract.setProductDestination(
      product.productId,
      product.destinationType,
      product.destinationAddress,
      product.podId
    );
  }
};
```

#### Option B: Fresh Start (Recommended if few/no products)

If you haven't configured many products yet:
1. Deploy new PurchaseRouter
2. Configure products from scratch as needed
3. Simpler, cleaner

#### Option C: Upgradeable Proxy Pattern (Best Long-term)

For future-proofing, consider using UUPS proxy:
1. Deploy PurchaseRouter behind upgradeable proxy
2. Future upgrades don't lose state
3. Can update SystemToken reference without redeploying
4. More complex initial setup

## Complete Dependency Analysis

### Contracts That Must Change

| Contract | Type | Cascading Impact | State Migration |
|----------|------|------------------|-----------------|
| **SystemTokenV2** | New deployment | None (new contract) | Existing V1 balances |
| **BountyManagerV4** | Function call | None | None |
| **EventManager** | Function call | None | None |
| **TokenFaucet** | Redeploy | None | None (stateless) |
| **PurchaseRouter** | Redeploy | **⚠️ YES** | Product destinations + Authorized treasuries |
| **PurchaseRouterDecentralized** | Redeploy | **⚠️ YES** | Product destinations + Authorized treasuries |

### Frontend/Backend That Must Change

| Component | Change Required | Impact |
|-----------|----------------|--------|
| **Environment Variables** | Update 4 addresses | All features using $SYSTEM |
| **ABI Files** | No change needed | SystemTokenV2 compatible |
| **API Routes** | Update env var references | Product destination APIs |
| **Shopping Cart** | Update env var references | Purchase flow |
| **CDP Paymaster** | Whitelist new addresses | Gasless transactions |

### Database That Must Change

| Table | Change Required | Impact |
|-------|----------------|--------|
| **products** | Possibly store destination mapping | If not relying solely on blockchain |
| **transactions** | Token address in records | Historical data shows V1 |
| **bounties** | Token address references | Via env var (auto-updates) |
| **events** | Token address references | Via env var (auto-updates) |

## Cascading Impact Assessment

### Level 1: Direct Dependencies ✅

**BountyManagerV4 → SystemToken**
- Impact: Function call update
- Cascading: None
- Risk: Low

**EventManager → SystemToken**
- Impact: Function call update
- Cascading: None
- Risk: Low

**TokenFaucet → SystemToken**
- Impact: Redeploy
- Cascading: None (no other contracts reference faucet)
- Risk: Low

### Level 2: Purchase System ⚠️

**PurchaseRouter → SystemToken**
- Impact: Redeploy
- Cascading: **State migration required**
- Risk: Medium

**What depends on PurchaseRouter?**
- ✅ Frontend shopping cart (env var update)
- ✅ Backend API routes (env var update)
- ✅ Products with configured destinations (state migration)
- ✅ Authorized pod treasuries (state migration)
- ❌ No other smart contracts

**PurchaseRouterDecentralized → SystemToken**
- Impact: Redeploy
- Cascading: **State migration required**
- Risk: Medium

**What depends on PurchaseRouterDecentralized?**
- ✅ Frontend shopping cart (env var update)
- ✅ Backend API routes (env var update)
- ✅ Products with configured destinations (state migration)
- ✅ Authorized pod treasuries (state migration)
- ❌ No other smart contracts

### Level 3: Indirect Dependencies ✅

**Pod Treasuries**
- Do they reference PurchaseRouter? **NO**
- Impact: None (treasuries are independent)

**Product Metadata**
- Stored on-chain in PurchaseRouter mappings
- Must be migrated to new contract

**Shopping Cart Frontend**
- References PurchaseRouter via env var
- Auto-updates when env var changes

## Migration Checklist with Dependencies

### Pre-Migration Assessment
- [ ] Count products with configured destinations
- [ ] Count authorized treasuries
- [ ] Export PurchaseRouter state (if needed)
- [ ] Export PurchaseRouterDecentralized state (if needed)
- [ ] Audit all env var references

### Deployment Phase
- [ ] Deploy SystemTokenV2
- [ ] Deploy new TokenFaucet (with SystemTokenV2)
- [ ] Deploy new PurchaseRouter (with SystemTokenV2)
- [ ] Deploy new PurchaseRouterDecentralized (with SystemTokenV2)

### State Migration Phase
- [ ] Re-authorize treasuries on new PurchaseRouter
- [ ] Re-set product destinations on new PurchaseRouter
- [ ] Re-authorize treasuries on new PurchaseRouterDecentralized
- [ ] Re-set product destinations on new PurchaseRouterDecentralized
- [ ] Verify all configurations match old contracts

### Configuration Phase
- [ ] Call BountyManagerV4.updatePrimaryTokens()
- [ ] Call EventManager.updateTokenAddresses()
- [ ] Update CDP Paymaster whitelist (5 addresses)
- [ ] Update env vars (4 addresses)
- [ ] Deploy frontend with new env vars

### Verification Phase
- [ ] Test faucet claims with SystemTokenV2
- [ ] Test bounty creation with SystemTokenV2
- [ ] Test event registration with SystemTokenV2
- [ ] Test marketplace purchase with SystemTokenV2
- [ ] Test product destination routing works
- [ ] Test pod treasury purchases work
- [ ] Verify all authorized treasuries are recognized

## Critical Questions to Answer Before Migration

### 1. PurchaseRouter State

**Question:** How many products have destinations configured?

**To check:**
```javascript
// Query all ProductDestinationSet events
const events = await publicClient.getContractEvents({
  address: '0xCd39D4AE4fcf91e49591396Fd9f62019878f0b78',
  abi: purchaseRouterABI,
  eventName: 'ProductDestinationSet',
  fromBlock: 0n, // Or deployment block
  toBlock: 'latest'
});

console.log(`${events.length} products configured`);
```

**Impact:** If > 10 products, state migration is tedious

### 2. Treasury Authorizations

**Question:** How many treasuries are authorized?

**To check:**
```javascript
// Query all TreasuryAuthorized events
const events = await publicClient.getContractEvents({
  address: '0xCd39D4AE4fcf91e49591396Fd9f62019878f0b78',
  abi: purchaseRouterABI,
  eventName: 'TreasuryAuthorized',
  fromBlock: 0n,
  toBlock: 'latest'
});

const authorizedTreasuries = events.filter(e => e.args.authorized);
console.log(`${authorizedTreasuries.length} treasuries authorized`);
```

**Impact:** Must re-authorize all on new contract

### 3. Active Marketplace Usage

**Question:** Are purchases actively happening?

**Impact:**
- High activity = need careful migration timing
- Low activity = easier to migrate during maintenance window

### 4. Product Inventory Database

**Question:** Do you store product destinations in database or only on-chain?

**Impact:**
- If database: Can rebuild on-chain state from DB
- If only on-chain: Must export from blockchain events

## Summary: Cascading Impact

### ✅ GOOD NEWS: No Smart Contract Cascade

**No other smart contracts reference PurchaseRouter or TokenFaucet**
- Contracts are isolated
- No domino effect of redeployments
- Treasury contracts don't depend on PurchaseRouter

### ⚠️ REQUIRES ATTENTION: State Migration

**PurchaseRouter has on-chain configuration state**
- Product destinations must be re-configured
- Treasury authorizations must be re-set
- Manageable if product count is low
- Tedious if many products configured

### ✅ MINIMAL FRONTEND IMPACT

**All references via environment variables**
- Update 4 env vars
- Redeploy frontend
- No code changes required

## Recommendation

1. **Before proceeding, check PurchaseRouter state:**
   - Query ProductDestinationSet events
   - Query TreasuryAuthorized events
   - Assess migration effort

2. **If state is minimal (< 10 products):**
   - ✅ Proceed with full redeployment
   - Manually reconfigure after deployment
   - 2-3 hours total

3. **If state is substantial (> 10 products):**
   - Consider automation script for state migration
   - Or consider upgradeable proxy pattern
   - 1-2 days for migration tooling

4. **No other contracts are impacted** - the cascade stops at PurchaseRouter

The dependency chain is **shallow and manageable**! 🎯

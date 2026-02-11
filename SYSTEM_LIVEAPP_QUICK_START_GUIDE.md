# SystemTokenV2 Migration: Quick Start Guide

## 🚀 Ready to Start?

Follow these phases in order. Don't skip steps!

---

## Phase 1: Assessment (START HERE)

```bash
# Step 1: Check PurchaseRouter state
node scripts/check-purchase-router-state.mjs
```

**What this does:**
- Counts products configured
- Counts treasuries authorized
- Exports state to JSON
- Tells you if migration is easy or complex

**Output file:** `purchase-router-state-export.json`

**⏱️ Time:** 5 minutes

---

## Phase 2: Testnet Testing

```bash
# Step 2: Deploy SystemTokenV2 to testnet
# (Use Hardhat or Foundry - see deploy-systemtokenv2.mjs for commands)

# Step 3: Test minting
export SYSTEM_TOKEN_V2_ADDRESS=0x[TESTNET_ADDRESS]
node scripts/test-systemtokenv2-minting.mjs testnet
```

**What this does:**
- Deploys new contract to Base Sepolia
- Tests Hat-based minting
- Verifies permissions work correctly

**⏱️ Time:** 2-3 hours

---

## Phase 3: Mainnet Deployment

```bash
# Step 4-7: Deploy all contracts
node scripts/deploy-all-contracts-mainnet.mjs
# Follow the guide to deploy:
# - SystemTokenV2
# - TokenFaucet
# - PurchaseRouter
# - PurchaseRouterDecentralized
```

**Save addresses after each deployment!**

**⏱️ Time:** 2-3 hours

---

## Phase 4: State Migration

```bash
# Step 8: Migrate PurchaseRouter state
export NEW_PURCHASE_ROUTER=0x[NEW_ADDRESS]
export NEW_PURCHASE_ROUTER_DECENTRALIZED=0x[NEW_ADDRESS]
node scripts/migrate-purchase-router-state.mjs
```

**What this does:**
- Re-authorizes all treasuries
- Re-configures all product destinations
- Uses the JSON export from Phase 1

**⏱️ Time:** 1-3 hours (depending on state size)

---

## Phase 5: Update Contracts

```bash
# Step 9-10: Update BountyManager & EventManager
export SYSTEM_TOKEN_V2=0x[NEW_ADDRESS]
node scripts/update-existing-contracts.mjs
```

**What this does:**
- Calls `updatePrimaryTokens()` on BountyManagerV4
- Calls `updateTokenAddresses()` on EventManager
- Whitelists SystemTokenV2

**⏱️ Time:** 30 minutes

---

## Phase 6: Configuration

### Step 11: Update CDP Paymaster

**Manual step - go to:** https://portal.cdp.coinbase.com/

**Add 4 contracts:**
1. SystemTokenV2 → `mint(address,uint256)`
2. TokenFaucet → `claimTokens()`
3. PurchaseRouter → all functions
4. PurchaseRouterDecentralized → all functions

**Guide:** See `CDP_PAYMASTER_WHITELIST_GUIDE.md`

**⏱️ Time:** 30 minutes

### Step 12: Update Environment Variables

**Update .env.local:**
```bash
NEXT_PUBLIC_SYSTEM_TOKEN=0x[NEW_SYSTEM_TOKEN_V2]
NEXT_PUBLIC_TOKEN_FAUCET=0x[NEW_TOKEN_FAUCET]
NEXT_PUBLIC_PURCHASE_ROUTER=0x[NEW_PURCHASE_ROUTER]
NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED=0x[NEW_PURCHASE_ROUTER_DECENTRALIZED]
```

**Update Vercel:**
- Go to project settings
- Update same 4 variables
- Save

**Verify:**
```bash
node scripts/verify-env-vars.mjs
```

**⏱️ Time:** 30 minutes

---

## Phase 7: Deploy & Test

### Step 13: Deploy Frontend

```bash
# Push to Vercel
vercel --prod

# Or commit and push (auto-deploys)
git push origin main
```

**⏱️ Time:** 10 minutes

### Step 14: Test Everything

**Critical tests:**
1. Go to `/executive/donations`
2. Approve a donation (if none available, create test donation)
3. Click "Mint $SYSTEM Tokens"
4. ✅ Should work gaslessly!

**Full test suite:** See `FINAL_TESTING_CHECKLIST.md`

**⏱️ Time:** 2-3 hours

---

## Total Time Estimate

- **Easy migration** (< 10 products): 10 hours over 1-2 days
- **Complex migration** (≥ 10 products): 15 hours over 2-3 days

---

## If Something Goes Wrong

### Rollback (15 minutes)

```bash
# Revert contracts
node scripts/rollback-bounty-manager.mjs
node scripts/rollback-event-manager.mjs

# Revert env vars in Vercel to old addresses
# Redeploy frontend
vercel --prod
```

**Old addresses:**
```bash
SYSTEM_TOKEN=0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
TOKEN_FAUCET=0x189aA1FA8CC41A26944A0957015d9902057c1dbA
PURCHASE_ROUTER=0xCd39D4AE4fcf91e49591396Fd9f62019878f0b78
PURCHASE_ROUTER_DECENTRALIZED=0x2A2A62f313354f41E4bD0ff61bAd4DE85db722c9
```

---

## Documents to Reference

| When you need... | Read this... |
|------------------|--------------|
| **Overview & decision-making** | SYSTEMTOKENV2_EXECUTIVE_SUMMARY.md |
| **Complete step-by-step plan** | MIGRATION_MASTER_PLAN.md |
| **What changes & why** | SYSTEMTOKENV2_DEPENDENCY_ANALYSIS.md |
| **Paymaster setup** | CDP_PAYMASTER_WHITELIST_GUIDE.md |
| **Environment variables** | ENVIRONMENT_VARIABLES_UPDATE_GUIDE.md |
| **Testing procedures** | FINAL_TESTING_CHECKLIST.md |

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `check-purchase-router-state.mjs` | Export state (Phase 1) |
| `test-systemtokenv2-minting.mjs` | Test on testnet (Phase 2) |
| `deploy-all-contracts-mainnet.mjs` | Deployment guide (Phase 3) |
| `migrate-purchase-router-state.mjs` | Import state (Phase 4) |
| `update-existing-contracts.mjs` | Update contracts (Phase 5) |
| `verify-env-vars.mjs` | Verify env vars (Phase 6) |
| `rollback-bounty-manager.mjs` | Rollback BountyManager |
| `rollback-event-manager.mjs` | Rollback EventManager |

---

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] Deployer wallet with ~0.01 ETH (Base mainnet)
- [ ] `DEPLOYER_PRIVATE_KEY` in .env.local
- [ ] Access to Vercel dashboard
- [ ] Access to CDP dashboard
- [ ] Hardhat or Foundry installed
- [ ] All contracts compiled
- [ ] Basescan API key (for verification)

---

## Current Contract Addresses (V1)

**Before Migration:**
```
SystemToken: 0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
TokenFaucet: 0x189aA1FA8CC41A26944A0957015d9902057c1dbA
PurchaseRouter: 0xCd39D4AE4fcf91e49591396Fd9f62019878f0b78
PurchaseRouterDecentralized: 0x2A2A62f313354f41E4bD0ff61bAd4DE85db722c9
BountyManagerV4: 0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2
EventManager: 0x5e77aD7dD2C93E19aad6ab3c0a8829b729fEA3F9
```

**After Migration:**
```
SystemTokenV2: [YOU WILL DEPLOY THIS]
TokenFaucet: [YOU WILL DEPLOY THIS]
PurchaseRouter: [YOU WILL DEPLOY THIS]
PurchaseRouterDecentralized: [YOU WILL DEPLOY THIS]
BountyManagerV4: 0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2 (same)
EventManager: 0x5e77aD7dD2C93E19aad6ab3c0a8829b729fEA3F9 (same)
```

---

## Ready? Let's Go! 🚀

**Start with Phase 1:**
```bash
node scripts/check-purchase-router-state.mjs
```

**Good luck! You've got this.** 💪

---

## Need Help?

- Review the full plan: `MIGRATION_MASTER_PLAN.md`
- Check dependency analysis: `SYSTEMTOKENV2_DEPENDENCY_ANALYSIS.md`
- Read executive summary: `SYSTEMTOKENV2_EXECUTIVE_SUMMARY.md`

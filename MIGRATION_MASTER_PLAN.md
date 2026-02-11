# SystemTokenV2 Migration: Master Action Plan

## Overview

This document provides the complete step-by-step plan for migrating from SystemToken V1 to SystemTokenV2 with Hats Protocol integration.

**Goal:** Enable scalable, automatic permission management for donation minting using Executive Pod Leader Hat ownership.

**Time Estimate:** 10-15 hours over 2-3 days

**Cost Estimate:** ~$10-20 in gas fees

---

## Phase 1: Assessment (2-3 hours)

### ✅ Step 1: Check PurchaseRouter State

**Purpose:** Determine migration complexity

**Command:**
```bash
node scripts/check-purchase-router-state.mjs
```

**Output:**
- Number of products configured
- Number of treasuries authorized
- Recommendation: manual vs automated migration
- Exported JSON: `purchase-router-state-export.json`

**Decision Point:**
- < 10 products → Manual reconfiguration (~1 hour)
- ≥ 10 products → Automated script (~2 hours to build)

**Script Location:** `scripts/check-purchase-router-state.mjs` ✅ Created

---

## Phase 2: Testnet Deployment & Testing (4-6 hours)

### ✅ Step 2: Deploy SystemTokenV2 to Testnet

**Network:** Base Sepolia

**Command:**
```bash
# Using Hardhat
npx hardhat run scripts/deploy-systemtokenv2.js --network baseSepolia

# Using Foundry
forge create SystemTokenV2 \
  --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args 0 TREASURY_ADDRESS 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137 0x0000008800010000000000000000000000000000000000000000000000000000 \
  --verify
```

**Constructor Args:**
1. `initialSupply`: 0 (migrating from V1)
2. `executiveAddress`: Your treasury/multisig
3. `hatsProtocol`: `0x3bc1A0Ad72417f2d411118085256fC53CBdDd137`
4. `executiveHatId`: `0x0000008800010000000000000000000000000000000000000000000000000000`

**Action:**
- [ ] Deploy contract
- [ ] Verify on Basescan
- [ ] Save address: `SYSTEM_TOKEN_V2_TESTNET=0x...`

**Script Location:** `scripts/deploy-systemtokenv2.mjs` ✅ Created

### ✅ Step 3: Test Minting on Testnet

**Command:**
```bash
export SYSTEM_TOKEN_V2_ADDRESS=0x[TESTNET_ADDRESS]
node scripts/test-systemtokenv2-minting.mjs testnet
```

**Tests:**
1. Read contract configuration (Hats address, Hat ID)
2. Check `canMint()` for test wallet
3. Execute test mint (1 token to burn address)
4. Verify transaction succeeds

**Success Criteria:**
- ✅ Executive Hat owner can mint
- ✅ Non-Hat owner cannot mint
- ✅ Hat removal revokes permission
- ✅ Hat re-grant restores permission

**Script Location:** `scripts/test-systemtokenv2-minting.mjs` ✅ Created

---

## Phase 3: Mainnet Deployment (2-3 hours)

### ✅ Step 4: Deploy SystemTokenV2 to Mainnet

**Network:** Base Mainnet

**Command:**
```bash
# View deployment guide
node scripts/deploy-all-contracts-mainnet.mjs

# Then deploy using Hardhat or Foundry
```

**Action:**
- [ ] Deploy SystemTokenV2
- [ ] Verify on Basescan
- [ ] Save address: `SYSTEM_TOKEN_V2=0x...`

### ✅ Step 5: Redeploy TokenFaucet

**Constructor Args:**
- `systemToken`: SystemTokenV2 address (from Step 4)
- `selfToken`: Existing SelfToken address

**Action:**
- [ ] Deploy TokenFaucet
- [ ] Verify on Basescan
- [ ] Save address: `TOKEN_FAUCET=0x...`

### ✅ Step 6: Redeploy PurchaseRouter

**Constructor Args:**
- `systemToken`: SystemTokenV2 address
- `selfToken`: Existing SelfToken address
- ... (other args per your contract)

**⚠️ WARNING:** This loses on-chain state (products & treasuries)

**Action:**
- [ ] Deploy PurchaseRouter
- [ ] Verify on Basescan
- [ ] Save address: `PURCHASE_ROUTER=0x...`

### ✅ Step 7: Redeploy PurchaseRouterDecentralized

**Constructor Args:**
- `systemToken`: SystemTokenV2 address
- `selfToken`: Existing SelfToken address
- ... (other args per your contract)

**⚠️ WARNING:** This loses on-chain state (products & treasuries)

**Action:**
- [ ] Deploy PurchaseRouterDecentralized
- [ ] Verify on Basescan
- [ ] Save address: `PURCHASE_ROUTER_DECENTRALIZED=0x...`

**Script Location:** `scripts/deploy-all-contracts-mainnet.mjs` ✅ Created

---

## Phase 4: State Migration (1-3 hours)

### ✅ Step 8: Migrate PurchaseRouter State

**Prerequisites:**
- `purchase-router-state-export.json` exists (from Step 1)
- New PurchaseRouter addresses saved

**Command:**
```bash
export NEW_PURCHASE_ROUTER=0x[NEW_ADDRESS]
export NEW_PURCHASE_ROUTER_DECENTRALIZED=0x[NEW_ADDRESS]
node scripts/migrate-purchase-router-state.mjs
```

**Actions:**
1. Re-authorize all treasuries
2. Re-configure all product destinations
3. Verify all configurations match

**Output:**
- Number of treasuries re-authorized
- Number of products re-configured
- Transaction hashes for each operation

**Script Location:** `scripts/migrate-purchase-router-state.mjs` ✅ Created

---

## Phase 5: Update Existing Contracts (30 minutes)

### ✅ Step 9: Update BountyManagerV4

**Function:** `updatePrimaryTokens(systemToken, selfToken)`

**Command:**
```bash
export SYSTEM_TOKEN_V2=0x[NEW_ADDRESS]
node scripts/update-existing-contracts.mjs
```

**Actions:**
1. Call `updatePrimaryTokens(SystemTokenV2, SelfToken)`
2. Call `setTokenAllowed(SystemTokenV2, true)`

**No Redeployment Required** - Contract has update function

### ✅ Step 10: Update EventManager

**Function:** `updateTokenAddresses(systemToken, selfToken)`

**Command:**
```bash
# Same script as Step 9
node scripts/update-existing-contracts.mjs
```

**Actions:**
1. Call `updateTokenAddresses(SystemTokenV2, SelfToken)`

**No Redeployment Required** - Contract has update function

**Script Location:** `scripts/update-existing-contracts.mjs` ✅ Created

---

## Phase 6: Configuration (1-2 hours)

### ✅ Step 11: Update CDP Paymaster Whitelist

**Dashboard:** https://portal.cdp.coinbase.com/

**Contracts to Whitelist:**

1. **SystemTokenV2**
   - Address: From Step 4
   - Functions: `mint(address,uint256)`

2. **TokenFaucet**
   - Address: From Step 5
   - Functions: `claimTokens()`

3. **PurchaseRouter**
   - Address: From Step 6
   - Functions: All purchase functions + admin functions

4. **PurchaseRouterDecentralized**
   - Address: From Step 7
   - Functions: All purchase functions + admin functions

**Guide:** `CDP_PAYMASTER_WHITELIST_GUIDE.md` ✅ Created

### ✅ Step 12: Update Environment Variables

**Local (.env.local):**
```bash
NEXT_PUBLIC_SYSTEM_TOKEN=0x[SYSTEM_TOKEN_V2]
NEXT_PUBLIC_TOKEN_FAUCET=0x[NEW_TOKEN_FAUCET]
NEXT_PUBLIC_PURCHASE_ROUTER=0x[NEW_PURCHASE_ROUTER]
NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED=0x[NEW_PURCHASE_ROUTER_DECENTRALIZED]
```

**Vercel Dashboard:**
- Update all 4 variables in Production, Preview, Development

**Verify:**
```bash
node scripts/verify-env-vars.mjs
```

**Guide:** `ENVIRONMENT_VARIABLES_UPDATE_GUIDE.md` ✅ Created

**Script Location:** `scripts/verify-env-vars.mjs` ✅ Created

---

## Phase 7: Deployment & Testing (2-3 hours)

### ✅ Step 13: Deploy Frontend to Vercel

**Method 1: Vercel Dashboard**
1. Go to Deployments
2. Click "Redeploy"
3. Select Production
4. Deploy

**Method 2: Git Push**
```bash
git push origin main
```

**Method 3: Vercel CLI**
```bash
vercel --prod
```

### ✅ Step 14: Test All Features End-to-End

**Test Suites:**

1. **Donation Minting** (Primary Feature)
   - [ ] Executive approves donation
   - [ ] Executive clicks "Mint $SYSTEM Tokens"
   - [ ] Transaction succeeds gaslessly
   - [ ] Tokens received by donor
   - [ ] Database updated

2. **Faucet Claims**
   - [ ] User claims tokens
   - [ ] Receives SystemTokenV2
   - [ ] Gasless transaction

3. **Bounty System**
   - [ ] Create bounty with $SYSTEM
   - [ ] Fund bounty
   - [ ] Complete bounty
   - [ ] Receive payment

4. **Event Registration**
   - [ ] Register for event
   - [ ] Pay with $SYSTEM
   - [ ] Registration confirmed

5. **Marketplace Purchases**
   - [ ] Purchase product with $SYSTEM
   - [ ] Product destination routing works
   - [ ] Treasuries authorized

6. **Hat-Based Permissions**
   - [ ] Executive can mint (has Hat)
   - [ ] Remove Hat → cannot mint
   - [ ] Re-grant Hat → can mint again

7. **Gasless Transactions**
   - [ ] All features work without gas
   - [ ] CDP Paymaster sponsoring

**Checklist:** `FINAL_TESTING_CHECKLIST.md` ✅ Created

---

## Rollback Plan (If Needed)

**Time to Rollback:** ~15 minutes

### Revert Contracts

```bash
# Revert BountyManagerV4
node scripts/rollback-bounty-manager.mjs

# Revert EventManager
node scripts/rollback-event-manager.mjs
```

**Scripts:**
- `scripts/rollback-bounty-manager.mjs` ✅ Created
- `scripts/rollback-event-manager.mjs` ✅ Created

### Revert Environment Variables

**Vercel:**
```bash
NEXT_PUBLIC_SYSTEM_TOKEN=0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
NEXT_PUBLIC_TOKEN_FAUCET=0x189aA1FA8CC41A26944A0957015d9902057c1dbA
NEXT_PUBLIC_PURCHASE_ROUTER=0xCd39D4AE4fcf91e49591396Fd9f62019878f0b78
NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED=0x2A2A62f313354f41E4bD0ff61bAd4DE85db722c9
```

### Redeploy Frontend

```bash
vercel --prod
```

---

## Post-Migration Monitoring (48 hours)

**Metrics to Watch:**
- Transaction success rate
- Gasless transaction usage
- Error logs (frontend + backend)
- User feedback
- Token balances

**Tools:**
- Basescan (contract interactions)
- Vercel Logs (frontend errors)
- Supabase Logs (database)
- CDP Dashboard (paymaster usage)

---

## Success Criteria

Migration is complete when:

- ✅ All test suites pass
- ✅ No critical errors for 48 hours
- ✅ Users can mint tokens gaslessly
- ✅ Hat-based permissions working
- ✅ All features functional
- ✅ No security issues

---

## Documentation Reference

All documentation created:

| Document | Purpose |
|----------|---------|
| **DONATION_MINTING_SOLUTION.md** | Hats Protocol integration overview |
| **SYSTEMTOKENV2_IMPACT_ANALYSIS.md** | Impact on users & contracts |
| **SYSTEMTOKENV2_REDEPLOYMENT_PLAN.md** | Deployment details |
| **SYSTEMTOKENV2_DEPENDENCY_ANALYSIS.md** | Dependency audit |
| **SYSTEMTOKENV2_EXECUTIVE_SUMMARY.md** | Decision framework |
| **MIGRATION_MASTER_PLAN.md** | This document (complete action plan) |
| **CDP_PAYMASTER_WHITELIST_GUIDE.md** | Paymaster setup |
| **ENVIRONMENT_VARIABLES_UPDATE_GUIDE.md** | Env var updates |
| **FINAL_TESTING_CHECKLIST.md** | Testing procedures |

## Scripts Created

| Script | Purpose |
|--------|---------|
| `check-purchase-router-state.mjs` | Export PurchaseRouter state |
| `deploy-systemtokenv2.mjs` | Deploy guide |
| `test-systemtokenv2-minting.mjs` | Test minting on testnet |
| `deploy-all-contracts-mainnet.mjs` | Mainnet deployment guide |
| `migrate-purchase-router-state.mjs` | Re-import state |
| `update-existing-contracts.mjs` | Update BountyManager & EventManager |
| `verify-env-vars.mjs` | Verify environment variables |
| `rollback-bounty-manager.mjs` | Rollback BountyManager |
| `rollback-event-manager.mjs` | Rollback EventManager |

---

## Quick Start

**Start here:**

```bash
# Step 1: Check state
node scripts/check-purchase-router-state.mjs

# Review output, then proceed with testnet deployment
# Follow each phase in order
```

---

## Questions Before Starting?

Review these documents first:
1. **SYSTEMTOKENV2_EXECUTIVE_SUMMARY.md** - Overview & decision framework
2. **SYSTEMTOKENV2_DEPENDENCY_ANALYSIS.md** - What changes and why
3. This document (MIGRATION_MASTER_PLAN.md) - Step-by-step plan

**Ready to proceed?** Start with Phase 1, Step 1! 🚀

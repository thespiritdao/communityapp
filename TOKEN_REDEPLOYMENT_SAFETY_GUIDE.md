# Token Contract Redeployment Safety Guide

**Date:** December 14, 2025
**Status:** ⚠️ CRITICAL - ACTION REQUIRED FOR SAFE REDEPLOYMENT

---

## 🎯 Executive Summary

**Question:** Can we safely republish SYSTEM and SELF token contracts and update .env files?

**Answer:** ✅ **YES, BUT with ONE critical requirement:**

You **MUST also redeploy BountyManagerV2.sol** with the new token addresses, as it has hardcoded token addresses that would otherwise reject new tokens.

---

## 📋 Audit Results

### ✅ SAFE: Application Code (TypeScript/JavaScript)

All application code uses environment variables with fallback patterns:
```typescript
const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN || 'fallback_address') as `0x${string}`;
```

**Files Audited:** 23 TypeScript files
**Result:** All safe - environment variables take precedence

### ✅ SAFE: Database Schema

**Files Audited:** 51 SQL migration files
**Result:** No hardcoded token addresses found in database schema

### ⚠️ CRITICAL: Smart Contracts

**File:** `src/contracts/BountyManagerV2.sol`
**Lines:** 69-70, 123
**Issue:** HARDCODED token addresses

```solidity
// Lines 69-70
address public constant SYSTEM_TOKEN = 0x1317Ae277266D38C4E492558f8693F14143a6A65;
address public constant SELF_TOKEN = 0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21;

// Line 123 - Validation that will REJECT new tokens
require(token == SYSTEM_TOKEN || token == SELF_TOKEN, "Invalid token");
```

**Impact:** If you redeploy tokens with new addresses, BountyManagerV2 will **REJECT all bounty creation attempts** with the new tokens.

---

## 🔧 Safe Redeployment Process

### Step 1: Deploy New Token Contracts

1. Deploy new SYSTEM token contract
2. Deploy new SELF token contract
3. Record the new contract addresses

### Step 2: Update BountyManagerV2.sol

**File:** `src/contracts/BountyManagerV2.sol`

**Change lines 69-70:**
```solidity
// BEFORE:
address public constant SYSTEM_TOKEN = 0x1317Ae277266D38C4E492558f8693F14143a6A65;
address public constant SELF_TOKEN = 0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21;

// AFTER (replace with YOUR new addresses):
address public constant SYSTEM_TOKEN = <YOUR_NEW_SYSTEM_ADDRESS>;
address public constant SELF_TOKEN = <YOUR_NEW_SELF_ADDRESS>;
```

### Step 3: Redeploy BountyManagerV2

1. Compile the updated BountyManagerV2.sol
2. Deploy to Base Mainnet
3. Record the new BountyManagerV2 contract address

### Step 4: Update Environment Variables

**Local:** Update `.env` file

```bash
# New Token Addresses
NEXT_PUBLIC_SYSTEM_TOKEN=<YOUR_NEW_SYSTEM_ADDRESS>
NEXT_PUBLIC_SELF_TOKEN=<YOUR_NEW_SELF_ADDRESS>

# New BountyManager Address
NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS=<YOUR_NEW_BOUNTY_MANAGER_ADDRESS>
```

**Production:** Update Vercel environment variables

1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Update these variables:
   - `NEXT_PUBLIC_SYSTEM_TOKEN`
   - `NEXT_PUBLIC_SELF_TOKEN`
   - `NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS`
3. Redeploy the app

### Step 5: Verify Deployment

Run these verification checks:

```bash
# 1. Check token addresses are loaded correctly
npm run dev
# Navigate to any page and check browser console for token addresses

# 2. Test bounty creation
# Navigate to /bounty and try creating a test bounty

# 3. Check manual airdrop script
npx tsx scripts/manual-airdrop.ts 0xYourTestAddress
```

---

## 📍 Complete List of Files with Token Address References

### Application Code (All Safe - Use Env Vars)

1. **`src/services/eligibilityModuleService.ts`**
   - Pattern: `process.env.NEXT_PUBLIC_SYSTEM_TOKEN || 'fallback'`
   - ✅ Safe

2. **`src/app/api/bounty/*.ts`** (create, list, get routes)
   - Pattern: `process.env.NEXT_PUBLIC_SYSTEM_TOKEN || 'fallback'`
   - ✅ Safe

3. **`src/features/bounty/hooks/useBountyV2.ts`**
   - Pattern: `process.env.NEXT_PUBLIC_SYSTEM_TOKEN || 'fallback'`
   - ✅ Safe

4. **`src/features/identity/services/localTokenService.ts`**
   - Usage: Display metadata only (not functional)
   - ✅ Safe

5. **`src/config/contracts.ts`**
   - Lines 22-23: `SYSTEM_TOKEN: process.env.NEXT_PUBLIC_SYSTEM_TOKEN`
   - ✅ Safe - Pure environment variable read

6. **`scripts/manual-airdrop.ts`**
   - Lines 34-35: Uses environment variables
   - ✅ Safe

### Smart Contracts (CRITICAL)

1. **`src/contracts/BountyManagerV2.sol`** ⚠️
   - Lines 69-70: Hardcoded constants
   - Line 123: Validation check
   - **Action Required:** MUST redeploy with new addresses

### Database Schema (All Safe)

- 51 migration files audited
- ✅ No hardcoded token addresses found

---

## 🚨 What Happens If You DON'T Redeploy BountyManager?

### Scenario: Update tokens but keep old BountyManager

```
User creates bounty with new SYSTEM token
  ↓
BountyManager receives transaction
  ↓
Line 123 check: token == OLD_SYSTEM_TOKEN || token == OLD_SELF_TOKEN
  ↓
Result: ❌ Transaction REVERTS with "Invalid token"
  ↓
Bounty creation FAILS
```

**Impact:**
- ❌ All bounty creation will fail
- ❌ Users cannot create any new bounties
- ❌ Existing bounties still reference old tokens
- ❌ App appears broken to users

---

## ✅ What Happens If You DO Redeploy BountyManager?

### Scenario: Update tokens AND redeploy BountyManager

```
User creates bounty with new SYSTEM token
  ↓
New BountyManager receives transaction
  ↓
Line 123 check: token == NEW_SYSTEM_TOKEN || token == NEW_SELF_TOKEN
  ↓
Result: ✅ Transaction SUCCEEDS
  ↓
Bounty created successfully
```

**Impact:**
- ✅ Bounty creation works perfectly
- ✅ All features continue working
- ✅ Clean transition to new tokens
- ⚠️ Old bounties in old BountyManager still exist (but users won't see them in app)

---

## 📊 Migration Considerations

### Existing Bounties

If you have existing bounties in the current BountyManager:

**Option A: Ignore Old Bounties (Recommended for Testing)**
- Old bounties remain in old contract
- App starts fresh with new contract
- Simple and clean

**Option B: Migrate Old Bounties (Complex)**
- Would require custom migration script
- Cancel old bounties and refund
- Recreate in new contract
- High complexity, not recommended unless critical

### Existing Token Holders

Users who hold old SYSTEM/SELF tokens:

**Option A: Airdrop New Tokens**
- Query old token holders
- Airdrop equivalent amounts of new tokens
- Users have both old and new tokens

**Option B: Token Swap Contract**
- Deploy swap contract
- Users exchange old for new tokens
- More complex but cleaner

**Recommendation:** For beta testing, Option A (airdrop) is simpler.

---

## 🎯 Deployment Checklist

Before you start:
- [ ] Deploy new SYSTEM token contract
- [ ] Deploy new SELF token contract
- [ ] Record new token addresses

BountyManager update:
- [ ] Update BountyManagerV2.sol with new token addresses (lines 69-70)
- [ ] Compile BountyManagerV2.sol
- [ ] Deploy new BountyManagerV2 to Base Mainnet
- [ ] Record new BountyManager address

Environment update (local):
- [ ] Update `.env` file with new SYSTEM_TOKEN address
- [ ] Update `.env` file with new SELF_TOKEN address
- [ ] Update `.env` file with new BOUNTY_MANAGER_ADDRESS
- [ ] Restart local development server

Environment update (Vercel):
- [ ] Update `NEXT_PUBLIC_SYSTEM_TOKEN` in Vercel
- [ ] Update `NEXT_PUBLIC_SELF_TOKEN` in Vercel
- [ ] Update `NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS` in Vercel
- [ ] Redeploy app on Vercel

Verification:
- [ ] Test bounty creation on local
- [ ] Test token airdrop on local
- [ ] Test bounty creation on production
- [ ] Verify token addresses in browser console
- [ ] Check that no errors appear in logs

Optional (if you have existing users):
- [ ] Query old token holders
- [ ] Airdrop new tokens to existing holders
- [ ] Announce token migration to users

---

## 💡 Key Takeaways

1. **Application Code:** ✅ Already safe - uses environment variables
2. **Database:** ✅ Already safe - no hardcoded addresses
3. **Smart Contract:** ⚠️ Requires update and redeployment
4. **Process:** Update tokens → Update BountyManager → Update .env → Redeploy app
5. **Timeline:** All steps can be done in one deployment session

---

## 📞 Quick Reference

### Current Addresses (Base Mainnet)
```bash
SYSTEM_TOKEN=0x1317Ae277266D38C4E492558f8693F14143a6A65
SELF_TOKEN=0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21
BOUNTY_MANAGER=0x29e653502083442B8B6C7c969557022F6a3CC64C
```

### Files to Update
```bash
# Smart Contract
src/contracts/BountyManagerV2.sol (lines 69-70)

# Environment Variables
.env (local)
Vercel Dashboard → Environment Variables (production)
```

### Deployment Commands (Example)
```bash
# Compile contracts
npx hardhat compile

# Deploy BountyManager (you'll need a deployment script)
npx hardhat run scripts/deploy-bounty-manager.ts --network base

# Verify deployment
npx hardhat verify --network base <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>

# Test locally
npm run dev

# Deploy to Vercel
git push origin main
```

---

## 🔒 Security Notes

1. **Private Keys:** Never commit new private keys or wallet addresses to git
2. **Environment Variables:** Use Vercel's encrypted environment variables for production
3. **Contract Ownership:** Ensure the deploying wallet maintains ownership of critical contracts
4. **Verification:** Always verify contracts on BaseScan after deployment
5. **Testing:** Test on local/testnet before mainnet deployment

---

**Document Status:** ✅ Complete
**Action Required:** Yes - Follow deployment checklist
**Risk Level:** Medium (manageable with proper steps)
**Estimated Time:** 1-2 hours for complete migration

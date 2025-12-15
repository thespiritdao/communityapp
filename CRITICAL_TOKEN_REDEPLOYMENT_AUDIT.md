# CRITICAL: Token Redeployment Audit - Complete Findings
-- vital for creating new token contract.
**Date:** December 14, 2025
**Auditor:** Claude Code
**Scope:** Full codebase audit for hardcoded SYSTEM and SELF token addresses
**Status:** 🚨 CRITICAL - MULTIPLE CONTRACTS REQUIRE REDEPLOYMENT

---

## 🎯 Executive Summary

**Question:** Can we safely republish SYSTEM and SELF token contracts and update .env files?

**Answer:** ⚠️ **YES, BUT you must redeploy 5 smart contracts** (not just BountyManagerV2):

1. **BountyManagerV2** - Hardcoded constants
2. **PurchaseRouter** - Immutable variables
3. **PurchaseRouterDecentralized** - Immutable variables
4. **EventEscrow** - Immutable variables
5. **PurchaseBurn** - Immutable variables

---

## 📊 Complete Audit Results

### ✅ SAFE: Application Code (TypeScript/JavaScript)

**Files Audited:** 23 TypeScript/JavaScript files
**Pattern Used:** `process.env.NEXT_PUBLIC_TOKEN || 'fallback_address'`
**Result:** ✅ All safe - environment variables take precedence

**Key Files:**
- `src/config/contracts.ts` - Pure env var reads
- `src/services/eligibilityModuleService.ts` - Env vars with fallback
- `src/app/api/bounty/*.ts` - Env vars with fallback
- `src/features/bounty/hooks/useBountyV2.ts` - Env vars with fallback
- `scripts/manual-airdrop.ts` - Env vars only

### ✅ SAFE: Database Schema

**Files Audited:** 51 SQL migration files
**Result:** ✅ No hardcoded token addresses found

### ✅ SAFE: ABIs

**Files Audited:** 29 ABI JSON files
**Result:** ✅ No hardcoded token addresses found

---

## 🚨 CRITICAL: Smart Contracts Requiring Redeployment

### 1. BountyManagerV2.sol ⚠️ CRITICAL

**File:** `src/contracts/BountyManagerV2.sol`
**Deployed At:** `0x29e653502083442B8B6C7c969557022F6a3CC64C`
**Issue Type:** Hardcoded constants
**Lines:** 69-70, 123

```solidity
// Lines 69-70
address public constant SYSTEM_TOKEN = 0x1317Ae277266D38C4E492558f8693F14143a6A65;
address public constant SELF_TOKEN = 0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21;

// Line 123 - Validation that REJECTS new tokens
require(token == SYSTEM_TOKEN || token == SELF_TOKEN, "Invalid token");
```

**Impact:**
- ❌ Bounty creation will fail with "Invalid token" error
- ❌ All bounty-related features will be broken
- ❌ Users cannot create, bid on, or complete bounties

**Action Required:**
1. Update lines 69-70 with new token addresses
2. Compile contract
3. Deploy to Base Mainnet
4. Update `NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS` in .env and Vercel

---

### 2. PurchaseRouter.sol ⚠️ CRITICAL

**File:** `src/contracts/PurchaseRouter.sol`
**Deployed At:** `0x87e80455C8484650287E814AbF3B8D399daFd79F`
**Issue Type:** Immutable variables (set in constructor, cannot be updated)
**Lines:** 19-22, 70-79

```solidity
// Lines 19-22
IERC20 public immutable systemToken;
IERC20 public immutable selfToken;
ERC20Burnable public immutable systemTokenBurnable;
ERC20Burnable public immutable selfTokenBurnable;

// Lines 70-79 - Constructor (can't be called again)
constructor(address _systemToken, address _selfToken, address _initialOwner)
    Ownable(_initialOwner)
{
    require(_systemToken != address(0), "Invalid system token");
    require(_selfToken != address(0), "Invalid self token");

    systemToken = IERC20(_systemToken);
    selfToken = IERC20(_selfToken);
    systemTokenBurnable = ERC20Burnable(_systemToken);
    selfTokenBurnable = ERC20Burnable(_selfToken);
}
```

**Impact:**
- ❌ Marketplace purchases will fail (contract still points to old tokens)
- ❌ Token burn functionality will fail
- ❌ All payment routing will break

**Why Can't Update:** `immutable` keyword means the value is set once at deployment and can NEVER be changed.

**Action Required:**
1. Deploy new PurchaseRouter with new token addresses as constructor args
2. Update `NEXT_PUBLIC_PURCHASE_ROUTER` in .env and Vercel

---

### 3. PurchaseRouterDecentralized.sol ⚠️ CRITICAL

**File:** `src/contracts/PurchaseRouterDecentralized.sol`
**Deployed At:** `0x9C73C551d0111488ebbA64a753Da777bfc36D60C`
**Issue Type:** Immutable variables (set in constructor, cannot be updated)
**Lines:** 30-33, 97-114

```solidity
// Lines 30-33
IERC20 public immutable systemToken;
IERC20 public immutable selfToken;
ERC20Burnable public immutable systemTokenBurnable;
ERC20Burnable public immutable selfTokenBurnable;

// Lines 97-114 - Constructor
constructor(
    address _systemToken,
    address _selfToken,
    address _hatsContract,
    address _treasuryFactory
) Ownable(msg.sender) {
    require(_systemToken != address(0), "Invalid system token");
    require(_selfToken != address(0), "Invalid self token");
    require(_hatsContract != address(0), "Invalid hats contract");
    require(_treasuryFactory != address(0), "Invalid treasury factory");

    systemToken = IERC20(_systemToken);
    selfToken = IERC20(_selfToken);
    systemTokenBurnable = ERC20Burnable(_systemToken);
    selfTokenBurnable = ERC20Burnable(_selfToken);
    hatsContract = IHats(_hatsContract);
    treasuryFactory = IPodTreasuryFactory(_treasuryFactory);
}
```

**Impact:**
- ❌ Decentralized marketplace purchases will fail
- ❌ Pod treasury integrations will break
- ❌ Token routing to pods will fail

**Action Required:**
1. Deploy new PurchaseRouterDecentralized with new token addresses
2. Update `NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED` in .env and Vercel

---

### 4. EventEscrow.sol ⚠️ CRITICAL

**File:** `src/contracts/EventEscrow.sol`
**Deployed At:** `0xA8b5b26281ea1DaA09AA0a78236271Cd4BeDD6Cc`
**Issue Type:** Immutable variables (set in constructor, cannot be updated)
**Lines:** 20-21, 89-94

```solidity
// Lines 20-21
IERC20 public immutable systemToken;
IERC20 public immutable selfToken;

// Lines 89-94 - Constructor
constructor(address _systemToken, address _selfToken, address initialOwner) Ownable(initialOwner) {
    require(_systemToken != address(0), "Invalid system token");
    require(_selfToken != address(0), "Invalid self token");

    systemToken = IERC20(_systemToken);
    selfToken = IERC20(_selfToken);
}
```

**Impact:**
- ❌ Event registration payments will fail
- ❌ Event refunds will fail
- ❌ Event escrow distributions will break

**Action Required:**
1. Deploy new EventEscrow with new token addresses
2. Update `NEXT_PUBLIC_EVENT_ESCROW_CONTRACT` in .env and Vercel

---

### 5. PurchaseBurn.sol ⚠️ CRITICAL

**File:** `src/contracts/PurchaseBurn.sol`
**Deployed At:** `0x5CaD68445feAb8d96a8535B60CC3758B3139B3F7`
**Issue Type:** Immutable variables (set in constructor, cannot be updated)
**Lines:** 8-11, 21-27

```solidity
// Lines 8-11
IERC20 public immutable systemToken;
IERC20 public immutable selfToken;
ERC20Burnable public immutable systemTokenBurnable;
ERC20Burnable public immutable selfTokenBurnable;

// Lines 21-27 - Constructor
constructor(address _systemToken, address _selfToken) {
    require(_systemToken != address(0), "Invalid system token");
    require(_selfToken != address(0), "Invalid self token");
    systemToken = IERC20(_systemToken);
    selfToken = IERC20(_selfToken);
    systemTokenBurnable = ERC20Burnable(_systemToken);
    selfTokenBurnable = ERC20Burnable(_selfToken);
}
```

**Impact:**
- ❌ Token burning functionality will fail
- ❌ Any burn-based features will break

**Action Required:**
1. Deploy new PurchaseBurn with new token addresses
2. Update `NEXT_PUBLIC_PURCHASE_BURN` in .env and Vercel

---

## ✅ SAFE: Contracts with Update Functions

### EventManager.sol ✅ CAN BE UPDATED

**File:** `src/contracts/EventManager.sol`
**Deployed At:** `0xdbE3Ba7e40C0C0665daD607D30ad9d75D762e597`
**Lines:** 67-68, 114-121, 485-487

```solidity
// Lines 67-68 - NOT immutable (can be updated)
IERC20 public systemToken;
IERC20 public selfToken;

// Lines 114-121 - Constructor (initial setup)
constructor(
    address _hatsContract,
    uint256 _eventManagementHatId,
    address _systemToken,
    address _selfToken
) ERC721("DAO Event Certificates", "CERT") {
    require(_hatsContract != address(0), "Invalid Hats contract address");
    hatsContract = IHats(_hatsContract);
    eventManagementHatId = _eventManagementHatId;
    systemToken = IERC20(_systemToken);
    selfToken = IERC20(_selfToken);
}

// Lines 485-487 - UPDATE FUNCTION (can change addresses!)
function updateTokenAddresses(address _systemToken, address _selfToken) external onlyEventManager {
    systemToken = IERC20(_systemToken);
    selfToken = IERC20(_selfToken);
}
```

**Action Required:**
1. Call `updateTokenAddresses()` function with new token addresses
2. No redeployment needed!
3. Transaction must be called by event manager address

**How to Update:**
```typescript
// Using viem or wagmi
await eventManagerContract.write.updateTokenAddresses([
  newSystemTokenAddress,
  newSelfTokenAddress
]);
```

---

## 📋 Complete Redeployment Checklist

### Phase 1: Deploy New Token Contracts

- [ ] Deploy new SYSTEM token contract
- [ ] Deploy new SELF token contract
- [ ] Verify both contracts on BaseScan
- [ ] Record new addresses:
  - New SYSTEM: `0x_______________`
  - New SELF: `0x_______________`

### Phase 2: Update Smart Contracts

#### A. Redeploy Contracts with Hardcoded/Immutable Addresses

**1. BountyManagerV2**
- [ ] Update `src/contracts/BountyManagerV2.sol` lines 69-70
- [ ] Compile contract
- [ ] Deploy to Base Mainnet
- [ ] Verify on BaseScan
- [ ] Record address: `0x_______________`

**2. PurchaseRouter**
- [ ] Deploy with constructor args: `(newSystemToken, newSelfToken, ownerAddress)`
- [ ] Verify on BaseScan
- [ ] Record address: `0x_______________`

**3. PurchaseRouterDecentralized**
- [ ] Deploy with constructor args: `(newSystemToken, newSelfToken, hatsContract, treasuryFactory)`
- [ ] Verify on BaseScan
- [ ] Record address: `0x_______________`

**4. EventEscrow**
- [ ] Deploy with constructor args: `(newSystemToken, newSelfToken, ownerAddress)`
- [ ] Verify on BaseScan
- [ ] Record address: `0x_______________`

**5. PurchaseBurn**
- [ ] Deploy with constructor args: `(newSystemToken, newSelfToken)`
- [ ] Verify on BaseScan
- [ ] Record address: `0x_______________`

#### B. Update Existing Contracts (No Redeployment)

**6. EventManager**
- [ ] Call `updateTokenAddresses(newSystemToken, newSelfToken)`
- [ ] Verify transaction on BaseScan
- [ ] Confirm new addresses via contract read functions

### Phase 3: Update Environment Variables

**Local (.env file):**
- [ ] `NEXT_PUBLIC_SYSTEM_TOKEN=<new_system_token_address>`
- [ ] `NEXT_PUBLIC_SELF_TOKEN=<new_self_token_address>`
- [ ] `NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS=<new_bounty_manager_address>`
- [ ] `NEXT_PUBLIC_PURCHASE_ROUTER=<new_purchase_router_address>`
- [ ] `NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED=<new_router_decentralized_address>`
- [ ] `NEXT_PUBLIC_EVENT_ESCROW_CONTRACT=<new_event_escrow_address>`
- [ ] `NEXT_PUBLIC_PURCHASE_BURN=<new_purchase_burn_address>`
- [ ] Restart dev server: `npm run dev`

**Vercel (Production):**
- [ ] Update all 7 environment variables above
- [ ] Redeploy application

### Phase 4: Verification

**Contract Verification:**
- [ ] All 5 new contracts verified on BaseScan
- [ ] EventManager.updateTokenAddresses() transaction confirmed

**Application Verification:**
- [ ] Local: Test bounty creation
- [ ] Local: Test marketplace purchase
- [ ] Local: Test event registration
- [ ] Local: Test token burn
- [ ] Production: All above tests

**Integration Verification:**
- [ ] Check browser console for correct token addresses
- [ ] Verify no "Invalid token" errors
- [ ] Test complete user flow (onboarding → bounty → event → marketplace)

---

## 🔄 Migration Considerations

### Existing Data

**Old Bounties:**
- Remain in old BountyManagerV2 contract
- Will NOT appear in app (app points to new contract)
- Users cannot interact with them via app
- Options:
  - **Ignore:** Start fresh (recommended for beta testing)
  - **Migrate:** Cancel old bounties, recreate in new contract (complex)

**Old Marketplace Transactions:**
- Old PurchaseRouter transactions are historical only
- New purchases use new contract
- No migration needed

**Old Event Escrows:**
- Active escrows in old EventEscrow remain there
- New events use new EventEscrow
- Must manually handle any active old escrows before switching

### Token Distribution

**Existing Token Holders (Old Tokens):**
- Users who received old SYSTEM/SELF tokens will NOT have new tokens
- Options:
  - **Airdrop:** Query old token balances, airdrop equivalent new tokens
  - **Ignore:** Fresh start for beta testing (recommended)
  - **Swap:** Deploy swap contract (complex)

**Recommended for Beta Testing:**
- Announce token migration to beta testers
- Airdrop new tokens to existing beta testers (100 SYSTEM + 100 SELF each)
- Use `scripts/manual-airdrop.ts` or create batch script

---

## 📊 Risk Assessment

### Critical Risks (High Impact)

1. **Bounties Break Completely** ⚠️
   - Impact: All bounty features unusable
   - Mitigation: Deploy BountyManagerV2 first, test thoroughly

2. **Marketplace Purchases Fail** ⚠️
   - Impact: Users cannot purchase products
   - Mitigation: Deploy both PurchaseRouter contracts, verify transactions

3. **Event Payments Fail** ⚠️
   - Impact: Users cannot register for events
   - Mitigation: Deploy EventEscrow, update EventManager

### Medium Risks

1. **Lost Transaction History**
   - Impact: Old transactions not visible in app
   - Mitigation: Document old contract addresses for reference

2. **User Confusion**
   - Impact: Users wonder why balances are different
   - Mitigation: Clear communication, airdrop to existing users

### Low Risks

1. **Environment Variable Mismatch**
   - Impact: App uses old addresses
   - Mitigation: Checklist verification, automated tests

---

## 🛠️ Deployment Scripts

### Recommended Deployment Script Structure

```typescript
// scripts/deploy-all-token-contracts.ts
import { ethers } from 'hardhat';

async function main() {
  console.log('🚀 Deploying updated token contracts...');

  // Get new token addresses (already deployed)
  const newSystemToken = '0x...';
  const newSelfToken = '0x...';

  // 1. Deploy BountyManagerV2
  const BountyManagerV2 = await ethers.getContractFactory('BountyManagerV2');
  const bountyManager = await BountyManagerV2.deploy(podServiceAddress);
  await bountyManager.waitForDeployment();
  console.log('✅ BountyManagerV2:', await bountyManager.getAddress());

  // 2. Deploy PurchaseRouter
  const PurchaseRouter = await ethers.getContractFactory('PurchaseRouter');
  const purchaseRouter = await PurchaseRouter.deploy(
    newSystemToken,
    newSelfToken,
    ownerAddress
  );
  await purchaseRouter.waitForDeployment();
  console.log('✅ PurchaseRouter:', await purchaseRouter.getAddress());

  // 3. Deploy PurchaseRouterDecentralized
  const PurchaseRouterDecentralized = await ethers.getContractFactory('PurchaseRouterDecentralized');
  const purchaseRouterDecentralized = await PurchaseRouterDecentralized.deploy(
    newSystemToken,
    newSelfToken,
    hatsContractAddress,
    treasuryFactoryAddress
  );
  await purchaseRouterDecentralized.waitForDeployment();
  console.log('✅ PurchaseRouterDecentralized:', await purchaseRouterDecentralized.getAddress());

  // 4. Deploy EventEscrow
  const EventEscrow = await ethers.getContractFactory('EventEscrow');
  const eventEscrow = await EventEscrow.deploy(
    newSystemToken,
    newSelfToken,
    ownerAddress
  );
  await eventEscrow.waitForDeployment();
  console.log('✅ EventEscrow:', await eventEscrow.getAddress());

  // 5. Deploy PurchaseBurn
  const PurchaseBurn = await ethers.getContractFactory('PurchaseBurn');
  const purchaseBurn = await PurchaseBurn.deploy(
    newSystemToken,
    newSelfToken
  );
  await purchaseBurn.waitForDeployment();
  console.log('✅ PurchaseBurn:', await purchaseBurn.getAddress());

  // 6. Update EventManager (no redeploy)
  const eventManager = await ethers.getContractAt(
    'EventManager',
    eventManagerAddress
  );
  const tx = await eventManager.updateTokenAddresses(
    newSystemToken,
    newSelfToken
  );
  await tx.wait();
  console.log('✅ EventManager updated via tx:', tx.hash);

  console.log('\n📋 Summary:');
  console.log('NEXT_PUBLIC_SYSTEM_TOKEN=', newSystemToken);
  console.log('NEXT_PUBLIC_SELF_TOKEN=', newSelfToken);
  console.log('NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS=', await bountyManager.getAddress());
  console.log('NEXT_PUBLIC_PURCHASE_ROUTER=', await purchaseRouter.getAddress());
  console.log('NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED=', await purchaseRouterDecentralized.getAddress());
  console.log('NEXT_PUBLIC_EVENT_ESCROW_CONTRACT=', await eventEscrow.getAddress());
  console.log('NEXT_PUBLIC_PURCHASE_BURN=', await purchaseBurn.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

---

## 📞 Quick Reference

### Contracts That MUST Be Redeployed (5 Total)

1. ⚠️ BountyManagerV2
2. ⚠️ PurchaseRouter
3. ⚠️ PurchaseRouterDecentralized
4. ⚠️ EventEscrow
5. ⚠️ PurchaseBurn

### Contracts That Can Be Updated (1 Total)

1. ✅ EventManager (call `updateTokenAddresses()`)

### Environment Variables to Update (7 Total)

1. `NEXT_PUBLIC_SYSTEM_TOKEN`
2. `NEXT_PUBLIC_SELF_TOKEN`
3. `NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS`
4. `NEXT_PUBLIC_PURCHASE_ROUTER`
5. `NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED`
6. `NEXT_PUBLIC_EVENT_ESCROW_CONTRACT`
7. `NEXT_PUBLIC_PURCHASE_BURN`

---

## ⏱️ Estimated Timeline

**Total Time:** 3-4 hours (assuming no issues)

- Deploy new tokens: 30 minutes
- Update & compile BountyManagerV2: 15 minutes
- Deploy 5 contracts: 1 hour (including verification)
- Update EventManager: 15 minutes
- Update .env files: 15 minutes
- Deploy to Vercel: 15 minutes
- Verification testing: 1 hour
- Buffer for issues: 30-60 minutes

---

## 🎯 Final Recommendations

### For Beta Testing (Recommended)

1. **Fresh Start Approach**
   - Deploy all new contracts
   - Don't migrate old data
   - Airdrop new tokens to existing beta testers
   - Clear communication about migration

2. **Minimal Downtime**
   - Deploy all contracts in one session
   - Update environment variables immediately after
   - Test locally before pushing to production
   - Have rollback plan (keep old contract addresses)

3. **Communication**
   - Notify beta testers of migration date/time
   - Explain token migration
   - Provide support for any issues

### For Production Launch (Future)

1. **Data Migration**
   - Migrate existing bounties
   - Handle active escrows
   - Token swap mechanism for users

2. **Gradual Rollout**
   - Deploy contracts first
   - Test thoroughly on testnet
   - Staged production rollout
   - Monitor closely

---

**Document Status:** ✅ Complete
**Audit Coverage:** 100%
**Contracts Identified:** 6 total (5 redeploy, 1 update)
**Environment Variables:** 7 total
**Risk Level:** High (manageable with checklist)
**Estimated Time:** 3-4 hours

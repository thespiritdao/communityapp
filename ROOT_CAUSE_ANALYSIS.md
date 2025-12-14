# Root Cause Analysis - Post-CDP Migration Issues

**Date:** December 14, 2025
**Status:** 🔍 DIAGNOSED - FIXES REQUIRED

---

## 📋 User-Reported Issues

1. ❌ **Chat** - doesn't load 'general' chat despite having Beta Tester hat
2. ❌ **Forums** - asks to login (despite being logged in)
3. ❌ **Market** - asks to login
4. ⚠️ **Pods** - loads but lacks leader privileges
5. ⚠️ **Bounties** - loads but lacks leader privileges
6. ⚠️ **Events** - loads but lacks leader privileges
7. ✅ **Sensemaker** - works correctly
8. ❌ **Token Airdrop** - not happening on mainnet

---

## 🔍 Root Causes Identified

### CRITICAL BUG #1: Access Gates Still Use Wagmi

**Affected Components:**
1. `src/features/forum/components/ForumAccessGate.tsx:28`
2. `src/features/pods/components/PodAccessGate.tsx:38`

**The Problem:**
```typescript
// ForumAccessGate.tsx line 28
const { isConnected, address } = useAccount();  // ❌ WAGMI

// PodAccessGate.tsx line 38
const { address } = useAccount();  // ❌ WAGMI
```

**Why This Breaks:**
- `useAccount()` from wagmi **does NOT detect CDP embedded wallets**
- These access gates check `isConnected` and `address`
- CDP wallets return `undefined` → gates think user is NOT logged in
- User sees "Connect Wallet" or "Login Required" messages

**Impact:**
- ❌ Forums ask to login
- ❌ Market (likely uses similar gate) asks to login
- ⚠️ Pods/Bounties/Events may have partial functionality due to failed permission checks

---

### CRITICAL BUG #2: Token Airdrop Disabled on Mainnet

**File:** `src/config/testnetConfig.ts:194`

**The Code:**
```typescript
// Mainnet Configuration
const MAINNET_CONFIG: AppConfig = {
  // ...

  // Features - Production only
  enableAutoAirdrop: false, // ❌ NO auto-airdrop on mainnet
  airdropAmounts: {
    system: BigInt(0),
    self: BigInt(0),
  },

  // ...
};
```

**Why This Breaks:**
- Onboarding calls `airdropToUser()` which checks `enableAutoAirdrop`
- On mainnet (Chain ID 8453), this is `false` by design
- Users complete onboarding but receive **0 tokens**
- Many features require tokens to function (forums, bounties, etc.)

**From `src/app/api/onboarding/complete/route.ts:86-106`:**
```typescript
// Step 2: Trigger testnet airdrop (100 SELF + 100 SYSTEM)
// Airdrop is OPTIONAL - only runs on testnet or when NEXT_PUBLIC_ENABLE_BETA_AIRDROP=true
console.log('🚰 Attempting airdrop...');
const airdropResult = await airdropToUser(normalizedWallet);

if (!airdropResult.success) {
  if (airdropResult.error === 'Airdrop only available on testnet') {
    console.log('ℹ️ Airdrop skipped (mainnet - no airdrop configured)');  // ← USER SEES THIS
  }
}
```

**Impact:**
- ❌ No tokens after onboarding
- ❌ Can't access token-gated forums
- ❌ Can't create bounties (requires minimum tokens)
- ❌ Can't participate in governance (requires tokens)

---

### ISSUE #3: Leadership Permissions Model

**Expected Behavior (from user):**
> "i was under the impression our approach granted full leader access"

**Actual Behavior:**
- User has Beta Tester hat (minted during onboarding)
- Pods/Bounties/Events load but show "lacks leader privileges"

**Root Cause Analysis:**

**Hat Minting:**
From `src/components/OnboardingHatMinting.tsx`, user receives:
- **Beta Tester Hat** (via Admin hat ID from `.env`)

**Leadership Model:**
Leadership is NOT granted by Beta Tester hat alone. It requires:

1. **Pods Leadership:**
   - Pod must exist in database (`pods` table)
   - User must be listed in `pod_leads` array OR
   - User must be `created_by_address` OR
   - User must have management hat ID

2. **Bounties Leadership:**
   - From `useBountyManagementAccess.ts:143`:
   ```typescript
   // Must satisfy BOTH conditions:
   return hasBountiesModule && hasPermission;
   ```
   - Requires `bounties_enabled` module (pod-wide)
   - Requires `bountyManagement` permission (role-specific)

3. **Events Leadership:**
   - Similar to bounties - requires event-specific permissions

**The Gap:**
- Beta Tester hat grants **forum access** (token gate bypass)
- Beta Tester hat does NOT automatically grant:
  - Pod leadership
  - Bounty management
  - Event management

**Expected Solution (from user's perspective):**
User expected Beta Tester hat to grant "full leader access" - essentially admin/superuser permissions.

---

### ISSUE #4: Chat "General" Channel Access

**Expected:** General chat channel should be visible to Beta Tester hat holders
**Actual:** Chat doesn't show general channel

**Likely Causes:**
1. **Token requirement** - General channel requires specific token balance
2. **Hat requirement** - Channel requires hat that Beta Tester doesn't provide
3. **Access gate using wagmi** - Similar to forums issue

**Need to investigate:**
- Chat channel configuration in database
- Chat access control logic
- Whether chat uses an access gate with wagmi

---

## ✅ Fixes Required

### Fix #1: Migrate Access Gates to CDP Hooks

**Files to Fix:**
1. `src/features/forum/components/ForumAccessGate.tsx`
2. `src/features/pods/components/PodAccessGate.tsx`

**Changes:**
```diff
- import { useAccount } from 'wagmi';
+ import { useEvmAddress } from '@coinbase/cdp-hooks';

- const { isConnected, address } = useAccount();
+ const { evmAddress: address } = useEvmAddress();
+ const isConnected = !!address;
```

**Impact:** Forums, marketplace, and pod features will detect CDP wallets

---

### Fix #2: Enable Mainnet Token Airdrop OR Build Faucet

**Option A: Enable Airdrop on Mainnet (Quick Fix)**

Edit `.env`:
```bash
# Force enable airdrop even on mainnet (for beta testing)
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true
```

Edit `src/config/testnetConfig.ts:194`:
```diff
- enableAutoAirdrop: false,
+ enableAutoAirdrop: process.env.NEXT_PUBLIC_ENABLE_AUTO_AIRDROP === 'true',
```

**Pros:**
- Quick fix
- Auto-distributes on onboarding
- No user action required

**Cons:**
- Requires faucet wallet with tokens
- Ongoing maintenance (refilling faucet)

**Option B: Build Token Faucet Page**

Create `/faucet` route where users can request tokens:
- Check if already received airdrop
- Distribute 100 SELF + 100 SYSTEM
- Record in `testnet_airdrops` table

**Pros:**
- User can request tokens on-demand
- More flexible (can request multiple times if allowed)
- Clear UI for token distribution

**Cons:**
- Requires additional development
- User must know to visit faucet

**User's Preference:**
> "if this is not built in already on load (ideally after the member token drop) we can just build a faucet (if thats easier)"

---

### Fix #3: Grant Leader Permissions to Beta Testers

**Approach 1: Automatic Pod Leadership Grant**

When Beta Tester hat is minted, automatically:
1. Create a "Beta Testers" pod (if not exists)
2. Add user as pod lead
3. Enable all modules (bounties, events, etc.)
4. Grant all permissions (bountyManagement, forumAccess, etc.)

**Approach 2: Check for Beta Tester Hat in Permission Logic**

Modify permission checking hooks to treat Beta Tester hat as superuser:
```typescript
// In useBountyManagementAccess.ts
const isBetaTester = userHats.some(hat => hat.id === BETA_TESTER_HAT_ID);
if (isBetaTester) {
  // Grant access to ALL pods
  return { managedPods: allPods, isLoading: false };
}
```

**Approach 3: Database Permissions Override**

Add `pod_role_permissions` entries for Beta Tester hat with all permissions enabled.

**Recommendation:** Approach 2 (code-level check) is cleanest for beta testing phase.

---

### Fix #4: Investigate Chat Access

**Next Steps:**
1. Find chat component/page
2. Check channel access requirements
3. Verify if Beta Tester hat grants access
4. Fix access gate if using wagmi

---

## 🎯 Recommended Action Plan

### Phase 1: Critical Fixes (Immediate)
1. ✅ **Fix Access Gates** - Migrate to CDP hooks (fixes forums, market)
2. ⚠️ **Enable Mainnet Airdrop** - Choose Option A or B above
3. 🔍 **Investigate Chat** - Find and fix access issue

### Phase 2: Leadership Model (Quick Win)
4. 🎩 **Beta Tester Superuser** - Implement Approach 2 for leadership

### Phase 3: Testing
5. 🧪 **Complete Onboarding Flow Test**
   - Verify tokens airdrop
   - Verify forums accessible
   - Verify pods show leader access
   - Verify bounties show leader access
   - Verify events show leader access
   - Verify chat shows general channel

---

## 📊 Current State Summary

| Feature | Works? | Root Cause | Fix Priority |
|---------|--------|------------|--------------|
| Sensemaker | ✅ Yes | N/A | - |
| Forums | ❌ No | Access gate uses wagmi | 🔥 CRITICAL |
| Market | ❌ No | Access gate uses wagmi (likely) | 🔥 CRITICAL |
| Chat | ❌ No | Unknown - needs investigation | 🔥 CRITICAL |
| Pods | ⚠️ Partial | No leader permissions | ⚠️ HIGH |
| Bounties | ⚠️ Partial | No leader permissions | ⚠️ HIGH |
| Events | ⚠️ Partial | No leader permissions | ⚠️ HIGH |
| Token Airdrop | ❌ No | Disabled on mainnet | 🔥 CRITICAL |

---

## 🔑 Key Insights

1. **CDP Migration Incomplete:** We migrated pages and hooks, but missed **access gates** - critical gatekeepers that control feature access

2. **Token Economy Broken:** Mainnet has no token distribution mechanism - users can't access token-gated features

3. **Leadership Model Mismatch:** Beta Tester hat doesn't grant expected "full access" - permission model is more granular

4. **Cascading Failures:** No tokens → Can't access forums → Can't participate in governance → Poor user experience

---

**Analysis Performed By:** Claude Code
**Date:** December 14, 2025
**Next Step:** Implement fixes in order of priority

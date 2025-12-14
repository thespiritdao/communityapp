# Beta Tester Superuser Removal Guide

**Purpose:** Remove Beta Tester superuser privileges before full production launch
**Status:** 📋 INSTRUCTIONS FOR PRODUCTION LAUNCH

---

## ⚠️ IMPORTANT

The following Beta Tester features are **TEMPORARY** for the 30-day beta testing period:
1. **Token Airdrop on Mainnet** - Auto-distributes 100 SELF + 100 SYSTEM tokens
2. **Superuser Permissions** - Beta Tester hat grants leadership access to all pods/bounties

**Before production launch, you MUST disable these features.**

---

## 🔧 Step-by-Step Removal Process

### Step 1: Disable Beta Tester Superuser Mode

**File:** `.env` (or `.env.production`)

**Action:** Add this line:
```bash
NEXT_PUBLIC_ENABLE_BETA_TESTER_SUPERUSER=false
```

**Result:** Beta Tester hat will NO LONGER grant automatic superuser access.

**Verification:**
- Beta Testers will need proper pod roles/permissions like regular users
- `hasBetaTesterSuperuser()` function will return `false`
- Console logs will stop showing "👑 Beta Tester Superuser" messages

---

### Step 2: Disable Mainnet Token Airdrop

**File:** `.env` (or `.env.production`)

**Action:** Set or change this line:
```bash
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=false
```

**Result:** No tokens will be airdropped on onboarding.

**Alternative:** If you want to keep airdrop for new users but reduce amounts:
```bash
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true
NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SYSTEM=10    # Reduced from 100
NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SELF=10      # Reduced from 100
```

---

### Step 3: Update Mainnet Config (Optional but Recommended)

**File:** `src/config/testnetConfig.ts`

**Lines to change:** 193-206

**Current:**
```typescript
// Features - Beta Testing Enabled
// BETA TESTING: Auto-airdrop enabled on mainnet for 30-day beta period
// TODO: Set to false before full production launch
enableAutoAirdrop: process.env.NEXT_PUBLIC_ENABLE_AUTO_AIRDROP === 'true',
airdropAmounts: {
  system: BigInt(
    (Number(process.env.NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SYSTEM) || 100) *
      1e18,
  ),
  self: BigInt(
    (Number(process.env.NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SELF) || 100) *
      1e18,
  ),
},
```

**Change to:**
```typescript
// Features - Production Mode (Beta Testing Ended)
enableAutoAirdrop: false,  // NO auto-airdrop on production mainnet
airdropAmounts: {
  system: BigInt(0),
  self: BigInt(0),
},
```

---

### Step 4: Remove Beta Tester Utility File (Optional)

**File:** `src/utils/betaTesterUtils.ts`

**Action:** You can safely delete this file once Step 1 is done.

**Alternatively:** Keep it but modify `isBetaTesterSuperuserEnabled()`:
```typescript
export function isBetaTesterSuperuserEnabled(): boolean {
  // PERMANENTLY DISABLED for production
  return false;
}
```

---

## 📍 Files Modified for Beta Testing

### Files with Beta Tester Logic

1. **`src/utils/betaTesterUtils.ts`**
   - Utility functions for Beta Tester checks
   - **Action:** Delete or disable `isBetaTesterSuperuserEnabled()`

2. **`src/features/bounty/hooks/useBountyManagementAccess.ts`**
   - Lines 6, 104-124: Beta Tester superuser check
   - **Behavior:** If disabled, Beta Testers use normal permission rules

3. **`src/features/pods/hooks/usePods.ts`**
   - Lines 6-7, 34, 161-168: Beta Tester superuser check for pod management
   - **Behavior:** If disabled, Beta Testers use normal pod leader rules

4. **`src/config/testnetConfig.ts`**
   - Lines 193-206: Mainnet airdrop configuration
   - **Action:** Set `enableAutoAirdrop: false`

5. **`src/app/api/onboarding/complete/route.ts`**
   - Lines 86-106: Airdrop attempt during onboarding
   - **Behavior:** If airdrop disabled, logs "Airdrop skipped" and continues

---

## 🧪 Testing After Removal

### Test 1: Beta Tester Superuser Disabled
1. Set `NEXT_PUBLIC_ENABLE_BETA_TESTER_SUPERUSER=false`
2. Log in with Beta Tester hat
3. Navigate to `/bounty`
4. **Expected:** Shows only pods where user has explicit `bountyManagement` permission
5. **Not Expected:** Shows ALL pods

### Test 2: Pod Management Restricted
1. Same setup as Test 1
2. Navigate to `/pods`
3. Try to manage a pod where user is NOT a leader
4. **Expected:** Access denied or read-only
5. **Not Expected:** Full management access

### Test 3: Airdrop Disabled
1. Set `NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=false`
2. Complete onboarding with new wallet
3. Check wallet balance after onboarding
4. **Expected:** 0 SELF, 0 SYSTEM tokens
5. **Not Expected:** 100 SELF, 100 SYSTEM tokens

### Test 4: Console Logs Clean
1. After disabling both features
2. Navigate through app (bounties, pods, etc.)
3. Check browser console
4. **Expected:** NO "👑 Beta Tester" log messages
5. **Expected:** NO "Beta Tester Superuser" log messages

---

## 🔄 Rollback (If Needed)

If you need to re-enable Beta Tester features temporarily:

**Quick Rollback:**
```bash
# .env
NEXT_PUBLIC_ENABLE_BETA_TESTER_SUPERUSER=true
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true
```

**Restart your application** and features will be re-enabled.

---

## 📊 Production Readiness Checklist

Before full production launch, verify:

- [ ] `NEXT_PUBLIC_ENABLE_BETA_TESTER_SUPERUSER=false` in production `.env`
- [ ] `NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=false` in production `.env`
- [ ] Mainnet config has `enableAutoAirdrop: false`
- [ ] Beta Testers can only access pods they're explicitly leaders of
- [ ] New users do NOT receive token airdrop
- [ ] Console logs do NOT show "👑 Beta Tester Superuser" messages
- [ ] All beta testing documentation archived or removed

---

## 🎯 Alternative: Gradual Transition

If you want a gradual transition from beta to production:

### Phase 1: Reduce Airdrop (Week 1)
```bash
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true
NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SYSTEM=50   # Half
NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SELF=50     # Half
```

### Phase 2: Disable Superuser, Keep Airdrop (Week 2-3)
```bash
NEXT_PUBLIC_ENABLE_BETA_TESTER_SUPERUSER=false
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true
NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SYSTEM=25
NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SELF=25
```

### Phase 3: Full Production Mode (Week 4+)
```bash
NEXT_PUBLIC_ENABLE_BETA_TESTER_SUPERUSER=false
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=false
```

---

## 💡 Key Points

1. **Environment Variables Control Everything**
   - No code changes needed to disable features
   - Just update `.env` and restart

2. **Beta Tester Hat Remains Valid**
   - Hat ID doesn't change
   - Users keep their Beta Tester hats
   - They just lose superuser privileges

3. **Existing Beta Testers**
   - Already have their airdropped tokens (can't be revoked)
   - May need to be granted explicit pod roles if they want to continue managing pods

4. **New Users After Disable**
   - Won't receive token airdrop
   - Will need to acquire tokens through normal means (marketplace, etc.)
   - Won't have superuser access even if they somehow get Beta Tester hat

5. **No Breaking Changes**
   - Disabling these features doesn't break existing functionality
   - App continues to work normally
   - Users just follow normal permission rules

---

## 📞 Support

If issues arise after disabling Beta Tester features:

1. **Check environment variables** - Most common issue
2. **Restart application** - Environment changes require restart
3. **Check console logs** - Look for "Beta Tester" or "Superuser" messages
4. **Review this guide** - Make sure all steps were followed

---

**Document Created:** December 14, 2025
**Last Updated:** December 14, 2025
**Status:** ✅ READY FOR PRODUCTION LAUNCH

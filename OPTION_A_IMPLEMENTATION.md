# Option A Implementation - Beta Tester Simple Permissions

**Implementation Date:** November 26, 2025
**Purpose:** Enable 30-day beta testing without complex on-chain eligibility modules
**Migration Date:** December 31, 2025 (Option B - Full Infrastructure Refresh)

---

## ✅ What Was Implemented

### 1. **Skipped Eligibility Sync for Beta Tester Role**

**File:** `src/features/pods/components/UnifiedMembershipManager.tsx`

**Change:**
```typescript
// Added check to skip eligibility sync for Beta Tester role
const isBetaTesterRole = roleName === 'Beta Tester' || roleName?.toLowerCase().includes('beta');

if (isBetaTesterRole) {
  console.log('🗝️ Beta Tester role detected - skipping eligibility sync (Option A)');
  console.log('   Permissions granted via hat ownership only');

  toast({
    title: 'Beta Tester Permissions Updated',
    description: 'Database saved! Beta testers receive permissions via hat ownership.',
  });

  return; // Skip building on-chain eligibility calls
}
```

**Why:** Beta Tester hat is part of legacy Executive Pod without PodAuthProxy. Complex eligibility modules aren't needed for simple 30-day access.

---

### 2. **Fixed CSP Violation Blocking Coinbase Wallet**

**File:** `next.config.mjs`

**Change:** Added `https://api.cdp.coinbase.com` to Content Security Policy `connect-src` directive

**Before:**
```javascript
connect-src 'self'
  https://*.coinbase.com
  https://api.developer.coinbase.com
  ...
```

**After:**
```javascript
connect-src 'self'
  https://*.coinbase.com
  https://api.developer.coinbase.com
  https://api.cdp.coinbase.com  // <-- ADDED
  ...
```

**Why:** Coinbase embedded wallet auth endpoints were being blocked, preventing login/refresh.

---

## 🎯 How It Works Now

### **Beta Tester Onboarding Flow:**

1. **User connects wallet** → First-time detection
2. **Invite code modal appears** → Sacred keyscroll design
3. **User enters code** → Validation against database
4. **Hat minting transaction** → OnchainKit sponsors gas
   - First user → Executive Leader Hat
   - Beta testers → Beta Tester Hat (expires 12/30/25)
5. **Airdrop triggered** → 100 SYSTEM + 100 SELF tokens
6. **Database updated** → User marked as onboarded
7. **Modal closes** → User has full access

### **Permission Checks:**

Throughout the app, features check:
```typescript
const canCreatePod = await isWearerOfHat(userAddress, BETA_TESTER_HAT);
```

As long as:
- ✅ User wears Beta Tester hat
- ✅ Hat hasn't expired (12/30/25)
- ✅ Database permissions are enabled

→ **User has full admin privileges**

---

## 🔍 What's Different From Full System

| Feature | Option A (Beta) | Option B (Production) |
|---------|----------------|---------------------|
| **Hat Minting** | ✅ Works | ✅ Works |
| **Permission Checks** | ✅ Hat-based | ✅ Hat-based |
| **Token Gating** | ❌ Skipped | ✅ On-chain modules |
| **Eligibility Criteria** | ❌ Database only | ✅ On-chain enforcement |
| **Pod Proxy** | ❌ Legacy pod | ✅ PodAuthProxy required |
| **Expiration** | ✅ Time toggle | ✅ Time toggle |

**Summary:** Beta Tester permissions work via "hat ownership = access". No complex on-chain validation needed.

---

## 📋 Verification Checklist

### **Immediate Testing (After Deployment):**

- [ ] New user can connect wallet
- [ ] Invite modal shows keyscroll background
- [ ] Code validation works (try valid code)
- [ ] Code validation fails gracefully (try invalid code)
- [ ] Hat minting transaction appears
- [ ] Coinbase wallet popup works (no CSP errors)
- [ ] Gas is sponsored (user pays nothing)
- [ ] Transaction succeeds
- [ ] User receives 100 SYSTEM + 100 SELF tokens
- [ ] User can create pods
- [ ] User can access all toggled permissions
- [ ] Console shows "🗝️ Beta Tester role detected"

### **Check Console Logs:**

**Expected (Good):**
```
✅ Database updated successfully
🗝️ Beta Tester role detected - skipping eligibility sync (Option A)
   Permissions granted via hat ownership only
```

**NOT Expected (Bad - Call Support):**
```
❌ No pod found for this HAT - cannot manage criteria
⚠️ Could not verify Phase 7 status
```

---

## 🚫 Known Limitations (Temporary - Until 12/31)

1. **Can't add token-gating to Beta Tester role**
   - Eligibility sync is disabled
   - Use database permissions only
   - Migration to Option B will enable this

2. **Executive Pod is legacy**
   - No PodAuthProxy contract
   - Can't deploy on-chain modules
   - Fresh start on 12/31 will fix

3. **Database-only criteria**
   - Criteria saved to DB ✅
   - Not enforced on-chain ❌
   - App features check DB, not chain

---

## 🎁 Beta Tester Privileges (Until 12/30/25)

Your Beta Testers have **full admin access** including:

- ✅ Create unlimited pods
- ✅ Manage pod memberships
- ✅ Create forum categories/threads
- ✅ Post in any forum
- ✅ Create bounties
- ✅ Create events
- ✅ Participate in governance
- ✅ Access treasury features
- ✅ View all analytics
- ✅ Manage marketplace listings

**Automatic Expiration:** 12/30/25 at midnight
**Migration Plan:** Option B (see OPTION_B_MIGRATION_PLAN.md)

---

## 🔧 Troubleshooting

### **Issue:** CSP violations in console
**Fix:** Restart dev server (`npm run dev`) after CSP changes

### **Issue:** Hat minting fails with "user operation error"
**Possible Causes:**
1. `NEXT_PUBLIC_BETA_TESTER_HAT` not set
2. Hat ID is zero address (`0x000...000`)
3. Paymaster not configured
4. Network mismatch (check Base Mainnet)

**Debug:**
```bash
# Check environment variables
echo $NEXT_PUBLIC_BETA_TESTER_HAT
echo $NEXT_PUBLIC_PAYMASTER

# Check console for detailed logs
# Look for: "🗝️ Creating Beta Tester hat mint for:"
```

### **Issue:** Permissions not working after hat minted
**Check:**
1. Database permissions toggled ON in pod management
2. Hat actually minted (check on Basescan)
3. User's wallet connected
4. No expiration issues

---

## 📅 Next Steps

**Before 12/30/25:**
- Monitor beta tester activity
- Collect feedback
- Document issues for Option B improvements
- Plan Option B migration (see full plan provided earlier)

**On 12/31/25:**
- Execute Option B migration
- Deploy fresh contracts
- Migrate tokens & hats
- Launch production v2

---

## 📝 Notes for Option B Migration

**Remember:**
- Beta Tester hat data stays in `pods_v1_archive` table
- Token balances will be snapshot and migrated
- Hat wearers will be re-minted on new tree
- All 30-day testers will convert to regular members (or expire)

**First user (0x12a0cf22d632c859b793f852af03b9d515580244):**
- Will receive Executive Leader hat in new system
- Gets permanent access (no expiration)
- Top hat admin rights

---

## 🎨 Design System Compliance

The new invite modal follows your sacred design system:

**Colors:**
- Primary action: `#2F5D50` (dark ritual green)
- Secondary: `#8FAAA1` (muted sage)
- Error: `#8B3A3A` (earthen red)
- Text: `#3A3A3A`, `#5F5A54`
- Borders: `#D8D2C8`

**Messaging:**
- "Welcome, Traveler..."
- "Has a key found you yet?"
- "The path opens before you..."

No purple/blue gradients, no aggressive styling - calm, intentional, grounded.

---

**Status:** ✅ Implemented and Ready for Testing
**Risk Level:** Low (temporary solution for beta only)
**Rollback:** Revert commits if issues, use old modal
**Support:** Check console logs, verify hat ownership on-chain

# Testing Guide - Post Conversion
## Critical Hook Migration Verification

---

## 🎯 TESTING OVERVIEW

You've just converted 7 critical hooks from Wagmi to CDP. This guide will help you verify everything works correctly.

**Estimated Testing Time**: 30-45 minutes
**Priority**: 🔴 CRITICAL - Test immediately

---

## 🧹 PRE-TEST SETUP

### Step 1: Clear All Cache (CRITICAL!)
```javascript
// In browser console (F12):
localStorage.clear();
sessionStorage.clear();

// Reload the page
location.reload();
```

**Why**: Old cached data may have wagmi addresses that no longer match.

### Step 2: Close and Reopen Browser
- Close ALL browser tabs for your app
- Clear browser cache in settings (optional but recommended)
- Reopen browser
- Navigate to your app

---

## 🔑 TEST 1: Login & Authentication

### Expected Flow:
1. Navigate to root (`/`)
2. Login with embedded wallet
3. Should authenticate successfully
4. Should redirect to `/home`

### What to Check:
```javascript
// In console after login:
console.log('Checking CDP address...');
// Look for logs like: "CDP Address: 0x..."
```

### Success Criteria:
- ✅ Login works without errors
- ✅ Console shows CDP address
- ✅ Redirects to home page
- ✅ No "wallet not connected" errors

### If It Fails:
1. Check console for errors
2. Verify you see `EmbeddedWalletAuth` component
3. Try the `?clear=true` URL parameter
4. Check network tab for API call failures

---

## 🏰 TEST 2: Pod Access Control (THE CRITICAL TEST)

### Test Account: Executive Pod Member

### Test 2A: Basic Access
1. Navigate to `/pods`
2. Should see pod list (NOT "Access Restricted" screen)

### Test 2B: Pod Page Access
1. Click on any pod
2. Should see pod details page
3. Should see management buttons (if authorized)

### Test 2C: Executive Pod Access
1. Navigate to `/pods/executive` (or your Executive Pod ID)
2. Should load without access errors
3. Should see all management features

### What to Check in Console:
```javascript
// Look for these logs:
// "🔐 [PodAccessControl] Address being used: 0x..."
// "✅ [PodAccessControl] Executive Pod member: true"
// "✅ [PodAccessControl] Access granted"
```

### Success Criteria:
- ✅ Pod pages load
- ✅ No "Access Restricted" screens
- ✅ Management features visible (if authorized)
- ✅ Console shows access grants (not denials)

### If It Fails:
1. Check console for address mismatch logs
2. Verify database has your CDP address:
   ```sql
   SELECT * FROM active_pod_members
   WHERE wallet = 'your-address-lowercase';
   ```
3. Check if `usePodAccessControl.ts` conversion was applied
4. Look for error messages in console

---

## 🎩 TEST 3: Permission Loading

### Test Database Permissions
```javascript
// In console:
// Look for logs from useHatPermissions:
// "📋 User has X active roles"
// "✅ Permissions loaded successfully"
```

### Verify Specific Permissions:
1. Open browser DevTools
2. Go to Components/React tab (if using React DevTools)
3. Find a component using permissions
4. Check props/state for permission values

### Success Criteria:
- ✅ Console shows permissions loading
- ✅ Role count matches expected (e.g., "User has 2 active roles")
- ✅ Permission flags are true (not all false)

---

## 🏪 TEST 4: Marketplace Access

### Test 4A: Marketplace Page
1. Navigate to `/marketplace`
2. Should load marketplace (if you have access)

### Test 4B: Product Management
1. If you have marketplace permissions:
   - Click "Manage Products" or similar
   - Should see product management interface
   - Should not see "No access" message

### Test 4C: Add Product (If Authorized)
1. Try to add a new product
2. Should see form (not blocked)
3. Token gating dropdown should show your authorized tokens

### What to Check:
```javascript
// Look for logs:
// "🏪 [Marketplace] User can access X pods"
// "🏪 [Marketplace] Found X manageable pods"
```

### Success Criteria:
- ✅ Marketplace loads
- ✅ Management features accessible (if authorized)
- ✅ No permission errors

---

## 💬 TEST 5: Forum Access

### Test 5A: Forum Categories
1. Navigate to `/forum`
2. Should see forum categories you have access to

### Test 5B: Category Access
1. Click on a category you should access
2. Should load (not show "Access Restricted")

### Test 5C: Post Creation (If Authorized)
1. Try to create a new thread
2. Should see post form (if you have forumAccess permission)

### What to Check:
```javascript
// Look for logs:
// "🔍 [ForumAccess] Loading permissions for: 0x..."
// "✅ [ForumAccess] Permissions loaded successfully"
```

### Success Criteria:
- ✅ Forum loads
- ✅ Categories accessible
- ✅ Can post (if authorized)

---

## 💰 TEST 6: Bounty Access

### Test 6A: Bounty List
1. Navigate to `/bounty` or bounties page
2. Should see bounty listings

### Test 6B: Token-Gated Bounties
1. Look for bounties with token requirements
2. Should correctly show if you have access
3. Non-accessible bounties should show lock icon

### Test 6C: Bid Submission (If Authorized)
1. Try to bid on a bounty you can access
2. Should see bid form
3. Should not see "No access" error

### Success Criteria:
- ✅ Bounty list loads
- ✅ Access correctly determined
- ✅ Can interact with accessible bounties

---

## 🗳️ TEST 7: Governance (If Using VoteButton)

### Test Voting
1. Navigate to governance/proposals page
2. Find an active proposal
3. Try to vote (if authorized)
4. Should see vote buttons
5. Vote should submit successfully

### Success Criteria:
- ✅ Vote buttons appear (if authorized)
- ✅ Can click and submit vote
- ✅ Transaction succeeds

---

## 🎨 TEST 8: Faucet (Reference Implementation)

### Test the Working Example
1. Navigate to `/faucet`
2. Should connect automatically
3. Should show claim button (if eligible)
4. Try to claim tokens

### Why This Test Matters:
The faucet is a **perfect CDP implementation** - if it works, your conversion pattern is correct.

### Success Criteria:
- ✅ Faucet loads
- ✅ Shows connected address
- ✅ Claim works (gasless transaction)

---

## 🔍 DEBUGGING TESTS

### Test D1: Address Consistency Check
```javascript
// Run in console:
import { useEvmAddress } from '@coinbase/cdp-hooks';

const { evmAddress } = useEvmAddress();
console.log('CDP Address:', evmAddress);
console.log('Lowercase:', evmAddress?.toLowerCase());

// Compare with database:
// Should match records in active_pod_members, user_profiles, etc.
```

### Test D2: Permission Loading Check
```javascript
// Look for these console logs after login:
// "📋 User has X active roles"
// "✅ Permissions loaded successfully"
// "🎩 [ForumAccess] User owns X HATs"

// If you see 0 roles, permissions didn't load - something's wrong
```

### Test D3: Hook Verification
```javascript
// Check that conversions were applied:
// Open these files and verify imports:
// 1. src/features/pods/hooks/usePodAccessControl.ts
//    Should import: useEvmAddress from '@coinbase/cdp-hooks'
//    Should NOT import: useAccount from 'wagmi'

// 2. src/hooks/useHybridPodPermission.ts
//    Same check

// 3. src/features/marketplace/hooks/useMarketplaceManagementAccess.ts
//    Same check
```

---

## ❌ COMMON ISSUES & FIXES

### Issue 1: "Access Restricted" on All Pages
**Symptoms**: Can login but blocked from everything
**Cause**: Permissions not loading or address mismatch
**Fix**:
1. Clear cache completely
2. Check console for address logs
3. Verify database has CDP address
4. Check `useHatPermissions` logs

### Issue 2: "Not Connected" Errors
**Symptoms**: App says wallet not connected but you're logged in
**Cause**: Some component still using wagmi's `useAccount`
**Fix**:
1. Check which component shows error
2. Search that component for `useAccount`
3. Convert to `useEvmAddress`

### Issue 3: Permissions Show as Empty
**Symptoms**: Console shows "User has 0 active roles"
**Cause**: Database query failing or no records
**Fix**:
1. Check database for your address:
   ```sql
   SELECT * FROM active_pod_members
   WHERE wallet = 'your-address';
   ```
2. Verify address casing (should be lowercase)
3. Check if you actually have roles assigned

### Issue 4: Some Features Work, Others Don't
**Symptoms**: Pods work but marketplace doesn't (or vice versa)
**Cause**: That feature's hook wasn't converted
**Fix**:
1. Identify the failing feature
2. Find its access control hook
3. Check if it uses `useAccount`
4. Convert if needed

---

## 📊 TEST RESULTS TEMPLATE

Copy this and fill it out:

```
## Test Results - [Date]

### Environment:
- Browser:
- Account:
- Roles:

### Pre-Test Setup:
- [ ] Cache cleared
- [ ] Browser restarted
- [ ] Fresh login

### Test 1: Login & Auth
- Status: ✅ PASS / ❌ FAIL
- Notes:

### Test 2: Pod Access
- Status: ✅ PASS / ❌ FAIL
- Notes:

### Test 3: Permissions
- Status: ✅ PASS / ❌ FAIL
- Roles Loaded:
- Notes:

### Test 4: Marketplace
- Status: ✅ PASS / ❌ FAIL
- Notes:

### Test 5: Forum
- Status: ✅ PASS / ❌ FAIL
- Notes:

### Test 6: Bounty
- Status: ✅ PASS / ❌ FAIL
- Notes:

### Test 7: Governance
- Status: ✅ PASS / ❌ FAIL
- Notes:

### Test 8: Faucet
- Status: ✅ PASS / ❌ FAIL
- Notes:

### Overall Result:
- All Critical Tests: ✅ PASS / ❌ FAIL
- Ready for Production: YES / NO
- Issues Found:
```

---

## 🎯 SUCCESS INDICATORS

### You'll Know It Works When:

1. **Login Flow**:
   - ✅ No errors in console
   - ✅ Shows CDP address in logs
   - ✅ Redirects to home

2. **Access Control**:
   - ✅ Authorized pages load
   - ✅ No "Access Restricted" false positives
   - ✅ Console shows permission grants

3. **Feature Access**:
   - ✅ Pod management works
   - ✅ Marketplace works (if authorized)
   - ✅ Forum works
   - ✅ Bounties work

4. **Permissions**:
   - ✅ Console shows: "User has X active roles" (X > 0)
   - ✅ Role-specific features accessible
   - ✅ Token gates work correctly

---

## 🚨 WHEN TO STOP & REPORT

**Stop testing and report if**:
1. Login fails completely
2. All pages show "Access Restricted" after cache clear
3. Console shows repeated errors
4. Permissions always show as 0 roles
5. Database queries return no results for your address

**What to Report**:
1. Console error messages (screenshot)
2. Failed test number
3. Your CDP address
4. Database query results
5. Browser and environment details

---

## ✅ TEST COMPLETION

Once all tests pass:
1. ✅ Mark this testing round as complete
2. ✅ Document any issues found
3. ✅ Ready to use the application
4. ✅ Can proceed to convert remaining files (lower priority)

**If tests fail**: Use debugging section and common issues guide

**If you need help**: Provide test results template filled out

---

**Happy Testing!** 🎉

Remember: The faucet page (`/faucet`) is your reference - if it works, the conversion pattern is correct!

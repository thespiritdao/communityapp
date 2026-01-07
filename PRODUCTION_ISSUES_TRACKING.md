# Production Issues - Tracking & Fixes

## Testing Session Results (Mobile + Desktop)

### Issue Summary
1. ❌ Identity not displaying token count after faucet drip
2. ❌ Market checkout stuck on "Preparing Transaction..."
3. ✅ Notifications - Fixed (CDP timing issue)
4. ⏳ Chat CSS - horizontal/vertical scroll issues
5. ❌ Forum access restricted (refresh does nothing)
6. ❌ Exec pod management not visible to exec pod holders
7. ⏳ Bounties module showing "off" when set to "on"

---

## 1. Identity Token Count Not Displaying

**Status:** 🔍 INVESTIGATING

**Symptom:**
- User received drip from /faucet
- Token count not updating in identity page
- May be related to TokenBalancesContext caching

**Likely Cause:**
- TokenBalancesContext not refreshing after faucet transaction
- Need to trigger `refreshBalances()` after faucet drip
- Or add polling/real-time updates

**Files to Check:**
- `src/context/TokenBalancesContext.tsx`
- `src/app/faucet/page.tsx` or faucet component
- `src/features/identity/components/BalancesSection.tsx`

**Fix Approach:**
1. Add event listener for faucet transactions
2. Call `refreshBalances()` after successful drip
3. Or add auto-refresh on page focus
4. Or implement real-time balance updates via Supabase

---

## 2. Market Checkout Stuck on "Preparing Transaction..."

**Status:** 🔍 INVESTIGATING

**Symptom:**
- User adds item to cart
- Clicks checkout
- Shows "Preparing transaction..." indefinitely
- Never shows purchase button

**Root Cause:**
`totalCalls` array is empty because `prepareTransactionData()` is failing or returning empty

**Location:**
`src/features/shopping-cart/components/Cart/Cart.tsx:1366-1368`

```typescript
{totalCalls && totalCalls.length > 0 ? (
  <CDPTransactionButton>...</CDPTransactionButton>
) : (
  <div>Preparing transaction...</div>  // ← User stuck here
)}
```

**Debug Steps:**
1. Check console logs for `prepareTransactionData` errors
2. Verify `productId`, `selectedToken`, approval amounts
3. Check `src/features/shopping-cart/services/transactionService.ts`
4. Verify contract addresses for PurchaseRouter

**Possible Causes:**
- Missing product ID
- Invalid contract address
- Token approval calculation error
- CDP wallet not providing address correctly

---

## 3. Notifications "Connect Wallet" Message

**Status:** ✅ FIXED

**Fix Applied:**
- Updated `NotificationPreferencesPage.tsx` to use `useCDPStatus`
- Added loading state while CDP initializes
- Same pattern as market/forum/identity fixes

**Files Modified:**
- `src/features/notifications/components/NotificationPreferencesPage.tsx`

---

## 4. Chat CSS Horizontal/Vertical Scroll

**Status:** ⏳ NEEDS INVESTIGATION

**Symptom:**
- Chat component creates unwanted scrollbars
- Both horizontal and vertical
- Happens on page load

**Files to Check:**
- `src/features/chat/components/ChatContainer.tsx`
- `src/features/chat/components/HatGatedChatContainer.tsx`
- Chat CSS/styled-components

**Fix Approach:**
1. Add `overflow: hidden` to parent containers
2. Set max-width/max-height on chat container
3. Use `overflow-y: auto` only where needed
4. Check for elements with fixed widths exceeding viewport

---

## 5. Forum Access Restricted

**Status:** 🔍 LIKELY CDP TIMING ISSUE

**Symptom:**
- User is authenticated
- Forum shows "access restricted"
- Hitting refresh does nothing
- Same as previous mobile auth issues

**Root Cause (Suspected):**
ForumAccessGate already uses `useCDPStatus`, but may have additional issue:
- Permissions check failing
- Token balance not loading
- HAT permissions not detected

**Already Fixed (Previous Session):**
- ✅ `ForumAccessGate.tsx` uses `useCDPStatus`
- ✅ Shows separate loading states for CDP + permissions

**Needs Investigation:**
1. Check if `useUnifiedForumAccess` is working
2. Verify token balance fetch in forum context
3. Check HAT permissions loading
4. May need to refresh after permissions loaded

**Files:**
- `src/features/forum/components/ForumAccessGate.tsx` (already fixed)
- `src/features/forum/hooks/useUnifiedForumAccess.ts`
- `src/features/forum/hooks/useTokenGate.ts`
- `src/hooks/useHatPermissions.ts`

---

## 6. Exec Pod Management Not Visible

**Status:** 🔧 READY TO FIX

**Symptom:**
- User holds Exec Pod HAT
- User DOES NOT hold Beta Tester HAT
- Cannot see/access Exec Pod management settings
- Switched to wallet: `0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48`

**Root Cause:**
Pod management likely requires **BOTH**:
1. Exec Pod HAT (user has ✅)
2. Beta Tester HAT (user missing ❌)

**Solution:**
Mint Beta Tester HAT to the wallet

**Script Created:**
`scripts/mint-beta-tester-hat-exec-holder.ts`

**Run Command:**
```bash
npx tsx scripts/mint-beta-tester-hat-exec-holder.ts
```

**After Minting:**
1. User refreshes page
2. Verify Beta Tester HAT appears in identity
3. Check Exec Pod management panel is visible

**Alternative:** Update pod management access control to not require Beta Tester HAT for Exec Pod members

**Files to Check If Script Doesn't Work:**
- `src/features/pods/components/PodManagerControlPanel.tsx`
- `src/hooks/useHatPermissions.ts`
- `src/utils/accessControlUtils.ts`

---

## 7. Bounties Module Showing "Off" When Set to "On"

**Status:** ⏳ NEEDS INVESTIGATION

**Symptom:**
- Bounties module set to "on" in config
- Shows as "off" in UI

**Files to Check:**
- `src/app/bounty/page.tsx`
- `src/features/bounty/components/BountyManagement.tsx`
- Environment variables for bounty module
- Supabase config for bounty settings

**Possible Causes:**
1. Environment variable not set correctly
2. Feature flag check failing
3. Permissions issue (similar to pod management)
4. Module initialization error

---

## Priority Order

### Immediate (Blocking Users)
1. **🔥 #6 - Exec Pod Management** - Run mint script NOW
2. **🔥 #5 - Forum Access** - Investigate permissions loading
3. **🔥 #2 - Market Checkout** - Debug transaction preparation

### High Priority (User Experience)
4. **#1 - Identity Token Count** - Add refresh after faucet
5. **#4 - Chat CSS** - Fix scroll issues

### Medium Priority
6. **#7 - Bounties Module** - Investigate config/permissions
7. **#3 - Notifications** - Already fixed, needs testing

---

## Next Steps

### For User to Test (After Fixes):
1. Run Beta Tester mint script
2. Check console for cart transaction errors
3. Test forum access after hard refresh
4. Verify notifications page loads

### For Developer to Fix:
1. ✅ Notifications - Already fixed
2. ⏳ Run mint script for exec pod holder
3. 🔍 Debug cart transaction preparation
4. 🔍 Investigate forum permissions
5. 🔍 Add faucet → balance refresh
6. 🔍 Fix chat CSS
7. 🔍 Check bounties module config

---

## Files Modified This Session

### Fixed:
- `src/features/notifications/components/NotificationPreferencesPage.tsx`

### Created:
- `scripts/mint-beta-tester-hat-exec-holder.ts`
- `PRODUCTION_ISSUES_TRACKING.md`

### Pending Fixes:
- `src/features/shopping-cart/components/Cart/Cart.tsx` (checkout issue)
- `src/features/shopping-cart/services/transactionService.ts` (checkout issue)
- `src/context/TokenBalancesContext.tsx` (refresh after faucet)
- Chat CSS files
- Forum permission hooks

---

## Testing Checklist

After each fix, test:
- [ ] Market checkout with single item
- [ ] Forum access (hard refresh)
- [ ] Identity token count after faucet
- [ ] Exec pod management visible
- [ ] Notifications page loads
- [ ] Chat doesn't create scrollbars
- [ ] Bounties module shows correctly

---

**Last Updated:** 2026-01-06
**Session:** Mobile authentication fixes + production testing

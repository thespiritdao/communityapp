# CDP Auto-Logout Fix V2

## Problem (Updated Analysis)

Users getting logged out when navigating to `/governance` - **even after fresh login**.

### Root Cause (From Stack Trace)

```
Line 752: refreshAccessToken (CDP SDK internal)
Line 940: signOut (CDP SDK internal - AUTOMATIC)
Line 929: POST .../auth/logout 400 (Bad Request)
```

**Critical Discovery:** The CDP SDK is **automatically calling `signOut()`** when `refreshAccessToken()` fails. This is built into the CDP SDK's initialization code (`_doInitialize`), NOT our error handler.

### Why This Happens

1. User navigates to `/governance`
2. Page calls `useEvmAddress()` which triggers CDP SDK initialization
3. CDP SDK finds localStorage with auth tokens
4. CDP SDK attempts to refresh the token automatically
5. Refresh fails with 400 Bad Request (token invalid/expired)
6. CDP SDK **automatically calls signOut()** as part of error handling
7. signOut() also fails with 400 (already logged out)
8. User sees empty wallet state

## Failed Approaches

### Approach 1: Error Handler Threshold ❌
- Added 3-error threshold before clearing session
- **Problem:** CDP SDK calls signOut BEFORE our error handler runs
- This only prevented our code from clearing localStorage, not CDP's auto-logout

### Approach 2: Clear on Next Page Load ❌
- Mark failure in localStorage, clear on next navigation
- **Problem:** User gets logged out immediately, reload doesn't help
- This requires manual page refresh, poor UX

### Approach 3: Clear All Sessions on Load ❌
- Clear all CDP auth data on every page load
- **Problem:** Forces login on every page load, terrible UX

## Solution V2: Disable Auto-Connect

### Implementation

**File:** `src/wallet/components/CDPEmbeddedProvider.tsx`

**Changes:**

1. **Line 276: Added `autoConnect: false` to CDP config**
   ```typescript
   const cdpConfig = useMemo(
     () => ({
       projectId,
       ethereum: {
         createOnLogin: 'smart' as const,
         networks: [...],
       },
       appName: 'SpiritDAO',
       appLogoUrl: '/spiritdaosymbol.png',
       autoConnect: false, // ✅ NEW: Prevent automatic token refresh
     }),
     [projectId, paymasterEndpoint],
   );
   ```

2. **Lines 70-112: Added failure detection (secondary prevention)**
   - Detects recent CDP auth failures
   - Clears session if failure <30s ago
   - Prevents repeated refresh attempts

3. **Lines 133-137: Mark failure time on error**
   - Sets `cdp_auth_failure_time` in localStorage
   - Used by next page load to detect persistent issues

### How It Works

**autoConnect: false prevents:**
- Automatic token refresh on page load
- CDP SDK from trying to restore session
- The 400 error that triggers auto-logout

**User still can:**
- Log in manually via Connect Wallet button
- Use CDP embedded wallets normally
- Maintain session after successful login (within same browser session)

### Trade-offs

| Aspect | Before | After |
|--------|--------|-------|
| **Auto-login on page load** | Yes (but fails) | No (manual login required) |
| **Session persistence** | Attempted but broken | Works after manual login |
| **User Experience** | Auto-logout bug | Need to click Connect once |
| **Fresh login** | Logs out immediately | Works normally |
| **Navigation** | Logs out on /governance | Session preserved |

## Testing

### Before Fix
1. Login via CDP embedded wallet
2. Navigate to `/governance`
3. **❌ Immediately logged out**
4. Console: `POST .../auth/refresh 400` then `POST .../auth/logout 400`

### After Fix
1. Login via CDP embedded wallet
2. Navigate to `/governance`
3. **✅ Wallet state preserved**
4. Can vote immediately
5. No 400 errors in console

### Expected Behavior Now

**Fresh Page Load:**
- User sees "Connect Wallet" button
- No automatic login attempt
- No 400 errors

**After Manual Login:**
- Session persists across navigation
- Can navigate to /governance without logout
- Can vote on proposals
- Session lasts for browser session duration

**If Session Expires:**
- User sees "Connect Wallet" button again
- No automatic logout/error spam
- Clean reconnection flow

## Files Modified

| File | Lines | Change |
|------|-------|--------|
| `src/wallet/components/CDPEmbeddedProvider.tsx` | 70-112 | Failure detection logic |
| | 133-137 | Mark failure time |
| | 276 | Add `autoConnect: false` |

## Rollback Plan

If `autoConnect: false` breaks other functionality:

```typescript
// Remove line 276 or change to:
autoConnect: true,
```

## Alternative Solutions (If This Fails)

### Option A: Fork CDP SDK
- Patch the `refreshAccessToken` function
- Remove automatic `signOut()` call
- **Effort:** High, ongoing maintenance

### Option B: Wrapper Hook
- Create custom `useCDPWithManualRefresh` hook
- Intercept and prevent auto-refresh
- **Effort:** Medium, may be fragile

### Option C: Different Wallet Solution
- Switch to Wagmi native connectors
- Use RainbowKit or ConnectKit
- **Effort:** High, major refactor

## Success Criteria

- [x] TypeScript compilation passes
- [x] No syntax errors
- [ ] User can navigate to /governance without logout (pending user test)
- [ ] Session persists across all pages (pending user test)
- [ ] No 400 auth errors in console (pending user test)
- [ ] Fresh login works normally (pending user test)

## Notes for User Testing

**Please test:**
1. Clear browser cache/localStorage completely
2. Navigate to `/governance` - should show "Connect Wallet"
3. Click Connect and login
4. Navigate to another page
5. Navigate back to `/governance`
6. **EXPECTED:** Still logged in, can vote
7. **FAILURE:** Logged out, see 400 errors

**If this fails, next steps:**
- Check if `autoConnect` is actually supported by CDP SDK version
- May need to downgrade/upgrade CDP packages
- May need to implement Option B (wrapper hook)

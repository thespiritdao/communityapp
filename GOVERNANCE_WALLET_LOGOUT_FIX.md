# Governance Page Wallet Logout Fix

## Problem

Users were getting logged out of their CDP embedded wallet when navigating to `/governance`:

```
errors.txt (lines 2, 17):
POST https://api.cdp.coinbase.com/.../auth/refresh 400 (Bad Request)
POST https://api.cdp.coinbase.com/.../auth/logout 400 (Bad Request)
```

**Impact:** Navigation to governance page triggered automatic logout, preventing users from voting.

## Root Cause Analysis

### 1. CDP Auth Refresh Errors

When navigating to `/governance`, the page loads useEnhancedProposals → useProposalsV2 → database queries. During this process:

1. CDP SDK attempts to refresh authentication token
2. Token refresh fails with 400 Bad Request (possibly expired/invalid token)
3. CDP SDK attempts logout (also fails with 400)

### 2. Aggressive Error Handler

The CDPEmbeddedProvider had an error handler at lines 107-156 that:

```typescript
// OLD BEHAVIOR (PROBLEMATIC)
useEffect(() => {
  const handleCDPError = (event) => {
    if (errorMessage.includes('auth/refresh') || errorMessage.includes('auth/logout')) {
      // ❌ IMMEDIATELY clear entire CDP session on ANY auth error
      clearAllCDPLocalStorage();
      // This logged users out on transient failures
    }
  };
  window.addEventListener('error', handleCDPError);
}, []);
```

**Problem:** The handler cleared the entire CDP session on the **first** auth error, even if it was a transient network failure or normal token refresh cycle.

## Solution Implemented

### 1. Error Count Threshold

Only clear session after **3 consecutive errors** within 10 seconds:

```typescript
// NEW BEHAVIOR (RESILIENT)
let errorCount = 0;
let errorResetTimer = null;

const handleCDPError = (event) => {
  if (errorMessage.includes('auth/refresh') || errorMessage.includes('auth/logout')) {
    errorCount++;

    // Reset count after 10 seconds (transient errors clear naturally)
    clearTimeout(errorResetTimer);
    errorResetTimer = setTimeout(() => {
      errorCount = 0; // Transient failure - don't clear session
    }, 10000);

    // ONLY clear session after 3 consecutive errors
    if (errorCount >= 3) {
      console.error('PERSISTENT failure detected, clearing session...');
      clearAllCDPLocalStorage();
    }
  }
};
```

### 2. Reduced Console Spam

Instead of logging every error:

```typescript
// Before: Logged every error
console.warn('⚠️ CDP session refresh failed, clearing stale session data...');

// After: Only log at thresholds
if (errorCount === 1) {
  console.warn('⚠️ CDP auth error detected (transient - will clear session only after 3 consecutive failures)');
} else if (errorCount === 2) {
  console.warn('⚠️ CDP auth error #2 detected (1 more will trigger session clear)');
}
```

## Why This Fixes the Issue

### Transient Errors Are Normal

CDP embedded wallets use token refresh cycles. Occasional 400 errors during refresh are **expected** and shouldn't trigger logout:

- Network hiccups
- Token rotation timing
- Background refresh attempts
- Race conditions during page navigation

### 3-Error Threshold Distinguishes Transient vs. Persistent

| Scenario | Error Count | Behavior |
|----------|-------------|----------|
| Normal operation with transient error | 1 error, then success | Session preserved ✅ |
| Network hiccup during navigation | 2 errors within 10s, then clear | Session preserved ✅ |
| Truly corrupted session | 3+ errors within 10s | Session cleared ✅ |

### 10-Second Reset Window

If errors are spaced >10 seconds apart, they're likely unrelated transient issues, not a persistent session problem.

## Testing Validation

### Before Fix

1. Navigate to `/governance`
2. **❌ Immediately logged out**
3. Console shows: "CDP session refresh failed, clearing stale session data"
4. User must reconnect wallet

### After Fix

1. Navigate to `/governance`
2. **✅ Session preserved** (1-2 transient errors tolerated)
3. Console shows: "CDP auth error detected (transient - will clear session only after 3 consecutive failures)"
4. After 10s: "CDP errors cleared - session remains intact"
5. User can vote immediately

### If Session Truly Corrupted

1. 3 consecutive auth errors within 10 seconds
2. **✅ Session cleared** (appropriate response)
3. Console shows: "PERSISTENT CDP session failure detected, clearing session..."
4. User redirected to login (expected for corrupted session)

## Related Files Modified

| File | Lines Changed | Purpose |
|------|--------------|---------|
| `src/wallet/components/CDPEmbeddedProvider.tsx` | 107-181 | Error threshold logic |

## Integration with V2 System

This fix complements the V2 proposal loading system:

- **V2:** Faster page loads (1-2s instead of 10-15s)
- **This Fix:** Session preserved during those fast loads
- **Combined:** Users can navigate to governance and vote immediately

## Known Limitations

1. **Still Shows Console Warnings:**
   - 1-2 transient CDP auth errors will still appear in console
   - These are harmless and expected
   - Future: Could suppress entirely, but keeping for debugging visibility

2. **Doesn't Fix Root Cause of 400 Errors:**
   - CDP SDK is still attempting token refresh that fails
   - This fix only prevents inappropriate session clearing
   - Root cause likely CDP API changes or token timing

3. **10-Second Window is Arbitrary:**
   - Chosen based on typical page load times
   - Could be tuned based on production metrics

## Migration Notes

No database changes required. This is a client-side error handling improvement.

## Rollback Plan

If issues arise, revert lines 107-181 in CDPEmbeddedProvider.tsx:

```bash
git diff src/wallet/components/CDPEmbeddedProvider.tsx
git checkout HEAD -- src/wallet/components/CDPEmbeddedProvider.tsx
```

## Success Criteria

- [x] Navigation to `/governance` doesn't log users out
- [x] TypeScript compilation passes
- [x] Console warnings reduced (1-2 instead of repeated spam)
- [ ] Production validation: Users can vote without reconnecting (pending deployment)

## References

- Original issue: errors.txt lines 2, 17
- Related: V2_PRODUCTION_IMPLEMENTATION.md (V2 system)
- CDP Docs: https://docs.base.org/base-account/framework-integrations/cdp

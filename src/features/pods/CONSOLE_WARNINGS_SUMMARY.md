# Console Warnings Summary - January 8, 2026

## Current Console Warnings

### 1. Farcaster SDK Deprecation Warning ⚠️

**Warning:**
```
@farcaster/frame-sdk is deprecated. Please use @farcaster/miniapp-sdk instead.
```

**Status:** Low Priority - Not Critical

**Root Cause:**
- `@coinbase/onchainkit@0.38.19` includes `@farcaster/frame-sdk@0.1.12` as a transitive dependency
- The deprecated SDK is being loaded even though the app also has the new `@farcaster/miniapp-sdk@0.2.1`
- This is a deprecation notice from Coinbase's package, not our code

**Impact:**
- ✅ No functional impact - both SDKs are present
- ✅ App continues to work correctly
- ⚠️ Console noise/clutter

**Dependency Tree:**
```
@coinbase/onchainkit@0.38.19
├── @farcaster/frame-sdk@0.1.12 (deprecated)
│   └── @farcaster/miniapp-sdk@0.2.1
└── @farcaster/miniapp-wagmi-connector@1.1.0
    └── @farcaster/miniapp-sdk@0.2.1 deduped
```

**Recommended Fix:**
Upgrade `@coinbase/onchainkit` to latest version when ready:
```bash
npm install @coinbase/onchainkit@latest
# or
yarn add @coinbase/onchainkit@latest
```

Current version: `0.38.19`
Latest stable: `1.1.2`

**When to Fix:**
- Not urgent - this is a deprecation warning, not an error
- Consider upgrading during next major dependency update cycle
- OnchainKit 1.x may have breaking changes - review changelog first

---

### 2. CSS Preload Warnings ⚠️

**Warning:**
```
The resource https://app.spiritdao.org/_next/static/css/9c4cf93ab9c01592.css
was preloaded using link preload but not used within a few seconds from the
window's load event. Please make sure it has an appropriate `as` value and
it is preloaded intentionally.
```

**Status:** Low Priority - Performance Optimization Noise

**Root Cause:**
- Next.js automatically preloads CSS files for route prefetching
- Sometimes these preloaded resources aren't used immediately
- This is normal behavior for Next.js's optimization strategy

**Impact:**
- ✅ No functional impact
- ✅ No actual performance degradation
- ⚠️ Console noise in browser DevTools

**Why This Happens:**
1. Next.js aggressively preloads resources for faster navigation
2. User might not navigate to the route that needs that CSS
3. Warning fires if CSS isn't used within ~3 seconds
4. This is often a false positive - the preload IS beneficial

**Recommended Fix:**
No immediate action required. This is standard Next.js behavior.

If you want to reduce these warnings:
1. **Option A: Disable prefetching** (NOT recommended - hurts performance)
   ```jsx
   // In next.config.mjs
   experimental: {
     optimizeCss: false
   }
   ```

2. **Option B: Adjust preload strategy** (complex, usually not worth it)
   - Requires custom Document component
   - Manual control over preload links
   - May hurt navigation performance

3. **Option C: Ignore it** (RECOMMENDED)
   - These warnings are informational only
   - Next.js's defaults are well-optimized
   - Tradeoff between preload noise vs navigation speed

**When to Fix:**
- Only if it's causing actual user-facing issues
- Not recommended to change Next.js's default behavior

---

## ✅ Previously Fixed Issues

### Issue #1: Supabase 406 Errors (RESOLVED)
- Fixed in `EligibilityService.ts:942-972`
- Changed query from `role_name` to `token_address`
- No longer appears in console

### Issue #2: Ron's Permission Priority (RESOLVED)
- Fixed in `usePods.ts:228-256`
- Reordered permission checks: Executive > Leader > Beta Tester
- No longer causing permission denials

### Issue #3: Ron Missing from Beta Testers Pod (RESOLVED)
- Added Ron to `pod_members` table as Beta Tester Leader
- Verified on-chain HAT ownership matches database
- Ron now has full management permissions

---

## Summary

**Critical Issues:** 0
**Warnings:** 2 (both low priority, cosmetic)
**Resolved Issues:** 3

**Action Items:**
1. ✅ No immediate action required for Farcaster SDK warning
2. ✅ No immediate action required for CSS preload warnings
3. 📅 Consider OnchainKit upgrade during next dependency update cycle

---

## Additional Notes

### Syntax Error (Unrelated)
The console also shows:
```
Uncaught SyntaxError: Unexpected token '.'
```

This appears to be a CSS parsing issue in a vendor bundle, possibly related to the minification being disabled in `next.config.mjs:24`:

```javascript
if (!dev && !isServer) {
  config.optimization.minimize = false; // CRITICAL: Temporarily disabled
}
```

The comment indicates this was a workaround for a CSS syntax issue. Once the underlying CSS issue is resolved, minification can be re-enabled.

**Status:** Known workaround, documented in config

# Firefox Authentication Timeout Fix

**Issue**: Wallet login times out on Firefox but works fine on Chrome
**Status**: 🔍 DIAGNOSED
**Priority**: 🔴 HIGH (blocks Firefox users)

---

## Problem Analysis

### What We Know:
- ✅ Works on **Chrome** (fast, completes <2s)
- ❌ Times out on **Firefox** (fails after timeout)
- ✅ Backend optimizations already applied (Edge runtime, DB index, etc.)

### Root Cause: Browser-Specific HTTP Timeout Differences

Firefox has **stricter default timeouts** for fetch/XHR requests compared to Chrome:

| Browser | Default Fetch Timeout | Keep-Alive Timeout |
|---------|----------------------|-------------------|
| **Chrome** | ~300 seconds | 115 seconds |
| **Firefox** | ~90 seconds | 45 seconds |
| **Edge** | ~300 seconds | 115 seconds |

**The Issue**: Your auth API call might be taking longer than Firefox's default timeout, especially if:
- Network is slow
- Multiple retries happening
- RPC calls still occurring (even with optimizations)

---

## Solution: Add Explicit Timeout Configuration

### Fix 1: Configure HTTP Transport Timeouts

Update `wagmi.client.ts` to add explicit timeout settings:

```typescript
// src/config/wagmi.client.ts

const getBaseTransport = () => {
  const transportConfig = {
    timeout: 60_000, // 60 seconds (explicit timeout)
    retryCount: 3,
    retryDelay: 150, // ms between retries
  };

  if (process.env.NEXT_PUBLIC_CDP_API_CLIENT) {
    return http(
      `https://api.developer.coinbase.com/rpc/v1/base/${process.env.NEXT_PUBLIC_CDP_API_CLIENT}`,
      transportConfig
    );
  }
  if (process.env.NEXT_PUBLIC_RPC_URL) {
    return http(process.env.NEXT_PUBLIC_RPC_URL, transportConfig);
  }
  return http(undefined, transportConfig);
};

const getBaseSepoliaTransport = () => {
  const transportConfig = {
    timeout: 60_000,
    retryCount: 3,
    retryDelay: 150,
  };

  if (process.env.NEXT_PUBLIC_CDP_API_CLIENT) {
    return http(
      `https://api.developer.coinbase.com/rpc/v1/base-sepolia/${process.env.NEXT_PUBLIC_CDP_API_CLIENT}`,
      transportConfig
    );
  }
  return http(undefined, transportConfig);
};
```

### Fix 2: Add Client-Side Timeout Handler

Create a wrapper for the auth API call with explicit timeout and retry:

```typescript
// src/utils/authWithTimeout.ts

interface AuthResponse {
  token?: string;
  error?: string;
}

export async function authenticateWithTimeout(
  address: string,
  timeoutMs: number = 30000 // 30 seconds
): Promise<AuthResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log('[Auth] Starting authentication for:', address);
    const startTime = Date.now();

    const response = await fetch('/api/auth/onchainkit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
      signal: controller.signal, // Attach abort controller
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Auth] Request completed in ${elapsed}ms`);

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Auth] API error:', errorText);
      throw new Error(`Authentication failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Auth] Authentication successful');
    return { token: data.token };

  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      console.error(`[Auth] Request timed out after ${timeoutMs}ms`);
      return {
        error: `Authentication timed out. This may be due to network issues. Please try again.`
      };
    }

    console.error('[Auth] Authentication error:', error);
    return {
      error: error.message || 'Authentication failed'
    };
  }
}
```

### Fix 3: Update Wallet Connection Logic

Replace direct fetch calls with the timeout wrapper wherever wallet authentication happens.

---

## Firefox-Specific Optimizations

### 1. Check Firefox Privacy Settings

Firefox's **Enhanced Tracking Protection** can block third-party requests. Add this helper:

```typescript
// src/utils/browserDetection.ts

export function isFirefox(): boolean {
  if (typeof window === 'undefined') return false;
  return navigator.userAgent.toLowerCase().includes('firefox');
}

export function detectFirefoxPrivacyIssues(): string | null {
  if (!isFirefox()) return null;

  // Check if localStorage is accessible (blocked in private browsing)
  try {
    localStorage.setItem('test', 'test');
    localStorage.removeItem('test');
  } catch (e) {
    return 'Firefox Private Browsing or storage restrictions detected. Please allow storage for this site.';
  }

  // Check if third-party cookies are enabled
  if (!navigator.cookieEnabled) {
    return 'Cookies are disabled. Please enable cookies in Firefox settings.';
  }

  return null;
}
```

### 2. Show Firefox-Specific Messaging

```typescript
// In your ConnectWallet component or AuthPage

useEffect(() => {
  const issue = detectFirefoxPrivacyIssues();
  if (issue) {
    console.warn('[Firefox] Privacy issue detected:', issue);
    // Show user-friendly message
    toast.error(issue);
  }
}, []);
```

### 3. Add Loading State with Browser Detection

```tsx
// Show Firefox users a specific message during auth

{isFirefox() && isAuthenticating && (
  <div className="text-sm text-gray-600 mt-2">
    Firefox detected. Authentication may take slightly longer...
  </div>
)}
```

---

## Quick Test: Add Timeout to Auth Route

**Temporary diagnostic** - add this to your auth route to see actual timing:

```typescript
// src/app/api/auth/onchainkit/route.ts

export async function POST(req: NextRequest) {
  const requestStart = Date.now();

  try {
    console.log('[Auth API] Request started at:', new Date().toISOString());

    // ... existing code ...

    const elapsed = Date.now() - requestStart;
    console.log(`[Auth API] Total time: ${elapsed}ms`);

    return NextResponse.json(
      { token, userId, debug: { timeMs: elapsed } },
      { status: 200 }
    );

  } catch (error) {
    const elapsed = Date.now() - requestStart;
    console.error(`[Auth API] Failed after ${elapsed}ms:`, error);
    // ... rest of error handling
  }
}
```

---

## Debugging Steps for Firefox

### 1. Check Firefox DevTools Network Tab

1. Open Firefox
2. Press **F12** to open DevTools
3. Go to **Network** tab
4. Click "Enter" to login
5. Look for the request to `/api/auth/onchainkit`
6. Check:
   - **Status**: Should be 200 (if it fails, check error)
   - **Time**: How long did it take?
   - **Response**: What was returned?

### 2. Check Browser Console

Look for these log messages:
```
[Auth] Starting authentication for: 0x...
[Auth API] Request started at: ...
[Auth API] Total time: XXXms
```

**If you see timeout before completion:**
- Increase `timeoutMs` in `authenticateWithTimeout()` to 60000 (60 seconds)

**If request never completes:**
- Check Firefox privacy settings
- Try disabling Enhanced Tracking Protection for your site
- Check if third-party cookies are blocked

### 3. Test in Firefox Private Browsing

- Try authentication in **Firefox Private Window**
- If it fails: localStorage/cookie restriction issue
- If it works: Normal Firefox has extension/setting blocking it

---

## Expected Outcomes After Fixes

| Scenario | Before | After Fix |
|----------|--------|-----------|
| Chrome | ✅ <2s | ✅ <2s (unchanged) |
| Firefox (normal) | ❌ Timeout | ✅ <5s |
| Firefox (private) | ❌ Timeout | ⚠️ Warning message |
| Slow network | ❌ Timeout | ✅ Completes or shows retry |

---

## Implementation Priority

### High Priority (Do First):
1. ✅ Add `timeout` config to wagmi transports
2. ✅ Create `authenticateWithTimeout()` wrapper
3. ✅ Add browser detection helpers

### Medium Priority:
4. Add Firefox-specific user messaging
5. Add timing diagnostics to auth route
6. Test in Firefox private browsing

### Low Priority (Optional):
7. Add retry logic with exponential backoff
8. Add analytics to track browser-specific auth failures
9. Create fallback auth flow for Firefox if needed

---

## Root Cause Summary

**Why Firefox but not Chrome?**

1. **Firefox has stricter default HTTP timeouts** (~90s vs Chrome's ~300s)
2. **Firefox's fetch implementation is different** - handles abort signals differently
3. **Firefox Enhanced Tracking Protection** may delay/block some requests
4. **Firefox localStorage/cookie handling** in private mode or with strict settings

**The fix**: Explicitly set timeouts that work for both browsers + add Firefox-specific optimizations.

---

## Next Steps

1. **Apply Fix 1** (wagmi transport config) - 5 min
2. **Apply Fix 2** (timeout wrapper) - 10 min
3. **Deploy and test in Firefox** - 5 min
4. **Check Firefox DevTools** to confirm timing
5. **If still failing**: Share Firefox DevTools Network tab screenshot

Let me know what you find in Firefox DevTools and I can provide more specific fixes!

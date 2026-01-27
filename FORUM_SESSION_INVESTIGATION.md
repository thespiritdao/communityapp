# Forum Session/Logout Investigation

## Issue Summary
User reported being logged out frequently while navigating the forum, particularly when clicking on threads.

**User Quote:**
> "I also want to note its logging me out often throughout the forum, im not sure if its the bugs or not. i went to click on a thread, and it logs me out in the process of seeing it. is our session correctly integrated with the embedded wallet?"

## Fixes Applied

### 1. ✅ ThreadCard Loading Error - FIXED
**Problem:** The forum displayed "loading error, please refresh" despite threads loading successfully.

**Root Cause:** ThreadList.tsx used defensive require() imports that were failing at runtime in Next.js 15:
```typescript
// ❌ OLD - Defensive pattern failing
let ThreadCard: React.ComponentType<any>;
try {
  ThreadCard = require('./ThreadCard').default;
} catch (error) {
  ThreadCard = ({ thread }: any) => (
    <div>
      <h3>{thread.title}</h3>
      <p>Loading error - please refresh</p>
    </div>
  );
}
```

**Solution Applied:**
```typescript
// ✅ NEW - Standard ES6 import
import ThreadCard from './ThreadCard';
import styles from '../styles/Forum.module.css';
```

**Status:** Committed and pushed to GitHub (commit 6f8be4d8)

---

## CDP Session Logout Investigation

### Observations from Error Logs

From `src/features/pods/errors.txt`, I observed:

1. **CDP Provider Re-initialization** - Lines 9, 15, 22, 33, 47, 55 show:
   ```
   🔐 CDP Embedded Wallets: Initializing with CDPHooksProvider for session persistence
   ```
   The provider is initializing multiple times during a single session.

2. **Threads Load Successfully** - Lines 61-75 confirm:
   ```
   Displaying threads: (3) [{…}, {…}, {…}]
   ```
   Data loading works correctly, so this isn't a database/API issue.

3. **No Actual Error Messages** - No console errors related to authentication failures or session expiry.

### Current Session Architecture

```typescript
// src/app/layout.tsx (Server Component)
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ModuleErrorBoundary>
          <Providers>{children}</Providers>
        </ModuleErrorBoundary>
      </body>
    </html>
  );
}

// src/app/providers.tsx (Client Component)
export function Providers({ children }) {
  return (
    <ContractConfigProvider>
      <CDPEmbeddedProvider>        {/* ← Session persistence layer */}
        <TokenBalancesProvider>
          <AuthProvider>
            <ProfilesProvider>
              <CommunityProvider>
                <UnifiedNotificationProvider>
                  {children}
                </UnifiedNotificationProvider>
              </CommunityProvider>
            </ProfilesProvider>
          </AuthProvider>
        </TokenBalancesProvider>
      </CDPEmbeddedProvider>
    </ContractConfigProvider>
  );
}
```

**Design Notes:**
- `layout.tsx` is a server component (prevents provider remounting)
- `providers.tsx` is client-only (mounts once at app startup)
- Should NOT remount during navigation

### CDP Configuration

```typescript
// src/wallet/components/CDPEmbeddedProvider.tsx
const cdpConfig = useMemo(
  () => ({
    projectId,
    ethereum: {
      createOnLogin: 'smart' as const,
      networks: [{
        chainId: base.id,
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || base.rpcUrls.default.http[0],
        paymasterUrl: paymasterEndpoint,
      }],
    },
    appName: 'SpiritDAO',
    appLogoUrl: '/spiritdaosymbol.png',
  }),
  [projectId, paymasterEndpoint],
);

return (
  <WagmiProvider config={wagmiConfig} reconnectOnMount={true}>
    <QueryClientProvider client={queryClient}>
      <OnchainKitProvider apiKey={...} chain={base} config={onchainKitConfig}>
        <CDPHooksProvider config={cdpConfig}>
          {children}
        </CDPHooksProvider>
      </OnchainKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
);
```

**Key Settings:**
- `reconnectOnMount={true}` - Should restore sessions on navigation
- `CDPHooksProvider` - Manages embedded wallet session persistence
- Session stored in localStorage by CDP SDK

### Wagmi Configuration

```typescript
// src/config/wagmi.client.ts
export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: fallback([
      http(PRIMARY_RPC),
      ...FALLBACK_RPCS.map((url) => http(url)),
    ]),
  },
  connectors: [
    coinbaseWallet({
      appName: 'SpiritDAO',
      preference: 'smartWalletOnly',
      version: '4',
    }),
  ],
  ssr: true,  // ✅ SSR-compatible
});
```

### React Query Configuration

```typescript
// src/wallet/components/CDPEmbeddedProvider.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes
      refetchOnWindowFocus: false,      // Don't refetch on focus
      refetchOnMount: false,            // Don't refetch on mount if data exists
      refetchOnReconnect: false,        // Don't refetch on reconnect
    },
  },
});
```

**Purpose:** Reduce RPC calls to prevent rate limiting that could trigger disconnections.

### Next.js Configuration

```javascript
// next.config.mjs
const nextConfig = {
  reactStrictMode: process.env.NODE_ENV === 'production',  // ❌ Disabled in dev
  transpilePackages: ['@coinbase/onchainkit'],
  // ... other config
};
```

**Note:** StrictMode is disabled in development, so double-renders aren't the issue.

---

## Potential Root Causes

### 1. CDP Provider Re-rendering (Likely)
**Symptom:** CDP logs show multiple initializations during single session.

**Possible Causes:**
- `useMemo` dependencies changing unexpectedly
- Parent component re-renders cascading to CDP provider
- localStorage being cleared by browser/extension

**Investigation Needed:**
- Add logging to track when `projectId` or `paymasterEndpoint` change
- Monitor localStorage for CDP keys being cleared
- Check if browser extensions interfere with CDP session storage

### 2. Navigation Causing Session Loss (Possible)
**Symptom:** User logs out when clicking threads.

**Possible Causes:**
- Thread page triggering full page reload instead of client-side navigation
- Error boundary catching errors and resetting state
- ForumErrorBoundary triggering on thread navigation

**Investigation Needed:**
- Monitor navigation events for full page reloads
- Check if Link components are configured correctly
- Verify no redirect loops in thread pages

### 3. RPC Rate Limiting (Unlikely)
**Symptom:** Excessive RPC calls could trigger temporary bans.

**Evidence Against:**
- React Query is configured to minimize refetching
- Fallback RPC providers configured
- No 429 errors in logs

### 4. Wallet Connection State Mismatch (Possible)
**Symptom:** CDP wallet and wagmi connector out of sync.

**Possible Causes:**
- `coinbaseWallet` connector reconnection failing
- Smart wallet address changing unexpectedly
- Paymaster endpoint issues

**Investigation Needed:**
- Log wallet connection state changes
- Monitor for address switches
- Verify paymaster responses

---

## Recommended Next Steps

### Immediate Testing
1. **Test ThreadCard Fix**
   - Clear browser cache and localStorage
   - Navigate to /forum
   - Verify threads display correctly (should now work)
   - Click on multiple threads to test navigation

2. **Monitor CDP Initialization**
   - Open browser console
   - Look for "🔐 CDP Embedded Wallets: Initializing" messages
   - Count how many times it appears during normal navigation
   - Expected: Once on page load, not on every navigation

### Short-Term Debugging

Add logging to track session state:

```typescript
// src/wallet/components/CDPEmbeddedProvider.tsx
useEffect(() => {
  console.log('🔍 CDP Config changed:', {
    projectId: projectId.substring(0, 8),
    paymasterEndpoint: paymasterEndpoint?.substring(0, 30),
  });
}, [projectId, paymasterEndpoint]);

useEffect(() => {
  const checkSession = () => {
    const cdpKeys = Object.keys(localStorage).filter(k =>
      k.includes('cdp') || k.includes('coinbase')
    );
    console.log('💾 CDP localStorage keys:', cdpKeys.length);
  };

  checkSession();
  const interval = setInterval(checkSession, 5000);
  return () => clearInterval(interval);
}, []);
```

### Medium-Term Solutions

If issue persists:

1. **Add Session Restoration Handler**
   ```typescript
   // Detect when user becomes disconnected and attempt auto-reconnect
   import { useEffect } from 'react';
   import { useAccount, useReconnect } from 'wagmi';

   function SessionGuard({ children }) {
     const { isConnected, isReconnecting } = useAccount();
     const { reconnect } = useReconnect();

     useEffect(() => {
       if (!isConnected && !isReconnecting) {
         console.warn('⚠️ Session lost, attempting reconnection...');
         reconnect();
       }
     }, [isConnected, isReconnecting, reconnect]);

     return <>{children}</>;
   }
   ```

2. **Prevent Navigation During Wallet Operations**
   ```typescript
   // Add loading state to prevent navigation while wallet is busy
   const [isWalletBusy, setIsWalletBusy] = useState(false);

   // Disable navigation if wallet is busy
   if (isWalletBusy) {
     return <LoadingSpinner />;
   }
   ```

3. **Add Error Recovery in Thread Pages**
   ```typescript
   // src/app/forum/thread/[id]/page.tsx
   if (walletError) {
     return (
       <div>
         <p>Connection lost. Reconnecting...</p>
         <button onClick={() => window.location.reload()}>
           Retry
         </button>
       </div>
     );
   }
   ```

---

## Related Issues

- CDP_SESSION_PERSISTENCE_FINAL_FIX.md - Previous session fix documentation
- PROVIDER_REMOUNTING_FIX.md - Provider architecture changes
- CDP_AUTO_LOGOUT_FIX_V2.md - Earlier logout investigation

---

## Testing Checklist

After ThreadCard fix:
- [ ] Forum loads without "loading error" message
- [ ] Threads display correctly on /forum
- [ ] Clicking threads navigates without logout
- [ ] Session persists across page navigation
- [ ] Hard refresh maintains login state
- [ ] Multiple thread navigations work consecutively

---

## Status

**ThreadCard Loading:** ✅ **FIXED** (commit 6f8be4d8)
**Session Logout:** 🔍 **INVESTIGATING** - Requires user testing to confirm if ThreadCard fix resolved it

---

*Generated: 2026-01-27*
*Next Review: After user tests ThreadCard fix*

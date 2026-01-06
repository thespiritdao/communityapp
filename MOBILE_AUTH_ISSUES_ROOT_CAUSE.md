# Mobile Authentication Issues - Root Cause Analysis

## Problem Summary

Multiple pages showing "Login" or "Access Denied" on mobile despite user being authenticated:
1. **Market page** - Shows "Login" button only
2. **Forum page** - Shows "locked out" message
3. **Identity page** - Token balances not displaying
4. **Governance page** - Wallet connection fails intermittently
5. **Desktop** - Consistent 401 logout errors and session drops

## Root Cause

### The CDP Migration Issue

All components were converted from OnChainKit's `useAccount()` to CDP's `useEvmAddress()`:

```typescript
// OLD (OnChainKit):
const { address } = useAccount();

// NEW (CDP):
const { evmAddress: address } = useEvmAddress();
```

**BUT**: `useEvmAddress()` has **different initialization timing** than `useAccount()`.

### The Race Condition

On mobile/slower connections, components render **before** CDP wallet initializes:

1. Component renders
2. Checks `useEvmAddress()` → returns `undefined` (CDP not ready yet)
3. Component shows "Login" or "Access Denied"
4. User is actually logged in, but CDP hasn't initialized
5. **Component never re-renders when CDP finishes initializing**

## Evidence

### Market Page (Line 29)
```typescript
// src/features/shopping-cart/components/Marketplace/Marketplace.tsx:29
if (!address) return <ConnectWallet />;
```
Checks address immediately - if CDP not ready, shows login button forever.

### Forum Page (Lines 28-29, 52-64)
```typescript
// src/app/forum/page.tsx:28-29
const { evmAddress: address } = useEvmAddress();
const isConnected = !!address;

// Lines 52-64 (ForumAccessGate.tsx)
if (!isConnected || !address) {
  return (
    <div>
      <h1>Connect Wallet to Access Forum</h1>
      <Button onClick={handleConnectWallet}>Connect Wallet</Button>
    </div>
  );
}
```
Forum checks `!address` and locks user out before CDP initializes.

### Identity Page Token Balances
```typescript
// src/context/TokenBalancesContext.tsx:32, 38-41
const { evmAddress: address } = useEvmAddress();

const refreshBalances = useCallback(async () => {
  if (!address) {
    console.log('No wallet address available, skipping balance fetch');
    return; // ❌ Exits before CDP ready
  }
```
Token balance fetch aborts if address not yet available.

### DatabaseTokenGallery (Lines 77-79)
```typescript
// src/features/identity/components/DatabaseTokenGallery.tsx:77-79
if (walletAddress) {
  loadTokens();
}
```
Won't load tokens until walletAddress exists (CDP timing issue).

## Why Desktop Also Fails

Desktop has **the same race condition**, but also:
- Session persistence issues with Supabase auth
- `window.location.reload()` calls (we fixed some, but may be more)
- 401 errors suggest Supabase session expiring while CDP session active

## The Solution Pattern

We need to:

### 1. Add Loading States for CDP Initialization

```typescript
const { evmAddress: address, isLoading: cdpLoading } = useEvmAddress();

if (cdpLoading) {
  return <LoadingSpinner>Connecting wallet...</LoadingSpinner>;
}

if (!address) {
  return <ConnectWallet />;
}
```

### 2. Use useEffect to React to CDP Initialization

```typescript
const [isReady, setIsReady] = useState(false);
const { evmAddress: address } = useEvmAddress();

useEffect(() => {
  if (address) {
    setIsReady(true);
  }
}, [address]);

if (!isReady) {
  return <LoadingSpinner />;
}
```

### 3. Add CDP Status Hook (RECOMMENDED)

Create a shared hook that all pages can use:

```typescript
// src/hooks/useCDPStatus.ts
export function useCDPStatus() {
  const { evmAddress: address } = useEvmAddress();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Wait for CDP to initialize OR timeout after 3 seconds
    const timeout = setTimeout(() => {
      setIsInitializing(false);
    }, 3000);

    if (address) {
      setIsInitializing(false);
      clearTimeout(timeout);
    }

    return () => clearTimeout(timeout);
  }, [address]);

  return {
    address,
    isConnected: !!address,
    isInitializing,
    isReady: !isInitializing,
  };
}
```

Then use it everywhere:

```typescript
const { address, isConnected, isInitializing } = useCDPStatus();

if (isInitializing) {
  return <LoadingSpinner>Connecting wallet...</LoadingSpinner>;
}

if (!isConnected) {
  return <ConnectWallet />;
}
```

## Files That Need Fixing

### Critical (Blocking mobile access):
1. ✅ `src/features/shopping-cart/components/Marketplace/Marketplace.tsx:29`
2. ✅ `src/app/forum/page.tsx:28-29`
3. ✅ `src/features/forum/components/ForumAccessGate.tsx:28-64`
4. ✅ `src/context/TokenBalancesContext.tsx:32,38-41`
5. ✅ `src/features/identity/components/DatabaseTokenGallery.tsx:77-79`

### Also Check:
- All files modified in git status with `useEvmAddress()` calls
- Any component that checks `!address` without waiting for CDP init
- Any component with `if (!isConnected)` early returns

## Testing Plan

1. Create `useCDPStatus` hook
2. Update Market, Forum, Identity, Governance pages
3. Test on mobile with network throttled to "Slow 3G"
4. Verify loading states appear, then content loads
5. Test hard refresh on each page
6. Verify no more "Login" buttons when logged in

## Desktop 401 Errors - Separate Issue

The 401 logout errors on desktop suggest:
- Supabase session expiring but CDP session still active
- `WalletAuthSync` not refreshing Supabase session
- Need to investigate `src/wallet/components/WalletAuthSync.tsx`

**Recommendation**: Fix mobile CDP timing first, then tackle desktop session persistence separately.

---

## Summary

The root cause is a **race condition between component render and CDP wallet initialization**. Components converted from `useAccount()` to `useEvmAddress()` don't wait for CDP to initialize before checking if the user is connected.

**Solution**: Create a centralized `useCDPStatus()` hook with proper loading states and timeout logic, then update all auth-gated pages to use it.

This will fix:
- ✅ Market "Login" button on mobile
- ✅ Forum "locked out" on mobile
- ✅ Identity token balances not loading
- ✅ Governance intermittent connection failures

Desktop 401 errors need separate investigation of Supabase session management.

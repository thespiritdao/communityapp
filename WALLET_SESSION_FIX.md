# Wallet Session Persistence Fix

## Problem
After completing onboarding, user navigates to `/home` but sees "Please connect your wallet" instead of the home screen.

## Root Cause
The wagmi config had **no connectors** (`connectors: []`), so wagmi's `useAccount()` hook couldn't detect the CDP embedded wallet that was created during onboarding.

### Technical Details:
- **Onboarding page**: Uses CDP hooks (`useCurrentUser`, `useEvmAddress`) to create embedded wallet
- **Home page**: Uses wagmi's `useAccount()` hook to check for wallet connection
- **The gap**: No bridge between CDP wallet system and wagmi's `useAccount()`

## Solution Implemented

### 1. Added CDP Connector to Wagmi Config
**File**: `src/config/wagmi.client.ts`

```typescript
import { cdpConnector } from '@coinbase/cdp-wagmi';

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(RPC_URL),
  },
  connectors: [
    cdpConnector({
      // Bridge CDP embedded wallets to wagmi
      // This allows useAccount() to detect CDP wallets
    }),
  ],
  ssr: true,
});
```

**What this does:**
- Bridges CDP embedded wallets to wagmi's hook system
- Allows `useAccount()` to return the CDP wallet address
- Enables seamless integration between CDP and wagmi ecosystems

### 2. Enabled Auto-Reconnect on Mount
**File**: `src/wallet/components/CDPEmbeddedProvider.tsx`

```typescript
<WagmiProvider config={wagmiConfig} reconnectOnMount={true}>
```

**What this does:**
- Automatically reconnects the wallet when pages load
- Restores CDP session across navigation
- Ensures `/home` page detects the wallet on first load

## Testing Instructions

### Clear Previous Session
```bash
# Clear browser cache/localStorage to ensure fresh test
# Visit: http://localhost:3000/?clear=true
```

### Test Complete Flow
1. **Clear any existing session**
   - Visit `http://localhost:3000/?clear=true`
   - Or manually clear browser localStorage

2. **Complete Onboarding**
   - Enter invite code
   - Create wallet via email/Google
   - Wait for hat minting to complete

3. **Verify Home Page**
   - Should automatically redirect to `/home`
   - Should see: "Welcome, Guest." (or your name if profile completed)
   - Should NOT see: "Please connect your wallet"
   - Should see all the module cards (Identity, Chat, Forum, etc.)

### Expected Results

**✅ Success:**
```
Home page loads with:
- "Welcome, Guest." header
- Profile completion reminder (if first time)
- All module cards visible
- Navigation bar at bottom
```

**❌ Still Seeing "Please connect your wallet"?**

If the issue persists, try these debugging steps:

1. **Check Browser Console**
   - Open DevTools → Console
   - Look for errors related to "wagmi", "CDP", or "wallet"
   - Share any errors you see

2. **Check Wallet Connection Status**
   - Add this to home page temporarily:
   ```typescript
   console.log('Wallet status:', { address, isConnected, isConnecting });
   ```

3. **Alternative: Use CDP Hooks Directly**
   - If wagmi integration still doesn't work, we can update `/home` to use CDP hooks instead

## Architecture Notes

### Wallet Provider Stack:
```
CDPEmbeddedProvider (top level)
  └─ WagmiProvider (with cdpConnector)
      └─ QueryClientProvider
          └─ OnchainKitProvider
              └─ CDPReactProvider
                  └─ App Components
```

### How It Works:
1. User authenticates via CDP (email/social login)
2. CDP creates embedded wallet (Smart Wallet)
3. `cdpConnector` bridges this wallet to wagmi
4. Wagmi's `useAccount()` hook now returns CDP wallet address
5. Home page detects wallet and shows content

### Why Two Systems?
- **CDP**: Modern embedded wallet system (email/social login, no popups)
- **Wagmi**: Industry-standard React hooks for Ethereum
- **Bridge**: `@coinbase/cdp-wagmi` connects both worlds

## Fallback Option

If wagmi integration still doesn't work after testing, we can update the home page to use CDP hooks directly:

```typescript
// Instead of:
import { useAccount } from 'wagmi';
const { address } = useAccount();

// Use CDP hooks:
import { useEvmAddress } from '@coinbase/cdp-hooks';
const { evmAddress: address } = useEvmAddress();
```

This would work immediately but requires updating all components using `useAccount()`.

## Production Considerations

### Session Persistence:
- CDP sessions persist in browser storage
- Users stay logged in across page refreshes
- Session expires after inactivity (configurable in CDP settings)

### Multi-Tab Behavior:
- Wallet state syncs across tabs (same browser)
- New tab in same browser = already authenticated
- Different browser = new authentication required

### Mobile Behavior:
- Sessions persist in mobile browsers
- Works with in-app browsers (Twitter, Discord, etc.)
- No app store installation needed

---

**Status**: ✅ READY FOR TESTING

Test the complete flow and verify the home page now recognizes your wallet connection!

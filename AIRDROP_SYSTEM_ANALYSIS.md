# Onboarding System - Correct Architecture

**Date:** January 27, 2026
**Status:** ✅ **CORRECTED** - Token Airdrop Removed, Faucet Used Instead

---

## Executive Summary

**IMPORTANT CLARIFICATION:** The onboarding system should **NOT** airdrop $SYSTEM and $SELF tokens.

**Correct Onboarding Flow:**
1. ✅ Mint Beta Tester HAT (platform access)
2. ✅ Mint Advocate NFT (governance voting power)
3. ✅ Auto-delegate NFT (activate voting power)
4. ❌ **NO TOKEN AIRDROP** - Users claim from faucet instead

**Token Acquisition:** Users visit `/faucet` to claim 10 SYSTEM + 10 SELF tokens (gasless via smart contract)

---

## Current Airdrop Configuration

### Tokens Being Airdropped

**Testnet (Base Sepolia):**
- 100 $SYSTEM tokens (configurable via `NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SYSTEM`)
- 100 $SELF tokens (configurable via `NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SELF`)

**Mainnet (Base):**
- 100 $SYSTEM tokens (configurable via `NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SYSTEM`)
- 100 $SELF tokens (configurable via `NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SELF`)
- ⚠️ **Beta Testing Feature** - Currently enabled on mainnet for 30-day beta period

### Trigger Points

Airdrop is triggered during onboarding flow:
1. User completes invite validation
2. User mints POC NFT and/or HAT
3. **`POST /api/onboarding/complete`** endpoint called
4. Airdrop executed automatically (if enabled)

**Location:** `src/app/api/onboarding/complete/route.ts` (line 119-139)

---

## Technical Architecture

### Current Implementation (Legacy Viem/Wagmi)

**File:** `src/utils/testnetAirdrop.ts`

```typescript
// ❌ USES LEGACY PRIVATE KEY WALLET (NOT CDP)
const account = privateKeyToAccount(FAUCET_PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: CHAIN,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

// Direct ERC20 transfer from server wallet
const hash = await walletClient.writeContract({
  address: tokenAddress,
  abi: ERC20_ABI,
  functionName: 'transfer',
  args: [toAddress, amount],
});
```

### How It Works

1. **Server-Side Private Key Wallet**
   - Uses `TESTNET_FAUCET_PRIVATE_KEY` or `PRIVATE_KEY` env variable
   - Creates EOA (Externally Owned Account) from private key
   - Requires ETH for gas fees (NOT gasless)

2. **Direct ERC20 Transfers**
   - Two separate transactions: SYSTEM token transfer, SELF token transfer
   - Each transaction costs gas (paid by faucet wallet)
   - Uses standard Viem `writeContract` calls

3. **Database Tracking**
   - Records in `testnet_airdrops` table
   - Prevents duplicate airdrops per address
   - Stores transaction hashes and amounts

### Why It's Incompatible with CDP Smart Accounts

**CDP Smart Accounts use:**
- `useSendUserOperation()` hook (ERC-4337)
- Smart Account addresses (not EOA)
- Gasless transactions via CDP Paymaster
- User operations instead of raw transactions

**Current airdrop uses:**
- `createWalletClient()` from Viem (EOA wallet)
- Private key authentication
- Direct ERC20 `transfer()` calls
- Traditional transactions (requires gas)

---

## Environment Configuration

### Required Environment Variables

**Faucet Wallet:**
```env
TESTNET_FAUCET_PRIVATE_KEY=0x...  # Private key for faucet wallet
# OR
PRIVATE_KEY=0x...                 # Fallback if TESTNET_FAUCET_PRIVATE_KEY not set
```

**Token Contracts:**
```env
NEXT_PUBLIC_SYSTEM_TOKEN=0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
NEXT_PUBLIC_SELF_TOKEN=0x1b8d424695E63ABca04E94bA46c03f1D83e14020
```

**Airdrop Configuration:**
```env
# Enable/disable auto-airdrop
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true  # Set to 'true' to enable

# Testnet amounts (in tokens, converted to wei internally)
NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SYSTEM=100  # Default: 100
NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SELF=100    # Default: 100

# Mainnet amounts (for beta testing period)
NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SYSTEM=100  # Default: 100
NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SELF=100    # Default: 100
```

**Network:**
```env
NEXT_PUBLIC_CHAIN_ID=8453         # 8453 = Base Mainnet, 84532 = Base Sepolia
NEXT_PUBLIC_RPC_URL=https://mainnet.base.org
NEXT_PUBLIC_IS_TESTNET=false      # Set to 'true' for testnet
```

### Current Configuration Status

Based on your git status and previous environment setup:
- ✅ Token addresses configured
- ✅ Chain ID set to Base Mainnet (8453)
- ⚠️ `NEXT_PUBLIC_ENABLE_AUTO_AIRDROP` - **Check Vercel**
- ⚠️ `TESTNET_FAUCET_PRIVATE_KEY` or `PRIVATE_KEY` - **Required for airdrop**

---

## Compatibility Issues

### ❌ Issue 1: Uses Legacy Viem, Not CDP Hooks

**Current:**
```typescript
// Legacy Viem approach
const account = privateKeyToAccount(FAUCET_PRIVATE_KEY);
const walletClient = createWalletClient({ account, ... });
await walletClient.writeContract({ ... });
```

**CDP Smart Account Pattern:**
```typescript
// Modern CDP approach
const { sendUserOperation } = useSendUserOperation();
const { currentUser } = useCurrentUser();
const smartAccount = currentUser.evmSmartAccounts[0];

await sendUserOperation({
  evmSmartAccount: smartAccount,
  network: 'base',
  calls: [{ to: token, data: encodedTransfer }],
  useCdpPaymaster: true,  // Gasless!
});
```

### ❌ Issue 2: Server-Side vs Client-Side

**Current:** Server-side API route uses private key wallet
**CDP:** Client-side hooks using user's embedded wallet

**Mismatch:** Airdrop needs to work server-side (during onboarding API call), but CDP hooks are client-side only.

### ❌ Issue 3: Gas Fees Required

**Current:** Faucet wallet pays gas for each airdrop
**CDP:** Gasless transactions via paymaster

**Problem:** Current approach requires faucet wallet to have ETH for gas, increasing operational costs.

---

## Recommended Solutions

### Option 1: Keep Current System (Easiest)

**Pros:**
- Already implemented and working
- No code changes needed
- Server-side = reliable, no user wallet required

**Cons:**
- ❌ Not using CDP infrastructure
- ❌ Requires ETH for gas fees
- ❌ Faucet wallet needs constant funding
- ❌ Two separate transactions per user

**Setup Required:**
1. Ensure `TESTNET_FAUCET_PRIVATE_KEY` or `PRIVATE_KEY` is set in Vercel
2. Fund faucet wallet with ETH for gas
3. Fund faucet wallet with SYSTEM and SELF tokens
4. Set `NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true` in Vercel

### Option 2: Migrate to CDP Smart Account Airdrop (Recommended)

**Approach:** Use a CDP Smart Account as the faucet wallet

**Pros:**
- ✅ Uses CDP infrastructure (consistent with app)
- ✅ Gasless transactions (no ETH needed)
- ✅ Can batch both token transfers in one operation
- ✅ Lower operational costs

**Cons:**
- 🔧 Requires code refactor
- 🔧 Need to create service CDP Smart Account
- 🔧 More complex setup

**Implementation:**

```typescript
// New approach: CDP Service Smart Account
import { CoinbaseWalletSDK } from '@coinbase/wallet-sdk';
import { encodeFunctionData } from 'viem';

// Initialize CDP SDK server-side
const sdk = new CoinbaseWalletSDK({
  appName: 'Spirit DAO',
  appChainIds: [8453], // Base
});

// Create/load service smart account (one-time setup)
const serviceAccount = await sdk.createSmartAccount({
  // Configuration for service account
});

export async function airdropToUserCDP(recipientAddress: string) {
  // Encode both token transfers
  const systemTransferData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [recipientAddress, SYSTEM_AMOUNT],
  });

  const selfTransferData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [recipientAddress, SELF_AMOUNT],
  });

  // Send both transfers in one gasless user operation
  const result = await serviceAccount.sendUserOperation({
    network: 'base',
    calls: [
      { to: SYSTEM_TOKEN_ADDRESS, data: systemTransferData },
      { to: SELF_TOKEN_ADDRESS, data: selfTransferData },
    ],
    useCdpPaymaster: true,  // Gasless!
  });

  return result;
}
```

**Migration Steps:**

1. **Create Service CDP Smart Account**
   - Use CDP SDK to create a dedicated smart account
   - Store credentials securely (not private key!)
   - Fund account with SYSTEM and SELF tokens only (no ETH needed)

2. **Update `testnetAirdrop.ts`**
   - Replace Viem wallet client with CDP SDK
   - Use `sendUserOperation` instead of `writeContract`
   - Batch both token transfers into single operation

3. **Update Environment Variables**
   - Remove `TESTNET_FAUCET_PRIVATE_KEY` / `PRIVATE_KEY`
   - Add CDP service account credentials
   - Configure CDP paymaster for gasless transactions

4. **Test Thoroughly**
   - Verify airdrop works on testnet
   - Confirm gasless transactions
   - Validate database tracking still works

### Option 3: Hybrid Approach (Pragmatic)

**Keep current system for now, plan migration:**

1. ✅ Current system works - don't break it
2. ✅ Fund faucet wallet adequately
3. 📋 Document migration to CDP as future enhancement
4. 📋 Monitor gas costs and token balances
5. 📋 Migrate when CDP server-side SDK is more mature

---

## Airdrop Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│  User Completes Onboarding                          │
│  POST /api/onboarding/complete                      │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  Check if airdrop enabled                           │
│  (NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true)            │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  airdropToUser(walletAddress)                       │
│  src/utils/testnetAirdrop.ts                        │
└─────────────────┬───────────────────────────────────┘
                  │
                  ├──► Check: Already received? → Skip
                  ├──► Check: Faucet balance sufficient? → Error
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  Transfer 100 SYSTEM tokens                         │
│  (Faucet wallet → User wallet)                      │
│  ⛽ Gas paid by faucet                               │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  Transfer 100 SELF tokens                           │
│  (Faucet wallet → User wallet)                      │
│  ⛽ Gas paid by faucet                               │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  Record airdrop in testnet_airdrops table           │
│  (Prevent duplicates)                               │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  Return success                                      │
│  User has 100 SYSTEM + 100 SELF                     │
└─────────────────────────────────────────────────────┘
```

---

## Security Considerations

### Current System

✅ **Good:**
- Airdrop tracking prevents duplicates
- Server-side validation (not client-exploitable)
- Environment variable security for private key
- Transaction confirmation before recording

⚠️ **Concerns:**
- Private key stored in environment variables (risk if leaked)
- Single point of failure (faucet wallet)
- No rate limiting (could be DoS'd via onboarding spam)
- Faucet wallet needs ETH refills (operational overhead)

### Recommended Improvements

1. **Rate Limiting:**
   ```typescript
   // Add rate limit to onboarding endpoint
   import { rateLimit } from '@/lib/ratelimit';

   const limiter = rateLimit({
     interval: 60 * 60 * 1000, // 1 hour
     uniqueTokenPerInterval: 100,
   });

   await limiter.check(request.ip, 5); // Max 5 airdrops per IP per hour
   ```

2. **Wallet Monitoring:**
   - Alert when faucet balance drops below threshold
   - Auto-refill mechanism or manual process
   - Daily balance checks

3. **Invite Code Validation:**
   - Already implemented ✅
   - Ensures only invited users get airdrops

---

## Testing Checklist

### Manual Testing Steps

- [ ] Enable airdrop: `NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true`
- [ ] Fund faucet wallet with 10,000 SYSTEM tokens
- [ ] Fund faucet wallet with 10,000 SELF tokens
- [ ] Fund faucet wallet with 0.5 ETH (for gas)
- [ ] Complete onboarding flow with new test wallet
- [ ] Verify 100 SYSTEM received in test wallet
- [ ] Verify 100 SELF received in test wallet
- [ ] Check `testnet_airdrops` table has record
- [ ] Try onboarding again with same wallet → Should fail (duplicate)
- [ ] Check faucet balance after airdrop
- [ ] Monitor transaction logs for errors

### Environment Verification

```bash
# Check Vercel environment variables
vercel env ls

# Required variables:
# NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true
# TESTNET_FAUCET_PRIVATE_KEY=0x...
# NEXT_PUBLIC_SYSTEM_TOKEN=0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
# NEXT_PUBLIC_SELF_TOKEN=0x1b8d424695E63ABca04E94bA46c03f1D83e14020
# NEXT_PUBLIC_CHAIN_ID=8453
# NEXT_PUBLIC_RPC_URL=https://mainnet.base.org
```

---

## Summary & Recommendations

### Current State

- ✅ Airdrop system is **implemented and functional**
- ❌ **NOT using CDP Smart Accounts** - uses legacy Viem
- ⚠️ **Requires gas fees** - faucet wallet needs ETH
- ⚠️ **Configuration needed** - check Vercel env variables

### Immediate Actions

1. **Verify Vercel Environment Variables**
   - Confirm `NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true`
   - Confirm `TESTNET_FAUCET_PRIVATE_KEY` or `PRIVATE_KEY` is set
   - Verify all token addresses and network settings

2. **Fund Faucet Wallet**
   - Add 10,000+ SYSTEM tokens
   - Add 10,000+ SELF tokens
   - Add 0.5+ ETH for gas fees
   - Set up balance monitoring/alerts

3. **Test Onboarding Flow**
   - Create test account and complete onboarding
   - Verify airdrop works end-to-end
   - Check database records

### Future Enhancement (Optional)

Consider migrating to CDP Smart Account-based airdrop for:
- Gasless transactions (no ETH needed)
- Consistency with app architecture
- Lower operational costs
- Better integration with CDP infrastructure

**Priority:** Low (current system works, migration is nice-to-have)

---

## Related Files

**Airdrop Implementation:**
- `src/utils/testnetAirdrop.ts` - Main airdrop logic (legacy Viem)
- `src/app/api/onboarding/complete/route.ts` - Airdrop trigger point
- `src/config/testnetConfig.ts` - Airdrop amounts and configuration

**CDP Infrastructure (not used for airdrop):**
- `src/utils/cdpTransaction.ts` - CDP Smart Account transaction utilities
- `src/features/bounty/components/BountyPaymentTransaction.tsx` - Example CDP usage

**Database:**
- Supabase table: `testnet_airdrops` (tracking)
- Supabase table: `user_profiles` (onboarding status)

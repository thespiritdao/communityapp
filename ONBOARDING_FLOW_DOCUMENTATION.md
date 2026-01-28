# Onboarding Flow Documentation

**Date:** January 27, 2026
**Status:** ✅ Production Ready

---

## Overview

The Spirit DAO onboarding flow grants new users the necessary NFTs and HATs to participate in the platform. Users can then claim tokens separately via the faucet.

---

## Onboarding Steps

### 1. User Signs Up with Invite Code
- User navigates to the app
- Creates CDP Embedded Wallet (gasless, no seed phrase needed)
- Enters valid invite code
- Wallet address is validated and normalized to lowercase

### 2. Beta Tester HAT Minted
**API:** `POST /api/onboarding/mint-hat`
**Purpose:** Grants platform access permissions

**What is minted:**
- **Beta Tester HAT** (for most users)
- **Executive Leader HAT** (for first user / founders)

**Benefits:**
- Access to pod management
- Access to chat and forums
- Access to events
- Access to marketplace
- Role-based permissions throughout the app

**Implementation:** `src/app/api/onboarding/mint-hat/route.ts`

### 3. Advocate NFT Minted
**API:** `POST /api/onboarding/mint-advocate`
**Purpose:** Grants governance voting power

**What is minted:**
- 1x Advocate NFT (ERC-721 voting token)

**Benefits:**
- Ability to vote on governance proposals
- Ability to create governance proposals (after delegation)
- Voting weight in pod governance

**Implementation:** `src/app/api/onboarding/mint-advocate/route.ts`

### 4. Auto-Delegation (Client-Side)
**Location:** `src/components/OnboardingHatMinting.tsx`
**Purpose:** Activates voting power

**What happens:**
- User's wallet delegates Advocate NFT to themselves
- Uses CDP `sendUserOperation` for gasless transaction
- Activates voting power immediately
- Required by ERC-20Votes standard

**Why needed:**
- Delegation must occur before voting power is active
- Auto-delegation ensures users can participate immediately
- Manual delegation is available on governance page if auto-delegation fails

### 5. Onboarding Complete
**API:** `POST /api/onboarding/complete`
**Purpose:** Marks user as fully onboarded

**What happens:**
- Assigns invite code to user profile
- Marks `onboarded_at` timestamp in database
- Returns success with faucet information

**Response:**
```json
{
  "success": true,
  "message": "Onboarding completed successfully",
  "isFirstUser": false,
  "faucetAvailable": true,
  "faucetUrl": "/faucet"
}
```

---

## Token Acquisition (Faucet)

### **IMPORTANT:** Tokens are NOT airdropped during onboarding

Instead, users claim tokens from the **Token Faucet** at `/faucet`.

### Token Faucet Details

**Smart Contract:** `TokenFaucet.sol`
**Contract Address:** `process.env.NEXT_PUBLIC_TOKEN_FAUCET`

**How it works:**
1. User navigates to `/faucet` page
2. Clicks "Claim Tokens" button
3. Smart contract transfers tokens to user's wallet
4. Gasless transaction via CDP Paymaster

**Tokens provided:**
- 10 $SYSTEM tokens (governance + utility)
- 10 $SELF tokens (contributor rewards)

**Cooldown:** 24 hours between claims

**Benefits of Faucet vs Airdrop:**
- ✅ No server-side private keys needed
- ✅ No gas costs (gasless via CDP)
- ✅ User-initiated (prevents waste on inactive users)
- ✅ Rate limiting built into smart contract
- ✅ Users can claim multiple times if they need more tokens

**Implementation:** `src/app/faucet/page.tsx`

---

## Complete Onboarding Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│  User Signs Up with Invite Code                     │
│  Creates CDP Embedded Wallet                        │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  POST /api/onboarding/mint-hat                      │
│  Mints Beta Tester HAT or Executive Leader HAT      │
│  ✅ Grants platform access permissions               │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  POST /api/onboarding/mint-advocate                 │
│  Mints 1x Advocate NFT                              │
│  ✅ Grants governance voting power                   │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  Client-side: Auto-delegate NFT to self             │
│  Uses CDP sendUserOperation (gasless)               │
│  ✅ Activates voting power immediately               │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  POST /api/onboarding/complete                      │
│  Assigns invite code                                │
│  Marks user as onboarded                            │
│  ✅ Returns faucet URL                               │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  User redirected to /faucet                         │
│  User claims 10 SYSTEM + 10 SELF tokens             │
│  ✅ User fully onboarded and funded                  │
└─────────────────────────────────────────────────────┘
```

---

## What Users Receive

### Immediately After Onboarding:
1. **Beta Tester HAT** (or Executive Leader HAT)
   - Platform access
   - Role-based permissions

2. **1x Advocate NFT**
   - Voting power (after delegation)
   - Governance participation

3. **Voting Power Activated**
   - Can vote on proposals immediately
   - Can create proposals immediately

### After Claiming from Faucet:
4. **10 $SYSTEM tokens**
   - Governance proposals
   - Pod creation
   - Event participation

5. **10 $SELF tokens**
   - Contributor rewards
   - Bounty payments
   - Marketplace purchases

---

## Security & Gas Costs

### Onboarding (Server-Side)
- **HAT Minting:** Server wallet pays gas
- **Advocate NFT Minting:** Server wallet pays gas
- **Private Key Security:** Admin wallet stored in backend .env only

### User Actions (Client-Side)
- **Auto-Delegation:** ✅ Gasless via CDP Paymaster
- **Token Claims:** ✅ Gasless via CDP Paymaster
- **All User Operations:** ✅ Gasless via CDP Paymaster

**No ETH required at any step!** 🎉

---

## Environment Variables

### Required for Onboarding:
```env
# HAT Minting (server-side)
ADMIN_PRIVATE_KEY=0x...  # Admin wallet for HAT minting

# Advocate NFT Minting (server-side)
ADMIN_PRIVATE_KEY=0x...  # Same admin wallet for Advocate minting

# HAT Contract Addresses
NEXT_PUBLIC_HATS=0x...  # Hats Protocol contract
NEXT_PUBLIC_BETA_TESTER_HAT=<hatId>  # Beta Tester hat ID
NEXT_PUBLIC_EXECUTIVE_LEADER_HAT=<hatId>  # Executive Leader hat ID

# Advocate NFT Contract
NEXT_PUBLIC_ADVOCATE_NFT=0x...  # Advocate NFT contract address

# Token Faucet
NEXT_PUBLIC_TOKEN_FAUCET=0x...  # Faucet smart contract

# Tokens
NEXT_PUBLIC_SYSTEM_TOKEN=0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
NEXT_PUBLIC_SELF_TOKEN=0x1b8d424695E63ABca04E94bA46c03f1D83e14020
```

### NOT Required (Removed):
```env
# ❌ REMOVED - No longer used
# NEXT_PUBLIC_ENABLE_AUTO_AIRDROP
# TESTNET_FAUCET_PRIVATE_KEY
# NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SYSTEM
# NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SELF
# NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SYSTEM
# NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SELF
```

---

## Testing Checklist

### Onboarding Flow:
- [ ] User can sign up with valid invite code
- [ ] CDP wallet created successfully
- [ ] Beta Tester HAT minted and received
- [ ] Advocate NFT minted and received
- [ ] Auto-delegation succeeds (voting power activated)
- [ ] Onboarding marked complete in database
- [ ] User can access platform features immediately

### Faucet Flow:
- [ ] User can navigate to `/faucet`
- [ ] Faucet shows correct token amounts (10 SYSTEM, 10 SELF)
- [ ] User can claim tokens (gasless transaction)
- [ ] Tokens received in wallet
- [ ] Cooldown timer prevents duplicate claims within 24 hours
- [ ] User can claim again after 24 hours

### Edge Cases:
- [ ] User with existing HAT doesn't get duplicate
- [ ] User with existing Advocate NFT doesn't get duplicate
- [ ] Auto-delegation failure doesn't block onboarding
- [ ] Faucet handles insufficient balance gracefully
- [ ] Faucet handles network errors gracefully

---

## Migration Notes

### What Changed (January 27, 2026):

**REMOVED:**
- Token airdrop during onboarding (`airdropToUser()`)
- Legacy Viem-based airdrop service (`testnetAirdrop.ts`)
- Environment variables for airdrop configuration

**KEPT:**
- HAT minting (Beta Tester + Executive Leader)
- Advocate NFT minting
- Auto-delegation of Advocate NFT
- Invite code system

**ADDED:**
- Faucet reference in onboarding completion
- Clear documentation about token acquisition via faucet

### Why This Change:

1. **Faucet is better than airdrop:**
   - Users claim tokens when they need them
   - No waste on inactive users
   - Built-in rate limiting
   - No server-side private keys for token transfers

2. **Cleaner architecture:**
   - Onboarding handles NFTs/HATs only
   - Token acquisition is separate user action
   - No gas costs for server (faucet is gasless for users)

3. **Security:**
   - Fewer private keys to manage
   - Reduced attack surface
   - Smart contract handles token distribution

---

## Related Files

**Onboarding APIs:**
- `src/app/api/onboarding/complete/route.ts` - Onboarding completion
- `src/app/api/onboarding/mint-hat/route.ts` - HAT minting
- `src/app/api/onboarding/mint-advocate/route.ts` - Advocate NFT minting

**Frontend Components:**
- `src/components/OnboardingHatMinting.tsx` - Onboarding modal
- `src/app/faucet/page.tsx` - Token faucet page

**Configuration:**
- `src/config/contracts.ts` - Contract addresses and HAT IDs

**Legacy (Removed):**
- `src/utils/testnetAirdrop.ts` - Old token airdrop service (kept for reference, not used)
- `src/utils/cdpAirdropService.ts` - CDP airdrop attempt (deleted)

---

## User-Facing Documentation

**For Users:**
1. Sign up with invite code
2. Complete onboarding (receive HAT + Advocate NFT)
3. Visit `/faucet` to claim tokens
4. Start participating in governance, bounties, and events!

**Key Message:**
"Onboarding gives you access to the platform. Visit the Faucet to claim your starting tokens!"

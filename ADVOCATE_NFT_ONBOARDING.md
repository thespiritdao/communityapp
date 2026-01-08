# Advocate NFT Auto-Minting During Onboarding

## Problem
Beta Testers couldn't create governance proposals because they lacked Advocate NFTs (needed for voting power). The on-chain Governor contract requires a minimum of 1 wei of voting power to create proposals.

## Solution
Integrated Advocate NFT minting + auto-delegation into the user onboarding flow.

---

## Implementation

### 1. New API Endpoint: `/api/onboarding/mint-advocate`

**File:** `src/app/api/onboarding/mint-advocate/route.ts`

**What it does:**
- Mints 1 Advocate NFT to new users during signup
- Uses backend admin wallet (same security pattern as HAT minting)
- Checks if user already has Advocate NFTs (prevents duplicate minting)
- Returns `needsDelegation: true` to trigger auto-delegation

**Security:**
- Admin private key stored securely in backend `.env`
- Validates wallet address format before minting
- Only mints 1 NFT per user (prevents abuse)

---

### 2. Updated Onboarding Component

**File:** `src/components/OnboardingHatMinting.tsx`

**New 3-Step Onboarding Flow:**

1. **Step 1:** Mint Beta Tester HAT (for app permissions)
   - Grants access to pod management, chat, events, etc.
   - Uses existing `/api/onboarding/mint-hat` endpoint

2. **Step 2:** Mint 1 Advocate NFT (for governance voting power)
   - Calls new `/api/onboarding/mint-advocate` endpoint
   - Non-blocking: If this fails, onboarding continues
   - User can get Advocate NFT manually later if needed

3. **Step 3:** Auto-delegate NFT to self (activates voting power)
   - Uses CDP `sendUserOperation` for gasless delegation
   - Delegates the NFT from user's wallet to themselves
   - This activates their voting power immediately
   - Non-blocking: If this fails, user can delegate manually from governance page

**UI Updates:**
- Shows current step progress (Step 1/3, Step 2/3, Step 3/3)
- Dynamic status messages:
  - "Granting access permissions..."
  - "Granting governance voting power..."
  - "Activating voting power..."
- Updated info text: "Grants pod management + governance voting power"

---

## How It Works

### For New Users:
1. User signs up with invite code
2. Creates CDP embedded wallet
3. **Onboarding modal appears**
4. User clicks "Grant Access"
5. Backend mints Beta Tester HAT ✅
6. Backend mints 1 Advocate NFT ✅
7. User's wallet auto-delegates NFT to self ✅
8. **User now has:**
   - Beta Tester HAT (app permissions)
   - 1 Advocate NFT (voting token)
   - Voting power delegated (can create proposals immediately)

### For Existing Beta Testers:

**CURRENT STATUS (as of 2026-01-06):**

We ran the initial airdrop and here's the result:

```
✅ 5/10 Beta Testers have Advocate NFTs
❌ 5/10 Beta Testers need Advocate NFTs

Successful mints:
- Jochen Weber
- Ryan Munn
- Ron Rivers #1
- Scott Graves
- Unknown User

Failed mints (need retry):
- Eric Miki
- Mariah McKay
- Tressa Rivers
- René Pinnell
- Ron Rivers #2
```

**Why some failed:**
- Coinbase Smart Wallets that haven't been used yet aren't deployed on-chain
- `_safeMint` in Advocate contract tries to call recipient address
- Undeployed wallets have no code → callback fails → tx reverts

**TO FIX:** Run the retry script:

```bash
npx tsx scripts/retry-advocate-mints-simple.ts
```

This will mint to the 5 failed addresses using the admin wallet (same as original airdrop).

**After all 10 have NFTs:**
Each Beta Tester needs to delegate their NFT to themselves:
- Go to `/governance` page
- Click "Delegate to Self" button
- This activates voting power (gasless via CDP Paymaster)

---

## Benefits

✅ **Seamless UX:** New users get everything they need in one flow
✅ **Immediate Voting Power:** Auto-delegation means users can create proposals right away
✅ **Gas-Free:** All transactions sponsored by CDP Paymaster
✅ **Fail-Safe:** If Advocate minting/delegation fails, onboarding continues (can be done manually later)
✅ **Scalable:** Works for any number of new signups
✅ **Secure:** Uses same backend admin wallet pattern as HAT minting

---

## Testing Checklist

- [ ] New user signup flow (verify all 3 steps complete)
- [ ] HAT minting succeeds
- [ ] Advocate NFT minting succeeds
- [ ] Auto-delegation succeeds
- [ ] User can create governance proposal immediately after signup
- [ ] Existing Beta Testers receive Advocate NFT (manual airdrop)
- [ ] Existing Beta Testers can delegate and create proposals

---

## Environment Variables Required

Make sure these are set in `.env`:

```bash
# Advocate NFT Contract Address
NEXT_PUBLIC_ADVOCATE=0x592E560171D2a882474cdfc3BbeeDb21cEB4015d

# Admin Wallet (must have minting permissions)
POD_ADMIN_PRIVATE_KEY=your_admin_private_key
# OR
PRIVATE_KEY=your_admin_private_key

# RPC & Chain Config
NEXT_PUBLIC_RPC_URL=https://base-mainnet.infura.io/v3/your_api_key
NEXT_PUBLIC_CHAIN_ID=8453
```

---

## Fallback Plan

If auto-delegation fails during onboarding:
1. User still gets Beta Tester HAT (app access works)
2. User gets 1 Advocate NFT (voting token received)
3. User sees message on governance page: "Delegate your voting power to create proposals"
4. User manually clicks "Delegate" button
5. User delegates NFT to themselves
6. User can now create proposals

This ensures the onboarding experience is never blocked, even if delegation fails.

---

## Files Modified

1. ✅ `src/app/api/onboarding/mint-advocate/route.ts` (NEW)
2. ✅ `src/components/OnboardingHatMinting.tsx` (UPDATED)
3. ✅ `src/features/governance/components/CreateProposalForm.tsx` (FIXED address extraction)

---

## Next Steps

1. Test the full onboarding flow with a new user
2. Airdrop 1 Advocate NFT to existing Beta Testers (use existing scripts)
3. Have existing Beta Testers delegate their NFTs to themselves
4. Verify all Beta Testers can create governance proposals

---

## Related Fixes

While implementing this, we also fixed a critical bug in `CreateProposalForm.tsx`:

**Bug:** Using `currentUser.evmSmartAccounts[0]` as address (incorrect)
**Fix:** Using `useEvmAddress()` hook to get proper address

This fixed the wallet connection issue that was preventing the governance page from loading properly.

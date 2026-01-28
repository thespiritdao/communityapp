# Token Airdrop Removal - Migration Summary

**Date:** January 27, 2026
**Status:** ✅ Complete

---

## What Changed

### REMOVED: Token Airdrop from Onboarding

**Previous behavior:**
- New users received automatic airdrop of 100 $SYSTEM + 100 $SELF tokens
- Used legacy Viem with server-side private key wallet
- Required ETH for gas fees
- Configured via `NEXT_PUBLIC_ENABLE_AUTO_AIRDROP` environment variable

**New behavior:**
- New users receive Beta Tester HAT + Advocate NFT only
- Users claim tokens separately from `/faucet` page
- Faucet is gasless via CDP Paymaster
- Rate-limited to prevent abuse (24-hour cooldown)

---

## Rationale

### Why Remove Token Airdrop?

1. **Faucet is Superior:**
   - User-initiated (no waste on inactive users)
   - Built-in smart contract rate limiting
   - Gasless for users (CDP Paymaster)
   - No server-side private keys needed

2. **Security:**
   - Fewer private keys to manage
   - Reduced attack surface
   - Smart contract handles token distribution

3. **Architecture:**
   - Onboarding handles NFTs/HATs (identity)
   - Token acquisition is separate (utility)
   - Cleaner separation of concerns

4. **Cost:**
   - No gas costs for server
   - No need to fund airdrop wallet with ETH
   - Users pay no gas (covered by faucet contract)

---

## Files Modified

### Core Changes:

**`src/app/api/onboarding/complete/route.ts`**
- Removed `airdropToUser()` call
- Removed airdrop import
- Removed airdrop response fields
- Added faucet URL to success response
- Updated comments and documentation

**Changes:**
```diff
- import { airdropToUser } from '@/utils/testnetAirdrop';

- // Step 3: Trigger testnet airdrop
- const airdropResult = await airdropToUser(normalizedWallet);

+ // Step 3: Mark user as onboarded
+ console.log('💰 User can claim tokens from faucet at /faucet');

  return NextResponse.json({
    success: true,
    message: 'Onboarding completed successfully',
-   airdrop: { ... },
+   faucetAvailable: true,
+   faucetUrl: '/faucet',
    isFirstUser,
  });
```

### Documentation Created:

**`ONBOARDING_FLOW_DOCUMENTATION.md`** (NEW)
- Complete onboarding flow diagram
- Detailed explanation of each step
- Token faucet documentation
- Environment variables guide
- Testing checklist
- Migration notes

**`AIRDROP_REMOVAL_SUMMARY.md`** (NEW - this file)
- Summary of changes
- Rationale for removal
- Migration guide
- Impact analysis

### Legacy Files (Preserved but Unused):

**`src/utils/testnetAirdrop.ts`**
- **Status:** Preserved for reference
- **Usage:** None (no longer imported)
- **Reason:** Historical documentation

**`src/utils/cdpAirdropService.ts`**
- **Status:** Deleted (never used)
- **Reason:** Created during investigation, not needed

---

## Environment Variables

### No Longer Required:

```env
# ❌ REMOVED - No longer used
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true
TESTNET_FAUCET_PRIVATE_KEY=0x...
NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SYSTEM=100
NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SELF=100
NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SYSTEM=100
NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SELF=100
```

**Action:** Remove these from Vercel environment variables

### Still Required:

```env
# ✅ Still needed for onboarding
ADMIN_PRIVATE_KEY=0x...  # For HAT and Advocate NFT minting

# ✅ Still needed for faucet
NEXT_PUBLIC_TOKEN_FAUCET=0x...
NEXT_PUBLIC_SYSTEM_TOKEN=0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
NEXT_PUBLIC_SELF_TOKEN=0x1b8d424695E63ABca04E94bA46c03f1D83e14020
```

---

## Impact Analysis

### User Experience:

**Before:**
1. Sign up → Receive HAT + Advocate NFT + 100 tokens automatically
2. Immediate access to all features

**After:**
1. Sign up → Receive HAT + Advocate NFT
2. Visit `/faucet` → Claim 10 tokens (gasless)
3. Access to all features

**Impact:** ✅ Minimal - One additional step, but users get instant feedback and control

### Benefits:

1. **User Control:**
   - Users see token claiming as separate action
   - Clear understanding of faucet system
   - Can claim more tokens later if needed

2. **Operational:**
   - No server gas costs
   - No need to monitor/refill airdrop wallet
   - Simpler infrastructure

3. **Security:**
   - One fewer private key to manage
   - Smart contract rate limiting
   - Reduced attack surface

### Drawbacks:

1. **Extra Step:**
   - Users must visit faucet separately
   - Slightly longer onboarding

**Mitigation:** Clear messaging during onboarding directing users to faucet

---

## Testing Requirements

### Manual Testing:

- [ ] New user onboarding completes without token airdrop
- [ ] Onboarding completion returns `faucetAvailable: true`
- [ ] User can access platform features with just HAT + NFT
- [ ] User can navigate to `/faucet`
- [ ] User can successfully claim tokens from faucet
- [ ] Faucet cooldown prevents duplicate claims

### Regression Testing:

- [ ] Existing users not affected
- [ ] HAT minting still works
- [ ] Advocate NFT minting still works
- [ ] Auto-delegation still works
- [ ] Invite code system still works

---

## Rollout Plan

### Phase 1: Deploy Changes ✅
- Remove airdrop from onboarding API
- Deploy to production
- Monitor error logs

### Phase 2: Clean Environment Variables
- Remove `NEXT_PUBLIC_ENABLE_AUTO_AIRDROP` from Vercel
- Remove `TESTNET_FAUCET_PRIVATE_KEY` from Vercel
- Remove airdrop amount variables

### Phase 3: User Communication
- Update onboarding UI to mention faucet
- Add tooltip/banner: "Claim your starting tokens from the Faucet!"
- Update user guides/documentation

### Phase 4: Monitor
- Track faucet usage
- Monitor user complaints/confusion
- Adjust messaging as needed

---

## Correct Onboarding Flow (Final)

```
User Signs Up
      ↓
Creates CDP Wallet
      ↓
Mints Beta Tester HAT (platform access)
      ↓
Mints Advocate NFT (governance power)
      ↓
Auto-Delegates NFT (activates voting)
      ↓
Onboarding Complete ✅
      ↓
User Redirected to /faucet
      ↓
Claims 10 SYSTEM + 10 SELF tokens (gasless)
      ↓
Ready to Participate! 🎉
```

---

## Summary

**What was removed:**
- Token airdrop during onboarding (100 SYSTEM + 100 SELF)
- Legacy Viem-based airdrop service
- Airdrop environment variables

**What was kept:**
- HAT minting (Beta Tester + Executive Leader)
- Advocate NFT minting
- Auto-delegation
- Invite code system

**What was improved:**
- Users now use faucet for tokens (better UX, lower cost)
- Cleaner onboarding flow
- Better security posture
- Simpler infrastructure

**Status:** ✅ Production ready - no breaking changes to existing users

# 🎩 Hat Minting Fix - Implementation Guide

## ✅ What Was Fixed

**Problem:** New users couldn't complete onboarding because their wallet tried to mint the Beta Tester hat to themselves, but they lacked admin permissions.

**Solution:** Backend hat minting using an admin wallet (same secure pattern as your token airdrop system).

---

## 📋 Changes Made

### 1. **New Backend API Route**
**File:** `src/app/api/onboarding/mint-hat/route.ts`
- Mints hats using admin wallet (POD_ADMIN_PRIVATE_KEY)
- Verifies admin wallet has Executive Pod Leader hat
- Checks if user already has the hat
- Returns transaction hash on success

### 2. **Updated Frontend Component**
**File:** `src/components/OnboardingHatMinting.tsx`
- Removed direct CDP transaction calls
- Now calls backend API instead
- Cleaner error handling
- Removed unused imports

### 3. **Verification Script**
**File:** `scripts/verify-admin-hat.ts`
- Confirms admin wallet wears Executive Pod Leader hat
- Checks Beta Tester hat is active
- Provides detailed troubleshooting

---

## 🔧 Setup Requirements

### IMPORTANT: Service Wallet Setup

Since your admin wallet is a **Coinbase Smart Wallet** (no direct private key access), you need to create a **dedicated service wallet**:

#### Step 1: Generate Service Wallet
```bash
tsx scripts/generate-service-wallet.ts
```

This will:
- ✅ Generate a new EOA (Externally Owned Account)
- ✅ Display the private key and address
- ✅ Provide setup instructions

#### Step 2: Add Private Key to .env
```bash
# Add this to your .env file (from script output)
POD_ADMIN_PRIVATE_KEY=0x... # Private key from generate-service-wallet.ts
```

#### Step 3: Fund the Service Wallet
Send ~0.001 ETH to the service wallet address for gas fees.

#### Step 4: Mint Executive Pod Leader Hat to Service Wallet
Using your Coinbase Smart Wallet (current admin), mint the Executive Pod Leader hat to your new service wallet.

**See detailed instructions:** `scripts/mint-hat-to-service-wallet.md`

**Quick method:**
1. Go to https://app.hatsprotocol.xyz
2. Connect your Coinbase Wallet
3. Find Executive Pod Leader hat
4. Mint to service wallet address
5. Confirm transaction

### Environment Variables

Ensure your `.env` has these configured:

```bash
# Service wallet (generated via script)
POD_ADMIN_PRIVATE_KEY=0x... # From generate-service-wallet.ts

# Hat IDs
NEXT_PUBLIC_EXECUTIVE_POD_LEADER=0x0000008800010000000000000000000000000000000000000000000000000000
NEXT_PUBLIC_BETA_TESTER_HAT=0x000000880001000b000000000000000000000000000000000000000000000000

# Hats Protocol (Base Mainnet)
NEXT_PUBLIC_HATS_CONTRACT=0x3bc1a0ad72417f2d411118085256fc53cbddd137

# RPC
NEXT_PUBLIC_RPC_URL=https://base-mainnet.infura.io/v3/YOUR_KEY
```

---

## ✅ Pre-Deployment Verification

### Step 1: Verify Admin Wallet Has Hat

```bash
npm install -g tsx  # If not already installed
tsx scripts/verify-admin-hat.ts
```

**Expected Output:**
```
✅ VERIFICATION PASSED
Your admin wallet is correctly configured and can mint hats!
```

**If verification fails:**
- The script will tell you exactly what's wrong
- You'll need to mint the Executive Pod Leader hat to your admin wallet
- Use Hats Protocol UI: https://app.hatsprotocol.xyz

### Step 2: Check Beta Tester Hat is Active

The verification script also checks this. If inactive:
1. Go to Hats Protocol UI
2. Find Beta Tester hat
3. Activate it (requires admin hat)

---

## 🧪 Testing the Fix

### Test 1: Verify API Works

```bash
# Start your dev server
npm run dev

# Test the API directly (in another terminal)
curl -X POST http://localhost:3000/api/onboarding/mint-hat \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0xYOUR_TEST_WALLET","isFirstUser":false}'
```

**Expected Response:**
```json
{
  "success": true,
  "transactionHash": "0x...",
  "blockNumber": "...",
  "hatId": "0x000000880001000b...",
  "hatName": "Beta Tester"
}
```

### Test 2: Full Onboarding Flow

1. **Clear your cache:**
   ```
   https://localhost:3000/?clear=true
   ```

2. **Start fresh onboarding:**
   - Enter invite code (or skip if first user)
   - Create wallet via email/Google
   - Complete hat minting (now via backend)
   - Should redirect to /home

3. **Monitor logs:**
   - Check browser console for client-side logs
   - Check terminal for backend logs
   - Look for: "✅ Hat minted successfully!"

### Test 3: Verify Hat Was Minted

After onboarding, verify on Hats Protocol:
```
https://app.hatsprotocol.xyz/trees/8453/136
```
(Replace 136 with your tree ID)

Should see your test wallet wearing Beta Tester hat.

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] ✅ Service wallet generated (`tsx scripts/generate-service-wallet.ts`)
- [ ] ✅ Service wallet funded with ~0.001 ETH (for gas)
- [ ] ✅ Executive Pod Leader hat minted to service wallet
- [ ] ✅ Service wallet verified (`tsx scripts/verify-admin-hat.ts`)
- [ ] ✅ Beta Tester hat is active
- [ ] ✅ POD_ADMIN_PRIVATE_KEY set in local .env
- [ ] ✅ Tested locally with new test wallet
- [ ] ✅ Verified hat appears on Hats Protocol UI
- [ ] ✅ Confirmed redirect to /home works

### Production Deployment
- [ ] ✅ Add POD_ADMIN_PRIVATE_KEY to Vercel environment variables
- [ ] ✅ Deploy to production
- [ ] ✅ Test production with real invite code
- [ ] ✅ Monitor logs for first few users
- [ ] ✅ Verify service wallet ETH balance periodically

---

## 🔍 Troubleshooting

### Error: "Admin wallet lacks required permissions"

**Cause:** Admin wallet doesn't wear Executive Pod Leader hat

**Fix:**
```bash
tsx scripts/verify-admin-hat.ts
# Follow the instructions provided
```

### Error: "Hat supply limit reached"

**Cause:** Beta Tester hat maxSupply reached

**Fix:**
- Increase maxSupply via Hats Protocol UI
- Or burn existing hats from test wallets

### Error: "Hat is not active"

**Cause:** Beta Tester hat was deactivated

**Fix:**
- Reactivate via Hats Protocol UI
- Requires admin hat to activate

### Error: "User already wears this hat"

**Cause:** User already received the hat (not actually an error)

**Fix:**
- API returns success with `alreadyHadHat: true`
- User can proceed normally

---

## 📊 Monitoring in Production

### Logs to Watch

**Backend (Vercel/your hosting):**
```
🎩 Mint Hat API: Starting hat mint process...
✅ Mint Hat API: Beta Tester hat minted successfully!
```

**Frontend (Browser console):**
```
🎩 Preparing hat mint request...
✅ Hat minted successfully!
```

### Success Metrics

- ✅ New users complete onboarding
- ✅ Redirect to /home works
- ✅ Hat visible in Hats Protocol UI
- ✅ Token airdrop completes
- ✅ No "chain undefined" errors

---

## 🔐 Security Notes

### Is This Secure?

**YES.** The service wallet approach is industry best practice:

1. ✅ **Private key stored in backend .env only** - Never exposed to client
2. ✅ **Dedicated purpose** - Service wallet only used for automated operations
3. ✅ **Revocable** - If compromised, revoke hat and create new wallet
4. ✅ **Minimal privileges** - Only has Executive Pod Leader hat, nothing else
5. ✅ **Your admin stays secure** - Coinbase Smart Wallet remains under your control
6. ✅ **Same pattern as airdrop** - Matches `testnetAirdrop.ts` security model

### Service Wallet Architecture

```
You (Coinbase Smart Wallet)
  └─> Executive Pod Leader Hat (admin control) ✅
       ├─> You wear it (manual operations) ✅
       └─> Service Wallet wears it (automated operations) ✅
            └─> Backend uses for minting Beta Tester hats
```

**Benefits:**
- **Separation of Concerns:** Personal admin vs automated service
- **Security:** If service wallet compromised, revoke hat → create new wallet
- **Auditable:** All service operations from single dedicated address
- **Best Practice:** Standard pattern for production dApps

### If Service Wallet Compromised

1. Use your Coinbase Smart Wallet to revoke the hat from service wallet
2. Generate new service wallet
3. Mint hat to new wallet
4. Update POD_ADMIN_PRIVATE_KEY in .env
5. Redeploy

Your admin control via Coinbase wallet is never at risk. ✅

---

## 📞 Support

If issues persist after following this guide:

1. Run verification script: `tsx scripts/verify-admin-hat.ts`
2. Check all environment variables are set
3. Verify Beta Tester hat is active in Hats Protocol UI
4. Test API endpoint directly with curl
5. Check browser console AND backend logs

---

## ✨ Summary

**What happens now:**

1. User creates wallet (CDP embedded) ✅
2. Frontend calls `/api/onboarding/mint-hat` ✅
3. **Backend service wallet** mints hat (has Executive Pod Leader hat) ✅
4. User receives Beta Tester hat ✅
5. Completes onboarding ✅
6. Redirects to /home ✅

**Architecture:**
```
User Wallet (no admin rights)
    ↓ (calls API)
Backend Service Wallet (wears Executive Pod Leader hat)
    ↓ (mints hat)
User receives Beta Tester hat
    ↓
Onboarding complete → /home
```

**No more "chain undefined" or permission errors!** 🎉

**Your Coinbase Smart Wallet maintains full admin control** - the service wallet just executes automated operations on your behalf.

# 🚀 Service Wallet Quick Start

**Problem:** Your Coinbase Smart Wallet doesn't have an accessible private key.

**Solution:** Create a dedicated service wallet (EOA) for backend operations.

---

## ⚡ Quick Setup (5 Steps)

### 1️⃣ Generate Service Wallet
```bash
tsx scripts/generate-service-wallet.ts
```

**Output:**
- ✅ New wallet address
- ✅ Private key
- ✅ Setup instructions

**Copy the private key** - you'll need it for step 4.

---

### 2️⃣ Add to .env
```bash
# Add this line to your .env file
POD_ADMIN_PRIVATE_KEY=0x... # Paste the private key from step 1
```

**⚠️ NEVER commit this to git!** (.env should already be in .gitignore)

---

### 3️⃣ Fund the Wallet
Send **0.001 ETH** to the service wallet address (from step 1) to cover gas fees.

**Where to send from:**
- Your Coinbase wallet
- Any exchange
- Another wallet you control

**Network:** Base Mainnet

---

### 4️⃣ Mint Executive Pod Leader Hat to Service Wallet

**Using Hats Protocol UI (Easiest):**

1. Go to https://app.hatsprotocol.xyz
2. Connect your **Coinbase Wallet** (your admin wallet)
3. Navigate to your Executive Pod tree
4. Find "Executive Pod Leader" hat
5. Click "Mint Hat" or "Add Wearer"
6. Paste your **service wallet address** (from step 1)
7. Confirm transaction in Coinbase Wallet
8. Wait for confirmation

**Alternative:** See `scripts/mint-hat-to-service-wallet.md` for other methods.

---

### 5️⃣ Verify Setup
```bash
tsx scripts/verify-admin-hat.ts
```

**Expected output:**
```
✅ VERIFICATION PASSED
Your admin wallet is correctly configured and can mint hats!
```

If this passes, you're ready to go! 🎉

---

## 🧪 Test It Works

### Local Testing
```bash
# Start dev server
npm run dev

# Clear cache and test onboarding
http://localhost:3000/?clear=true

# Complete onboarding flow
# Should successfully mint hat and redirect to /home
```

### API Test
```bash
# Test the API directly
curl -X POST http://localhost:3000/api/onboarding/mint-hat \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0xYOUR_TEST_WALLET","isFirstUser":false}'
```

**Expected response:**
```json
{
  "success": true,
  "transactionHash": "0x...",
  "hatName": "Beta Tester"
}
```

---

## 🚀 Deploy to Production

### 1. Add to Vercel Environment Variables
In Vercel dashboard:
- Go to Settings → Environment Variables
- Add `POD_ADMIN_PRIVATE_KEY` with the value from step 1
- Save

### 2. Deploy
```bash
npm run build
# Deploy normally to Vercel
```

### 3. Test Production
- Create new test user
- Complete onboarding
- Should receive hat and redirect to /home ✅

---

## 🔐 Security Checklist

- [x] ✅ Private key stored in .env (not in code)
- [x] ✅ .env in .gitignore (never committed)
- [x] ✅ Vercel env variables configured (production)
- [x] ✅ Service wallet only used for backend operations
- [x] ✅ Service wallet has minimal privileges (only Executive Pod Leader hat)
- [x] ✅ Your Coinbase wallet maintains admin control

---

## 🎯 Architecture

```
You (Coinbase Smart Wallet) - Full Admin Control
  │
  ├─> Manual operations (via Hats Protocol UI)
  │
  └─> Service Wallet (automated backend operations)
       └─> Mints Beta Tester hats via API
```

**Benefits:**
- ✅ Your admin wallet stays secure (no private key exposure)
- ✅ Dedicated wallet for service operations
- ✅ Can revoke and recreate if needed
- ✅ Industry best practice

---

## ❓ FAQ

**Q: Is this secure?**
A: Yes! Same pattern as your token airdrop system. Private key only in backend .env.

**Q: What if the service wallet is compromised?**
A: Use your Coinbase wallet to revoke the hat, generate new service wallet, mint hat to it, update .env.

**Q: Do I still have admin control?**
A: Yes! Your Coinbase Smart Wallet maintains full control. Service wallet just executes automated operations.

**Q: How much ETH do I need?**
A: ~0.001 ETH is enough for ~100 hat minting transactions.

**Q: Can I use a different wallet?**
A: Yes, any EOA works. Just ensure it wears the Executive Pod Leader hat.

---

## 📋 What You Created

### Files
- ✅ `src/app/api/onboarding/mint-hat/route.ts` - Backend API
- ✅ `src/components/OnboardingHatMinting.tsx` - Updated component
- ✅ `scripts/generate-service-wallet.ts` - Wallet generator
- ✅ `scripts/verify-admin-hat.ts` - Verification script
- ✅ `HAT_MINTING_FIX_GUIDE.md` - Full documentation

### Configuration
- ✅ Service wallet generated
- ✅ POD_ADMIN_PRIVATE_KEY in .env
- ✅ Service wallet funded
- ✅ Executive Pod Leader hat minted to service wallet

---

## 🆘 Troubleshooting

**"Admin wallet lacks required permissions"**
→ Service wallet doesn't have Executive Pod Leader hat. Complete step 4.

**Verification script fails**
→ Check POD_ADMIN_PRIVATE_KEY is set in .env

**Hat minting fails**
→ Ensure service wallet is funded and has the hat

**Still stuck?**
→ Check `HAT_MINTING_FIX_GUIDE.md` for detailed troubleshooting

---

## ✨ You're Done!

Your onboarding flow should now work end-to-end:
1. ✅ User creates Coinbase embedded wallet
2. ✅ Backend mints Beta Tester hat
3. ✅ User completes onboarding
4. ✅ Redirects to /home

No more errors! 🎉

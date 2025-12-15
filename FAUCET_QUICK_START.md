# Token Faucet - Quick Start

**Status:** ✅ Ready to Deploy
**Build Status:** ✅ Passing

---

## What We Built

A complete self-service token faucet system that eliminates the need for manual airdrops.

### Features
- 🎯 **Gasless for users** - Coinbase Paymaster covers all gas fees
- ⏱️ **24-hour cooldown** - Users can claim once per day
- 💎 **10 SYSTEM + 10 SELF tokens** per claim
- 🎨 **SpiritDAO design system** - Beautiful ritual green UI
- 📱 **Mobile-first** - Droplets icon in bottom navigation
- ⏳ **Real-time countdown** - Shows time until next claim
- 📊 **Live balance monitoring** - Displays faucet reserves

---

## 🚀 Deploy in 5 Steps

### 1. Deploy Contract
```bash
npx hardhat run scripts/deploy-token-faucet.ts --network base
```
Save the contract address!

### 2. Update .env
```bash
NEXT_PUBLIC_TOKEN_FAUCET=0x...  # Your deployed address
```

### 3. Whitelist on Coinbase
- Go to Coinbase Developer Dashboard
- Add contract address
- Whitelist function: `claimTokens()`

### 4. Fund the Faucet
```bash
npx tsx scripts/fund-faucet.ts
```
Transfers 1,000 SYSTEM + 1,000 SELF (supports ~100 claims)

### 5. Deploy Frontend
```bash
git add .
git commit -m "Add token faucet"
git push
```

---

## Coinbase Paymaster Whitelist Info

**Contract Address:** (from step 1)

**Function to Whitelist:**
```
claimTokens()
```

That's it - just ONE function!

**Description:**
Allows users to claim 10 SYSTEM + 10 SELF tokens once per 24 hours

**Gas Estimate:** ~100,000

---

## User Flow

1. User clicks **Droplets icon** in bottom nav
2. Sees claim amounts and faucet reserves
3. Clicks **Claim Tokens** button
4. Transaction is gasless (instant confirmation)
5. Success message + 24-hour countdown begins
6. After 24 hours, can claim again

---

## Files Created

### Smart Contract
- ✅ `src/contracts/TokenFaucet.sol`

### Scripts
- ✅ `scripts/deploy-token-faucet.ts`
- ✅ `scripts/fund-faucet.ts`

### Frontend
- ✅ `src/app/faucet/page.tsx` (full faucet UI)
- ✅ `src/components/MobileBottomNav.tsx` (added Droplets icon)

### Documentation
- ✅ `FAUCET_DEPLOYMENT_GUIDE.md` (complete guide)
- ✅ `FAUCET_QUICK_START.md` (this file)

---

## Contract Functions

### For Users
- `claimTokens()` - Claim 10 SYSTEM + 10 SELF
- `canClaim(address)` - Check if user can claim now
- `getTimeUntilNextClaim(address)` - Seconds until next claim

### For Admin (You)
- `updateClaimAmounts(uint256, uint256)` - Change claim amounts
- `emergencyWithdraw(address, uint256)` - Emergency token recovery

---

## Testing Checklist

After deployment, test:

- [ ] Navigate to `/faucet` page loads correctly
- [ ] Droplets icon appears in bottom navigation
- [ ] Connect wallet shows correct address
- [ ] Claim button is enabled (first time)
- [ ] Click claim → transaction succeeds (gasless)
- [ ] Success message appears
- [ ] Tokens appear in wallet
- [ ] Countdown timer starts (24 hours)
- [ ] Button is disabled during cooldown
- [ ] After 24 hours, can claim again

---

## Monitoring

### Check Faucet Balance
Visit `/faucet` page - reserves shown in UI

### Refill When Low
```bash
npx tsx scripts/fund-faucet.ts
```

### View Claims on BaseScan
Search for your faucet contract address on BaseScan to see all claim transactions

---

## Support

**Full documentation:** `FAUCET_DEPLOYMENT_GUIDE.md`

**Build status:** ✅ Passing (no errors)

---

## Next Steps

1. **Deploy now** - Follow the 5 steps above
2. **Test thoroughly** - Use checklist
3. **Announce to community** - Share `/faucet` link
4. **Monitor usage** - Check claims on BaseScan

---

**Ready to launch! 🎉**

Questions? Check `FAUCET_DEPLOYMENT_GUIDE.md` for detailed info.

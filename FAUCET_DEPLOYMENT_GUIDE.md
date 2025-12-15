# Token Faucet Deployment Guide

**Status:** Ready for Deployment ✅
**Date:** December 15, 2025

---

## Overview

The Token Faucet system allows users to claim 10 SYSTEM + 10 SELF tokens once every 24 hours, completely gasless through Coinbase Paymaster integration.

**Key Features:**
- ✅ Self-service token claiming (no manual airdrops needed)
- ✅ 24-hour cooldown between claims
- ✅ Gasless for users (Coinbase Paymaster sponsorship)
- ✅ Beautiful SpiritDAO design system UI
- ✅ Real-time countdown timer
- ✅ Faucet balance monitoring

---

## Files Created

### Smart Contract
- `src/contracts/TokenFaucet.sol` - Main faucet contract with cooldown logic

### Deployment Scripts
- `scripts/deploy-token-faucet.ts` - Deploy contract and get whitelist info
- `scripts/fund-faucet.ts` - Fund faucet with tokens

### Frontend
- `src/app/faucet/page.tsx` - Complete faucet UI with SpiritDAO styling
- `src/components/MobileBottomNav.tsx` - Updated with Droplets icon for faucet

---

## Deployment Steps

### Step 1: Deploy the Contract

```bash
npx hardhat run scripts/deploy-token-faucet.ts --network base
```

**Expected Output:**
- Contract address (e.g., `0x...`)
- Verification command for BaseScan
- Whitelist information for Coinbase Paymaster

**Save the contract address!**

---

### Step 2: Update Environment Variables

Add to your `.env` file:

```bash
NEXT_PUBLIC_TOKEN_FAUCET=0x... # Address from Step 1
```

---

### Step 3: Verify Contract on BaseScan

Run the command provided by the deployment script:

```bash
npx hardhat verify --network base <FAUCET_ADDRESS> "<SYSTEM_TOKEN>" "<SELF_TOKEN>"
```

This makes your contract visible and trustworthy on BaseScan.

---

### Step 4: Whitelist on Coinbase Paymaster

Go to Coinbase Developer Dashboard → Paymaster → Add Contract

**Contract Information:**
- **Address:** `<FAUCET_ADDRESS>` from Step 1
- **Network:** Base Mainnet

**Functions to Whitelist:**

1. **claimTokens()**
   - Signature: `claimTokens()`
   - Description: Allows users to claim 10 SYSTEM + 10 SELF tokens once per 24 hours
   - Gas estimate: ~100,000

**That's it!** Only one function needs whitelisting.

---

### Step 5: Fund the Faucet

Transfer tokens from your faucet wallet to the contract:

```bash
npx tsx scripts/fund-faucet.ts
```

**Default amounts:**
- 1,000 SYSTEM tokens
- 1,000 SELF tokens
- Supports ~100 claims

**Adjust amounts in `scripts/fund-faucet.ts` if needed:**
```typescript
const SYSTEM_FUND_AMOUNT = 1000; // Change this
const SELF_FUND_AMOUNT = 1000;   // Change this
```

---

### Step 6: Deploy Frontend

Push your changes to Vercel:

```bash
git add .
git commit -m "Add token faucet system"
git push
```

Vercel will automatically deploy with the new faucet page and navigation icon.

---

### Step 7: Test the Faucet

1. Open your app on mobile or desktop
2. Click the **Droplets icon** in the bottom navigation
3. Connect your wallet if not already connected
4. Click **Claim Tokens** button
5. Confirm the transaction (gasless!)
6. Verify tokens arrive in your wallet

---

## User Experience Flow

### First-Time User
1. User navigates to `/faucet` via Droplets icon
2. Sees clean interface with claim amounts and faucet reserves
3. Clicks **Claim Tokens** button
4. Transaction is gasless (Coinbase Paymaster pays gas)
5. Success message shows tokens claimed
6. User can see 24-hour countdown until next claim

### Returning User (Before 24 Hours)
1. User sees **Cooldown Active** warning
2. Real-time countdown shows time remaining
3. **Claim Tokens** button is disabled
4. After countdown reaches 0, button becomes active again

### Wallet Not Connected
1. User sees warning: "Wallet Not Connected"
2. Instructions to connect wallet first
3. Once connected, faucet interface appears

---

## Design System Compliance

The faucet page follows **SpiritDAO Sacred Minimalism** design system:

### Colors Used

**Primary (Ritual Green):** `#2F5D50`
- Claim button (active state)
- Header text
- Success messages

**Success Info:** `#E8F1EE` background, `#B8D9CA` border
- Claim amount display
- Success message backgrounds

**Warning Info:** `#FAF4EC` background, `#E8D7B8` border
- Cooldown timer
- Wallet not connected warning

**Disabled:** `#D8D2C8`
- Claim button (inactive state)

**Background:** `#F5F4ED`
- Page background (SpiritDAO neutral)

### Icons
- **Droplets:** Faucet representation (lucide-react)
- **Clock:** Cooldown timer
- **CheckCircle:** Success states
- **XCircle:** Error states
- **Loader2:** Loading animation

---

## Contract Functions Reference

### User Functions

#### claimTokens()
```solidity
function claimTokens() external nonReentrant
```
- Claims tokens for the caller
- Enforces 24-hour cooldown
- Transfers 10 SYSTEM + 10 SELF tokens
- Emits `TokensClaimed` event

#### canClaim(address user)
```solidity
function canClaim(address user) external view returns (bool)
```
- Returns `true` if user can claim now
- Used by frontend to enable/disable button

#### getTimeUntilNextClaim(address user)
```solidity
function getTimeUntilNextClaim(address user) external view returns (uint256)
```
- Returns seconds until next claim
- Returns `0` if user can claim now
- Used by frontend for countdown timer

#### getFaucetBalances()
```solidity
function getFaucetBalances() external view returns (uint256 systemBalance, uint256 selfBalance)
```
- Returns current token balances in faucet
- Used by frontend to display reserves

---

### Admin Functions (Owner Only)

#### updateClaimAmounts(uint256 _systemAmount, uint256 _selfAmount)
```solidity
function updateClaimAmounts(uint256 _systemAmount, uint256 _selfAmount) external onlyOwner
```
- Update how many tokens users receive per claim
- Default: 10 SYSTEM + 10 SELF (10e18 wei)

#### emergencyWithdraw(address token, uint256 amount)
```solidity
function emergencyWithdraw(address token, uint256 amount) external onlyOwner
```
- Withdraw tokens from faucet in case of emergency
- Can withdraw any ERC20 token

---

### Public Functions

#### fundFaucet(address token, uint256 amount)
```solidity
function fundFaucet(address token, uint256 amount) external
```
- Anyone can fund the faucet with SYSTEM or SELF tokens
- Requires token approval first

---

## Monitoring & Maintenance

### Check Faucet Balances

The faucet page automatically displays current reserves. You can also check on-chain:

```typescript
const balances = await publicClient.readContract({
  address: FAUCET_ADDRESS,
  abi: FAUCET_ABI,
  functionName: 'getFaucetBalances',
});
console.log(`SYSTEM: ${formatEther(balances[0])}`);
console.log(`SELF: ${formatEther(balances[1])}`);
```

### Refill When Low

When faucet balances get low (<100 tokens), run:

```bash
npx tsx scripts/fund-faucet.ts
```

### Update Claim Amounts (If Needed)

If you want to change how many tokens users get per claim:

1. Update the contract (owner only):
   ```typescript
   await walletClient.writeContract({
     address: FAUCET_ADDRESS,
     abi: FAUCET_ABI,
     functionName: 'updateClaimAmounts',
     args: [parseEther('20'), parseEther('20')], // 20 tokens each
   });
   ```

2. Update the frontend display in `src/app/faucet/page.tsx` (optional, will auto-fetch from contract)

---

## Troubleshooting

### "Claim cooldown active" Error
- **Cause:** User claimed within last 24 hours
- **Fix:** Wait until countdown reaches 0
- **Check:** Call `getTimeUntilNextClaim(userAddress)`

### "Insufficient SYSTEM/SELF tokens in faucet" Error
- **Cause:** Faucet ran out of tokens
- **Fix:** Run `npx tsx scripts/fund-faucet.ts`

### "Gas required exceeds allowance" Error
- **Cause:** Coinbase Paymaster not whitelisting the function
- **Fix:** Ensure `claimTokens()` is whitelisted on Coinbase dashboard
- **Verify:** Check Coinbase Developer dashboard → Paymaster → Whitelisted Contracts

### Claim Button Stays Disabled
- **Frontend Issue:** Check browser console for errors
- **Contract Issue:** Verify `canClaim(userAddress)` returns `true`
- **Wallet Issue:** Ensure wallet is connected and on Base Mainnet

---

## Security Considerations

### Implemented Protections

✅ **ReentrancyGuard:** Prevents reentrancy attacks
✅ **Cooldown Enforcement:** 24-hour minimum between claims
✅ **Balance Checks:** Verifies faucet has enough tokens before transfer
✅ **Ownership Control:** Only owner can update amounts or emergency withdraw
✅ **Immutable Tokens:** Token addresses cannot be changed after deployment

### Best Practices

1. **Monitor Balances:** Ensure faucet stays funded
2. **Regular Audits:** Check claim logs for suspicious activity
3. **Owner Key Security:** Protect the private key that deployed the contract
4. **Whitelist Accuracy:** Only whitelist `claimTokens()` on paymaster

---

## Cost Analysis

### Deployment Costs
- Contract deployment: ~0.001 ETH (one-time)
- Contract verification: Free
- Initial funding: 1,000 SYSTEM + 1,000 SELF tokens

### Ongoing Costs
- **User claims:** $0 (Coinbase Paymaster covers gas)
- **Refilling faucet:** ~0.0001 ETH per refill transaction
- **Paymaster sponsorship:** Free (within Coinbase limits)

### Estimated Gas Costs (if not using paymaster)
- `claimTokens()`: ~80,000-100,000 gas
- At 1 gwei base fee: ~$0.0003 per claim
- 100 claims without paymaster: ~$0.03

**With Coinbase Paymaster: $0 for users** ✅

---

## Success Metrics

Track these metrics to measure faucet success:

1. **Total Claims:** Count `TokensClaimed` events
2. **Unique Users:** Count distinct addresses that claimed
3. **Daily Active Users:** Users claiming on a given day
4. **Faucet Uptime:** % of time faucet had sufficient balance
5. **Average Time Between Claims:** User engagement metric

---

## Next Steps After Deployment

1. ✅ **Test with multiple wallets** to verify 24-hour cooldown
2. ✅ **Monitor BaseScan** for claim transactions
3. ✅ **Share faucet link** with community (`yourapp.com/faucet`)
4. ✅ **Set up refill alerts** when balance drops below threshold
5. ✅ **Announce in Discord/Telegram** that faucet is live

---

## FAQ

**Q: Can users claim from multiple wallets?**
A: Yes, each wallet has its own 24-hour cooldown. One person could create multiple wallets to claim more tokens, but that's expected behavior for public faucets.

**Q: Can I change the cooldown period?**
A: The 24-hour cooldown is hardcoded as `constant COOLDOWN_PERIOD = 24 hours`. To change it, you'd need to deploy a new contract.

**Q: What happens if the faucet runs out of tokens?**
A: Claims will fail with "Insufficient tokens" error. Frontend shows current reserves so you can refill proactively.

**Q: Can I use this faucet on testnet?**
A: Yes! Just deploy to Base Sepolia instead of Base Mainnet by using `--network baseSepolia` in the deployment command.

**Q: How do I know if Coinbase Paymaster is working?**
A: User transactions will show `gasPrice: 0` and no ETH deducted from their wallet. Check Coinbase Developer dashboard for sponsored transaction logs.

---

## Support

If you encounter issues:

1. Check browser console for errors
2. Verify contract on BaseScan
3. Check Coinbase Paymaster dashboard for sponsorship logs
4. Review this guide's Troubleshooting section

---

## Summary

🎉 **You've built a complete token faucet system!**

**What you accomplished:**
- ✅ Secure smart contract with cooldown logic
- ✅ Gasless user experience via Coinbase Paymaster
- ✅ Beautiful, responsive UI with SpiritDAO design
- ✅ Real-time countdown and balance monitoring
- ✅ Easy-to-use admin scripts for deployment and funding

**Ready to deploy:** Follow the 7 steps above and your faucet will be live!

---

**Questions?** Review the FAQ section or check the Troubleshooting guide.

**Good luck! 🚀**

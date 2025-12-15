# Deploy TokenFaucet via Remix

**Use this guide to deploy the faucet contract directly from Remix instead of Hardhat.**

---

## Why Remix?

- ✅ No ETH needed for deployment (use your funded wallet)
- ✅ Visual interface for contract interaction
- ✅ Works in browser - no command line needed
- ✅ Easy to verify on BaseScan

---

## Step-by-Step Deployment

### 1. Open Remix

Go to: **https://remix.ethereum.org**

### 2. Create New File

- Click the "+" icon in the File Explorer
- Name it: `TokenFaucet.sol`

### 3. Copy Contract Code

Copy the entire contents of `src/contracts/TokenFaucet_Remix.sol` into the new file.

**Important:** Use `TokenFaucet_Remix.sol` (not the regular `TokenFaucet.sol`)

The Remix version has all dependencies inlined - no imports needed!

### 4. Compile Contract

- Click **"Solidity Compiler"** tab (left sidebar)
- Select compiler version: **0.8.20**
- Click **"Compile TokenFaucet.sol"**
- Wait for green checkmark ✅

### 5. Connect MetaMask

- Click **"Deploy & Run Transactions"** tab
- Environment: Select **"Injected Provider - MetaMask"**
- MetaMask will popup - connect your wallet
- Verify network shows **"Base Mainnet (8453)"**

### 6. Set Constructor Parameters

In the "Deploy" section, you'll see two input fields:

**_SYSTEMTOKEN:**
```
0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
```

**_SELFTOKEN:**
```
0x1b8d424695E63ABca04E94bA46c03f1D83e14020
```

### 7. Deploy Contract

- Click **"Deploy"** button (orange)
- MetaMask will popup asking for confirmation
- Confirm the transaction
- Wait for deployment (usually 2-5 seconds on Base)

### 8. Save Contract Address

After deployment:
- Expand "Deployed Contracts" section (bottom of left panel)
- You'll see the contract address (starts with `0x...`)
- **COPY THIS ADDRESS** - you'll need it!

### 9. Verify on BaseScan

Go to: **https://basescan.org/address/YOUR_CONTRACT_ADDRESS**

Click **"Contract"** → **"Verify and Publish"**

**Verification Settings:**
- Compiler Type: **Solidity (Single file)**
- Compiler Version: **v0.8.20**
- License: **MIT**

**Contract Code:**
- Paste the entire contents of `TokenFaucet_Remix.sol`

**Constructor Arguments (ABI-encoded):**
You need to ABI-encode the constructor arguments. Use this tool:
https://abi.hashex.org/

Or manually encode:
```
0x000000000000000000000000d67e460ce56be18b573ab434b3dc962c657d8bb5
0000000000000000000000001b8d424695e63abca04e94ba46c03f1d83e14020
```

Click **"Verify and Publish"**

---

## Post-Deployment Steps

### 1. Update .env File

Add this line to your `.env`:

```bash
NEXT_PUBLIC_TOKEN_FAUCET=0x...  # Your deployed contract address
```

### 2. Whitelist on Coinbase Paymaster

Go to: **Coinbase Developer Dashboard → Paymaster**

**Add Contract:**
- Contract Address: `YOUR_CONTRACT_ADDRESS`
- Network: Base Mainnet

**Whitelist Function:**
- Function: `claimTokens()`
- Signature: `claimTokens()`
- Gas Limit: 100000

### 3. Fund the Faucet

Now that the contract is deployed, fund it with tokens:

```bash
npx tsx scripts/fund-faucet.ts
```

This will transfer 1,000 SYSTEM + 1,000 SELF tokens to the faucet contract.

### 4. Test on Remix (Optional)

Before deploying frontend, test claiming directly in Remix:

**Load Contract:**
- Copy your deployed contract address
- In Remix "Deploy" tab, paste address in "At Address" field
- Click "At Address" button

**Test Functions:**
1. **canClaim** - Enter your wallet address, click "call"
   - Should return `true` for first-time claimers

2. **getFaucetBalances** - Click "call"
   - Should show token balances after funding

3. **claimTokens** - Click "transact"
   - Should succeed and transfer 10 SYSTEM + 10 SELF to your wallet

### 5. Deploy Frontend

```bash
git add .
git commit -m "Add token faucet with contract address"
git push
```

---

## Troubleshooting

### Error: "Insufficient SYSTEM/SELF tokens in faucet"

**Problem:** Contract has no tokens yet

**Solution:** Run the funding script:
```bash
npx tsx scripts/fund-faucet.ts
```

### Error: "Claim cooldown active"

**Problem:** You already claimed within last 24 hours

**Solution:** Wait until cooldown expires. Check remaining time:
- Call `getTimeUntilNextClaim` with your address
- Result is in seconds

### MetaMask shows wrong network

**Problem:** Not connected to Base Mainnet

**Solution:**
1. Open MetaMask
2. Click network dropdown
3. Select "Base Mainnet"
4. Refresh Remix page

### Contract won't compile

**Problem:** Wrong compiler version or file

**Solution:**
- Ensure using `TokenFaucet_Remix.sol` (not `TokenFaucet.sol`)
- Select compiler version **0.8.20** exactly
- Clear cache (Ctrl+Shift+R in Remix)

---

## Interacting with Deployed Contract

### Via Remix

After deployment, the contract appears in "Deployed Contracts" section.

**View Functions (Orange buttons):**
- `canClaim` - Check if address can claim
- `getTimeUntilNextClaim` - Seconds until next claim
- `getFaucetBalances` - Check faucet reserves
- `systemClaimAmount` - Amount of SYSTEM per claim
- `selfClaimAmount` - Amount of SELF per claim
- `owner` - Contract owner address

**Transaction Functions (Red/Orange buttons):**
- `claimTokens` - Claim tokens (user function)
- `updateClaimAmounts` - Change claim amounts (owner only)
- `emergencyWithdraw` - Withdraw tokens (owner only)
- `fundFaucet` - Deposit tokens (anyone)

### Via BaseScan

After verification, go to BaseScan → Read Contract / Write Contract tabs

**Read Contract:**
- View all contract state
- Check balances
- Verify claim eligibility

**Write Contract:**
- Connect wallet
- Execute transactions
- Same functions as Remix

---

## Cost Estimation

**Deployment Cost:**
- Gas Used: ~1,500,000 gas
- At 0.1 gwei (typical Base fee): ~$0.0005
- At 1 gwei: ~$0.005

**Total:** Less than 1 cent to deploy!

---

## Verification Checklist

After deployment, verify:

- [ ] Contract deployed successfully
- [ ] Address saved in `.env` as `NEXT_PUBLIC_TOKEN_FAUCET`
- [ ] Contract verified on BaseScan
- [ ] Faucet funded with tokens (1,000 SYSTEM + 1,000 SELF)
- [ ] `claimTokens()` whitelisted on Coinbase Paymaster
- [ ] Test claim works in Remix
- [ ] Frontend deployed with updated `.env`

---

## Alternative: Deploy via Script

If you prefer command line, you can still use Hardhat:

```bash
npx hardhat run scripts/deploy-token-faucet.ts --network base
```

But Remix is easier if:
- You're not comfortable with terminal
- You want visual feedback
- You prefer browser-based tools
- You want to test functions immediately

---

## Next Steps

1. ✅ Deploy contract via Remix
2. ✅ Save contract address
3. ✅ Update `.env` file
4. ✅ Verify on BaseScan
5. ✅ Whitelist on Coinbase Paymaster
6. ✅ Fund faucet with tokens
7. ✅ Test claim in Remix
8. ✅ Deploy frontend
9. ✅ Test on live app

---

## Support

**Remix Issues:**
- Clear browser cache
- Try incognito mode
- Use Chrome/Brave browser

**MetaMask Issues:**
- Ensure Base Mainnet is added
- Check you have some ETH for gas
- Try disconnecting and reconnecting

**Contract Issues:**
- Check constructor parameters are correct
- Verify you're using `TokenFaucet_Remix.sol`
- Ensure compiler version is 0.8.20

---

## Summary

✅ **Remix Version Created:** `TokenFaucet_Remix.sol`
✅ **No import errors** - all dependencies inlined
✅ **Ready to deploy** - copy and paste into Remix
✅ **Deployment cost** - Less than 1 cent on Base

**Let's deploy it!** 🚀

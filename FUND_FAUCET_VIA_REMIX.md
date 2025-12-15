# Fund Token Faucet via Remix (Workaround for No ETH)

**Problem:** The faucet wallet has no ETH for gas, so scripts fail.

**Solution:** Use Remix with YOUR MetaMask wallet to transfer tokens to the faucet contract.

---

## Quick Steps

### 1. Open Remix
https://remix.ethereum.org

### 2. Connect MetaMask
- Click "Deploy & Run Transactions" tab
- Environment: **Injected Provider - MetaMask**
- Connect your personal wallet (the one with ETH)
- Verify network: **Base Mainnet**

---

## Transfer SYSTEM Tokens

### 1. Load SYSTEM Token Contract

In the "At Address" field, paste:
```
0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
```

Click **"At Address"**

The contract should appear in "Deployed Contracts" section.

### 2. Expand the Contract

Click the dropdown arrow to see all functions.

### 3. Call `transfer` Function

Find the **transfer** function (orange/red button).

**Parameters:**
- `to`: `0x189aA1FA8CC41A26944A0957015d9902057c1dbA` (your faucet contract)
- `amount`: `1000000000000000000000` (1,000 tokens = 1000 * 10^18)

Click **"transact"**

MetaMask will popup → **Confirm** transaction

Wait for confirmation (~2 seconds)

---

## Transfer SELF Tokens

### 1. Load SELF Token Contract

In the "At Address" field, paste:
```
0x1b8d424695E63ABca04E94bA46c03f1D83e14020
```

Click **"At Address"**

### 2. Call `transfer` Function

**Parameters:**
- `to`: `0x189aA1FA8CC41A26944A0957015d9902057c1dbA` (your faucet contract)
- `amount`: `1000000000000000000000` (1,000 tokens)

Click **"transact"** → **Confirm** in MetaMask

Wait for confirmation

---

## Verify Faucet Has Tokens

### 1. Load Faucet Contract

In the "At Address" field, paste:
```
0x189aA1FA8CC41A26944A0957015d9902057c1dbA
```

Click **"At Address"**

### 2. Call `getFaucetBalances`

Find **getFaucetBalances** (blue button - it's a view function)

Click **"call"**

**Expected Result:**
```
systemBalance: 1000000000000000000000
selfBalance: 1000000000000000000000
```

This is 1,000 SYSTEM + 1,000 SELF tokens (supports 100 claims)

---

## Test Claiming

### 1. Call `canClaim`

In the faucet contract, find **canClaim** function.

**Parameter:**
- `user`: `YOUR_WALLET_ADDRESS` (copy from MetaMask)

Click **"call"**

**Result:** Should return `true` (if you haven't claimed before)

### 2. Call `claimTokens`

Find **claimTokens** (orange/red button).

**No parameters needed** - just click **"transact"**

MetaMask will popup → **Confirm**

Wait for confirmation

### 3. Verify Tokens Received

Load SYSTEM token contract again (step above).

Call **balanceOf** with your wallet address.

You should see your balance increased by 10 tokens!

---

## Alternative: Use BaseScan

If you prefer using BaseScan instead of Remix:

### 1. Go to SYSTEM Token on BaseScan
```
https://basescan.org/address/0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
```

### 2. Click "Contract" → "Write Contract"

### 3. Click "Connect to Web3"

Connect MetaMask

### 4. Find `transfer` Function

**Parameters:**
- `to (address)`: `0x189aA1FA8CC41A26944A0957015d9902057c1dbA`
- `amount (uint256)`: `1000000000000000000000`

Click **"Write"** → **Confirm** in MetaMask

### 5. Repeat for SELF Token
```
https://basescan.org/address/0x1b8d424695E63ABca04E94bA46c03f1D83e14020
```

Same steps as SYSTEM token

---

## Quick Reference

**Your Faucet Contract:**
```
0x189aA1FA8CC41A26944A0957015d9902057c1dbA
```

**SYSTEM Token:**
```
0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
```

**SELF Token:**
```
0x1b8d424695E63ABca04E94bA46c03f1D83e14020
```

**Amount to Transfer:**
```
1000000000000000000000
```
(That's 1,000 tokens in wei format)

---

## Why This Works

**Script Fails Because:**
- Script uses faucet wallet private key
- Faucet wallet has NO ETH
- Can't pay gas fees for transfer

**Remix Works Because:**
- You use YOUR MetaMask wallet
- YOUR wallet HAS ETH
- You pay gas fees yourself
- Tokens come from YOUR balance, not faucet wallet

**Important:** Make sure YOUR MetaMask wallet has:
- ✅ At least 1,000 SYSTEM tokens
- ✅ At least 1,000 SELF tokens
- ✅ Some ETH for gas (0.0001 ETH is plenty on Base)

---

## After Funding

Once faucet is funded:

1. ✅ Test claiming in Remix (call `claimTokens()`)
2. ✅ Check your wallet - should have +10 SYSTEM and +10 SELF
3. ✅ Deploy frontend: `git push`
4. ✅ Test on live app at `/faucet` page

---

## Summary

Instead of running the script (which needs ETH), use Remix to:
1. Load SYSTEM token contract
2. Call `transfer` to send 1,000 SYSTEM to faucet contract
3. Load SELF token contract
4. Call `transfer` to send 1,000 SELF to faucet contract
5. Verify with `getFaucetBalances`
6. Test claiming with `claimTokens`

**Done! 🚀**

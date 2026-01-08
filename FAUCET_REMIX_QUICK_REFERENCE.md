# Token Faucet - Remix Quick Reference Card

**Use this for copy-paste deployment in Remix**

---

## 🚀 Deploy in 3 Minutes

### 1. Open Remix
```
https://remix.ethereum.org
```

### 2. Copy Contract
Open file: `src/contracts/TokenFaucet_Remix.sol`
Copy entire file → Paste into Remix

### 3. Compile
- Compiler: **0.8.20**
- Click: **Compile**

### 4. Deploy
**Environment:** Injected Provider - MetaMask
**Network:** Base Mainnet

**Constructor Parameters:**
```
_systemToken: 0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
_selfToken: 0x1b8d424695E63ABca04E94bA46c03f1D83e14020
```

Click **Deploy** → Confirm in MetaMask

### 5. Save Address
Copy deployed contract address (starts with `0x...`)

---

## 📝 Update .env

```bash
NEXT_PUBLIC_TOKEN_FAUCET=0x...  # Your contract address
```

---

## 💳 Coinbase Paymaster

**Contract:** Your deployed address
**Function to Whitelist:** `claimTokens()`

---

## 💰 Fund Faucet

```bash
npx tsx scripts/fund-faucet.ts
```

---

## ✅ Test in Remix

**canClaim(address)** → Should return `true`
**getFaucetBalances()** → Should show 1000 SYSTEM + 1000 SELF
**claimTokens()** → Should transfer 10 + 10 tokens

---

## 🌐 Deploy Frontend

```bash
git add .
git commit -m "Add faucet contract"
git push
```

---

## 📊 Constructor ABI (for BaseScan verification)

If BaseScan asks for ABI-encoded constructor arguments:

```
0x000000000000000000000000d67e460ce56be18b573ab434b3dc962c657d8bb5
0000000000000000000000001b8d424695e63abca04e94ba46c03f1d83e14020
```

---

## 🔗 Links

**Remix:** https://remix.ethereum.org
**BaseScan:** https://basescan.org
**Coinbase Dashboard:** https://portal.cdp.coinbase.com

---

## ⚡ Quick Test

After deployment:

1. Load contract in Remix "At Address"
2. Call `canClaim` with your wallet → `true`
3. Call `claimTokens` → Get 10 SYSTEM + 10 SELF
4. Call `canClaim` again → `false` (24h cooldown)
5. Call `getTimeUntilNextClaim` → `86400` (seconds)

---

## 🎯 One-Line Summary

Copy `TokenFaucet_Remix.sol` → Paste in Remix → Compile → Deploy with token addresses → Fund → Ship!

**That's it! 🚀**

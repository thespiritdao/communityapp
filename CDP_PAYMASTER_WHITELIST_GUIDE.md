# CDP Paymaster Whitelist Update Guide

## What to Update

After deploying new contracts, you MUST update the CDP Paymaster whitelist for gasless transactions to work.

## Steps

### 1. Go to CDP Dashboard

URL: https://portal.cdp.coinbase.com/

### 2. Navigate to Paymaster Settings

- Click on your project
- Go to "Paymaster" section
- Click "Contract Allowlist"

### 3. Add SystemTokenV2

**Contract Address:** (from your deployment)
```
SYSTEM_TOKEN_V2=0x...
```

**Functions to Whitelist:**
```
mint(address,uint256)
```

**Why:** Executives need to mint tokens gaslessly after donation approval

### 4. Add New TokenFaucet

**Contract Address:** (from your deployment)
```
TOKEN_FAUCET=0x...
```

**Functions to Whitelist:**
```
claimTokens()
```

**Why:** Users claim tokens from faucet gaslessly

### 5. Add New PurchaseRouter

**Contract Address:** (from your deployment)
```
PURCHASE_ROUTER=0x...
```

**Functions to Whitelist:**
```
purchaseWithSystemToken(string,uint256)
purchaseWithEth(string)
purchaseWithToken(string,address,uint256)
setProductDestination(string,uint8,address,uint256)
setTreasuryAuthorization(address,bool)
```

**Why:** Marketplace purchases need to work gaslessly

### 6. Add New PurchaseRouterDecentralized

**Contract Address:** (from your deployment)
```
PURCHASE_ROUTER_DECENTRALIZED=0x...
```

**Functions to Whitelist:**
```
purchaseWithSystemToken(string,uint256)
purchaseWithEth(string)
purchaseWithToken(string,address,uint256)
setProductDestination(string,uint8,address,uint256)
setTreasuryAuthorization(address,bool)
```

**Why:** Decentralized marketplace purchases need to work gaslessly

### 7. Optional: Keep Old Contracts Temporarily

During migration period, you may want to keep old contract addresses whitelisted:

```
OLD_SYSTEM_TOKEN=0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
OLD_TOKEN_FAUCET=0x189aA1FA8CC41A26944A0957015d9902057c1dbA
OLD_PURCHASE_ROUTER=0xCd39D4AE4fcf91e49591396Fd9f62019878f0b78
OLD_PURCHASE_ROUTER_DECENTRALIZED=0x2A2A62f313354f41E4bD0ff61bAd4DE85db722c9
```

This allows for smoother transition. Remove after migration is complete.

## Verification

After whitelisting, test gasless transactions:

### Test 1: Mint SystemTokenV2
```bash
# From executive dashboard
# Go to /executive/donations
# Approve a donation
# Click "Mint $SYSTEM Tokens"
# Should succeed without paying gas
```

### Test 2: Claim from Faucet
```bash
# Go to faucet page
# Click "Claim Tokens"
# Should succeed without paying gas
```

### Test 3: Purchase from Marketplace
```bash
# Go to marketplace
# Purchase a product with $SYSTEM
# Should succeed without paying gas
```

## Troubleshooting

### Error: "useroperation reverted: execution reverted"

**Cause:** Contract not whitelisted or function not whitelisted

**Fix:**
1. Check contract address is correct in paymaster
2. Check function signature is correct
3. Wait 5-10 minutes for whitelist to propagate

### Error: "failed to prepare calls"

**Cause:** Paymaster not configured in frontend

**Fix:**
1. Verify `useCdpPaymaster: true` in sendUserOperation
2. Check CDP API key is valid
3. Check network is correct (Base mainnet)

## Summary Checklist

- [ ] SystemTokenV2 address whitelisted
- [ ] SystemTokenV2 mint() function whitelisted
- [ ] TokenFaucet address whitelisted
- [ ] TokenFaucet claimTokens() whitelisted
- [ ] PurchaseRouter address whitelisted
- [ ] PurchaseRouter functions whitelisted
- [ ] PurchaseRouterDecentralized address whitelisted
- [ ] PurchaseRouterDecentralized functions whitelisted
- [ ] Test gasless minting (donations)
- [ ] Test gasless faucet claim
- [ ] Test gasless marketplace purchase

## Important Notes

⚠️ **Whitelist changes take 5-10 minutes to propagate**

⚠️ **Function signatures must match exactly** - use Basescan to verify

⚠️ **Test on testnet first** before updating mainnet paymaster

---

**After completing this step, proceed to updating environment variables.**

# Advocate NFT Mint Failures - Fix Ready

## Problem
5/10 Advocate NFT mints failed due to **Coinbase Smart Wallet + `_safeMint` incompatibility**.

## Root Cause
- Coinbase Smart Wallets are NOT deployed on-chain until first transaction
- `_safeMint` tries to call `onERC721Received` on recipient
- Undeployed wallets have no code ’ callback fails ’ tx reverts

## Failed Addresses
1. `0x62421b696132bb635feba0e3cb2f305637cb7ead` - Eric Miki
2. `0xe3ddfd2b214d51316533181248a4106f83e4934c` - Mariah McKay (Smart Wallet)
3. `0xaecf4d00f0e402fbeb0757f22be9062d89018106` - Tressa Rivers (Smart Wallet)
4. `0x0259c4b65866d8f9e596052dbcdfc142c28b6329` - René Pinnell
5. `0x12a0cf22d632c859b793f852af03b9d515580244` - Ron Rivers #2 (Smart Wallet)

## Fix (Ready to Execute)

### Script: `retry-failed-mints.ts`

**What it does:**
1. Sends 0.000001 ETH to each failed address (activates wallet)
2. Waits 5 seconds for settlement
3. Retries mint transaction
4. Should succeed for all 5 addresses

### Run the Fix

```bash
npx tsx scripts/retry-failed-mints.ts
```

**Cost:** ~$0.07 (5 × 0.000001 ETH + gas)

## After Fix

### Verify Success
```bash
npx tsx scripts/check-advocate-balance.ts
```

Should show **10/10 Beta Testers** with 1 Advocate NFT each.

### Notify Users
Email the 5 affected users to delegate their voting power:

> Visit https://spiritdao.org/governance
> Click "Delegate to Self"
> Confirm transaction (gasless)

## Status
 Root cause identified
 Fix script ready
ó **AWAITING EXECUTION**
ó Verification pending

## Files Created
- `scripts/diagnose-failed-mints.ts` - Diagnostic
- `scripts/retry-failed-mints.ts` - **Fix (run this)**
- `scripts/check-revert-reason.ts` - Debug tool

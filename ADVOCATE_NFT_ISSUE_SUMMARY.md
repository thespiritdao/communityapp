# Advocate NFT Airdrop Issue - Root Cause Analysis

## Summary

The Advocate NFT airdrop is failing because **the admin wallet lacks minting permissions** on the Advocate NFT contract.

---

## Error Details

**Error Signature:** `0x118cdaa7`
**Decoded Error:** `OwnableUnauthorizedAccount(address account)`

This is an OpenZeppelin Ownable error that occurs when a non-owner tries to call an owner-only function.

**Contract:** `0x592E560171D2a882474cdfc3BbeeDb21cEB4015d` (Advocate NFT)
**Admin Wallet Attempting Mint:** `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`
**Function:** `mint(address to, uint8 memberType, string uri)`

---

## Root Cause

The `mint()` function on the Advocate NFT contract is restricted to the contract owner only (via `onlyOwner` modifier from OpenZeppelin Ownable).

The admin wallet `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d` is **NOT** the owner of the Advocate NFT contract, so all mint attempts are reverting.

---

## Current State

- **Total Supply:** 1 Advocate NFT
- **Only 1 Beta Tester has NFT:** Ron Rivers (`0x12a0cf22d632c859b793f852af03b9d515580244`)
- **9 Beta Testers need NFTs:** All mint attempts failed due to permission error
- **Your test account:** `0xAECF4D00F0e402FbeB0757f22be9062d89018106` - Has 0 Advocate NFTs

---

## Solutions

### Option 1: Grant Minting Role to Admin Wallet (Recommended)

If the Advocate NFT contract has a minter role system:

1. Call `grantRole(MINTER_ROLE, 0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d)` from the contract owner
2. Re-run the airdrop script: `npx tsx scripts/airdrop-advocate-to-beta-testers.ts`

### Option 2: Transfer Ownership to Admin Wallet

If you want the admin wallet to have full control:

1. Call `transferOwnership(0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d)` from the current owner
2. Re-run the airdrop script

### Option 3: Use Contract Owner Wallet

Use the actual owner wallet's private key in `.env`:

1. Update `POD_ADMIN_PRIVATE_KEY` to the owner wallet's private key
2. Re-run the airdrop script

### Option 4: Manual Minting via Contract Owner

Have the contract owner manually mint to each Beta Tester:

1. Go to BaseScan contract page
2. Connect owner wallet
3. Call `mint(address, uint8, string)` for each Beta Tester
4. Use memberType = 0 (Standard Member)
5. Use empty string for uri parameter

---

## Verification Steps

### 1. Check Current Owner

```bash
# On BaseScan: https://basescan.org/address/0x592E560171D2a882474cdfc3BbeeDb21cEB4015d
# Read Contract -> owner()
```

### 2. After Granting Permissions

Verify the airdrop with:

```bash
npx tsx scripts/airdrop-advocate-to-beta-testers.ts
```

### 3. Verify Individual Balances

```bash
npx tsx scripts/check-advocate-balance.ts
```

(Update the `TEST_WALLET` variable in the script to check different addresses)

---

## Files Modified

1. ✅ `scripts/airdrop-advocate-to-beta-testers.ts` - Fixed mint function signature
2. ✅ `src/app/api/onboarding/mint-advocate/route.ts` - Fixed mint function signature
3. ✅ `scripts/check-advocate-balance.ts` - Created diagnostic tool
4. ⚠️ Database already has Advocate token configured correctly (ERC-721)

---

## Next Steps

1. **Identify the Advocate NFT contract owner**
2. **Grant minting permissions** to admin wallet (`0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`)
3. **Re-run airdrop** to mint to 9 remaining Beta Testers
4. **Verify balances** show in Identity page
5. **Test governance** proposal creation

---

## Important Notes

- ✅ The mint function signature has been corrected in both the airdrop script and onboarding API
- ✅ Advocate is correctly configured as ERC-721 in the database
- ❌ Admin wallet lacks permissions - **this is the blocking issue**
- The Advocate NFT contract has **auto-delegation disabled** by default, so users will need to manually delegate after receiving NFTs

---

## Commands Reference

```bash
# Check on-chain balance
npx tsx scripts/check-advocate-balance.ts

# Run airdrop (after fixing permissions)
npx tsx scripts/airdrop-advocate-to-beta-testers.ts

# View full output logs
cat airdrop-fixed-output.txt
```

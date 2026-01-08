# Complete Advocate + Governor Redeploy Guide

## Situation
- Current Advocate owner: `0x4156673c6bE8bc61c6fD042b4bD96e837dC42D` (old wallet, no access)
- Governor is hardcoded to use current Advocate address
- Only 1 NFT minted (minimal impact)
- Need to redeploy both contracts with proper ownership

---

## Deployment Order

**IMPORTANT:** Deploy in this order:
1. Deploy Advocate NFT first
2. Get the new Advocate address
3. Deploy Governor with new Advocate address
4. Update all configuration

---

## Step 1: Deploy New Advocate NFT

### In Remix:

1. Open https://remix.ethereum.org
2. Create file: `AdvocateMembership.sol`
3. Paste contents from `contracts/AdvocateMembership.sol`
4. Compile (Solidity 0.8.20)
5. Deploy to **Base Mainnet** with:
   - `name_`: "Advocate Membership"
   - `symbol_`: "ADVOCATE"
   - `baseTokenURI_`: "https://spiritdao.org/api/metadata/" (or your metadata URI)
6. **COPY THE NEW CONTRACT ADDRESS**
7. Call `setAutoDelegationEnabled(true)` on the new contract

### Verify on BaseScan:

1. Go to https://basescan.org/verifyContract
2. Enter new Advocate address
3. Compiler: v0.8.20
4. Optimization: Enabled, 200 runs
5. Flatten the contract:
   ```bash
   # In Remix, right-click AdvocateMembership.sol -> "Flatten"
   # Copy the flattened code
   ```
6. Paste flattened code and verify

**Save this address as:** `NEW_ADVOCATE_ADDRESS`

---

## Step 2: Deploy New Governor

### Find Your Governor Contract

```bash
# Search for Governor contract source
```

Let me check if you have the Governor source code...

### Governor Deployment Parameters

You'll need these from the old Governor:
- Name: "SpiritDAO Governor"
- Voting Delay: 1 block
- Voting Period: 7200 blocks (1 day on Base)
- Proposal Threshold: 1
- Quorum: (check old Governor)
- **Token:** NEW_ADVOCATE_ADDRESS (from Step 1)

### In Remix:

1. Compile your Governor contract
2. Deploy with parameters above
3. **COPY THE NEW GOVERNOR ADDRESS**
4. Verify on BaseScan

**Save this address as:** `NEW_GOVERNOR_ADDRESS`

---

## Step 3: Update Configuration

### 3A: Update `.env`

```bash
# OLD:
NEXT_PUBLIC_ADVOCATE=0x592E560171D2a882474cdfc3BbeeDb21cEB4015d
NEXT_PUBLIC_DAO_GOVERNOR=0x838eCf5cF90C31713Ed281Dc4F09DbBADA5e6813

# NEW:
NEXT_PUBLIC_ADVOCATE=NEW_ADVOCATE_ADDRESS
NEXT_PUBLIC_DAO_GOVERNOR=NEW_GOVERNOR_ADDRESS
```

### 3B: Update Database

```sql
-- Update Advocate NFT address in tokens table
UPDATE tokens
SET contract_address = 'NEW_ADVOCATE_ADDRESS'
WHERE id = 'advocate';

-- Verify update
SELECT * FROM tokens WHERE id = 'advocate';
```

### 3C: Update Paymaster Whitelist (If Applicable)

If using contract whitelisting for CDP Paymaster:

1. Go to https://portal.cdp.coinbase.com/
2. Navigate to Paymaster settings
3. Add `NEW_ADVOCATE_ADDRESS` to whitelist
4. Add `NEW_GOVERNOR_ADDRESS` to whitelist
5. Remove old addresses (optional)

---

## Step 4: Restart Application

```bash
# Kill dev server (Ctrl+C)
# Restart
npm run dev
```

---

## Step 5: Mint Advocate NFTs to Beta Testers

```bash
npx tsx scripts/airdrop-advocate-to-beta-testers.ts
```

This will mint to all 10 Beta Testers with the NEW contract.

---

## Step 6: Verify Everything Works

### Check Advocate NFT:

```bash
npx tsx scripts/check-advocate-balance.ts
```

### Check Governor Config:

```bash
npx tsx scripts/check-governor-config.ts
```

Should show:
- Voting Token: NEW_ADVOCATE_ADDRESS ✅

### Test in App:

1. Go to http://localhost:3000/identity
2. Should show Advocate NFT under Credentials
3. Go to http://localhost:3000/governance
4. Should be able to create proposal

---

## Cleanup

### Old Contracts (Optional)

The old contracts will still exist on-chain but won't be used:
- Old Advocate: `0x592E560171D2a882474cdfc3BbeeDb21cEB4015d`
- Old Governor: `0x838eCf5cF90C31713Ed281Dc4F09DbBADA5e6813`

You can leave them or update your database to mark them as inactive.

---

## Quick Reference

### Files to Update:
- ✅ `.env` - Both contract addresses
- ✅ Database `tokens` table - Advocate address
- ⚠️ Paymaster whitelist (if using)

### Scripts to Run After:
```bash
npx tsx scripts/airdrop-advocate-to-beta-testers.ts
npx tsx scripts/check-advocate-balance.ts
npx tsx scripts/check-governor-config.ts
```

### Contracts to Deploy:
1. AdvocateMembership.sol → Get address → Use in Governor
2. Governor.sol (with new Advocate address)

---

## Estimated Time

- Deploy Advocate: 5 min
- Verify Advocate: 5 min
- Deploy Governor: 5 min
- Verify Governor: 5 min
- Update config: 5 min
- Run airdrop: 5 min
- Test: 5 min

**Total: ~35 minutes**

---

## Need Governor Source Code?

Do you have your Governor contract source code?

If not, I can help you:
1. Find it in your codebase
2. Recreate it from the ABI
3. Use a standard OpenZeppelin Governor template

Let me check if you have it...

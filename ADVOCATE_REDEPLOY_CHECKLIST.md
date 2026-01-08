# Advocate NFT Redeploy Checklist

## Why Redeploy is OK

✅ **Only 1 NFT minted** (to one Beta Tester)
✅ **Contract not verified** (easier to replace)
✅ **You control deployment** (can set correct owner from start)
✅ **Faster than debugging ownership** (saves time)

---

## What Needs to be Updated After Redeploy

### 1. Database (Supabase)

**Table: `tokens`**

```sql
-- Update the Advocate NFT contract address
UPDATE tokens
SET contract_address = '0xNEW_ADVOCATE_ADDRESS_HERE'
WHERE id = 'advocate';
```

### 2. Environment Variables

**File: `.env`**

```bash
# Update this line
NEXT_PUBLIC_ADVOCATE=0xNEW_ADVOCATE_ADDRESS_HERE
```

### 3. Coinbase Paymaster (If Using Whitelist)

If you have a contract whitelist for the CDP Paymaster, you need to:

**Option A: Via CDP Dashboard**
1. Go to https://portal.cdp.coinbase.com/
2. Navigate to Paymaster settings
3. Add new contract address to whitelist

**Option B: Via API/Script**
- Check if you have paymaster configuration in your codebase
- Update the whitelist array

**File to check:** `src/utils/paymaster.ts` or similar

### 4. Governor Contract (CRITICAL)

**Issue:** Your Governor contract is probably configured to use the OLD Advocate NFT address as the voting token.

**You'll need to:**

**Option A: Redeploy Governor Too**
- Redeploy Governor with new Advocate address
- Update all references to Governor address
- Migrate any existing proposals (if any)

**Option B: If Governor is Upgradeable**
- Upgrade Governor to point to new Advocate address
- Requires Governor to have an upgrade function

**Option C: Check if Governor Uses Interface**
- Some Governors query voting power dynamically
- May just work if you update the token getter

**Let me check your Governor contract:**

---

## Files That Reference ADVOCATE Address

Let me search for all files that need updating:

```bash
# These files will need the new address:
.env
scripts/airdrop-advocate-to-beta-testers.ts
src/app/api/onboarding/mint-advocate/route.ts
migrations/add_advocate_nft_token.sql (if you run it)
migrations/fix_advocate_token_type.sql (if you run it)
```

---

## Deployment Steps

### Step 1: Deploy New Advocate Contract

**In Remix:**
1. Compile `contracts/AdvocateMembership.sol`
2. Set deployment parameters:
   - `name`: "Advocate Membership"
   - `symbol`: "ADVOCATE"
   - `baseTokenURI`: "https://example.com/api/metadata/" (or your actual metadata URI)
3. Deploy to **Base Mainnet**
4. **Copy the new contract address**
5. **Verify the contract** on BaseScan (important!)

### Step 2: Verify Contract on BaseScan

1. Go to: https://basescan.org/verifyContract
2. Enter new contract address
3. Select:
   - Compiler: v0.8.20
   - Optimization: Yes (200 runs) - or whatever you used
4. Paste the flattened contract code
5. Submit verification

### Step 3: Enable Auto-Delegation (Optional but Recommended)

Call `setAutoDelegationEnabled(true)` on the new contract so new mints automatically delegate.

### Step 4: Update All References

1. Update `.env`:
   ```bash
   NEXT_PUBLIC_ADVOCATE=0xNEW_ADDRESS
   ```

2. Update database:
   ```sql
   UPDATE tokens SET contract_address = '0xNEW_ADDRESS' WHERE id = 'advocate';
   ```

3. Restart your dev server:
   ```bash
   # Kill current server, then:
   npm run dev
   ```

### Step 5: Re-run Airdrop Script

```bash
npx tsx scripts/airdrop-advocate-to-beta-testers.ts
```

This will mint to all 10 Beta Testers (including the one who already had one from the old contract).

### Step 6: Handle the One Existing NFT Holder

**Ron Rivers** (`0x12a0cf22d632c859b793f852af03b9d515580244`) has 1 NFT from the old contract.

**Options:**
1. **Mint him a new one** - He'll have both (old one is worthless now)
2. **Ignore it** - Old NFT won't work with Governor anyway
3. **Burn the old one** - If the old contract allows it

**Recommendation:** Just mint him a new one. The old one will be ignored by the system.

---

## Governor Contract Investigation

**CRITICAL:** Check your Governor contract:

```bash
# Check what token the Governor uses for voting power
npx tsx scripts/check-governor-token.ts
```

Let me create that script for you...

---

## Risks & Considerations

### Low Risk ✅
- Advocate NFT is new (only 1 minted)
- No governance proposals exist yet (I assume)
- Easy to update references
- Can verify new contract properly

### Medium Risk ⚠️
- Governor contract integration
- Need to update Paymaster whitelist
- Any hardcoded references in smart contracts

### High Risk ❌
- If there are existing active proposals using old Advocate NFT
- If Governor is not upgradeable and uses old address
- If other contracts reference the old Advocate address

---

## Alternative: Quick Ownership Fix

If you just want to get the old contract working:

**Find the owner wallet:**
1. Check `.env` for old private keys
2. Check deployment transaction on BaseScan
3. Look at who deployed the contract initially

**Then:**
1. Import that wallet to MetaMask
2. Transfer ownership via script
3. Run airdrop

---

## My Recommendation

**Redeploy if:**
- You don't know who owns the current contract
- You want a clean, verified contract
- You're OK updating the Governor (or it's not deployed yet)

**Debug ownership if:**
- Governor is already deployed and uses old Advocate
- There are active proposals
- Other contracts reference old Advocate address

---

## Questions to Answer Before Deciding

1. **Is the Governor contract deployed?** If yes, what address?
2. **Are there any active governance proposals?**
3. **Do you have access to the original deployer wallet?**
4. **Is the Governor upgradeable?**

Let me check your codebase for the Governor...

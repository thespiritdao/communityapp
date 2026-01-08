# Advocate NFT Airdrop Troubleshooting

## Issues Identified

### 1. Advocate NFT Not Showing on Identity Page

**Problem:** After successful airdrop, Advocate NFT doesn't display on `/identity` page under Memberships or Credentials.

**Root Cause:** The Identity page uses `DatabaseTokenGallery` component which loads tokens from the Supabase `tokens` table. The Advocate NFT contract was not added to this table.

**Solution:** Run the migration to add Advocate NFT to the tokens table.

```bash
# Execute this SQL in Supabase SQL Editor:
# File: migrations/add_advocate_nft_token.sql
```

**What the migration does:**
- Adds Advocate NFT (0x592E560171D2a882474cdfc3BbeeDb21cEB4015d) to `tokens` table
- Sets `token_type` to `erc20` (Advocate is an ERC-20 governance token)
- Uses default Spirit DAO symbol image
- Marks as active and available for display

### 2. Governance Permission Check Failing

**Problem:** Console logs show `hasGovernancePermission: false` even after receiving Beta Tester HAT.

**Possible Causes:**
1. User doesn't have Beta Tester role in database
2. `pod_role_permissions` table not updated
3. `useHatPermissions` hook not loading correctly
4. Wallet address mismatch

**Diagnostic Steps:**

#### Check 1: Verify Beta Tester HAT ownership on-chain
```typescript
// Check if user actually owns Beta Tester HAT on Base
// Beta Tester HAT ID: 0x000000880001000b00000000000000000000000000000000000000000000000a
// Contract: 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137 (Hats Protocol)

// On BaseScan: https://basescan.org/address/0x3bc1A0Ad72417f2d411118085256fC53CBdDd137
// Call balanceOf(address account, uint256 id)
// address = your wallet
// id = 0x000000880001000b00000000000000000000000000000000000000000000000a
```

#### Check 2: Verify database entry in `pod_role_permissions`
```sql
SELECT
  prp.role_name,
  prp.permissions,
  prp.token_address,
  prp.is_active,
  p.name as pod_name
FROM pod_role_permissions prp
JOIN pods p ON prp.pod_id = p.id
WHERE prp.token_address = '0xAECF4D00F0e402FbeB0757f22be9062d89018106' -- Your wallet
  AND prp.is_active = true;
```

Expected result:
```
role_name: "Beta Tester"
permissions: { "governanceParticipation": true, ... }
is_active: true
pod_name: "Beta Testers"
```

#### Check 3: Verify wallet address extraction
The governance page uses `useEvmAddress()` hook to get wallet address. Check console logs for:
```javascript
🏛️ Governance Permission Check: {
  address: "0x...",
  hasGovernancePermission: boolean,
  hatPermissions: {...},
  userRolesCount: number
}
```

If `address` is undefined or incorrect, the permission check will fail.

### 3. Airdrop Script Showing "0 Successfully Airdropped"

**Problem:** Script shows all Beta Testers already have NFTs or failed minting.

**Analysis:** From your logs:
```
✅ Successfully Airdropped: 0
ℹ️ Already Had NFTs: 1 (your test account)
```

This indicates:
- Your test account (0xAECF4D00F0e402FbeB0757f22be9062d89018106) already had 1 Advocate NFT before running the script
- The script correctly detected this and skipped minting
- Other Beta Testers may have failed or also already had NFTs

**Next Step:** Check the full airdrop output to see individual results for each Beta Tester.

---

## Quick Fix Checklist

### Step 1: Add Advocate NFT to Database
```bash
# Run this SQL in Supabase SQL Editor
INSERT INTO tokens (
  name,
  description,
  contract_address,
  token_type,
  token_image,
  is_active,
  created_at
) VALUES (
  'Advocate NFT',
  'Governance voting token that grants proposal creation rights',
  '0x592E560171D2a882474cdfc3BbeeDb21cEB4015d',
  'erc20',
  '/images/symbolobinfin.png',
  true,
  NOW()
)
ON CONFLICT (contract_address)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  token_type = EXCLUDED.token_type,
  is_active = true;
```

### Step 2: Verify On-Chain Advocate NFT Balance
```bash
# Check balance on BaseScan:
# 1. Go to https://basescan.org/address/0x592E560171D2a882474cdfc3BbeeDb21cEB4015d
# 2. Click "Read Contract"
# 3. Find "balanceOf" function
# 4. Enter your wallet address
# 5. Expected result: 1 (or greater)
```

### Step 3: Verify Beta Tester HAT Ownership
```bash
# Check HAT ownership on BaseScan:
# 1. Go to https://basescan.org/address/0x3bc1A0Ad72417f2d411118085256fC53CBdDd137
# 2. Click "Read Contract"
# 3. Find "balanceOf" function (ERC-1155)
# 4. Enter:
#    - account: Your wallet address
#    - id: 0x000000880001000b00000000000000000000000000000000000000000000000a
# 5. Expected result: 1
```

### Step 4: Check Database Beta Tester Entry
```sql
-- Run this in Supabase SQL Editor
SELECT
  prp.role_name,
  prp.permissions,
  prp.token_address,
  prp.is_active,
  p.name as pod_name
FROM pod_role_permissions prp
JOIN pods p ON prp.pod_id = p.id
WHERE prp.token_address = '0xAECF4D00F0e402FbeB0757f22be9062d89018106'
  AND prp.is_active = true;
```

### Step 5: Refresh Identity Page
After running the migration:
1. Hard refresh the Identity page (Ctrl+Shift+R)
2. Check that Advocate NFT appears under Credentials section
3. Verify the balance shows 1

### Step 6: Re-test Governance Proposal Creation
1. Go to `/governance` page
2. Check browser console for permission logs
3. Verify `hasGovernancePermission: true`
4. Try creating a proposal

---

## Expected Behavior After Fixes

### Identity Page (`/identity`)
- **Credentials Section:** Shows "Advocate NFT" with balance 1
- **Memberships Section:** Shows "Beta Tester" HAT

### Governance Page (`/governance`)
- Console shows: `hasGovernancePermission: true`
- "Create Proposal" button enabled
- Can select "Beta Testers Pod" in "Accessible To" dropdown
- Proposal submission succeeds (no on-chain revert)

---

## Files Modified

1. ✅ `migrations/add_advocate_nft_token.sql` (NEW)
2. ✅ `ADVOCATE_NFT_TROUBLESHOOTING.md` (NEW - this file)

---

## Next Actions

1. Run the SQL migration in Supabase to add Advocate NFT to tokens table
2. Verify on-chain balances for both Advocate NFT and Beta Tester HAT
3. Check database entries for Beta Tester role
4. Test Identity page displays Advocate NFT
5. Test Governance page proposal creation

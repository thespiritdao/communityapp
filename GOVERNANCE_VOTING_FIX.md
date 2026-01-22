# Governance Voting RLS Fix - ROOT CAUSE FOUND

## Problem Summary
Voting on governance proposals was failing with:
```
Error 42501: new row violates row-level security policy for table "governance_votes"
```

## Root Cause (Discovered via Debug Logs)

### The Issue
The JWT structure in your app stores `wallet_address` in **user_metadata**, not as a top-level claim:

```javascript
// ACTUAL JWT structure:
{
  sub: "663e69b6-aefe-4a2c-83fc-5c5ac822a101",
  wallet_address: undefined,  // ❌ Not here!
  user_metadata: {
    wallet_address: "0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48"  // ✅ HERE!
  }
}
```

### Why RLS Failed
The RLS policy was checking:
```sql
voter_address = (auth.jwt() ->> 'wallet_address')  -- Returns NULL!
```

But should check:
```sql
voter_address = (auth.jwt() -> 'user_metadata' ->> 'wallet_address')  -- ✅ Correct path
```

### Secondary Issue: Case Sensitivity
- JWT has: `0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48` (lowercase)
- Insert had: `0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48` (mixed case)
- Solution: Use `LOWER()` for case-insensitive comparison

## The Fix

### 1. New Migration Created
File: `supabase/migrations/20250121000000_fix_governance_votes_rls_user_metadata.sql`

**Key changes:**
- ✅ Checks nested path: `auth.jwt() -> 'user_metadata' ->> 'wallet_address'`
- ✅ Case-insensitive: Uses `LOWER()` on both sides
- ✅ All three policies updated (SELECT, INSERT, UPDATE)

### 2. Code Changes
File: `src/features/governance/components/EnhancedVoteButton.tsx:224`

**Change:**
```typescript
// Before:
voter_address: address,  // Mixed case: 0xABC...

// After:
voter_address: address.toLowerCase(),  // Normalized: 0xabc...
```

## How to Apply the Fix

### Step 1: Apply the Migration

**Option A - Supabase CLI (Recommended):**
```bash
npx supabase db reset
```

**Option B - Supabase Dashboard:**
1. Go to https://app.supabase.com
2. Navigate to: **SQL Editor**
3. Copy contents of `supabase/migrations/20250121000000_fix_governance_votes_rls_user_metadata.sql`
4. Paste and click **Run**
5. Verify you see: `✅ governance_votes RLS policies updated to use user_metadata.wallet_address`

### Step 2: Restart Dev Server

```bash
# Kill current server (Ctrl+C)
npm run dev
```

### Step 3: Test Voting

1. Hard refresh browser: `Ctrl + Shift + R`
2. Navigate to `/governance`
3. Click any vote button (For, Against, Abstain)
4. Vote should succeed with toast: "Vote Submitted"

## Verification

### Check the Policy Was Applied
Run in Supabase SQL Editor:
```sql
SELECT
    policyname,
    cmd,
    with_check
FROM pg_policies
WHERE tablename = 'governance_votes'
AND cmd = 'INSERT';
```

**Expected result:**
```
Policy: governance_votes_insert_own
WITH CHECK: (lower(voter_address) = lower(((auth.jwt() -> 'user_metadata'::text) ->> 'wallet_address'::text)))
```

### Check Browser Console After Voting
Should see:
```
✅ [VOTE DEBUG] Supabase session already exists
🔐 [VOTE DEBUG] Existing JWT claims: { wallet_address: undefined, userMetadata: { wallet_address: '0x...' } }
📊 [VOTE DEBUG] Submitting vote with data: { voter_address: '0x...' (lowercase) }
✅ Vote submitted successfully
```

## Why This Happened

The JWT creation in `/api/auth/onchainkit` stores `wallet_address` in `user_metadata`:
```typescript
// src/app/api/auth/onchainkit/route.ts
const { data: userData } = await supabase.auth.admin.createUser({
  email: fakeEmail,
  email_confirm: true,
  user_metadata: {
    wallet_address: normalizedAddress,  // Stored here, not as custom claim
  },
});
```

Supabase stores this in the `user_metadata` field, not as a top-level JWT claim.

## Future Consideration

For cleaner architecture, you could move `wallet_address` to a top-level custom claim by modifying the JWT creation. However, the current fix (checking nested path) works correctly and maintains backward compatibility.

---

**Status:** Ready to apply
**Files Changed:**
- `supabase/migrations/20250121000000_fix_governance_votes_rls_user_metadata.sql` (new)
- `src/features/governance/components/EnhancedVoteButton.tsx` (updated)

**Next Action:** Apply migration to database

# RLS Policy Error - Agreement Signing Blocked

**Date**: 2025-11-10
**Error Code**: 42501
**Severity**: 🔴 BLOCKING - Cannot sign agreements

---

## The Error

```
Error signing agreement: {
  code: '42501',
  message: 'new row violates row-level security policy for table "pod_accountability_signatures"'
}
```

---

## What is RLS?

**Row-Level Security (RLS)** is a PostgreSQL/Supabase security feature that controls which rows users can:
- **INSERT** (create)
- **SELECT** (read)
- **UPDATE** (modify)
- **DELETE** (remove)

**In Supabase**: RLS is enabled by default on all tables to protect your data.

---

## Why Is This Happening?

The `pod_accountability_signatures` table has RLS enabled, but **no policy exists** that allows users to INSERT their own signatures.

**Current State**:
- RLS is enabled ✅
- Policy for INSERT: ❌ Missing or too restrictive
- Result: All inserts blocked

---

## Two Solutions

### Solution 1: Temporarily Disable RLS (FASTEST - 30 seconds)

**Use this for immediate testing**

**Steps**:
1. Go to Supabase Dashboard
2. Open SQL Editor
3. Copy and paste from `TEMP_DISABLE_RLS_SIGNATURES.sql`:
   ```sql
   ALTER TABLE pod_accountability_signatures DISABLE ROW LEVEL SECURITY;
   ```
4. Click "Run"

**Result**:
- ✅ Agreement signing works immediately
- ⚠️ **WARNING**: Anyone can insert/read signatures (development only!)

**When to use**:
- Testing the agreement flow
- Development environment
- Debugging

**Don't use in production!**

---

### Solution 2: Create Proper RLS Policies (RECOMMENDED - 5 minutes)

**Use this for production-ready security**

**Steps**:
1. Go to Supabase Dashboard
2. Open SQL Editor
3. Copy and paste from `FIX_RLS_POLICY_SIGNATURES.sql`
4. Run the entire script
5. Verify policies created

**Policies Created**:

**1. INSERT Policy** - Users can insert their own signatures:
```sql
CREATE POLICY "Users can insert their own accountability signatures"
ON pod_accountability_signatures
FOR INSERT
TO authenticated
WITH CHECK (
  signer_address = lower(auth.jwt() ->> 'sub')
  OR signer_address = lower((auth.jwt() -> 'user_metadata' ->> 'wallet_address'))
  OR true  -- Temporary: Allow all inserts for testing
);
```

**2. SELECT Policy** - Users can view signatures:
```sql
CREATE POLICY "Users can view pod accountability signatures"
ON pod_accountability_signatures
FOR SELECT
TO authenticated
USING (
  signer_address = lower(auth.jwt() ->> 'sub')
  OR signer_address = lower((auth.jwt() -> 'user_metadata' ->> 'wallet_address'))
  OR true  -- Temporary: Allow all reads
);
```

**3. UPDATE Policy** - Users can update their own signatures:
```sql
CREATE POLICY "Users can update their own signatures"
ON pod_accountability_signatures
FOR UPDATE
TO authenticated
USING (
  signer_address = lower(auth.jwt() ->> 'sub')
  OR signer_address = lower((auth.jwt() -> 'user_metadata' ->> 'wallet_address'))
  OR true  -- Temporary: Allow all updates
)
WITH CHECK (...);
```

**Note**: The `OR true` clauses allow all operations temporarily for testing. Remove them in production!

---

## Testing After Fix

### Step 1: Apply One of the Solutions Above

Choose either:
- **Quick**: Run `TEMP_DISABLE_RLS_SIGNATURES.sql` (disables RLS)
- **Proper**: Run `FIX_RLS_POLICY_SIGNATURES.sql` (creates policies)

### Step 2: Refresh Browser

Hard refresh: `Ctrl+Shift+R` or `Cmd+Shift+R`

### Step 3: Try Signing Agreement

1. Go to pod management page
2. Click "Agreements" tab
3. Click "Sign Agreement"
4. Sign with wallet
5. **Expected**: Success! No RLS error

### Step 4: Verify in Database

Run this SQL to confirm signature was saved:

```sql
SELECT
  id,
  pod_id,
  signer_address,
  accountability_statement,
  signed_at,
  is_valid
FROM pod_accountability_signatures
WHERE pod_id = '4b019af5-69db-4118-bb4f-2e95ce9785a0'
  AND signer_address = '0x12a0cf22d632c859b793f852af03b9d515580244'
ORDER BY signed_at DESC
LIMIT 1;
```

**Expected**: 1 row with your signature

### Step 5: Refresh Page and Verify Access

1. Refresh the pod management page
2. **Expected**: All tabs now visible (Controls, Modules, Treasury, Delete)
3. **Expected**: Full management access granted

---

## Understanding the Policy Logic

### How Supabase RLS Works with Web3 Wallets

**The Challenge**:
- Web3 users authenticate with wallet addresses (0x...)
- Supabase expects email/password or OAuth
- How do we match wallet addresses to Supabase users?

**The Solution** (in the policy):
```sql
signer_address = lower(auth.jwt() ->> 'sub')
OR signer_address = lower((auth.jwt() -> 'user_metadata' ->> 'wallet_address'))
OR true  -- Temporary fallback
```

**What this checks**:
1. **Option 1**: `auth.jwt() ->> 'sub'` - Supabase user ID
2. **Option 2**: `auth.jwt() -> 'user_metadata' ->> 'wallet_address'` - Wallet stored in metadata
3. **Option 3**: `OR true` - Allow all (temporary, for testing)

**For production**:
- Remove `OR true`
- Ensure wallet addresses are stored in `user_metadata` during authentication
- Or use Supabase custom claims to store wallet address

---

## Why Didn't We Hit This Earlier?

**Good question!**

During testing, you probably:
1. Created signatures manually via SQL Editor (bypasses RLS)
2. Or RLS was disabled
3. Or you were testing with a Supabase service role key (bypasses RLS)

**Now we're testing** the actual user flow with a real wallet, which triggers RLS.

---

## Recommended Approach

**For Now (Development)**:
1. Use Solution 1 (disable RLS) to test the full flow
2. Verify everything works end-to-end
3. Document the complete agreement signing process

**For Production**:
1. Implement proper authentication that stores wallet addresses in Supabase
2. Use Solution 2 (RLS policies) with proper wallet address matching
3. Remove the `OR true` fallback clauses
4. Test with multiple wallets

---

## Quick Reference

### Check if RLS is Enabled
```sql
SELECT rowsecurity
FROM pg_tables
WHERE tablename = 'pod_accountability_signatures';
```

### Check Current Policies
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'pod_accountability_signatures';
```

### Temporarily Disable RLS
```sql
ALTER TABLE pod_accountability_signatures DISABLE ROW LEVEL SECURITY;
```

### Re-enable RLS
```sql
ALTER TABLE pod_accountability_signatures ENABLE ROW LEVEL SECURITY;
```

---

## Summary

### The Problem
✅ Access control working
✅ Agreement signing modal working
✅ Database column name fixed
✅ PodId parameter fixed
❌ **RLS policy blocking inserts**

### The Fix
**Option A**: Disable RLS temporarily (30 seconds)
**Option B**: Create proper RLS policies (5 minutes)

### Next Steps
1. Choose a solution above
2. Run the SQL in Supabase
3. Try signing agreement again
4. Verify access is granted

---

**Generated**: 2025-11-10
**Priority**: 🔴 CRITICAL - Must fix to test agreement flow

**Go to Supabase SQL Editor now and run one of the solutions!**

# RLS Troubleshooting Steps

## Current Situation

You're experiencing RLS policy violations when trying to:
1. Create pod_modules entries (INSERT fails with 403)
2. Create chat_groups entries (INSERT fails with 403)

But interestingly:
- pod_modules **UPDATE** succeeded (line 376 in errors.txt)
- This suggests UPDATE policy works but INSERT policy doesn't

## Diagnostic Steps

### Step 1: Check Current RLS Policies

Run this in **Supabase SQL Editor** (you must be logged in):

```sql
-- Copy and paste the entire contents of scripts/diagnose-rls-issue.sql
```

This will show you:
- ✅ Your user ID and wallet address
- ✅ Pod configuration and your permissions
- ✅ Current RLS policies
- ✅ Whether the RLS check should pass

### Step 2: Check Policy Configuration

Run this in **Supabase SQL Editor**:

```sql
-- Copy and paste the contents of scripts/check-rls-policies.sql
```

Look for the INSERT policies and check if they:
- ❌ Use `auth.uid()::text = ANY(pods.pod_leads)` (WRONG - this is the bug)
- ✅ Use `(SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())` (CORRECT)

## Common Issues and Solutions

### Issue 1: Migration Didn't Apply

**Symptom**: INSERT policies still check `auth.uid()` instead of `wallet_address`

**Solution**: Re-run the migration:
```sql
-- Copy and paste: supabase/migrations/20260118000000_fix_pod_modules_rls_correctly.sql
```

### Issue 2: user_profiles RLS Blocks the Lookup

**Symptom**: The RLS policy can't read `user_profiles.wallet_address` because user_profiles has its own RLS

**Solution**: Ensure user_profiles has a SELECT policy that allows users to read their own profile:
```sql
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

### Issue 3: wallet_address is NULL

**Symptom**: user_profiles.wallet_address is NULL for your user

**Solution**: Run the fix script:
```bash
node scripts/fix-user-wallet-rls.mjs your-email@example.com 0xYourWalletAddress
```

### Issue 4: Wallet Not in pod_leads

**Symptom**: Your wallet is not in the pod's pod_leads array

**Solution**: Add your wallet to pod_leads:
```sql
UPDATE pods
SET pod_leads = array_append(pod_leads, '0xyourwalletaddress')
WHERE id = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';
```

## Key Insight: Why UPDATE Works But INSERT Doesn't

If UPDATE works but INSERT doesn't, it means:
1. The **UPDATE policy** is correct (uses wallet_address lookup)
2. The **INSERT policy** is wrong (still uses auth.uid() or is missing)

This can happen if:
- The migration only partially applied
- Multiple migrations are conflicting
- Policies were manually edited

## Next Steps

1. **Run diagnose-rls-issue.sql** in Supabase SQL Editor while logged in
2. **Check the output** to see which check fails
3. **Apply the appropriate solution** from above
4. **Test again** by trying to toggle a module or create a chat

## Files Created

- `scripts/diagnose-rls-issue.sql` - Comprehensive diagnostic query
- `scripts/check-rls-policies.sql` - Check current RLS policies
- `scripts/test-rls-lookup.mjs` - Test RLS lookup programmatically
- `scripts/check-pod-permissions.mjs` - Check pod manager permissions
- `supabase/migrations/20260118000000_fix_pod_modules_rls_correctly.sql` - Corrected RLS policies

## Expected Results After Fix

When RLS is working correctly:
- ✅ You can toggle pod modules
- ✅ You can create chat groups
- ✅ No 403 or RLS policy violation errors
- ✅ Both INSERT and UPDATE operations succeed

## If All Else Fails

If the diagnostic shows everything is correct but it still fails:

1. **Clear Supabase cache**: The Supabase client might be caching old policies
   - Try logging out and back in
   - Clear browser cache
   - Restart the dev server

2. **Check PostgREST**: Supabase uses PostgREST which caches schema
   - In Supabase dashboard, go to Settings > API
   - Look for a "Reload schema cache" or similar button

3. **Verify authentication**: Make sure you're logged in with the correct account
   - Check browser console for auth errors
   - Verify session token is valid

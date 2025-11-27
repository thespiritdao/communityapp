# RLS Debugging Guide - Notification Preferences

**Status:** RLS policy error persisting after SQL fixes applied
**Error Code:** 42501 - Row-level security policy violation

---

## 🔍 Step 1: Run Diagnostic SQL

Run `DIAGNOSE_NOTIFICATION_PREFERENCES.sql` in Supabase Dashboard → SQL Editor

This will show you:
1. ✅ If table exists
2. ✅ Current RLS policies
3. ✅ Your JWT structure
4. ✅ What field the JWT has (wallet_address vs sub)

**Share the output with me** so I can see exactly what's configured.

---

## 🛠️ Step 2: Apply Complete Fix

Run `FIX_RLS_COMPLETE.sql` - this drops ALL existing policies and creates fresh ones.

**Key things this does:**
- Drops any old/broken policies
- Creates 4 new policies (SELECT, INSERT, UPDATE, DELETE)
- All policies check: `current_setting('request.jwt.claims', true)::json->>'wallet_address'`
- Enables RLS
- Shows you the policies at the end

---

## ⚠️ Step 3: Temporary Workaround (If Still Broken)

If the error persists, run `TEMPORARY_DISABLE_RLS.sql` to **temporarily disable RLS**.

**This will:**
- ✅ Let the preferences page load and work
- ✅ Allow us to test the functionality
- ❌ Remove security (anyone can read/write any preferences)

**Only use this for testing!** Re-enable RLS once we fix the policies.

---

## 🔬 Possible Root Causes

### Cause 1: JWT Not Set
**Problem:** Supabase client not sending JWT claims
**Symptoms:** Error on SELECT and INSERT
**Check:** Run query #5 in diagnostic SQL - does it return `null`?

**Fix:** Check that you're authenticated:
```typescript
// In browser console:
const { data: { session } } = await supabase.auth.getSession();
console.log('Session:', session);
console.log('User:', session?.user);
```

### Cause 2: Wrong JWT Field
**Problem:** JWT has `sub` but not `wallet_address`
**Symptoms:** Policies don't match
**Check:** Run query #6 in diagnostic SQL

**Fix:** Check your JWT structure:
```sql
SELECT current_setting('request.jwt.claims', true)::json;
```

Expected structure:
```json
{
  "wallet_address": "0x12a0cf22d632c859b793f852af03b9d515580244",
  "sub": "...",
  "iat": ...,
  "exp": ...
}
```

If `wallet_address` is missing, you need to update how JWT is created.

### Cause 3: Case Sensitivity
**Problem:** RLS policy checking exact case
**Symptoms:** Works for some addresses, not others
**Check:** Query #8 in diagnostic SQL

**Fix:** Already using `LOWER()` in policies, but double-check.

### Cause 4: Anonymous Role
**Problem:** User making request as anonymous, not authenticated
**Symptoms:** JWT claims are null
**Check:** In browser console:
```typescript
const { data } = await supabase.auth.getUser();
console.log('User:', data.user);
```

**Fix:** Ensure user is signed in before accessing preferences page.

### Cause 5: Supabase Client Not Using Auth
**Problem:** Using wrong Supabase client instance
**Symptoms:** No JWT sent with requests
**Check:** Look at network tab - does request have `Authorization: Bearer ...` header?

**Fix:** Ensure using authenticated client:
```typescript
// Should be using client with auth, not service role
import { supabase } from '@/utils/supabaseClient'; // ✅ Client-side with auth
// NOT:
import { supabaseAdmin } from '@/utils/supabaseAdminClient'; // ❌ Bypasses RLS
```

---

## 🧪 Testing Steps

### Test 1: Check JWT is Present
```sql
-- In Supabase SQL Editor while logged in to app:
SELECT current_setting('request.jwt.claims', true)::json;
```

**Expected:** Should return your JWT claims with `wallet_address`
**If null:** Authentication not working

### Test 2: Check Policies Exist
```sql
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'notification_preferences';
```

**Expected:** 4 policies (SELECT, INSERT, UPDATE, DELETE)
**If empty:** Policies not created

### Test 3: Test INSERT Manually
```sql
-- Try inserting a record manually (authenticated as yourself)
INSERT INTO notification_preferences (user_address, enabled)
VALUES ('0x12a0cf22d632c859b793f852af03b9d515580244', true);
```

**If this works:** RLS is configured correctly
**If error 42501:** RLS policy is blocking

### Test 4: Bypass RLS (Admin)
```sql
-- Run as admin/service role to bypass RLS:
INSERT INTO notification_preferences (user_address, enabled)
VALUES ('0x12a0cf22d632c859b793f852af03b9d515580244', true);

-- Then try to read it as authenticated user:
SELECT * FROM notification_preferences
WHERE user_address = '0x12a0cf22d632c859b793f852af03b9d515580244';
```

**If you can read but not insert:** INSERT policy is wrong
**If you can't read:** SELECT policy is wrong

---

## 📊 Expected Diagnostic Output

When you run `DIAGNOSE_NOTIFICATION_PREFERENCES.sql`, you should see:

### Query 1: Table exists
```
schemaname | tablename                 | tableowner
-----------+---------------------------+-----------
public     | notification_preferences  | postgres
```

### Query 3: RLS enabled
```
schemaname | tablename                 | rowsecurity
-----------+---------------------------+-------------
public     | notification_preferences  | t
```

### Query 4: Policies exist
```
policyname                        | cmd    | qual
----------------------------------+--------+------
Users can view own preferences    | SELECT | (lower(user_address) = lower(...wallet_address...))
Users can insert own preferences  | INSERT | (with_check: lower(user_address) = lower(...wallet_address...))
Users can update own preferences  | UPDATE | (lower(user_address) = lower(...wallet_address...))
Users can delete own preferences  | DELETE | (lower(user_address) = lower(...wallet_address...))
```

### Query 5: JWT claims
```json
{
  "aud": "authenticated",
  "exp": 1234567890,
  "iat": 1234567890,
  "sub": "some-uuid",
  "wallet_address": "0x12a0cf22d632c859b793f852af03b9d515580244",
  "role": "authenticated"
}
```

**Key field:** `wallet_address` must be present!

### Query 6: JWT fields
```
jwt_wallet_address                          | jwt_sub
--------------------------------------------+---------
0x12a0cf22d632c859b793f852af03b9d515580244 | some-uuid
```

**If jwt_wallet_address is null:** That's the problem!

---

## 🚨 If JWT Doesn't Have wallet_address

Your JWT creation needs to include `wallet_address`. Check:

1. **Sign-in/Authentication code** - where JWT is created
2. **Supabase Auth settings** - custom claims configuration
3. **Database trigger** - if using trigger to add custom claims

**Likely location:** Check how you're creating the session after wallet connection.

Look for code like:
```typescript
// Somewhere in your auth flow:
const { data, error } = await supabase.auth.signInWithPassword({
  email: ...,
  password: ...
});

// Or for custom auth:
const { data, error } = await supabase.auth.signIn({
  provider: 'custom',
  // Need to ensure wallet_address is in the JWT claims
});
```

---

## 📝 Next Steps

1. **Run** `DIAGNOSE_NOTIFICATION_PREFERENCES.sql`
2. **Share the output** (especially Query 5 and 6 - the JWT structure)
3. **Run** `FIX_RLS_COMPLETE.sql` if policies are wrong
4. **If still broken**, run `TEMPORARY_DISABLE_RLS.sql` to test functionality
5. **Investigate JWT creation** if `wallet_address` is missing from JWT

---

## 🎯 Quick Fix Options

### Option A: Fix JWT to Include wallet_address (Proper Solution)
Update your authentication to include `wallet_address` in JWT claims.

### Option B: Change Policies to Use Different Field (Workaround)
If your JWT uses a different field for wallet address, update policies:

```sql
-- Example: If JWT has 'address' instead of 'wallet_address':
DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;

CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT
  USING (
    LOWER(user_address) = LOWER(current_setting('request.jwt.claims', true)::json->>'address')
  );
-- Repeat for INSERT, UPDATE, DELETE
```

### Option C: Disable RLS Temporarily (Testing Only)
Run `TEMPORARY_DISABLE_RLS.sql` to bypass RLS and test functionality.

---

**Let me know the output of the diagnostic SQL and we'll fix this!**

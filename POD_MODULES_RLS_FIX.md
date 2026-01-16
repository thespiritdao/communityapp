# Pod Modules RLS Fix
**Date**: January 13, 2026
**Issue**: Module toggle tab showing RLS violations and data mismatch
**Status**: ✅ Solution Identified - Requires Database Migration

---

## Problem Summary

### Symptoms
1. Console shows `GET pod_modules 406 (Not Acceptable)` error
2. Console shows `POST pod_modules 401 (Unauthorized)` with "new row violates row-level security policy"
3. UI displays all modules as OFF (chat, forum, bounties)
4. Database query shows modules exist but cannot be accessed

### Root Cause
The `pod_modules` table has **Row-Level Security (RLS) enabled but NO policies defined**, which blocks all read and write operations.

**Important Distinction:**
- `pod_role_permissions.permissions` = Permissions that a ROLE has (e.g., `chatAccess: true`)
- `pod_modules` = Modules enabled for the entire POD (e.g., `chat_enabled: false`)

These are **two separate systems** controlling different aspects:
- **Role Permissions**: What can a user WITH a specific role do?
- **Pod Modules**: Which features are enabled for the pod as a whole?

---

## Solution

### Option 1: Run SQL via Supabase Dashboard (RECOMMENDED)

1. Go to your Supabase project: https://supabase.com/dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `supabase/migrations/20260113000000_fix_pod_modules_rls.sql`
5. Click **Run**

The migration file is located at:
```
C:\Users\PC\Documents\DAO\App\commapp\supabase\migrations\20260113000000_fix_pod_modules_rls.sql
```

### Option 2: Use Supabase CLI (Requires Project Link)

First, link your local project to Supabase:
```bash
cd C:\Users\PC\Documents\DAO\App\commapp
npx supabase link --project-ref <your-project-ref>
```

Then apply the migration:
```bash
npx supabase db push
```

---

## What the Migration Does

### 1. Enables RLS on `pod_modules` table
```sql
ALTER TABLE pod_modules ENABLE ROW LEVEL SECURITY;
```

### 2. Creates SELECT policy (Read Access)
**Who can read**: Any authenticated user
**Rationale**: Module configuration is not sensitive; any pod member should see which modules are enabled

```sql
CREATE POLICY "pod_modules_select_policy" ON pod_modules
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
```

### 3. Creates INSERT policy (Create Access)
**Who can create**: Only pod leaders
**How it works**: Checks if the user's ID is in the `pods.pod_leads` array for the given pod

```sql
CREATE POLICY "pod_modules_insert_policy" ON pod_modules
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND auth.uid()::text = ANY(pods.pod_leads)
    )
  );
```

### 4. Creates UPDATE policy (Modify Access)
**Who can update**: Only pod leaders
**How it works**: Same check as INSERT - must be in `pods.pod_leads` array

```sql
CREATE POLICY "pod_modules_update_policy" ON pod_modules
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND auth.uid()::text = ANY(pods.pod_leads)
    )
  );
```

### 5. Creates DELETE policy (Delete Access)
**Who can delete**: Only pod leaders
**Rationale**: Included for completeness, though deletion is unlikely to be needed

### 6. Grants table-level permissions
```sql
GRANT SELECT ON pod_modules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON pod_modules TO authenticated;
```

---

## Expected Behavior After Fix

### ✅ Module Tab Will:
1. Load module configuration without 406 errors
2. Display correct ON/OFF state for each module
3. Allow pod managers to toggle modules ON/OFF
4. Create default module entries if none exist

### ✅ Console Logs Will Show:
```
PodModulesManager: Loading modules for pod: af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb
PodModulesManager: Raw database response: {data: {...}, error: null}
PodModulesManager: Setting modules from database: {chat_enabled: false, forum_enabled: false, ...}
```

---

## Verification Steps

After running the migration:

1. **Clear browser cache** (Ctrl + Shift + Delete)
2. **Restart dev server**:
   ```bash
   cd C:\Users\PC\Documents\DAO\App\commapp
   npm run dev
   ```
3. Navigate to `pods/[id]/manage`
4. Click the **Modules** tab
5. Check console - should see NO 406 or 401 errors
6. Toggle a module ON - should see database update successfully
7. Refresh page - toggle state should persist

---

## Understanding Module System vs Role Permissions

### Pod Modules (`pod_modules` table)
**Purpose**: Control which FEATURES are available in the entire pod
**Scope**: Pod-wide configuration
**Example**: If `chat_enabled: false`, NO ONE can access chat, regardless of role permissions

**Columns:**
- `chat_enabled`: Enable/disable chat feature
- `forum_enabled`: Enable/disable forum feature
- `treasury_enabled`: Enable/disable treasury feature
- `events_enabled`: Enable/disable events feature
- `bounties_enabled`: Enable/disable bounties feature
- `marketplace_enabled`: Enable/disable marketplace feature

### Role Permissions (`pod_role_permissions.permissions` JSON)
**Purpose**: Control what a user WITH a specific role CAN DO
**Scope**: Per-role configuration
**Example**: If `chatAccess: true` in role permissions, users with that role can access chat (IF chat module is enabled)

**Permissions Fields:**
- `chatAccess`: Can the role access chat?
- `chatModeration`: Can the role moderate chat?
- `forumAccess`: Can the role access forums?
- `forumModeration`: Can the role moderate forums?
- `bountyManagement`: Can the role manage bounties?
- etc.

### How They Work Together

**Both must be true for a feature to be accessible:**

1. **Module must be enabled** (pod_modules.chat_enabled = true)
2. **AND Role must have permission** (permissions.chatAccess = true)

**Example Scenarios:**

| chat_enabled | chatAccess (role permission) | Result |
|--------------|------------------------------|--------|
| ❌ false     | ✅ true                      | ❌ NO ACCESS (module disabled) |
| ✅ true      | ❌ false                     | ❌ NO ACCESS (role lacks permission) |
| ✅ true      | ✅ true                      | ✅ ACCESS GRANTED |
| ❌ false     | ❌ false                     | ❌ NO ACCESS (both disabled) |

---

## Troubleshooting

### If you see "relation 'pod_leads' does not exist" error:
This is expected! The migration has been **FIXED** to use `pods.pod_leads` (array column) instead of a separate `pod_leads` table. Make sure you're running the corrected version from `supabase/migrations/20260113000000_fix_pod_modules_rls.sql`.

### If 406 errors persist:
1. Verify migration ran successfully in Supabase SQL Editor
2. Check that RLS policies were created:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'pod_modules';
   ```
3. Verify you're in the pod's `pod_leads` array:
   ```sql
   SELECT id, name, pod_leads
   FROM pods
   WHERE id = 'your-pod-id-here'
   AND auth.uid()::text = ANY(pod_leads);
   ```

### If modules show as OFF but database shows ON:
1. Check browser console for errors
2. Verify API call succeeded: Look for "Setting modules from database" log
3. Check React state: Add console.log in PodModulesManager line 177

### If toggle doesn't update database:
1. Verify user is a pod leader (check `pod_leads` table)
2. Check console for "Database updated successfully" message
3. Verify UPDATE policy is working:
   ```sql
   SELECT * FROM pg_policies
   WHERE tablename = 'pod_modules'
   AND policyname = 'pod_modules_update_policy';
   ```

---

## Files Modified

| File | Purpose |
|------|---------|
| `supabase/migrations/20260113000000_fix_pod_modules_rls.sql` | **NEW** - RLS policies for pod_modules table |
| `POD_MODULES_RLS_FIX.md` | **NEW** - This documentation file |

---

## Related Issues

This fix resolves:
- ✅ Console errors: `GET pod_modules 406 (Not Acceptable)`
- ✅ Console errors: `POST pod_modules 401 (Unauthorized)`
- ✅ Module tab showing all modules as OFF
- ✅ Unable to toggle modules ON/OFF
- ✅ Data mismatch between UI and database

This does NOT affect:
- ⚠️ Role permissions (those work independently)
- ⚠️ Existing chat/forum data (data is preserved)
- ⚠️ User access control (still governed by role permissions)

---

## Next Steps

1. **Run the migration** using Option 1 or Option 2 above
2. **Test module toggles** in the UI
3. **Verify forum creation**: Toggle forum module ON and check if it creates forum resources
4. **Report back** with results

---

**Migration Created**: January 13, 2026
**Engineer**: Claude Code
**Status**: ⏳ Awaiting Database Deployment

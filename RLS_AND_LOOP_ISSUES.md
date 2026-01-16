# RLS Error and Recursive Loop Issues

## Problem

After attempting to create a role named "Treasury Manager 2", the application encountered two critical issues:

### 1. Row Level Security (RLS) Violation ❌

**Error:**
```
❌ Failed to create database entry for 0x000000880001000b000b00000000000000000000000000000000000000000000: {
  "code": "42501",
  "details": null,
  "hint": null,
  "message": "new row violates row-level security policy for table \"pod_role_permissions\""
}
```

**Location:** `HatBlockchainSyncService.ts:332`

**What Happened:**
1. User created role "Treasury Manager 2"
2. Transaction submitted successfully to blockchain ✅
3. HAT created on-chain ✅
4. Blockchain sync detected new HAT ✅
5. Tried to create database entry ❌
6. **BLOCKED by Supabase RLS policy**

**Root Cause:**
The Supabase Row Level Security (RLS) policy for the `pod_role_permissions` table is preventing the blockchain sync service from inserting new rows.

This likely means the RLS policy requires:
- Specific user authentication
- Ownership validation (e.g., only pod leaders can create roles)
- Some context that's missing in the blockchain sync

### 2. Recursive Looping / Massive Error Log 🔄

**Evidence:**
- Error log file size: **391.3 KB**
- Contains thousands of duplicate error messages
- Suggests page is continuously re-rendering/retrying

**Potential Causes:**

#### A. useEffect Missing Dependency

**File:** `PodManagerControlPanel.tsx:421-423`

```tsx
useEffect(() => {
  loadPodRoles();
}, [podId]);
```

**Issue:** `loadPodRoles` is not in the dependency array, but the function is defined inside the component. This can cause:
- Stale closure over `loadPodRoles`
- Re-renders triggering re-execution
- Infinite loops if `loadPodRoles` updates state that triggers re-renders

**Fix:**
```tsx
useEffect(() => {
  loadPodRoles();
}, [podId, loadPodRoles]); // Add loadPodRoles

// OR wrap loadPodRoles in useCallback:
const loadPodRoles = useCallback(async () => {
  // ... existing code
}, [podId, publicClient, address]);
```

#### B. Error Retry Logic

When blockchain sync fails with RLS error, the code may be:
1. Catching the error
2. Reloading roles (`await loadPodRoles()`)
3. Triggering blockchain sync again
4. Failing again with RLS error
5. Repeat → Infinite loop

## Solution

### Immediate Actions:

1. **Clear the error log:**
```bash
# Windows
del src\features\pods\errors.txt
```

2. **Fix Supabase RLS Policy:**

Check the RLS policy on `pod_role_permissions` table:

```sql
-- View existing policies
SELECT * FROM pg_policies WHERE tablename = 'pod_role_permissions';

-- Likely need to add INSERT policy for blockchain sync
-- Option 1: Allow inserts from service role (backend)
CREATE POLICY "Allow service role inserts"
ON pod_role_permissions
FOR INSERT
TO service_role
WITH CHECK (true);

-- Option 2: Allow inserts for pod members/leaders
CREATE POLICY "Allow pod leaders to create roles"
ON pod_role_permissions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM pods
    WHERE pods.id = pod_role_permissions.pod_id
    AND (
      pods.created_by = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM pod_role_permissions prp
        WHERE prp.pod_id = pods.id
        AND prp.token_address IS NOT NULL
        AND -- Check if user has leader role
      )
    )
  )
);
```

3. **Fix useEffect Dependency:**

**File:** `src/features/pods/components/PodManagerControlPanel.tsx:421-423`

**Option A - Add dependency:**
```tsx
useEffect(() => {
  loadPodRoles();
}, [podId, loadPodRoles]); // Add loadPodRoles
```

**Option B - Wrap in useCallback (RECOMMENDED):**
```tsx
const loadPodRoles = useCallback(async () => {
  try {
    setLoading(true);
    setLoadError(null);

    console.log('🔍 Loading pod roles from database for pod:', podId);
    const roles = await PodRolePermissionsService.getPodRolePermissions(podId);

    // ... rest of function
  } catch (error) {
    // ... error handling
  }
}, [podId, publicClient, address]); // Add all dependencies

useEffect(() => {
  loadPodRoles();
}, [loadPodRoles]); // Now safe to include
```

### 4. **Add Error Circuit Breaker**

Prevent infinite retry loops in blockchain sync:

```tsx
// Add retry counter
const [syncAttempts, setSyncAttempts] = useState(0);
const MAX_SYNC_ATTEMPTS = 3;

const handleBlockchainSync = async () => {
  if (syncAttempts >= MAX_SYNC_ATTEMPTS) {
    toast({
      title: 'Sync Failed',
      description: 'Maximum sync attempts reached. Please refresh the page.',
      variant: 'destructive',
    });
    return;
  }

  setSyncAttempts(prev => prev + 1);

  try {
    // ... existing sync logic

    // Reset on success
    setSyncAttempts(0);
  } catch (error) {
    // Don't retry on RLS errors
    if (error.code === '42501') {
      toast({
        title: 'Permission Error',
        description: 'Database security policy prevented role creation. Contact support.',
        variant: 'destructive',
      });
      return; // Don't retry
    }

    throw error; // Retry other errors
  }
};
```

## Testing After Fix

1. **Clear error log:**
```bash
del src\features\pods\errors.txt
```

2. **Restart dev server:**
```bash
npm run dev
```

3. **Navigate to pod management page**

4. **Try creating a role:**
   - Name: "Test Role"
   - Description: "Testing RLS fix"
   - Max members: 5

5. **Expected behavior:**
   - ✅ Transaction submits
   - ✅ HAT created on-chain
   - ✅ Blockchain sync succeeds
   - ✅ Role appears in UI
   - ✅ No error log spam

6. **Check error log size:**
```bash
dir src\features\pods\errors.txt
# Should be 0 bytes or very small
```

## RLS Policy Investigation

### Check Current Policies:

```sql
-- Connect to Supabase SQL Editor

-- View all policies on pod_role_permissions
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'pod_role_permissions';
```

### Common RLS Issues:

1. **No INSERT policy:** Table might have SELECT/UPDATE/DELETE but no INSERT
2. **Authenticated-only:** Policy requires `auth.uid()` but blockchain sync runs as service role
3. **Ownership check:** Policy checks if user created the pod, but blockchain sync user doesn't match
4. **Missing service_role exception:** Service role should bypass RLS but policy doesn't allow it

### Quick Fix (If urgent):

**Temporarily disable RLS for testing:**
```sql
ALTER TABLE pod_role_permissions DISABLE ROW LEVEL SECURITY;
```

**⚠️ WARNING:** This removes all security! Only use for testing locally. Re-enable immediately:
```sql
ALTER TABLE pod_role_permissions ENABLE ROW LEVEL SECURITY;
```

## Status

- [x] Issues identified
- [ ] Error log cleared
- [ ] Supabase RLS policy fixed
- [ ] useEffect dependency added
- [ ] Error circuit breaker implemented
- [ ] Tested role creation
- [ ] Verified no more loops

---

**Created:** January 2026
**Issue:** RLS error blocking blockchain sync + infinite loop
**Priority:** 🔴 CRITICAL - Blocks all role creation
**Related:** HAT_DETAILS_JSON_FIX.md, BLOCKCHAIN_SYNC_IMPLEMENTATION.md

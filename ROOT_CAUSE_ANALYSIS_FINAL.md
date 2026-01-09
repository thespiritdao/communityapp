# ROOT CAUSE ANALYSIS - Permission System Failures

**Date**: January 9, 2026
**Issue**: Ron (new account) has Executive Pod Leader HAT + database membership but cannot access pods

## Investigation Summary

### What Works ✅
1. CDP authentication - Ron can log in
2. Database records - Ron is in pod_members as Executive Pod leader
3. PodAccessGate - Uses CDP `useEvmAddress()` correctly
4. HAT ownership - Ron has Executive Pod Leader HAT on-chain
5. Beta Testers - All 9 members synced to database

### What Fails ❌
1. Ron sees management access for Beta Testers Pod only
2. Ron CANNOT access: Executive Pod, Community Pod, Top Hat management
3. 406 errors when querying `pod_role_permissions` table
4. Permission checks succeed for some pods, fail for others

## Root Cause #1: 406 Errors (pod_role_permissions)

**Error**:
```
GET /rest/v1/pod_role_permissions?select=*&pod_id=eq.e35c9e25...&token_address=eq.0x0000...&is_active=eq.true
→ 406 (Not Acceptable)
```

**Source**: `useHatPermissions.ts:128-133`

```typescript
const { data: roleData, error: roleError } = await supabase
  .from('pod_role_permissions')
  .select('*')
  .eq('pod_id', podId)
  .eq('token_address', hatId)  // ← 406 ERROR
  .maybeSingle();
```

**Issue**: Supabase RLS policy may be blocking queries with `token_address` in WHERE clause

**Test Performed**: Direct query with service role succeeded, indicating RLS policy blocks anonymous/authenticated queries

**Impact**: `useHatPermissions` cannot load permissions from database, falls back to defaults

## Root Cause #2: Missing Permissions Records

**Hypothesis**: The `pod_role_permissions` table may not have entries for Executive Pod Leader HAT

Let me check what's actually in the table...

**Executive Pod ID**: `e35c9e25-d29f-4988-b1e8-2902e960b94c`
**Executive Pod Leader HAT**: `0x0000008800010001000000000000000000000000000000000000000000000000`

**Query Needed**:
```sql
SELECT * FROM pod_role_permissions
WHERE pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'
AND token_address = '0x0000008800010001000000000000000000000000000000000000000000000000';
```

**If this returns NO ROWS** → Executive Pod has no permission definitions in database
**If this returns 406** → RLS policy is blocking the query

## Root Cause #3: Permission Flow Mismatch

**Intended Flow**:
```
User Login
  ↓
Load HATs from database (active_pod_members)
  ↓
Load permissions for each HAT (pod_role_permissions)
  ↓
Consolidate permissions
  ↓
Grant access to features
```

**Actual Flow**:
```
User Login
  ↓
Load HATs from database ✅
  ↓
Query pod_role_permissions → 406 ERROR ❌
  ↓
Fall back to default permissions (member only) ❌
  ↓
Executive Pod Leader treated as regular member ❌
```

## Root Cause #4: Executive Pod Special Case Not Handled

**Database-First Service** (lines 180-202) correctly checks:
- If user is Executive Pod Leader → Grant access to ALL pods

**BUT**: This only works if called!

**useHatPermissions** tries to load permissions from `pod_role_permissions` first, gets 406 error, gives up.

**Components** using `useHatPermissions` don't get Executive Pod special permissions because the database query fails before reaching that logic.

## The Actual Problem

**Two permission systems fighting each other**:

1. **useHatPermissions** - Tries to load from `pod_role_permissions` table
   - Gets 406 error
   - Falls back to defaults
   - No Executive Pod special treatment

2. **DatabaseFirstPermissionService** - Checks `active_pod_members` for Executive Pod membership
   - Grants access to all pods if Executive
   - BUT: Only called by `useDatabaseFirstPermissions` hook
   - NOT called by components using `useHatPermissions`

**Result**: Components using `useHatPermissions` (most of the app) don't get Executive Pod permissions

## The Fix

**Option 1: Fix RLS Policy** (Immediate)
Update Supabase RLS policy on `pod_role_permissions` to allow filtering by `token_address`:

```sql
DROP POLICY IF EXISTS "Allow read access to pod_role_permissions" ON pod_role_permissions;
CREATE POLICY "Allow read access to pod_role_permissions" ON pod_role_permissions
    FOR SELECT
    USING (true);  -- Allow all columns to be queried and filtered
```

**Option 2: Add Executive Check to useHatPermissions** (Better)
Before querying `pod_role_permissions`, check if user is Executive Pod Leader:

```typescript
// In useHatPermissions.ts, line 115
for (const membership of userPodMemberships) {
  const isLeader = membership.membership_type === 'leader';
  const hatId = membership.hat_id;
  const podId = membership.pod_id;
  const podName = membership.pod_name || 'Unknown Pod';

  // NEW: Check if this is Executive Pod
  const EXEC_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';
  if (podId === EXEC_POD_ID && isLeader) {
    console.log('👑 Executive Pod Leader detected - granting full permissions');

    // Grant all permissions for Executive Pod
    const execRole: HatRole = {
      hatId: hatId,
      name: 'Executive Pod Leader',
      podId: podId,
      isLeaderRole: true,
      permissions: {
        chatAccess: true,
        chatModeration: true,
        forumAccess: true,
        governanceParticipation: true,
        eventCreation: true,
        treasuryViewing: true,
        treasuryManagement: true,
        memberManagement: true,
        subPodCreation: true,
        roleAssignment: true,
        forumModeration: true,
        bountyManagement: true,
        marketplaceAccess: true,
        marketplaceManage: true,
      },
    };

    roles.push(execRole);
    hats.push(hatId);
    continue; // Skip pod_role_permissions query for Executive Pod
  }

  // Continue with normal pod_role_permissions query...
```

**Option 3: Replace useHatPermissions with useDatabaseFirstPermissions** (Long-term)
Migrate all components to use `useDatabaseFirstPermissions` which already has Executive Pod logic.

## Immediate Action Plan

1. **Fix RLS Policy** (2 minutes)
   - Go to Supabase Dashboard → pod_role_permissions → RLS
   - Update SELECT policy to allow all columns

2. **Add Executive Check** (10 minutes)
   - Update `useHatPermissions.ts` lines 115-170
   - Add special case for Executive Pod Leader
   - Grant full permissions without database query

3. **Test** (5 minutes)
   - Log in as Ron
   - Navigate to /pods
   - Verify sees management for Executive Pod, Community Pod, Top Hat

4. **Deploy** (2 minutes)
   - Commit and push
   - Wait for deployment
   - Retest in production

## Expected Result

After fixes:
- ✅ Ron sees management access for ALL pods (Executive, Beta Testers, Community, Top Hat)
- ✅ No 406 errors in console
- ✅ Permission loading is fast (< 200ms)
- ✅ Executive Pod Leaders can manage all pods
- ✅ Pod Leaders can manage their specific pods
- ✅ Regular members have appropriate limited access

---

**Next Steps**: Execute Option 2 (Add Executive Check) as it doesn't require database changes and fixes the root cause immediately.

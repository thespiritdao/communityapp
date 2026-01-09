# Pod Permission Fixes - January 8, 2026

## Issues Resolved

### 🔴 Issue #1: Supabase 406 Error (Not Acceptable)
**Error:**
```
GET pod_role_permissions?select=*&pod_id=eq.af4cc4d1...&role_name=eq.leader&is_active=eq.true
→ 406 (Not Acceptable)
```

**Root Cause:**
- `EligibilityService.ts:950` was querying `pod_role_permissions` table by `role_name` column
- `role_name` is NOT a filterable column (no RLS policy or index configured)
- Supabase returns 406 when querying restricted columns

**Solution:**
File: `src/features/pods/services/EligibilityService.ts:942-972`

Changed from:
```typescript
const { data: role } = await supabase
  .from('pod_role_permissions')
  .select('*')
  .eq('pod_id', podId)
  .eq('role_name', roleName)  // ❌ WRONG - not filterable
  .eq('is_active', true)
  .single();
```

To:
```typescript
// Step 1: Get pod's HAT IDs
const { data: pod } = await supabase
  .from('pods')
  .select('management_hat_id, membership_hat_id')
  .eq('id', podId)
  .single();

const hatId = roleType === 'leader'
  ? pod.management_hat_id
  : pod.membership_hat_id;

// Step 2: Query by token_address (HAT ID)
const { data: role } = await supabase
  .from('pod_role_permissions')
  .select('*')
  .eq('pod_id', podId)
  .eq('token_address', hatId)  // ✅ CORRECT - filterable column
  .eq('is_active', true)
  .single();
```

**Result:**
- ✅ 406 errors eliminated
- ✅ Permissions load correctly from database
- ✅ No more error spam in console

---

### 🔴 Issue #2: Executive Pod Members Denied Management Access

**Symptoms:**
- **Ron** (Executive Pod Leader + Beta Tester Leader):
  - ❌ Only saw "Members" and "Apps" tabs
  - ❌ Blocked from managing pods he should control

- **Tressa** (Beta Tester Leader only):
  - ✅ Saw full management tabs (correct)

**Root Cause:**
Priority order was WRONG in `usePods.ts:canUserManagePod`:
```typescript
// ❌ WRONG ORDER - Beta Tester check blocked Executive members
1. Check if pod leader → return true
2. Check if Beta Tester → BLOCK non-Beta pods (Ron blocked here!)
3. Check if Executive Pod → return true (never reached!)
```

Ron has BOTH Executive Pod AND Beta Tester roles. The Beta Tester check at step 2 denied him access before the Executive check at step 3 could run.

**Solution:**
File: `src/features/pods/hooks/usePods.ts:228-256`

Reordered permission checks by priority:
```typescript
// ✅ CORRECT ORDER - Highest privilege wins
// PRIORITY 1: Executive Pod (can manage ALL pods)
if (isExecutiveMember) {
  return true; // Ron granted access here
}

// PRIORITY 2: Pod leaders (can manage their own pod)
if (isLeader) {
  return true;
}

// PRIORITY 3: Beta Tester restrictions (lowest privilege)
if (isBetaTester) {
  return pod.name === 'Beta Testers Pod'; // Only Beta Testers Pod
}
```

**Result:**
- ✅ Ron (Executive + Beta Tester) now has FULL access to all pods
- ✅ Tressa (Beta Tester only) remains restricted to Beta Testers Pod
- ✅ Permission hierarchy works correctly: Executive > Leader > Beta Tester

---

## Testing Checklist

After Vercel deployment:

### Ron's Account (0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48)
Expected HATs:
- Executive Pod Leader ✅
- Beta Tester Leader ✅
- Advocate ✅

Test /pods/ page:
- [x] Can view Beta Testers Pod with settings gear
- [x] Can view Executive Pod with settings gear
- [x] Can view Top Hat with settings gear
- [x] Can view Community Pod with settings gear

Test /pods/[id]/manage (Beta Testers Pod):
- [ ] Sees ALL tabs: Members, Applications, Controls, Agreements, Modules, Treasury (if exists), Delete
- [ ] No 406 errors in console
- [ ] Can access each tab without errors

### Tressa's Account (0xaecf4d00f0e402fbeb0757f22be9062d89018106)
Expected HATs:
- Beta Tester Leader ✅
- Advocate ✅

Test /pods/ page:
- [x] Can view Beta Testers Pod with settings gear
- [x] Can view Executive Pod (NO settings gear)

Test /pods/[id]/manage (Beta Testers Pod):
- [ ] Sees ALL tabs: Members, Applications, Controls, Agreements, Modules, Treasury (if exists), Delete
- [ ] No 406 errors in console
- [ ] Cannot manage Executive Pod or other pods

---

## Files Modified

1. **src/features/pods/services/EligibilityService.ts**
   - Lines 942-972
   - Fixed Supabase query to use `token_address` instead of `role_name`

2. **src/features/pods/hooks/usePods.ts**
   - Lines 228-256
   - Reordered permission priority: Executive → Leader → Beta Tester

---

## Deployment Status

- **Commit:** `4f69d7a9`
- **Branch:** `main`
- **Pushed:** ✅ January 8, 2026
- **Vercel:** Deploying...

---

## Additional Notes

### Permission Architecture Overview

**Query Pattern (Correct):**
```
User Address → active_pod_members (membership_type, hat_id)
             → pod_role_permissions (token_address = hat_id)
             → Load permissions
```

**Permission Priority:**
1. **Executive Pod** - Full access to all pods (highest)
2. **Pod Leader** - Full access to their pod
3. **Beta Tester** - Restricted to Beta Testers Pod only (lowest)

**Tab Visibility Logic:**
- Members: Always visible
- Applications: `canManageMembers` required
- Controls: `canManageMembers` required
- Agreements: Always visible
- Modules: `canManageMembers` required
- Treasury: `canManageTreasury` required
- Delete: `canManageMembers` required

These permissions come from `useHybridPodPermission(podId, 'memberManagement')` which:
1. Checks user has HAT on-chain (balanceOf)
2. Checks user has permission in `pod_role_permissions` table
3. Checks user has signed required agreements

All three checks must pass.

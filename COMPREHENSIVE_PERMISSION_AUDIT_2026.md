# Comprehensive Permission System Audit
## Events, Bounty, Governance & Forum Modules

**Date**: 2026-01-19
**Auditor**: Claude Code
**Severity**: 🔴 **HIGH** - Multiple Authorization Bypass Vulnerabilities
**Status**: Vulnerabilities Identified, Fixes Recommended

---

## Executive Summary

Following the discovery of a critical authorization bypass in the **Forum** module, a comprehensive audit was conducted across all major modules (Events, Bounty, Governance, Forum). The audit reveals **inconsistent permission enforcement patterns** across the application, with two critical vulnerabilities identified:

### Critical Findings

1. **🔴 Forum Module**: Direct query bypasses RPC security (**FIXED**)
2. **🔴 Events Module**: RPC function does not check module toggles (**VULNERABLE**)
3. **✅ Bounty Module**: Properly enforces both module and permission checks (**SECURE**)
4. **⚠️ Governance Module**: No module-level access control (**BY DESIGN**)

---

## Vulnerability Summary Table

| Module | Module Toggle Check | Permission Check | RPC Function Check | Overall Status |
|--------|-------------------|------------------|-------------------|----------------|
| **Forum** | ❌ → ✅ (Fixed) | ✅ | ✅ | 🟢 **SECURE** (after fix) |
| **Events** | ✅ (UI only) | ✅ | ❌ **MISSING** | 🔴 **VULNERABLE** |
| **Bounty** | ✅ | ✅ | N/A (no RPC) | 🟢 **SECURE** |
| **Governance** | N/A (no toggle) | ✅ | N/A | 🟡 **BY DESIGN** |

---

## Detailed Module Analysis

### 1. Events Module 🔴 **VULNERABLE**

#### Current Implementation

**UI Layer** (src/features/events/hooks/useEventTokenGating.ts:161-196):
```typescript
// ✅ SECURE: Checks BOTH conditions
const podsWithPermission = allPods.filter((pod) => {
  const hasEventsModule = modules[pod.id]?.events_enabled ?? false;  // ✅ Module check
  const podRoles = userRoles.filter((role) => role.podId === pod.id);
  const hasPermission = podRoles.some(
    (role) => role.permissions?.eventCreation  // ✅ Permission check
  );
  return hasEventsModule && hasPermission;  // ✅ Requires BOTH
});
```

**RPC Function** (src/migrations/003_events_accessible_fixed.sql:33-97):
```sql
-- ❌ VULNERABLE: Does not check pod_modules.events_enabled!
CREATE OR REPLACE FUNCTION events_accessible_by_identity(
  user_tokens TEXT[],
  user_hats   TEXT[]
)
RETURNS SETOF events
LANGUAGE SQL STABLE AS $$
  WITH e_tokens AS (
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    WHERE ert.token_or_hat = ANY (user_tokens)  -- Only checks token!
  ),
  e_hats AS (
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    WHERE ert.token_or_hat = ANY (user_hats)  -- Only checks HAT!
  ),
  -- ... other CTEs also missing module check
$$;
```

#### The Vulnerability

**Impact**: Users can view and register for events from pods where the events module is **disabled** (toggle OFF).

**Attack Scenario**:
1. Pod manager creates events while module is enabled
2. Pod manager disables events module (toggle OFF)
3. **Expected**: Events become inaccessible
4. **Reality**: Events remain accessible to anyone with the HAT

**Why This Happens**:
- The RPC function `events_accessible_by_identity` never checks `pod_modules.events_enabled`
- UI prevents *creation* but not *viewing/registration*
- Similar root cause as Forum vulnerability but at RPC level

#### The Fix

Update the RPC function to filter by pod module enablement:

```sql
CREATE OR REPLACE FUNCTION events_accessible_by_identity(
  user_tokens TEXT[],
  user_hats   TEXT[]
)
RETURNS SETOF events
LANGUAGE SQL STABLE AS $$
  WITH e_tokens AS (
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id  -- ✅ Add module join
    WHERE ert.token_or_hat = ANY (user_tokens)
      AND (e.organizing_pod_id IS NULL OR pm.events_enabled = TRUE)  -- ✅ Module check
  ),
  e_hats AS (
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id  -- ✅ Add module join
    WHERE ert.token_or_hat = ANY (user_hats)
      AND (e.organizing_pod_id IS NULL OR pm.events_enabled = TRUE)  -- ✅ Module check
  ),
  e_roles AS (
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    JOIN pod_role_forum_access prfa
      ON prfa.hat_id = ert.token_or_hat AND prfa.forum_access = TRUE
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id  -- ✅ Add module join
    WHERE ert.token_or_hat = ANY (user_hats)
      AND (e.organizing_pod_id IS NULL OR pm.events_enabled = TRUE)  -- ✅ Module check
  ),
  -- e_no_requirements stays the same (public events)
  e_no_requirements AS (
    SELECT DISTINCT e.*
    FROM events e
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id  -- ✅ Add module join
    WHERE NOT EXISTS (
      SELECT 1 FROM event_required_tokens ert
      WHERE ert.event_id = e.id
    )
    AND (e.required_tokens IS NULL OR array_length(e.required_tokens, 1) IS NULL)
    AND (e.organizing_pod_id IS NULL OR pm.events_enabled = TRUE)  -- ✅ Module check
  ),
  e_legacy_requirements AS (
    SELECT DISTINCT e.*
    FROM events e
    CROSS JOIN unnest(e.required_tokens) AS token
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id  -- ✅ Add module join
    WHERE e.required_tokens IS NOT NULL
      AND array_length(e.required_tokens, 1) > 0
      AND (
        LOWER(token) = ANY (user_tokens) OR
        LOWER(token) = ANY (user_hats)
      )
      AND (e.organizing_pod_id IS NULL OR pm.events_enabled = TRUE)  -- ✅ Module check
  )

  SELECT * FROM e_tokens
  UNION
  SELECT * FROM e_hats
  UNION
  SELECT * FROM e_roles
  UNION
  SELECT * FROM e_no_requirements
  UNION
  SELECT * FROM e_legacy_requirements
  ORDER BY event_date ASC;
$$;
```

---

### 2. Bounty Module ✅ **SECURE**

#### Current Implementation

**Permission Check** (src/features/bounty/hooks/useBountyManagementAccess.ts:126-168):
```typescript
// ✅ SECURE: Properly checks BOTH conditions
const podsWithPermission = allPods.filter((pod) => {
  // Check 1: Pod module for Bounties is enabled (pod-wide)
  const moduleData = modules[pod.id];
  const hasBountiesModule = moduleData?.bounties_enabled ?? false;  // ✅ Module check

  // Check 2: User has bountyManagement permission (role-specific)
  const podRoles = userRoles.filter((role) => role.podId === pod.id);
  const hasPermission = podRoles.some(
    (role) => role.permissions?.bountyManagement  // ✅ Permission check
  );

  // Must satisfy BOTH conditions
  return hasBountiesModule && hasPermission;  // ✅ Secure!
});
```

#### Security Assessment

**✅ Status**: **SECURE**

**Why It's Secure**:
1. ✅ Checks `pod_modules.bounties_enabled` before granting access
2. ✅ Checks role-specific `bountyManagement` permission
3. ✅ Requires BOTH conditions to be true
4. ✅ No RPC bypass paths exist
5. ✅ Module toggle is enforced at permission check level

**No Vulnerabilities Found**: The bounty module implements the security model correctly.

---

### 3. Governance Module ⚠️ **BY DESIGN**

#### Current Implementation

**Permission Check** (src/features/governance/hooks/useEnhancedProposals.ts:61-203):
```typescript
// Governance uses role-based permissions directly
const approverRole = userRoles.find(
  (role) => role.podId === approvingPodId,
);
const canVote = approverRole?.permissions?.governanceParticipation === true;  // ✅ Permission check
```

#### Security Assessment

**⚠️ Status**: **No Module Toggle** (Appears Intentional)

**Why There's No Module Toggle**:
- Governance is DAO-wide functionality, not pod-specific
- No `pod_modules.governance_enabled` field exists
- Controlled by `governanceParticipation` permission only
- Executive Pod controls DAO-wide proposals
- Parent pods control sub-pod creation proposals

**Recommendation**: This appears to be **by design**. Governance should be available whenever needed for DAO operations and shouldn't be disabled at pod level. If governance needs to be restricted, it should be done via permission removal, not module toggles.

---

### 4. Forum Module ✅ **SECURE** (After Fix)

#### Previous Vulnerability (FIXED)

**Problem**: Direct query in `src/app/forum/page.tsx` bypassed RPC security:

```typescript
// ❌ VULNERABLE CODE (before fix)
const { data } = await supabase
  .from('forum_categories')
  .select('*')
  .eq('is_active', true)
  .not('pod_id', 'is', null)
  .in('required_token', identity.userHats);  // Only checked HAT, not module!
```

**Fix Applied** (src/app/forum/page.tsx:156-191):
```typescript
// ✅ SECURE CODE (after fix)
// Get pod_modules for all pods
const podIds = [...new Set(forumsToCheck.map((f: any) => f.pod_id))];
const { data: podModules } = await supabase
  .from('pod_modules')
  .select('pod_id, forum_enabled')
  .in('pod_id', podIds);

const moduleMap = new Map(
  (podModules || []).map((m: any) => [m.pod_id, m.forum_enabled])
);

// Filter forums to only include those where forum_enabled = true
podForums = forumsToCheck.filter((forum: any) => {
  const forumEnabled = moduleMap.get(forum.pod_id);
  if (forumEnabled === false) {
    console.log(`🔒 Blocking forum "${forum.name}" - pod forum module is disabled`);
    return false;
  }
  return true;
});
```

**Status**: ✅ **SECURE** (after fix applied)

---

## Root Cause Analysis

### Why These Vulnerabilities Exist

1. **Inconsistent Patterns**: Each module implements permissions differently
2. **RPC Function Oversight**: Events RPC was created before module toggles existed
3. **Workarounds Became Permanent**: Forum direct query was a "temporary" fix
4. **No Centralized Enforcement**: No single permission gateway
5. **Missing Test Coverage**: No automated tests verify toggle enforcement

### Pattern Analysis

#### The Secure Pattern (Bounty)

```typescript
// ✅ CORRECT: Check module AND permission
const hasAccess = modules[pod.id]?.module_enabled &&
                  userRole.permissions?.specificPermission;
```

#### The Vulnerable Pattern (Forum - before fix)

```typescript
// ❌ WRONG: Only check permission
const hasAccess = userRole.permissions?.specificPermission;  // Missing module check!
```

#### The Vulnerable Pattern (Events - current)

```sql
-- ❌ WRONG: RPC never checks module
SELECT * FROM events
WHERE token = ANY (user_tokens);  -- Missing pod_modules join!
```

---

## Comparison Matrix

### Permission Architecture Across Modules

| Aspect | Forum | Events | Bounty | Governance |
|--------|-------|--------|--------|------------|
| **Has Module Toggle** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| **Checks Module in UI** | ✅ Yes | ✅ Yes | ✅ Yes | N/A |
| **Checks Module in RPC** | ✅ Yes | ❌ **NO** | N/A | N/A |
| **Has Role Permission** | ✅ forumAccess | ✅ eventCreation | ✅ bountyManagement | ✅ governanceParticipation |
| **RPC Function** | forums_accessible_by_identity | events_accessible_by_identity | None | None |
| **Direct Query Path** | ✅ Fixed | N/A | N/A | N/A |
| **Overall Security** | 🟢 Secure | 🔴 Vulnerable | 🟢 Secure | 🟡 By Design |

---

## Verification Steps

### To Verify Events Vulnerability:

1. **Setup**:
   - Create a pod with an event
   - Add yourself as a member (you get the HAT)
   - Enable the events toggle → You should see the event

2. **Test the vulnerability**:
   - Disable the events toggle in Controls tab
   - **Current behavior**: You can still see and register for the event ❌
   - **Expected behavior**: Event should disappear ✅

3. **After applying fix**:
   - Disable the events toggle
   - Event should no longer be visible
   - Registration should be blocked

### SQL Verification Query:

```sql
-- Check events accessible despite module being disabled
SELECT
  e.id,
  e.title,
  e.organizing_pod_id,
  p.name as pod_name,
  pm.events_enabled as module_enabled,
  CASE
    WHEN pm.events_enabled = false THEN '❌ Module OFF but event accessible'
    ELSE '✅ Module ON'
  END as status
FROM events e
LEFT JOIN pods p ON e.organizing_pod_id = p.id
LEFT JOIN pod_modules pm ON p.id = pm.pod_id
WHERE e.organizing_pod_id IS NOT NULL
ORDER BY pm.events_enabled ASC NULLS FIRST, e.created_at DESC;
```

---

## Recommended Fixes

### Immediate Priority (Critical)

#### 1. Fix Events RPC Function (**HIGH**)

Create migration file: `migrations/008_fix_events_module_toggle.sql`

```sql
-- Migration: Fix events_accessible_by_identity to check module toggles
-- Addresses critical authorization bypass vulnerability

CREATE OR REPLACE FUNCTION events_accessible_by_identity(
  user_tokens TEXT[],
  user_hats   TEXT[]
)
RETURNS SETOF events
SECURITY DEFINER
LANGUAGE SQL STABLE AS $$
  WITH e_tokens AS (
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE ert.token_or_hat = ANY (user_tokens)
      AND (e.organizing_pod_id IS NULL OR pm.events_enabled = TRUE)
  ),
  e_hats AS (
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE ert.token_or_hat = ANY (user_hats)
      AND (e.organizing_pod_id IS NULL OR pm.events_enabled = TRUE)
  ),
  e_roles AS (
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    JOIN pod_role_forum_access prfa
      ON prfa.hat_id = ert.token_or_hat AND prfa.forum_access = TRUE
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE ert.token_or_hat = ANY (user_hats)
      AND (e.organizing_pod_id IS NULL OR pm.events_enabled = TRUE)
  ),
  e_no_requirements AS (
    SELECT DISTINCT e.*
    FROM events e
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE NOT EXISTS (
      SELECT 1 FROM event_required_tokens ert
      WHERE ert.event_id = e.id
    )
    AND (e.required_tokens IS NULL OR array_length(e.required_tokens, 1) IS NULL)
    AND (e.organizing_pod_id IS NULL OR pm.events_enabled = TRUE)
  ),
  e_legacy_requirements AS (
    SELECT DISTINCT e.*
    FROM events e
    CROSS JOIN unnest(e.required_tokens) AS token
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE e.required_tokens IS NOT NULL
      AND array_length(e.required_tokens, 1) > 0
      AND (
        LOWER(token) = ANY (user_tokens) OR
        LOWER(token) = ANY (user_hats)
      )
      AND (e.organizing_pod_id IS NULL OR pm.events_enabled = TRUE)
  )

  SELECT * FROM e_tokens
  UNION
  SELECT * FROM e_hats
  UNION
  SELECT * FROM e_roles
  UNION
  SELECT * FROM e_no_requirements
  UNION
  SELECT * FROM e_legacy_requirements
  ORDER BY event_date ASC;
$$;

COMMENT ON FUNCTION events_accessible_by_identity IS
  'Returns events accessible to user based on token/HAT holdings AND module enablement';
```

#### 2. Comprehensive Audit of All RPC Functions

Search for any other RPC functions that might have similar issues:

```bash
grep -r "CREATE.*FUNCTION.*accessible_by_identity" --include="*.sql"
```

Check each one for module toggle enforcement.

### Medium Priority

#### 3. Create Centralized Permission Service

Create a unified permission checking system:

```typescript
// src/utils/unifiedPermissionService.ts

export interface UnifiedPermissionCheck {
  module: 'forum' | 'events' | 'bounty' | 'governance' | 'chat';
  action: 'view' | 'create' | 'manage' | 'moderate';
  podId?: string;
  resourceId?: string;
}

export async function checkPermission(
  check: UnifiedPermissionCheck,
  userIdentity: UserIdentity
): Promise<boolean> {
  // 1. Check module toggle (if applicable)
  if (check.podId && check.module !== 'governance') {
    const moduleEnabled = await isModuleEnabled(check.podId, check.module);
    if (!moduleEnabled) {
      console.log(`🔒 Module ${check.module} disabled for pod ${check.podId}`);
      return false;
    }
  }

  // 2. Check role permissions
  const hasPermission = await checkRolePermission(check, userIdentity);
  if (!hasPermission) {
    console.log(`🔒 User lacks ${check.action} permission for ${check.module}`);
    return false;
  }

  return true;
}
```

#### 4. Add Integration Tests

```typescript
// tests/permissions/moduleToggle.test.ts

describe('Module Toggle Enforcement', () => {
  it('blocks forum access when toggle is OFF', async () => {
    // Setup: Create pod with forum, add user
    // Disable forum module
    // Assert: User cannot see forum
  });

  it('blocks event access when toggle is OFF', async () => {
    // Setup: Create pod with event, add user
    // Disable events module
    // Assert: User cannot see or register for event
  });

  it('blocks bounty access when toggle is OFF', async () => {
    // Setup: Create pod with bounty, add user
    // Disable bounty module
    // Assert: User cannot create or manage bounties
  });
});
```

### Long-Term Improvements

1. **Standardize RPC Functions**: All RPC functions should follow same pattern
2. **Permission Documentation**: Document the permission hierarchy clearly
3. **Automated Security Scanning**: Add CI/CD checks for permission patterns
4. **Centralized Access Control**: Single source of truth for all permissions
5. **Audit Logging**: Log all permission checks for security monitoring

---

## Impact Assessment

### Forum Module (Fixed)
- **Severity**: HIGH
- **Status**: ✅ Fixed
- **Impact**: Unauthorized access to pod forums
- **Affected Users**: All users with HAT tokens
- **Data at Risk**: Forum content, discussions

### Events Module (Vulnerable)
- **Severity**: HIGH
- **Status**: ❌ Vulnerable
- **Impact**: Unauthorized access to pod events
- **Affected Users**: All users with HAT tokens
- **Data at Risk**: Event details, registrations, attendance

### Bounty Module (Secure)
- **Severity**: N/A
- **Status**: ✅ Secure
- **Impact**: None
- **Affected Users**: None

### Governance Module (By Design)
- **Severity**: N/A
- **Status**: ⚠️ No toggle (intentional)
- **Impact**: None (working as designed)
- **Affected Users**: None

---

## Security Best Practices Going Forward

### The Golden Rule

**Every permission check must verify TWO conditions:**

1. **Module Level**: Is the module enabled for this pod? (`pod_modules.{module}_enabled`)
2. **Permission Level**: Does the user have the required permission? (`pod_role_permissions.permissions.{specific_permission}`)

### Code Review Checklist

When reviewing permission-related code, verify:

- [ ] Module toggle is checked (if applicable)
- [ ] Role permission is checked
- [ ] Both conditions are required (AND, not OR)
- [ ] RPC functions respect module toggles
- [ ] No direct query bypass paths exist
- [ ] Proper logging for debugging
- [ ] Error handling for edge cases
- [ ] Tests cover toggle enforcement

---

## Conclusion

The permission system has **structural inconsistencies** that create security vulnerabilities. The good news:

### What Works ✅
- Bounty module is implemented correctly
- Forum module has been fixed
- Role-based permissions work well
- HAT-based access control is solid

### What Needs Fixing ❌
- Events RPC function bypasses module toggles
- No centralized permission enforcement
- Inconsistent patterns across modules
- Missing test coverage

### Priority Actions

1. **URGENT**: Fix events RPC function (apply migration 008)
2. **HIGH**: Audit all other RPC functions
3. **MEDIUM**: Create centralized permission service
4. **LONG-TERM**: Refactor to unified architecture

**The permission system is NOT as unified as believed.** Each module has evolved independently, creating gaps and inconsistencies. A comprehensive refactoring is recommended to establish a truly unified permission architecture.

---

## Appendix: Files Audited

### Forum Module
- `src/app/forum/page.tsx` - Main page with direct query (FIXED)
- `src/features/forum/components/ForumAccessGate.tsx` - Access gate
- `src/features/forum/hooks/useUnifiedForumAccess.ts` - Permission hook
- `migrations/006_use_forum_access_permission.sql` - RPC function (secure)
- `migrations/007_fix_public_forum_access.sql` - RPC update (secure)

### Events Module
- `src/app/events/page.tsx` - Main page
- `src/features/events/hooks/useEventTokenGating.ts` - Permission hooks
- `src/features/events/components/EventList.tsx` - Event listing
- `src/migrations/003_events_accessible_fixed.sql` - RPC function (VULNERABLE)

### Bounty Module
- `src/app/bounty/page.tsx` - Main page
- `src/features/bounty/hooks/useBountyManagementAccess.ts` - Permission hook (secure)

### Governance Module
- `src/app/governance/page.tsx` - Main page
- `src/features/governance/hooks/useEnhancedProposals.ts` - Proposal filtering

### Common Infrastructure
- `src/utils/accessControlUtils.ts` - Shared access control utilities
- `src/features/pods/components/PodModulesManager.tsx` - Module toggles UI

---

**Report Prepared By**: Claude Code
**Audit Date**: 2026-01-19
**Next Review**: After events RPC fix implementation
**Classification**: Internal Security Audit


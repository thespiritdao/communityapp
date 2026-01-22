# Forum Permission Security Audit
## Critical Vulnerability Report

**Date**: 2026-01-19
**Severity**: 🔴 **HIGH** - Authorization Bypass
**Status**: Identified, Fix Available

---

## Executive Summary

A critical permission bypass vulnerability was discovered in the forum access control system. Users can view forum categories associated with pods **even when the pod's forum module toggle is set to OFF**. This violates the intended security model where pod managers control module access via the Controls tab.

### Impact
- **Unauthorized Access**: Users with the correct HAT tokens can access pod forum categories regardless of the `pod_modules.forum_enabled` toggle state
- **Security Model Violation**: The Controls toggle is non-functional for forum access control
- **Trust Issue**: Pod managers believe they are controlling access but the toggle is not enforced

---

## Root Cause Analysis

### The Problem: Direct Query Bypass

In `src/app/forum/page.tsx` (lines 136-141), the application performs a **direct database query** to fetch pod-based forum categories:

```typescript
// 🔴 VULNERABLE CODE
const { data, error: podForumError } = await supabase
  .from('forum_categories')
  .select('*')
  .eq('is_active', true)
  .not('pod_id', 'is', null)
  .in('required_token', identity.userHats);  // ⚠️ Only checks HAT ownership!
```

#### What This Query Checks:
✅ `is_active = true` - Forum is marked active
✅ `pod_id IS NOT NULL` - It's a pod-specific forum
✅ `required_token IN user_hats` - User has the required HAT

#### What This Query **DOES NOT** Check:
❌ `pod_modules.forum_enabled` - Whether the pod's forum module is enabled!

---

## Why The Unified System Was Bypassed

### Design Intent (What Should Happen)

The application has a sophisticated permission system with multiple layers:

1. **RPC Function**: `forums_accessible_by_identity()`
   - **DOES** check `pm.forum_enabled = TRUE`
   - **DOES** check token/HAT requirements
   - **DOES** respect module toggles

2. **ForumAccessGate**: `useUnifiedForumAccess` hook
   - **DOES** call the RPC function
   - **DOES** check `pod_role_permissions.forumAccess`
   - **DOES** validate HAT ownership

3. **Pod Modules Manager**: UI toggle
   - **DOES** update `pod_modules.forum_enabled`
   - **DOES** show visual feedback

### What Actually Happens

The forum page (`src/app/forum/page.tsx`) implements a **dual-system approach**:

1. **Path A**: Legacy RPC system (✅ Secure)
   ```typescript
   const accessibleForums = await getUserAccessibleForums();
   // Calls forums_accessible_by_identity() RPC
   // ✅ Checks forum_enabled toggle
   ```

2. **Path B**: Direct query for pod forums (❌ **VULNERABLE**)
   ```typescript
   const { data } = await supabase
     .from('forum_categories')
     .select('*')
     .eq('is_active', true)
     .not('pod_id', 'is', null)
     .in('required_token', identity.userHats);
   // ❌ DOES NOT check forum_enabled toggle!
   ```

3. **Merge**: Results are combined without re-validation
   ```typescript
   allForumsMap.set(forum.id, forum);  // Vulnerable forums get added here
   ```

---

## Evidence of the Vulnerability

### Migration Files Confirm RPC Function is Secure

From `migrations/007_fix_public_forum_access.sql` (lines 44-46):
```sql
LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
WHERE fcrt.token_or_hat = ANY (user_hats)
  AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)  -- ✅ Toggle checked!
```

From `migrations/006_use_forum_access_permission.sql` (lines 98-101):
```sql
LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
WHERE prfa.hat_id = ANY (user_hats)
  AND prfa.forum_access = TRUE
  AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)  -- ✅ Toggle checked!
```

**The RPC function is CORRECT.** The problem is the application **bypasses it** with a direct query.

---

## Why This Bypass Exists

### Historical Context

When pod-based forums were initially implemented (`FORUM_REQUIRED_TOKEN_NULL_FIX`), the RPC function only used the `forum_category_required_tokens` link table. Pod forums store `required_token` directly in the `forum_categories` table, not in the link table.

To fix the "forums not showing" issue, a **direct query** was added as a workaround:

```typescript
// 2) ALSO get pod-based forum categories using direct required_token check
const { data } = await supabase
  .from('forum_categories')
  .select('*')
  .eq('is_active', true)
  .not('pod_id', 'is', null)
  .in('required_token', identity.userHats);
```

This query was **supposed** to be temporary until the RPC function was updated to support pod forums directly. **It was never updated to check the toggle.**

---

## Comparison: Chat vs Forum

### Does Chat Have the Same Issue?

**Analysis**: Chat system was not extensively audited, but initial inspection suggests:

- Chat uses `getAccessibleChatGroups()` from `accessControlUtils.ts`
- This function filters based on `required_token` client-side
- **Potential Issue**: May not check `pod_modules.chat_enabled` either

**Recommendation**: Perform similar audit on chat system.

---

## The Fix

### Solution: Add Module Toggle Check to Direct Query

Update `src/app/forum/page.tsx` to include the module toggle check:

```typescript
// 🟢 SECURE CODE
if (identity.userHats.length > 0) {
  const { data, error: podForumError } = await supabase
    .from('forum_categories')
    .select(`
      *,
      pods!inner(
        id,
        name,
        pod_modules!inner(forum_enabled)
      )
    `)
    .eq('is_active', true)
    .not('pod_id', 'is', null)
    .eq('pods.pod_modules.forum_enabled', true)  // ✅ Check toggle!
    .in('required_token', identity.userHats);

  if (podForumError) {
    console.warn('❌ Error fetching pod forums:', podForumError);
  } else {
    // Transform the nested structure
    podForums = (data || []).map(forum => ({
      ...forum,
      pod_name: forum.pods?.name || null,
    }));
    console.log('📊 Pod forums query returned:', podForums);
  }
}
```

### Alternative: Use RPC Function for Everything

**Better long-term solution**: Update the RPC function to handle pod forums natively.

Modify `forums_accessible_by_identity()` to include a CTE for pod forums:

```sql
f_pod_forums AS (
  SELECT DISTINCT fc.*
  FROM forum_categories fc
  JOIN pod_modules pm ON pm.pod_id = fc.pod_id
  WHERE fc.pod_id IS NOT NULL
    AND fc.required_token = ANY (user_hats)
    AND fc.is_active = TRUE
    AND pm.forum_enabled = TRUE  -- ✅ Toggle check
)
```

Then add it to the UNION:
```sql
SELECT * FROM f_public
UNION
SELECT * FROM f_tokens
UNION
SELECT * FROM f_hats
UNION
SELECT * FROM f_roles
UNION
SELECT * FROM f_pod_forums;  -- ✅ New CTE
```

This eliminates the need for the direct query entirely.

---

## Security Recommendations

### Immediate Actions (Priority: HIGH)

1. ✅ **Apply the fix** to `src/app/forum/page.tsx`
2. ✅ **Test thoroughly**: Verify toggle works correctly
3. ✅ **Audit chat system**: Check for similar vulnerabilities
4. ✅ **Review all direct queries**: Search for similar bypass patterns

### Medium-Term Actions

1. **Centralize access control**: All permission checks should go through RPC functions
2. **Add integration tests**: Test module toggle enforcement
3. **Security review process**: Require review for any direct database queries
4. **Documentation**: Document the permission architecture clearly

### Long-Term Actions

1. **Unified permission system**: Consolidate all access control logic
2. **Automated security testing**: Add tests that verify toggles are respected
3. **Principle of least privilege**: Default to deny, explicit allow
4. **Audit logging**: Log all permission checks for security monitoring

---

## Verification Steps

### To Verify the Fix Works:

1. **Setup**:
   - Create a pod with a forum category
   - Add a user as a member (they get the HAT)
   - Enable the forum toggle → User should see forum

2. **Test the vulnerability**:
   - Disable the forum toggle in Controls tab
   - **Before fix**: User still sees the forum ❌
   - **After fix**: User no longer sees the forum ✅

3. **Verify toggle state**:
   ```sql
   SELECT
     p.name as pod_name,
     pm.forum_enabled,
     fc.name as forum_name,
     fc.is_active
   FROM pods p
   JOIN pod_modules pm ON pm.pod_id = p.id
   JOIN forum_categories fc ON fc.pod_id = p.id;
   ```

4. **Check access**:
   - Run the audit script: `psql -f scripts/audit-forum-permissions.sql`
   - Review "POTENTIAL PERMISSION GAPS" section

---

## Technical Debt

### Issues Identified During Audit

1. **Dual permission systems**: RPC + direct queries create complexity
2. **No centralized enforcement**: Permission logic scattered across codebase
3. **Missing test coverage**: No automated tests for toggle enforcement
4. **Documentation gaps**: Permission architecture not documented
5. **Inconsistent patterns**: Chat and forum use different approaches

### Recommendations for Cleanup

1. **Consolidate to RPC-only**: Remove all direct permission queries
2. **Create permission service**: Centralize all access control logic
3. **Add comprehensive tests**: Test all permission scenarios
4. **Document architecture**: Create clear diagrams and documentation
5. **Standardize patterns**: Use consistent approach across modules

---

## Conclusion

The vulnerability exists because a **workaround for a previous bug** (forums not showing) introduced a **permission bypass**. The fix is straightforward: add the module toggle check to the direct query, or better yet, update the RPC function to handle pod forums natively.

**The permission system is NOT as unified as believed.** There are multiple code paths for permission checks, and not all of them respect the module toggles. A comprehensive security review and refactoring is recommended.

### Key Takeaways

1. **Module toggles are NOT enforced** for pod forums in the current implementation
2. **Direct database queries bypass** the secure RPC permission system
3. **Workarounds introduced vulnerabilities** that were never fixed
4. **A unified permission system exists** but is not consistently used
5. **Both immediate fix and long-term refactoring** are needed

---

## Appendix: Permission Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER REQUESTS FORUM ACCESS                │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴────────────┐
         │                        │
         ▼                        ▼
┌────────────────────┐   ┌────────────────────┐
│  Path A: RPC       │   │  Path B: Direct    │
│  (Secure ✅)       │   │  (Vulnerable ❌)   │
│                    │   │                    │
│ getUserAccessible  │   │  SELECT * FROM     │
│ Forums()           │   │  forum_categories  │
│   └─> forums_      │   │  WHERE pod_id      │
│       accessible_  │   │  IS NOT NULL       │
│       by_identity()│   │  AND required_     │
│                    │   │  token IN hats     │
│ ✅ Checks toggle   │   │                    │
│ ✅ Checks HATs     │   │ ❌ NO toggle check │
│ ✅ Checks perms    │   │ ✅ Checks HATs     │
└────────┬───────────┘   └─────────┬──────────┘
         │                         │
         │    ┌────────────────────┘
         │    │
         ▼    ▼
    ┌─────────────┐
    │   MERGE     │  ← ❌ No re-validation!
    │   RESULTS   │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │  USER SEES  │
    │   FORUMS    │
    └─────────────┘
```

---

## Files Referenced

- `src/app/forum/page.tsx:136-141` - Vulnerable direct query
- `src/features/forum/components/ForumAccessGate.tsx` - Access gate component
- `src/features/forum/hooks/useUnifiedForumAccess.ts` - Permission hook (secure)
- `src/features/pods/components/PodModulesManager.tsx` - Toggle UI
- `src/utils/accessControlUtils.ts` - Access control utilities
- `migrations/007_fix_public_forum_access.sql` - RPC function definition
- `migrations/006_use_forum_access_permission.sql` - Permission migration

---

**Report Prepared By**: Claude Code
**Report Date**: 2026-01-19
**Next Review**: After fix implementation

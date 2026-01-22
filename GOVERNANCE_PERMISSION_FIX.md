# Governance Permission Authorization Bypass Fix

## Issue Summary

**Severity**: 🔴 CRITICAL - Authorization Bypass Vulnerability
**Date Fixed**: 2026-01-22
**Component**: CreateProposalForm

### The Problem

Users could bypass pod-specific "Governance Participation" permission toggles and create proposals in pods where governance was explicitly disabled for their role.

**User Report**:
> "I have been creating proposals for the Temporal Naturalism pod but the 'Governance Participation' toggle has been off. In an ideal framework it would have been blocking my capacity to a.) Create Proposals for that pod/role, b.) Voting on proposals tagged with the role."

### Root Cause

The CreateProposalForm component used **consolidated/global** governance permissions instead of **pod-specific** permissions:

```typescript
// ❌ VULNERABLE CODE:
const hasGovernancePermission = hatPermissions?.governanceParticipation ?? false;
// This was TRUE if user had governance in ANY pod, not the specific pod
```

Additionally, there was a bypass where pod leaders could create proposals without permission checks:

```typescript
// ❌ VULNERABLE CODE:
const { data: ledPods } = await supabase
  .from('pods')
  .select('id, name, pod_leads')
  .contains('pod_leads', [address.toLowerCase()]);
// Added pods where user is leader WITHOUT checking governanceParticipation
```

### Attack Scenario

1. User has "Governance Participation" permission in Pod A
2. User is a member/leader in Pod B
3. Pod B manager DISABLES "Governance Participation" for user's role
4. User navigates to `/governance`
5. `hasGovernancePermission = true` (because of Pod A permission)
6. User can select Pod B from dropdown (via pod_leads bypass)
7. **User successfully creates proposal in Pod B** ❌ (Should have been blocked)

---

## Fixes Implemented

### 1. Use Pod-Specific Permission Checks

**File**: `src/features/governance/components/CreateProposalForm.tsx`

**Lines 244-261**: Changed from global to pod-specific permissions

```typescript
// ✅ FIXED: Check governance participation permission for SPECIFIC pods, not global
const podsWithGovernancePermission = React.useMemo(() => {
  return (userRoles || [])
    .filter(role => role.permissions?.governanceParticipation === true && role.podId)
    .map(role => role.podId);
}, [userRoles]);

// User can create proposals if they have governance permission in at least one pod
const hasGovernancePermission = podsWithGovernancePermission.length > 0;
```

### 2. Removed Pod Leader Bypass

**File**: `src/features/governance/components/CreateProposalForm.tsx`

**Lines 483-512**: Removed the pod_leads bypass that allowed proposal creation without permission check

```typescript
// ✅ SECURITY FIX: Only load pods where user has governanceParticipation permission
// Removed pod_leads bypass that allowed proposal creation without permission check
for (const role of userRoles || []) {
  if (role.permissions?.governanceParticipation && role.podId) {
    // Add pod to dropdown
  } else if (role.podId) {
    // Log pods where user does NOT have governance permission
    console.log(`  ⚠️ Skipped pod (no governance permission): ${pod.name}`);
  }
}
```

### 3. Added Server-Side Validation

**File**: `src/features/governance/components/CreateProposalForm.tsx`

**Lines 1121-1134**: Added validation at submission time

```typescript
// ✅ SECURITY: Validate that user has governance permission in the selected pod
const selectedPodId = formData.selectedToken;
if (selectedPodId && !podsWithGovernancePermission.includes(selectedPodId)) {
  console.error('❌ Authorization failed: User does not have governance permission in selected pod');
  toast({
    title: 'Authorization Error',
    description: 'You do not have governance participation permission in the selected pod',
    variant: 'destructive',
  });
  return;
}
```

---

## Voting Component (Already Secure)

**File**: `src/features/governance/components/EnhancedVoteButton.tsx`

The voting component was already correctly implemented:

```typescript
// ✅ CORRECT: Check governance permission for the CORRECT pod
const { canParticipate: hasGovernancePermission } = useGovernancePermission(
  proposal.approving_pod_id,  // Pod-specific check
  proposal.governance_context,
);

// ✅ Block voting if no permission
if (!hasGovernancePermission) {
  return (
    <Button disabled title="You do not have governance participation permission">
      {getChoiceText(choice)} (No Permission)
    </Button>
  );
}
```

---

## Testing Plan

### Test Case 1: User with Governance in Pod A, Member of Pod B (Governance OFF)

**Setup:**
1. User is member of "Temporal Naturalism" pod (Pod B)
2. Pod manager sets `governanceParticipation = false` for user's role
3. User has `governanceParticipation = true` in another pod (Pod A)

**Expected Behavior (After Fix):**
- ✅ User can create proposals for Pod A
- ❌ User CANNOT see Pod B in the pod dropdown
- ❌ User CANNOT create proposals for Pod B
- ❌ User CANNOT vote on proposals tagged with Pod B

**Test Steps:**
1. Navigate to `/governance`
2. Click "Create Proposal"
3. Check pod dropdown - Pod B should NOT appear
4. Attempt to vote on existing Pod B proposals - button should be disabled

### Test Case 2: User with Governance in Multiple Pods

**Setup:**
1. User has `governanceParticipation = true` in Pod A
2. User has `governanceParticipation = true` in Pod B

**Expected Behavior:**
- ✅ User can see BOTH pods in dropdown
- ✅ User can create proposals for either pod
- ✅ User can vote on proposals for either pod

### Test Case 3: Pod Leader with No Governance Permission

**Setup:**
1. User is in `pod_leads` array for Pod C
2. User has `governanceParticipation = false` for their role

**Expected Behavior (After Fix):**
- ❌ User CANNOT see Pod C in dropdown (bypass removed)
- ❌ User CANNOT create proposals for Pod C
- ❌ User CANNOT vote on proposals for Pod C

---

## Database Verification Query

To verify permission settings for a specific user in a specific pod:

```sql
SELECT
  p.name as pod_name,
  prp.role_name,
  prp.permissions->>'governanceParticipation' as governance_participation,
  apm.wallet,
  apm.hat_id
FROM pod_role_permissions prp
JOIN active_pod_members apm ON prp.token_address = apm.hat_id
JOIN pods p ON prp.pod_id = p.id
WHERE apm.wallet = '0xuser-address-lowercase'
ORDER BY p.name;
```

---

## Security Impact

- **Before Fix**: Users could bypass governance permissions and create/vote in any pod they had access to
- **After Fix**: Users can ONLY create/vote in pods where they have explicit `governanceParticipation = true`
- **Scope**: Affects all users with mixed governance permissions across multiple pods
- **Risk Mitigated**: Authorization bypass, privilege escalation

---

## Related Files Changed

1. `src/features/governance/components/CreateProposalForm.tsx` - Main fixes
2. `src/features/governance/components/EnhancedVoteButton.tsx` - Already correct (verified)
3. `src/hooks/useGovernancePermission.ts` - Already correct (verified)

---

## Monitoring

After deployment, monitor for:
- Console logs: `⚠️ Skipped pod (no governance permission): [Pod Name]`
- Error toasts: "You do not have governance participation permission in the selected pod"
- User reports about not being able to create proposals (may indicate fix is working correctly)

---

## Rollback Plan

If issues arise, revert commit with:
```bash
git revert <commit-hash>
```

The consolidated permissions approach will be restored, but the authorization bypass will return.

---

## Future Improvements

1. **API-Level Validation**: Add server-side permission checks in proposal submission API
2. **RLS Policies**: Enforce pod-specific governance permissions at database level
3. **Audit Logging**: Log all proposal creation attempts with permission context
4. **Module Toggle**: Consider adding `governance_enabled` to `pod_modules` for consistency with other modules

---

## References

- Investigation Report: In-memory from agent investigation
- useGovernancePermission Hook: `src/hooks/useGovernancePermission.ts`
- Pod Permissions Audit: `COMPREHENSIVE_PERMISSION_AUDIT_2026.md`
- Related Issue: Events module had similar pattern (fixed)

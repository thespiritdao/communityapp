# Governance Visibility and Permissions System

## Date: 2026-01-22
## Status: ✅ IMPLEMENTED

---

## Overview

The governance system follows a **transparency-first** approach:
- ✅ **ALL proposals are visible to everyone** (transparency)
- ✅ **Voting is restricted by pod-specific permissions** (security)
- ✅ **Users can filter between relevant and all proposals** (usability)

---

## User Experience Flow

### 1. Viewing Proposals

**Default View: "My Proposals"**
- Shows only proposals the user can vote on
- Reduces cognitive load and user fatigue
- Count displayed: `My Proposals (3)`

**Alternative View: "All Proposals"**
- Shows ALL proposals regardless of voting permissions
- Promotes transparency and awareness
- Count displayed: `All Proposals (15)`

**Toggle Location**: Top-right of "Active Proposals" section

```
Active Proposals                    [My Proposals (3)] [All Proposals (15)]
```

### 2. Creating Proposals

**Permission Check**: Pod-specific `governanceParticipation` permission

```typescript
// User can ONLY select pods where they have governance permission
const podsWithGovernancePermission = userRoles
  .filter(role => role.permissions?.governanceParticipation === true)
  .map(role => role.podId);
```

**Behavior:**
- ✅ Dropdown shows ONLY pods with permission
- ❌ Bypasses removed (no more pod_leads bypass)
- ✅ Validation at submission time
- ✅ Console logs: `⚠️ Skipped pod (no governance permission): [Pod Name]`

### 3. Voting on Proposals

**Permission Check**: Pod-specific for the proposal's `approving_pod_id`

```typescript
const { canParticipate: hasGovernancePermission } = useGovernancePermission(
  proposal.approving_pod_id,
  proposal.governance_context,
);
```

**Behavior When Permission is OFF:**
- ✅ Proposal is VISIBLE in "All Proposals" view
- ❌ Proposal is HIDDEN in "My Proposals" view
- ✅ Vote buttons are DISABLED with opacity
- ✅ Message displayed: "Insufficient permissions to vote"
- ✅ Tooltip: "You do not have governance participation permission in the required pod"

---

## Test Workflow (Temporal Naturalism Pod Example)

### Setup:
1. User is member of Temporal Naturalism pod
2. User creates a proposal for that pod
3. Pod manager turns OFF "Governance Participation" for user's role

### Expected Behavior:

#### Filter: "My Proposals"
```
[ ] The proposal does NOT appear (user cannot vote)
```

#### Filter: "All Proposals"
```
[✓] The proposal DOES appear (transparency)
[✓] Vote buttons show as disabled
[✓] Message: "Insufficient permissions to vote"
[✓] User can still READ the proposal details
```

#### Creating New Proposals:
```
[✓] Temporal Naturalism pod does NOT appear in dropdown
[✓] Console: "⚠️ Skipped pod (no governance permission): Temporal Naturalism"
```

---

## Proposal Types and Governance Context

### 1. DAO-Wide Proposals (On-Chain Governance)
- **Approving Pod**: Executive Pod
- **Permission Required**: `governanceParticipation` in Executive Pod
- **Visibility**: ALL users can see (transparency)
- **Voting**: Only Executive Pod members with permission

### 2. Pod Creation Proposals
- **Approving Pod**:
  - Executive Pod (for top-level pods under Community Pod)
  - Parent Pod (for sub-pods)
- **Permission Required**: `governanceParticipation` in approving pod
- **Visibility**:
  - **Before Fix**: Only shown if user can vote
  - **After Fix**: ALL users can see (consistency with on-chain proposals)
- **Voting**: Only approving pod members with permission

### 3. Pod-Level Proposals (Future)
- **Approving Pod**: The pod itself
- **Permission Required**: `governanceParticipation` in that specific pod
- **Visibility**: ALL users can see
- **Voting**: Only pod members with permission

---

## Database Schema

### `pod_role_permissions` Table

```sql
CREATE TABLE pod_role_permissions (
  pod_id UUID,
  token_address TEXT, -- HAT ID
  role_name TEXT,
  permissions JSONB,  -- { governanceParticipation: boolean }
  is_active BOOLEAN
);
```

**Example Permission:**
```json
{
  "governanceParticipation": true,
  "forumWrite": true,
  "marketplace": true,
  "events": true
}
```

**Query to Check User's Permission:**
```sql
SELECT
  p.name as pod_name,
  prp.role_name,
  prp.permissions->>'governanceParticipation' as governance_participation
FROM pod_role_permissions prp
JOIN active_pod_members apm ON prp.token_address = apm.hat_id
JOIN pods p ON prp.pod_id = p.id
WHERE apm.wallet = '0xuser-address-lowercase'
  AND prp.pod_id = 'temporal-naturalism-pod-id';
```

---

## Component Architecture

### CreateProposalForm (`src/features/governance/components/CreateProposalForm.tsx`)

**Lines 246-250**: Pod-specific permission check
```typescript
const podsWithGovernancePermission = React.useMemo(() => {
  return (userRoles || [])
    .filter(role => role.permissions?.governanceParticipation === true && role.podId)
    .map(role => role.podId);
}, [userRoles]);
```

**Lines 1121-1134**: Submission validation
```typescript
if (selectedPodId && !podsWithGovernancePermission.includes(selectedPodId)) {
  toast({
    title: 'Authorization Error',
    description: 'You do not have governance participation permission',
  });
  return;
}
```

### EnhancedVoteButton (`src/features/governance/components/EnhancedVoteButton.tsx`)

**Lines 37-40**: Pod-specific permission check
```typescript
const { canParticipate: hasGovernancePermission } = useGovernancePermission(
  proposal.approving_pod_id,
  proposal.governance_context,
);
```

**Lines 77-95**: Disabled state with message
```typescript
if (!hasGovernancePermission) {
  return (
    <div className="flex flex-col gap-1">
      <Button disabled className="opacity-50">
        {getChoiceText(choice)}
      </Button>
      <span className="text-xs text-gray-500 italic">
        Insufficient permissions to vote
      </span>
    </div>
  );
}
```

### GovernancePage (`src/app/governance/page.tsx`)

**Line 21**: Filter state
```typescript
const [proposalFilter, setProposalFilter] = useState<'all' | 'votable'>('votable');
```

**Lines 65-67**: Filter logic
```typescript
const filteredProposals = proposalFilter === 'all'
  ? enhancedProposals
  : enhancedProposals.filter(p => p.user_can_vote);
```

**Lines 177-200**: Filter toggle UI
```typescript
<div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
  <button onClick={() => setProposalFilter('votable')}>
    My Proposals ({enhancedProposals.filter(p => p.user_can_vote).length})
  </button>
  <button onClick={() => setProposalFilter('all')}>
    All Proposals ({enhancedProposals.length})
  </button>
</div>
```

### useEnhancedProposals (`src/features/governance/hooks/useEnhancedProposals.ts`)

**Lines 85-107**: On-chain proposals (NOT filtered)
```typescript
for (const proposal of onChainProposals) {
  allProposals.push({
    ...proposal,
    user_can_vote: hasDAOGovernancePermission, // Permission flag
    approving_pod_id: execPodId,
  });
}
// NOTE: All proposals added regardless of permission
```

**Lines 212-214**: Pod proposals filtering (REMOVED for consistency)
```typescript
// BEFORE: Filtered to only votable proposals
const relevantPodProposals = userVotableProposals.filter(
  (proposal) => proposal.user_can_vote || proposal.user_vote,
);

// AFTER: Show all pod proposals (same as on-chain)
allProposals.push(...userVotableProposals);
```

---

## Security Guarantees

### ✅ What is Protected:

1. **Proposal Creation**: Can ONLY create proposals in authorized pods
2. **Voting**: Can ONLY vote on proposals if permission is enabled
3. **Submission**: Server-side validation prevents unauthorized submissions
4. **Pod Selection**: Dropdown only shows authorized pods

### ✅ What is Transparent:

1. **Proposal Viewing**: Everyone can see all proposals
2. **Vote Counts**: Public vote tallies (blockchain transparency)
3. **Proposal Details**: Full description and metadata visible to all

### ❌ What is NOT Protected:

1. **Reading proposals** - Intentionally public for transparency
2. **Viewing vote counts** - Public blockchain data
3. **Seeing proposal metadata** - DAO operations should be transparent

---

## User Flow Examples

### Example 1: Power User in Multiple Pods

**User Profile:**
- Executive Pod member (governance ON)
- Dev Pod member (governance ON)
- Marketing Pod member (governance OFF)

**"My Proposals" View:**
```
✅ Executive Pod Proposal #123
✅ Dev Pod Proposal #456
(2 proposals shown)
```

**"All Proposals" View:**
```
✅ Executive Pod Proposal #123 [Can Vote]
✅ Dev Pod Proposal #456 [Can Vote]
⚠️ Marketing Pod Proposal #789 [Insufficient permissions to vote]
(3 proposals shown)
```

### Example 2: Read-Only Observer

**User Profile:**
- Community member (no governance permissions in any pod)

**"My Proposals" View:**
```
No proposals available for you to vote on.
You can view all proposals using the "All Proposals" filter above.
```

**"All Proposals" View:**
```
⚠️ Executive Pod Proposal #123 [Insufficient permissions to vote]
⚠️ Dev Pod Proposal #456 [Insufficient permissions to vote]
⚠️ Marketing Pod Proposal #789 [Insufficient permissions to vote]
(3 proposals shown - all read-only)
```

### Example 3: Temporal Naturalism Test Case

**Initial State:**
- User creates proposal for Temporal Naturalism pod
- Governance participation: ON

**After Governance Toggle OFF:**
- User navigates to `/governance`
- Default view: "My Proposals" - **Proposal NOT shown**
- Switch to "All Proposals" - **Proposal IS shown**
- Vote buttons: **Disabled with "Insufficient permissions" message**
- Proposal details: **Fully readable**

---

## Benefits of This Approach

### 1. Transparency
- All DAO proposals are visible to everyone
- Promotes accountability and awareness
- Aligns with web3 ethos

### 2. Security
- Pod-specific permission enforcement
- No authorization bypasses
- Clear visual indicators of voting ability

### 3. Usability
- Default view shows only relevant proposals (reduced fatigue)
- Easy toggle to see all proposals (full context)
- Clear messaging about permissions
- Vote button states indicate ability to participate

### 4. Flexibility
- Pod managers can adjust governance access per role
- Users can monitor proposals even without voting rights
- Filter preserves user choice between focus and awareness

---

## Future Enhancements

### 1. Notification Preferences
```
[ ] Notify me of new proposals in pods I can vote on
[ ] Notify me of ALL new proposals (observer mode)
```

### 2. Proposal Categories
```
[All] [DAO-Wide] [Pod Creation] [Pod Management]
```

### 3. Permission Indicators
```
Executive Pod Proposal #123
└─ 🔓 You can vote  |  🔒 View only
```

### 4. Analytics Dashboard
```
Your Voting Activity:
- Proposals you can vote on: 5
- Proposals you've voted on: 3
- Voting participation rate: 60%
```

---

## Related Documentation

- `GOVERNANCE_PERMISSION_FIX.md` - Authorization bypass fix (2026-01-22)
- `COMPREHENSIVE_PERMISSION_AUDIT_2026.md` - Full permission system audit
- `POD_MODULES_CHAT_RLS_FIX.md` - Similar pattern for chat permissions

---

## Testing Checklist

### Pre-Deployment Tests:

- [ ] User with governance in Pod A CANNOT create proposals for Pod B
- [ ] User with governance OFF sees proposal but cannot vote
- [ ] Filter toggle works correctly (counts match)
- [ ] "My Proposals" shows only votable proposals
- [ ] "All Proposals" shows all proposals
- [ ] Vote button shows "Insufficient permissions" when appropriate
- [ ] Console logs: "⚠️ Skipped pod (no governance permission)"

### Post-Deployment Monitoring:

- [ ] Check for authorization errors in logs
- [ ] Monitor user feedback about filter UX
- [ ] Track voting participation rates
- [ ] Verify no bypasses or permission leaks

---

## Summary

The governance system now provides:
- **Full transparency**: Everyone sees all proposals
- **Strict security**: Pod-specific permission enforcement
- **User-friendly filtering**: Toggle between relevant and all proposals
- **Clear messaging**: Disabled buttons with permission explanations

This balances DAO transparency principles with role-based access control, while maintaining excellent UX through smart filtering defaults.

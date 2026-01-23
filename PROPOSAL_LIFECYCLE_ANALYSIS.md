# Proposal Lifecycle Analysis - Why Orphaned & Future Impact

## Why Those 3 Proposals Were "Orphaned"

**They're NOT orphaned - they're working as designed!**

Here's what happened:

1. You deleted from `proposal_metadata` table (DAO-wide proposals)
2. But the 3 proposals showing are from `pod_level_proposals` table (pod-specific proposals)
3. **These are completely separate tables for different governance types**

### Your Governance Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GOVERNANCE SYSTEM                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. DAO-WIDE PROPOSALS (On-Chain Governor Contract)         │
│     Table: proposal_metadata                                │
│     Example: "Should we upgrade the protocol?"              │
│     Voting: All DAO token holders                           │
│     Status: active/executed/cancelled (from on-chain)       │
│                                                              │
│  2. POD CREATION PROPOSALS (Pod Approval)                   │
│     Table: pods (status: 'proposed'/'draft')                │
│     Example: "Approve new Marketing Pod"                    │
│     Voting: Executive Pod members                           │
│     Status: proposed/approved/rejected                      │
│                                                              │
│  3. POD-LEVEL PROPOSALS (Pod-Specific Decisions)            │
│     Table: pod_level_proposals ← YOUR 3 PROPOSALS           │
│     Example: "Should Marketing Pod hire a designer?"        │
│     Voting: Pod members with governance permission          │
│     Status: proposed/active/approved/rejected/executed      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Not orphaned - just in a different table!**

---

## Current Status Management

### DAO-Wide Proposals (proposal_metadata)

**Status Source:** On-chain Governor contract
**Query Logic:**
```typescript
// useProposalsV3.ts
.eq('status', 'active')  // Only shows 'active' proposals
```

**Status Values:**
- `active` - Currently votable
- `executed` - Proposal passed and executed
- `cancelled` - Proposal was cancelled
- (Status comes from on-chain contract state)

**Automatic Updates:** ❌ NO
- Status must be manually updated OR
- Background sync service must update from on-chain state

### Pod-Level Proposals (pod_level_proposals)

**Status Source:** Database only (off-chain)
**Query Logic:**
```typescript
// governanceService.ts line 483
.in('status', ['proposed', 'active', 'approved', 'rejected'])
```

**Status Values (from schema):**
- `draft` - Being created
- `proposed` - Submitted for voting
- `active` - Currently votable
- `approved` - Passed
- `rejected` - Failed
- `executed` - Approved and executed

**Automatic Updates:** ❌ NO
- No automatic status changes based on deadline
- No automatic archiving of old proposals
- **This is a gap in the current architecture!**

### Pod Creation Proposals (pods table)

**Query Logic:**
```typescript
// useEnhancedProposals.ts line 123
.filter(pod => pod.status === 'proposed' || pod.status === 'draft')
```

**Status Values:**
- `draft` - Being created
- `proposed` - Awaiting approval
- `approved` - Approved, pod is active
- `rejected` - Rejected

---

## Do We Need to Worry About This in the Future?

**YES - There are 3 gaps in the current architecture:**

### Gap #1: No Automatic Proposal Expiration ⚠️

**Problem:**
- `pod_level_proposals` has `voting_deadline` field
- But there's NO code that checks this deadline
- Proposals with expired deadlines continue showing as "active"

**Impact:**
- Old proposals stay in the UI forever
- Users can vote on expired proposals
- No automatic status transition to "rejected" or "archived"

**Example:**
```sql
-- This proposal expired 30 days ago, but still shows as "active"
INSERT INTO pod_level_proposals (title, status, voting_deadline)
VALUES ('Old Proposal', 'active', NOW() - INTERVAL '30 days');
```

### Gap #2: No Automatic Status Updates ⚠️

**Problem:**
- DAO-wide proposals fetch state from on-chain contract
- But `proposal_metadata.status` is never updated
- V3 fetches state from contract every time (wasteful)

**Impact:**
- Database status can drift from on-chain state
- Wasted RPC calls fetching state every page load
- No historical record of when proposal was executed

**Example:**
```typescript
// Current V3 approach (lines 115-137 in useProposalsV3.ts)
const state = await publicClient.readContract({
  functionName: 'state',
  args: [proposalId], // Fetches state EVERY TIME
});
// Should instead: Update database when state changes
```

### Gap #3: No Proposal Archiving ⚠️

**Problem:**
- Executed/rejected proposals stay in "active" queries forever
- No automatic archiving after X days
- Database will grow indefinitely

**Impact:**
- Query performance degrades over time
- UI clutter with old proposals
- Unnecessary data transfer

---

## Recommendations: Automatic Lifecycle Management

### Solution #1: Automatic Deadline Expiration (High Priority)

**Create Database Function:**
```sql
-- supabase/migrations/YYYYMMDD_auto_expire_proposals.sql

CREATE OR REPLACE FUNCTION expire_old_pod_proposals()
RETURNS void AS $$
BEGIN
  UPDATE pod_level_proposals
  SET status = 'rejected'
  WHERE status IN ('proposed', 'active')
    AND voting_deadline < NOW()
    AND voting_deadline IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Run daily via pg_cron
SELECT cron.schedule(
  'expire-old-proposals',
  '0 0 * * *', -- Daily at midnight
  $$SELECT expire_old_pod_proposals()$$
);
```

**Alternative (Client-Side):**
```typescript
// Add to useEnhancedProposals.ts
const podLevelProposals = await GovernanceService.getPodLevelProposals();

const activeProposals = podLevelProposals.filter(p => {
  // Filter out expired proposals client-side
  if (p.voting_deadline && new Date(p.voting_deadline) < new Date()) {
    return false; // Expired
  }
  return true;
});
```

### Solution #2: Background Sync Service (Medium Priority)

**Update DAO-wide proposal status from on-chain:**
```typescript
// scripts/sync-proposal-status.ts
async function syncProposalStatuses() {
  const { data: proposals } = await supabase
    .from('proposal_metadata')
    .select('onchain_proposal_id, status')
    .eq('status', 'active');

  for (const proposal of proposals) {
    const onChainState = await publicClient.readContract({
      functionName: 'state',
      args: [BigInt(proposal.onchain_proposal_id)],
    });

    const newStatus = mapStateToStatus(onChainState);

    if (newStatus !== proposal.status) {
      await supabase
        .from('proposal_metadata')
        .update({ status: newStatus })
        .eq('onchain_proposal_id', proposal.onchain_proposal_id);
    }
  }
}

// Run every 5 minutes via cron
```

**Benefit:**
- V3 can trust database status
- No need to fetch state on every page load
- Faster page loads (0.5s → 0.1s)

### Solution #3: Automatic Archiving (Low Priority)

**Archive old proposals:**
```sql
-- Archive proposals older than 90 days
CREATE OR REPLACE FUNCTION archive_old_proposals()
RETURNS void AS $$
BEGIN
  -- Archive DAO-wide proposals
  UPDATE proposal_metadata
  SET status = 'archived'
  WHERE status IN ('executed', 'cancelled')
    AND created_at < NOW() - INTERVAL '90 days';

  -- Archive pod-level proposals
  UPDATE pod_level_proposals
  SET status = 'archived'
  WHERE status IN ('approved', 'rejected', 'executed')
    AND created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
```

**Update queries to exclude archived:**
```typescript
// useProposalsV3.ts
.eq('status', 'active')
.not('status', 'eq', 'archived') // Exclude archived

// governanceService.ts
.in('status', ['proposed', 'active', 'approved', 'rejected'])
// Already excludes 'archived' ✅
```

---

## Impact on Proposals Whose Time Expires

### Current Behavior (No Automatic Expiration)

**Scenario:** Pod-level proposal with `voting_deadline: 2026-01-01`

**What happens on 2026-01-02:**
1. ✅ Proposal still shows in /governance
2. ✅ Users can still vote
3. ❌ No indication that deadline passed
4. ❌ Status stays "active" forever

**User Experience:** ⚠️ Confusing - looks like active proposal

### DAO-Wide Proposals (On-Chain)

**Scenario:** On-chain proposal reaches deadline

**What happens:**
1. ✅ Contract state changes automatically (Pending → Defeated/Succeeded)
2. ❌ Database `proposal_metadata.status` NOT updated
3. ✅ V3 fetches fresh state from contract (sees correct state)
4. ⚠️ Requires RPC call every page load

**User Experience:** ✅ Works, but inefficient

### Recommended User Experience

**With automatic expiration:**
```typescript
// Display expired proposals differently
if (proposal.voting_deadline && new Date(proposal.voting_deadline) < new Date()) {
  return (
    <div className="opacity-50">
      <Badge variant="outline" className="text-gray-500">
        Voting Ended
      </Badge>
      <p className="text-sm text-gray-500">
        Deadline: {new Date(proposal.voting_deadline).toLocaleDateString()}
      </p>
      {/* Show results, but disable voting */}
    </div>
  );
}
```

---

## Implementation Priority

### Immediate (This Week)
1. ✅ **Client-side deadline filtering** - Quick fix in `useEnhancedProposals.ts`
2. ✅ **Update query to exclude 'archived'** - Prevent showing archived proposals

### Short-term (Next 2 Weeks)
1. ⚠️ **Database function for expiration** - Auto-update status based on deadline
2. ⚠️ **Background sync service** - Update DAO-wide proposal status from on-chain

### Long-term (Production)
1. 📅 **pg_cron jobs** - Automated expiration and archiving
2. 📅 **Monitoring** - Track proposals by status, alert on issues
3. 📅 **Admin UI** - Manual status management when needed

---

## Quick Fix for Immediate Use

**Add deadline checking to useEnhancedProposals.ts:**

```typescript
// After line 278 in useEnhancedProposals.ts
const podLevelProposals = await GovernanceService.getPodLevelProposals();

// Filter out expired proposals
const activeProposals = podLevelProposals.filter(p => {
  if (!p.voting_deadline) return true; // No deadline = always active
  return new Date(p.voting_deadline) >= new Date(); // Not expired
});

for (const proposal of activeProposals) { // Use filtered list
  // ... rest of code
}
```

This prevents expired proposals from showing immediately, without database changes.

---

## Summary

**Why "orphaned"?**
- Not orphaned - just in different table (`pod_level_proposals` vs `proposal_metadata`)

**Future worry?**
- ⚠️ YES - need automatic expiration based on `voting_deadline`
- ⚠️ YES - need status updates for DAO-wide proposals
- ⚠️ YES - need archiving for old proposals

**Immediate action:**
- Add client-side deadline filtering (5 min fix)
- Plan background sync service for production

**No impact yet because:**
- System is new, no expired proposals
- But will become issue as proposals age
- Proactive fix recommended before production launch

# Proposal Creation & Voting Display Fixes

## Issue 1: Duplicate Proposal Creation

### Problem
When creating a proposal with a pod token selected, the system creates TWO proposals:
1. On-chain governance proposal (in `proposal_metadata`)
2. Pod-level proposal (in `pod_level_proposals`)

### Root Cause
**File:** `src/features/governance/components/CreateProposalForm.tsx` (Lines 1405-1433)

```typescript
// Line 1387: ALWAYS creates proposal_metadata entry
const { error: metadataError } = await supabase
  .from('proposal_metadata')
  .insert([{
    onchain_proposal_id: tempProposalId,
    title: proposalTitle,
    // ...
  }]);

// Line 1409-1430: ALSO creates pod_level_proposals if pod selected
const isPodLevelProp = proposalTokenId && !isDAOWide;
if (isPodLevelProp) {
  await GovernanceService.createPodLevelProposal({
    // Creates duplicate entry
  });
}
```

### The Logic Should Be:

1. **DAO-Wide Proposal** (`selectedToken === 'dao-wide'`):
   - ✅ Submit to Governor contract (on-chain)
   - ✅ Save to `proposal_metadata`
   - ❌ Do NOT save to `pod_level_proposals`
   - Uses `VoteButton` component
   - Voted on by Executive Pod members

2. **Pod-Level Proposal** (`selectedToken === <pod-id>`):
   - ❌ Do NOT submit to Governor contract
   - ❌ Do NOT save to `proposal_metadata`
   - ✅ Save to `pod_level_proposals` only
   - Uses `EnhancedVoteButton` component
   - Voted on by pod members

3. **Pod Creation Proposal**:
   - ❌ Do NOT submit to Governor contract
   - ❌ Do NOT save to `proposal_metadata`
   - ✅ Save to `pods` table with `status='proposed'`
   - Uses `EnhancedVoteButton` component
   - Voted on by Executive Pod members

### Current Broken Flow:
```
User creates proposal with "Beta Testers" pod selected
  ↓
Submits to Governor contract (ON-CHAIN) ← WRONG for pod-level
  ↓
Saves to proposal_metadata ← WRONG for pod-level
  ↓
Saves to pod_level_proposals ← Correct
  ↓
Result: 2 proposals created!
```

### Correct Flow Should Be:
```
User creates proposal with "Beta Testers" pod selected
  ↓
Skip Governor contract submission
  ↓
Save ONLY to pod_level_proposals
  ↓
Result: 1 pod-level proposal
```

### Fix Required:

**In `CreateProposalForm.tsx`, around line 1250:**

```typescript
const isDAOWide = proposalTokenId === 'dao-wide';
const isPodLevel = proposalTokenId && !isDAOWide;

if (isDAOWide) {
  // Current code: Submit to Governor + save to proposal_metadata
  // This is correct - keep it
} else if (isPodLevel) {
  // NEW: Skip Governor submission entirely
  // Just save to pod_level_proposals
  try {
    await GovernanceService.createPodLevelProposal({
      title: formData.title,
      description: formData.body,
      pod_id: proposalTokenId,
      created_by: address!,
      metadata: {
        forum_thread_id: formData.forumThreadId,
        choices: ['For', 'Against', 'Abstain'],
      },
    });

    toast({
      title: '✅ Pod Proposal Created!',
      description: 'Your pod-level proposal has been created.',
    });

    // Trigger refetch
    queryClient.invalidateQueries({ queryKey: ['enhanced-proposals'] });
    onSuccess?.();
    return; // Exit early - don't submit to Governor
  } catch (error) {
    // Handle error
  }
}
```

## Issue 2: Pod Creation Vote Not Displaying

### Problem
When voting on a pod creation proposal using `EnhancedVoteButton`, the vote is saved to database but doesn't appear on the frontend.

### Possible Causes:

#### Cause 1: React Query Not Refetching
**File:** `src/features/governance/components/EnhancedVoteButton.tsx` (Line 273)

```typescript
// CRITICAL: Trigger refetch to update UI immediately
console.log('🔄 [VOTE V3] Triggering UI refetch...');
onVoteSuccess?.();
```

**Check:** Is `onVoteSuccess` actually being passed and called?

**File:** `src/app/governance/page.tsx` (Line 442)

```typescript
<EnhancedVoteButton
  key={`${proposal.id}-${idx}`}
  proposal={proposal}
  choice={idx + 1}
  onVoteSuccess={refetchProposals}  // ← Is this being called?
/>
```

#### Cause 2: Vote Count Not Being Aggregated
Pod-level votes are stored in `governance_votes` table but may not be aggregated into vote counts.

**Check:** Does `useEnhancedProposals` fetch vote counts for pod-level proposals?

**File:** `src/features/governance/hooks/useEnhancedProposals.ts`

Need to check if it queries vote counts from `governance_votes` for pod-level proposals.

#### Cause 3: Wrong Table Being Queried
Pod creation proposals might be stored in `pods` table with `status='proposed'`, not in `pod_level_proposals`.

**Check:** Where is the pod creation proposal actually stored?

```sql
-- Check pods table
SELECT * FROM pods WHERE status = 'proposed';

-- Check pod_level_proposals
SELECT * FROM pod_level_proposals;
```

#### Cause 4: Vote Display Logic
**File:** `src/app/governance/page.tsx` (Lines 342-380)

```typescript
{proposal.type === 'governance' ? (
  // Governance proposals use scores array: [for, against, abstain]
  <>
    <div className="text-center p-2 bg-green-50 border border-green-200 rounded">
      <p className="text-2xl font-bold text-green-700">
        {proposal.scores?.[0] || 0}
      </p>
      <p className="text-xs text-green-600 font-medium">For</p>
    </div>
    // ...
  </>
) : (
  // Pod proposals use vote_counts: {for, against, abstain}
  <>
    <div className="text-center p-2 bg-green-50 border border-green-200 rounded">
      <p className="text-2xl font-bold text-green-700">
        {proposal.vote_counts?.for || 0}
      </p>
      <p className="text-xs text-green-600 font-medium">For</p>
    </div>
    // ...
  </>
)}
```

**Check:** Does the pod creation proposal have `vote_counts` populated?

### Debugging Steps:

1. **Check vote in database:**
```sql
SELECT * FROM governance_votes
WHERE proposal_id = '<pod-creation-proposal-id>'
ORDER BY timestamp DESC;
```

2. **Check if proposal has vote_counts:**
```javascript
console.log('Proposal object:', JSON.stringify(proposal, null, 2));
console.log('Vote counts:', proposal.vote_counts);
```

3. **Check React Query cache:**
```javascript
// In browser console
localStorage.clear(); // Clear cache
window.location.reload(); // Hard reload
```

4. **Verify refetch is called:**
Add logs in `EnhancedVoteButton.tsx` line 273:
```typescript
console.log('🔄 Calling onVoteSuccess callback');
console.log('onVoteSuccess function:', onVoteSuccess);
onVoteSuccess?.();
console.log('✅ onVoteSuccess called');
```

### Quick Fix to Try:

**Hard refresh with cache clear:**
1. Open DevTools (F12)
2. Right-click reload button
3. Select "Empty Cache and Hard Reload"

Or in code, increase refetch frequency temporarily:

**File:** `src/features/governance/hooks/useEnhancedProposals.ts`

```typescript
return useQuery<EnhancedProposal[]>({
  queryKey: ['enhanced-proposals', address, permissionHash, onChainProposals.length],
  queryFn: async () => { /* ... */ },
  staleTime: 0, // ← Change from 60000 to 0 temporarily
  refetchInterval: 5000, // ← Add this to refetch every 5 seconds
});
```

## Testing Checklist:

### After Fixing Duplicate Creation:
- [ ] Create DAO-wide proposal → Should appear in `proposal_metadata` only
- [ ] Create pod-level proposal → Should appear in `pod_level_proposals` only
- [ ] No duplicates in either table
- [ ] Both types show correctly on governance page

### After Fixing Vote Display:
- [ ] Vote on pod creation proposal
- [ ] Vote count updates immediately on frontend
- [ ] Hard refresh still shows correct vote count
- [ ] Vote is in database (`governance_votes` table)
- [ ] Vote shows as "✓ Voted For/Against/Abstain" after voting

## Issue 3: Pod-Level Proposals Visible to All Users (FIXED)

### Problem
Pod-level proposals were being shown to ALL users on the governance page, even those who don't have the appropriate token/hat for that pod.

### Root Cause
**File:** `src/features/governance/hooks/useEnhancedProposals.ts` (Lines 253-299)

The code checked `canVote` (line 258-259) but then added ALL pod-level proposals to the list regardless (line 299):

```typescript
const canVote = podRole?.permissions?.governanceParticipation === true;

// ... fetch user vote ...

const enhancedProposal: EnhancedProposal = { /* ... */ };
allProposals.push(enhancedProposal); // ← Always added!
```

The same issue existed for pod creation proposals (lines 148-217).

### Fix Applied
**File:** `src/features/governance/hooks/useEnhancedProposals.ts`

#### Pod-Level Proposals (Lines 281-286):
```typescript
// ✅ TOKEN-GATING: Only show pod-level proposals to users who have the appropriate token/hat
// Skip this proposal if user doesn't have governance permission in this pod
if (!canVote) {
  console.log(`🔒 [TOKEN-GATE] Hiding pod-level proposal "${proposal.title}" - user lacks pod token`);
  return; // Skip this proposal entirely
}
```

#### Pod Creation Proposals (Lines 159-163):
```typescript
// ✅ TOKEN-GATING: Only show pod creation proposals to users who can vote on them
if (!canVote) {
  console.log(`🔒 [TOKEN-GATE] Hiding pod creation proposal "${pod.name}" - user lacks approver token`);
  return null; // Will be filtered out
}
```

#### Filter Null Values (Lines 221-224):
```typescript
// ✅ TOKEN-GATING: Filter out null entries (proposals user can't vote on)
const visiblePodProposals = userVotableProposals.filter(p => p !== null);
allProposals.push(...visiblePodProposals);
console.log(`✅ Loaded ${visiblePodProposals.length} pod creation proposals (${userVotableProposals.length - visiblePodProposals.length} hidden due to token-gating)`);
```

### Result
- Pod-level proposals: Only visible to users with governance permission in that specific pod
- Pod creation proposals: Only visible to users with governance permission in the approving pod (Executive Pod or parent pod)

---

## Issue 4: Duplicate Proposals on Frontend (FIXED)

### Problem
When creating a proposal with a pod selected, BOTH the governance version AND the pod-level version appeared on the governance page as separate proposals.

### Root Cause
**File:** `src/features/governance/components/CreateProposalForm.tsx` (Lines 908-1027)

The `waitForProposalConfirmation` function updated `proposal_metadata` with the real on-chain ID but NOT `pod_level_proposals`:

```typescript
await supabase
  .from('proposal_metadata')
  .update({
    onchain_proposal_id: realProposalId,
    transaction_hash: receipt.transactionHash,
  })
  .eq('onchain_proposal_id', tempProposalId);

// ❌ Missing: No update to pod_level_proposals
```

This caused the deduplication logic in `useEnhancedProposals.ts` to fail because:
- Pod-level proposal: `onchain_proposal_id = "temp_ac3b2784"`
- Governance proposal: `onchain_proposal_id = "110249862..."`
- Deduplication filters out temp IDs, so set is empty

### Fix Applied
**File:** `src/features/governance/components/CreateProposalForm.tsx`

#### APPROACH 1: Receipt Lookup (Lines 987-994):
```typescript
await supabase
  .from('proposal_metadata')
  .update({
    onchain_proposal_id: realProposalId,
    transaction_hash: receipt.transactionHash,
  })
  .eq('onchain_proposal_id', tempProposalId);

// Also update pod_level_proposals if it exists (for deduplication to work)
await supabase
  .from('pod_level_proposals')
  .update({
    onchain_proposal_id: realProposalId,
    transaction_hash: receipt.transactionHash,
  })
  .eq('onchain_proposal_id', tempProposalId);
```

#### APPROACH 2: Event Query (Lines 1161-1174):
```typescript
// ✅ ALSO update pod_level_proposals if it exists
const { error: podUpdateError } = await supabase
  .from('pod_level_proposals')
  .update({
    onchain_proposal_id: realProposalId,
    transaction_hash: log.transactionHash,
  })
  .eq('onchain_proposal_id', tempProposalId);

if (podUpdateError) {
  console.log('ℹ️ No pod-level proposal to update (this is OK for DAO-wide proposals)');
} else {
  console.log('✅ Pod-level proposal also updated with real ID');
}
```

### Result
Now both `proposal_metadata` AND `pod_level_proposals` get updated with the real on-chain ID, allowing deduplication to work correctly.

---

## Priority:

1. ✅ **FIXED:** Pod-level proposal token-gating (security issue)
2. ✅ **FIXED:** Duplicate proposal display (deduplication now works)
3. **PENDING:** Decide if dual creation (on-chain + pod-level) is intentional architecture

---

**Current Status:**
- ✅ Governance voting works (confirmed on-chain)
- ✅ Pod voting saves to database
- ✅ Pod-level proposals only visible to users with appropriate tokens
- ✅ Duplicate proposals deduplicated on frontend (after fix propagates)
- ⚠️ Dual creation still happens but is now handled correctly by deduplication

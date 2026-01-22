# Vote Database Migration Guide

## Overview

The governance voting system has been migrated from **blockchain queries** to **database-backed storage** to resolve caching issues and improve performance.

### Problems Solved
- ✅ **RPC Cache Issues**: Vote tallies showing 0s due to Infura/Base RPC caching
- ✅ **React Query Cache**: Stale data being served after voting
- ✅ **Performance**: Faster queries from database vs blockchain
- ✅ **Reliability**: No more dependency on RPC provider uptime

### Architecture Change

**Before:**
```
User votes → Contract → RPC Provider → React Query → UI
                           ↓ (cache issues)
                      Stale data returned
```

**After:**
```
User votes → Contract → Event Sync → Database → React Query → UI
                                          ↓
                                   Real-time updates
```

## Setup Instructions

### 1. Run Database Migration

```bash
# Apply the migration to create the new tables
# This is done automatically if using Supabase CLI
```

The migration creates:
- `governance_proposal_votes` - Aggregated vote counts per proposal
- `governance_user_votes` - Individual votes for vote history

### 2. Initialize Vote Counts

Run this **once** to backfill existing vote data:

```bash
# Make sure your dev server is running on port 3000
npm run dev

# In another terminal:
node scripts/initialize-vote-counts.mjs
```

This will:
- Fetch all VoteCast events from the last 100k blocks (~2.3 days)
- Sync them to the database
- Initialize vote counts for all existing proposals

### 3. Environment Variables

Add to `.env.local`:

```bash
# Required for vote sync API (server-side only)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Optional: Use Base's official RPC instead of Infura
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
```

## How It Works

### When a User Votes

1. **Vote submitted on-chain** via CDP Smart Account
2. **Immediate database sync** via `/api/governance/sync-vote`
   - Inserts vote into `governance_user_votes`
   - Aggregates all votes for the proposal
   - Updates `governance_proposal_votes`
3. **UI refetches** after 2 seconds (reduced from 4s)
4. **Real-time display** of updated vote counts

### Queries

**useProposals.ts** now queries database instead of contract:
```typescript
const { data: voteData } = await supabase
  .from('governance_proposal_votes')
  .select('for_votes, against_votes, abstain_votes')
  .eq('proposal_id', proposalId)
  .maybeSingle();
```

**VoteButton.tsx** checks hasVoted from database:
```typescript
const { data } = await supabase
  .from('governance_user_votes')
  .select('id')
  .eq('proposal_id', proposalId)
  .eq('voter_address', address.toLowerCase())
  .maybeSingle();
```

## Testing

### Test New Vote Flow

1. Navigate to `/governance`
2. Click "For" on a proposal
3. Verify:
   - ✅ Vote succeeds on-chain
   - ✅ "Syncing vote to database" log appears
   - ✅ All 3 buttons disappear after ~2 seconds
   - ✅ Vote tally increments from 0 to 1
   - ✅ Page refresh still shows updated tally

### Test Vote Synchronization

1. Vote on a proposal
2. Open browser dev tools → Network tab
3. Verify POST to `/api/governance/sync-vote` succeeds
4. Check console logs for:
   ```
   🔄 Syncing vote to database...
   ✅ Vote synced to database
   📊 [Proposal ...] Vote counts from DB: { for: '1', ... }
   ```

## API Routes

### POST `/api/governance/sync-vote`
Syncs a single vote immediately after user votes.

**Request:**
```json
{
  "proposalId": "123...",
  "voter": "0x...",
  "choice": 1,
  "votingPower": 1,
  "txHash": "0x..."
}
```

### GET `/api/governance/sync-votes`
Auto-syncs last 100k blocks of vote events.

### POST `/api/governance/sync-votes`
Syncs custom block range.

**Request:**
```json
{
  "fromBlock": "12345",
  "toBlock": "12400"
}
```

## Troubleshooting

### Vote tallies still showing 0s

1. Check if migration ran:
   ```sql
   SELECT * FROM governance_proposal_votes;
   ```

2. Check if votes were synced:
   ```sql
   SELECT * FROM governance_user_votes WHERE proposal_id = 'your_proposal_id';
   ```

3. Run initialization script:
   ```bash
   node scripts/initialize-vote-counts.mjs
   ```

### "Failed to sync vote to database"

1. Verify `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
2. Check API route logs in terminal
3. Verify RLS policies allow service role access

### Votes not appearing after refresh

1. Check browser console for database query errors
2. Verify Supabase RLS policies allow public read access:
   ```sql
   SELECT * FROM governance_proposal_votes; -- Should work without auth
   ```

## Maintenance

### Regular Sync (Optional)

For extra reliability, you can run periodic syncs via cron:

```bash
# Cron job to sync votes every 5 minutes
*/5 * * * * curl http://localhost:3000/api/governance/sync-votes
```

### Monitoring

Watch for these logs to ensure system is working:
- `✅ Vote synced to database` - Vote successfully recorded
- `📊 Vote counts from DB` - Tallies being read from database
- `⚠️ Failed to sync vote to database` - **Action required**

## Rollback

If you need to rollback to blockchain queries:

1. Comment out database queries in `useProposals.ts:228-232`
2. Restore original contract query from git history
3. Comment out database sync in `VoteButton.tsx:152-174`

## Files Changed

- `supabase/migrations/20250121000002_create_governance_proposal_votes.sql`
- `src/features/governance/services/voteEventSync.ts`
- `src/app/api/governance/sync-vote/route.ts`
- `src/app/api/governance/sync-votes/route.ts`
- `src/features/governance/hooks/useProposals.ts`
- `src/features/governance/components/VoteButton.tsx`
- `scripts/initialize-vote-counts.mjs`

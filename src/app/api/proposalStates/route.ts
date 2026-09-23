import { type NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, type Abi } from 'viem';
import { base } from 'viem/chains';
import DAOGovernorABI from '@/abis/DAO_GovernorABI.json';
// Service role: this route runs without a user session and anon holds no
// table grants. It only reads proposal metadata and writes the status cache.
import { supabaseAdmin as supabase } from '@/utils/supabaseAdminClient';
import { recordExplorerEvent, type ExplorerEventType } from '@/lib/explorerEvents';

// Governor state enum → Pulse event type. Only transitions into one of
// these terminal/notable states fire a Pulse row; transient states
// (pending, active, succeeded, expired) do not.
const STATE_EVENT_TYPE: Record<number, ExplorerEventType | undefined> = {
  2: 'proposal_canceled',
  3: 'proposal_defeated',
  5: 'proposal_queued',
  7: 'proposal_executed',
};

const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL!;

// Type assertion for viem strict ABI typing
const governorAbi = DAOGovernorABI as Abi;

// Helper: fetch all proposal IDs from Supabase
async function getProposalIdsFromSupabase() {
  const { data, error } = await supabase
    .from('proposal_metadata')
    .select('onchain_proposal_id')
    .not('onchain_proposal_id', 'is', null);
  if (error) throw error;
  return data.map((row: any) => row.onchain_proposal_id);
}

export async function GET(req: NextRequest) {
  // Optionally accept ?user=0x... to get user-vote status for a specific user
  // Optionally accept ?force=true to bypass cache
  const { searchParams } = new URL(req.url);
  const user = searchParams.get('user')?.toLowerCase();
  const force = searchParams.get('force') === 'true';

  // 1. Get all proposal IDs
  const proposalIds = await getProposalIdsFromSupabase();

  // 2. Get cached states
  const { data: cached, error: cacheError } = await supabase
    .from('proposal_onchain_status')
    .select('*');
  const cacheMap = Object.fromEntries(
    (cached || []).map((row: any) => [row.proposal_id, row]),
  );

  // 3. For proposals not in cache, older than 15s, or if force=true, fetch from chain
  const now = Date.now();
  const needsUpdate = proposalIds.filter((id) => {
    if (force) return true; // Force refresh all proposals
    const row = cacheMap[id];
    if (!row) return true;
    const lastChecked = new Date(row.last_checked).getTime();
    return now - lastChecked > 15 * 1000; // 15 seconds
  });

  const updates: any[] = [];
  if (needsUpdate.length > 0) {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
    });

    // Multicall for proposal states
    const stateCalls = needsUpdate.map((id) => ({
      address: GOVERNOR_ADDRESS,
      abi: governorAbi,
      functionName: 'state',
      args: [BigInt(id)],
    }));
    const stateResults = await publicClient.multicall({
      contracts: stateCalls,
    });

    // For each proposal, also fetch user-vote status if ?user= is provided
    let userVotes: Record<string, boolean> = {};
    if (user) {
      const voteCalls = needsUpdate.map((id) => ({
        address: GOVERNOR_ADDRESS,
        abi: governorAbi,
        functionName: 'hasVoted',
        args: [BigInt(id), user as `0x${string}`],
      }));
      const voteResults = await publicClient.multicall({
        contracts: voteCalls,
      });
      userVotes = Object.fromEntries(
        needsUpdate.map((id, i) => [id, Boolean(voteResults[i].result)]),
      );
    }

    // Update cache in Supabase
    for (let i = 0; i < needsUpdate.length; i++) {
      const id = needsUpdate[i];
      const state = Number(stateResults[i].result);
      const vote = user ? userVotes[id] : undefined;
      const priorState = cacheMap[id]?.state;
      await supabase.from('proposal_onchain_status').upsert({
        proposal_id: id,
        state,
        last_checked: new Date().toISOString(),
        user_votes: user ? { [user]: vote } : undefined,
      });
      updates.push({ id, state, vote });

      // Pulse: log on transitions into a notable terminal state. Dedupe key
      // is per-(proposal, state) so even if the cache misses and we re-detect
      // the same state, only one event is recorded.
      const eventType = STATE_EVENT_TYPE[state];
      if (eventType && priorState !== state) {
        recordExplorerEvent({
          type: eventType,
          title: `Proposal ${eventType.replace('proposal_', '')}`,
          url: '/governance',
          metadata: { proposal_id: id, prior_state: priorState ?? null, new_state: state },
          dedupe_key: `${eventType}:${id}`,
        }).catch((err) => console.warn('[proposalStates] explorer event failed:', err));
      }
    }
  }

  // 4. Return merged cache + updates
  const result: Record<string, any> = {};
  for (const id of proposalIds) {
    const cache = cacheMap[id];
    const update = updates.find((u) => u.id === id);
    result[id] = {
      state: update?.state ?? cache?.state,
      hasVoted: user ? update?.vote ?? cache?.user_votes?.[user] : undefined,
    };
  }

  // --- Patch: For any proposal with state === 0 (Pending), fetch live from chain ---
  const pendingIds = Object.entries(result)
    .filter(([_, v]) => v.state === 0)
    .map(([id]) => id);
  if (pendingIds.length > 0) {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
    });
    const stateCalls = pendingIds.map((id) => ({
      address: GOVERNOR_ADDRESS,
      abi: governorAbi,
      functionName: 'state',
      args: [BigInt(id)],
    }));
    const stateResults = await publicClient.multicall({
      contracts: stateCalls,
    });
    pendingIds.forEach((id, i) => {
      result[id].state = Number(stateResults[i].result);
    });
  }
  // --- End patch ---

  return NextResponse.json(result);
}

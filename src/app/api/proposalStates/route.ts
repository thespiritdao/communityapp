import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import DAOGovernorABI from 'src/abis/DAO_GovernorABI.json';
import { supabase } from 'src/utils/supabaseClient';

const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL!;

// Helper: fetch all proposal IDs from Supabase
async function getProposalIdsFromSupabase() {
  const { data, error } = await supabase
    .from('proposal_metadata')
    .select('onchain_proposal_id')
    .not('onchain_proposal_id', 'is', null);
  if (error) throw error;
  return data.map((row: any) => row.onchain_proposal_id);
}

// Helper: fetch user addresses (for demo, you might want to limit this)
async function getUserAddresses() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('wallet_address');
  if (error) throw error;
  return data.map((row: any) => row.wallet_address);
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
  const cacheMap = Object.fromEntries((cached || []).map((row: any) => [row.proposal_id, row]));

  // 3. For proposals not in cache, older than 15s, or if force=true, fetch from chain
  const now = Date.now();
  const needsUpdate = proposalIds.filter((id) => {
    if (force) return true; // Force refresh all proposals
    const row = cacheMap[id];
    if (!row) return true;
    const lastChecked = new Date(row.last_checked).getTime();
    return now - lastChecked > 15 * 1000; // 15 seconds
  });

  let updates: any[] = [];
  if (needsUpdate.length > 0) {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
    });

    // Multicall for proposal states
    const stateCalls = needsUpdate.map((id) => ({
      address: GOVERNOR_ADDRESS,
      abi: DAOGovernorABI,
      functionName: 'state',
      args: [BigInt(id)],
    }));
    const stateResults = await publicClient.multicall({ contracts: stateCalls });

    // For each proposal, also fetch user-vote status if ?user= is provided
    let userVotes: Record<string, boolean> = {};
    if (user) {
      const voteCalls = needsUpdate.map((id) => ({
        address: GOVERNOR_ADDRESS,
        abi: DAOGovernorABI,
        functionName: 'hasVoted',
        args: [BigInt(id), user as `0x${string}`],
      }));
      const voteResults = await publicClient.multicall({ contracts: voteCalls });
      userVotes = Object.fromEntries(
        needsUpdate.map((id, i) => [id, Boolean(voteResults[i].result)])
      );
    }

    // Update cache in Supabase
    for (let i = 0; i < needsUpdate.length; i++) {
      const id = needsUpdate[i];
      const state = Number(stateResults[i].result);
      const vote = user ? userVotes[id] : undefined;
      await supabase
        .from('proposal_onchain_status')
        .upsert({
          proposal_id: id,
          state,
          last_checked: new Date().toISOString(),
          user_votes: user ? { [user]: vote } : undefined,
        });
      updates.push({ id, state, vote });
    }
  }

  // 4. Return merged cache + updates
  const result: Record<string, any> = {};
  for (const id of proposalIds) {
    const cache = cacheMap[id];
    const update = updates.find((u) => u.id === id);
    result[id] = {
      state: update?.state ?? cache?.state,
      hasVoted: user ? (update?.vote ?? cache?.user_votes?.[user]) : undefined,
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
      abi: DAOGovernorABI,
      functionName: 'state',
      args: [BigInt(id)],
    }));
    const stateResults = await publicClient.multicall({ contracts: stateCalls });
    pendingIds.forEach((id, i) => {
      result[id].state = Number(stateResults[i].result);
    });
  }
  // --- End patch ---

  return NextResponse.json(result);
}
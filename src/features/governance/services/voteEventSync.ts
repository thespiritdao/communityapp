// Vote Event Synchronization Service
// Listens for VoteCast events from Governor contract and syncs to Supabase

import { createPublicClient, http, type AbiEvent, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import DAOGovernorABIJson from '@/abis/DAO_GovernorABI.json';
import type { Abi } from 'viem';

const DAOGovernorABI = DAOGovernorABIJson as Abi;

const GOVERNOR_ADDRESS = process.env
  .NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Server-side only

/**
 * Sync a single VoteCast event to the database
 */
async function syncVoteCastEvent(
  proposalId: string,
  voter: string,
  choice: number,
  votingPower: bigint,
  txHash: string,
  blockNumber: bigint,
) {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log(`🗳️ Syncing vote: Proposal ${proposalId.substring(0, 20)}..., Voter ${voter.substring(0, 10)}..., Choice ${choice}`);

  // 1. Insert or update individual vote
  const { error: voteError } = await supabaseAdmin
    .from('governance_user_votes')
    .upsert({
      proposal_id: proposalId,
      voter_address: voter.toLowerCase(),
      choice,
      voting_power: votingPower.toString(),
      tx_hash: txHash,
      block_number: blockNumber.toString(),
      voted_at: new Date().toISOString(),
    }, {
      onConflict: 'proposal_id,voter_address',
    });

  if (voteError) {
    console.error('❌ Failed to insert user vote:', voteError);
    throw voteError;
  }

  // 2. Aggregate all votes for this proposal
  const { data: allVotes, error: aggregateError } = await supabaseAdmin
    .from('governance_user_votes')
    .select('choice, voting_power')
    .eq('proposal_id', proposalId);

  if (aggregateError) {
    console.error('❌ Failed to aggregate votes:', aggregateError);
    throw aggregateError;
  }

  // Calculate totals
  let forVotes = 0n;
  let againstVotes = 0n;
  let abstainVotes = 0n;

  for (const vote of allVotes || []) {
    const power = BigInt(vote.voting_power || 1);
    if (vote.choice === 1) forVotes += power;
    else if (vote.choice === 0) againstVotes += power;
    else if (vote.choice === 2) abstainVotes += power;
  }

  const totalVotes = forVotes + againstVotes + abstainVotes;

  console.log(`📊 Aggregated votes for proposal ${proposalId.substring(0, 20)}...:`, {
    for: forVotes.toString(),
    against: againstVotes.toString(),
    abstain: abstainVotes.toString(),
    total: totalVotes.toString(),
  });

  // 3. Update proposal vote counts
  const { error: updateError } = await supabaseAdmin
    .from('governance_proposal_votes')
    .upsert({
      proposal_id: proposalId,
      for_votes: forVotes.toString(),
      against_votes: againstVotes.toString(),
      abstain_votes: abstainVotes.toString(),
      total_votes: totalVotes.toString(),
      last_updated_block: blockNumber.toString(),
    }, {
      onConflict: 'proposal_id',
    });

  if (updateError) {
    console.error('❌ Failed to update proposal vote counts:', updateError);
    throw updateError;
  }

  console.log(`✅ Successfully synced vote for proposal ${proposalId.substring(0, 20)}...`);
}

/**
 * Sync historical votes from a block range
 * Call this on server startup or manually to backfill vote data
 */
export async function syncHistoricalVotes(fromBlock: bigint, toBlock: bigint) {
  console.log(`🔍 Syncing historical votes from block ${fromBlock} to ${toBlock}...`);

  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ||
                  process.env.NEXT_PUBLIC_BASE_RPC_URL ||
                  'https://mainnet.base.org';

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const eventAbi = DAOGovernorABI.find(
    (item) => item.type === 'event' && item.name === 'VoteCast',
  )! as AbiEvent;

  const logs = await publicClient.getLogs({
    address: GOVERNOR_ADDRESS,
    event: eventAbi,
    fromBlock,
    toBlock,
  });

  console.log(`📥 Found ${logs.length} VoteCast events`);

  for (const log of logs) {
    try {
      const { voter, proposalId, support, weight } = log.args as {
        voter: string;
        proposalId: bigint;
        support: number;
        weight: bigint;
      };

      await syncVoteCastEvent(
        proposalId.toString(),
        voter,
        support,
        weight,
        log.transactionHash || '',
        log.blockNumber || 0n,
      );
    } catch (error) {
      console.error('❌ Failed to sync vote event:', error);
      // Continue processing other events
    }
  }

  console.log(`✅ Finished syncing ${logs.length} historical votes`);
}

/**
 * Watch for new VoteCast events in real-time
 * Call this on server startup to keep vote counts up-to-date
 */
export function watchVoteCastEvents() {
  console.log('👀 Starting VoteCast event watcher...');

  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ||
                  process.env.NEXT_PUBLIC_BASE_RPC_URL ||
                  'https://mainnet.base.org';

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const unwatch = publicClient.watchEvent({
    address: GOVERNOR_ADDRESS,
    event: parseAbiItem('event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)'),
    onLogs: async (logs) => {
      for (const log of logs) {
        try {
          const { voter, proposalId, support, weight } = log.args as {
            voter: string;
            proposalId: bigint;
            support: number;
            weight: bigint;
          };

          await syncVoteCastEvent(
            proposalId.toString(),
            voter,
            support,
            weight,
            log.transactionHash || '',
            log.blockNumber || 0n,
          );
        } catch (error) {
          console.error('❌ Failed to process VoteCast event:', error);
        }
      }
    },
  });

  console.log('✅ VoteCast event watcher started');

  return unwatch;
}

/**
 * Initialize vote counts for a new proposal (all zeros)
 */
export async function initializeProposalVotes(proposalId: string) {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { error } = await supabaseAdmin
    .from('governance_proposal_votes')
    .insert({
      proposal_id: proposalId,
      for_votes: '0',
      against_votes: '0',
      abstain_votes: '0',
      total_votes: '0',
      last_updated_block: '0',
    });

  if (error && !error.message.includes('duplicate key')) {
    console.error('❌ Failed to initialize proposal votes:', error);
    throw error;
  }

  console.log(`✅ Initialized vote counts for proposal ${proposalId.substring(0, 20)}...`);
}

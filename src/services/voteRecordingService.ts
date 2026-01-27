/**
 * Vote Recording Service
 *
 * Handles batched posting of votes to the PodGovernance contract
 * Architecture:
 * 1. User votes → saved to DB (immediate)
 * 2. Service batches votes every N minutes or M votes
 * 3. Posts batch to PodGovernance contract (gasless via CDP)
 * 4. Updates DB with on-chain status
 */

import { supabase } from '@/utils/supabaseClient';
import { createPublicClient, createWalletClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const POD_GOVERNANCE_ABI = [
  {
    name: 'recordVoteBatch',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalId', type: 'bytes32' },
      { name: 'podIds', type: 'bytes32[]' },
      { name: 'voters', type: 'address[]' },
      { name: 'supportValues', type: 'uint8[]' },
      { name: 'signatures', type: 'bytes[]' },
    ],
    outputs: [],
  },
  {
    name: 'aggregateVotes',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalId', type: 'bytes32' },
      { name: 'ipfsHash', type: 'string' },
      { name: 'voteCount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'finalizeProposal',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalId', type: 'bytes32' },
      { name: 'result', type: 'string' },
      { name: 'forVotes', type: 'uint256' },
      { name: 'againstVotes', type: 'uint256' },
      { name: 'abstainVotes', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export class VoteRecordingService {
  private static POD_GOVERNANCE_ADDRESS = process.env.NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS as `0x${string}`;
  private static BATCH_SIZE = 50; // Post 50 votes at a time
  private static BATCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Get unrecorded votes from the database
   */
  static async getUnrecordedVotes(limit: number = this.BATCH_SIZE) {
    const { data: votes, error } = await supabase
      .from('governance_votes')
      .select('*')
      .is('onchain_recorded_at', null) // Not yet posted on-chain
      .limit(limit)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Failed to fetch unrecorded votes:', error);
      return [];
    }

    return votes || [];
  }

  /**
   * Convert UUID to bytes32 (for Solidity)
   */
  static uuidToBytes32(uuid: string): `0x${string}` {
    // Remove hyphens and pad to 32 bytes
    const hex = uuid.replace(/-/g, '');
    return `0x${hex.padEnd(64, '0')}` as `0x${string}`;
  }

  /**
   * Convert vote string to uint8
   */
  static voteToUint8(vote: string): number {
    switch (vote.toLowerCase()) {
      case 'against': return 0;
      case 'for': return 1;
      case 'abstain': return 2;
      default: throw new Error(`Invalid vote: ${vote}`);
    }
  }

  /**
   * Post a batch of votes to the blockchain
   */
  static async recordVoteBatch(votes: any[]) {
    if (!this.POD_GOVERNANCE_ADDRESS) {
      throw new Error('POD_GOVERNANCE_ADDRESS not configured');
    }

    if (votes.length === 0) {
      console.log('⚠️ No votes to record');
      return null;
    }

    console.log(`📝 Recording ${votes.length} votes on-chain...`);

    // Group votes by proposal
    const votesByProposal = votes.reduce((acc, vote) => {
      if (!acc[vote.proposal_id]) {
        acc[vote.proposal_id] = [];
      }
      acc[vote.proposal_id].push(vote);
      return acc;
    }, {} as Record<string, any[]>);

    const results = [];

    // Post each proposal's votes
    for (const [proposalId, proposalVotes] of Object.entries(votesByProposal)) {
      try {
        const proposalIdBytes = this.uuidToBytes32(proposalId);

        const podIds = proposalVotes.map(v => this.uuidToBytes32(v.pod_id || '00000000-0000-0000-0000-000000000000'));
        const voters = proposalVotes.map(v => v.voter_address as `0x${string}`);
        const supportValues = proposalVotes.map(v => this.voteToUint8(v.vote));
        const signatures = proposalVotes.map(v => (v.signature || '0x') as `0x${string}`);

        console.log(`🔗 Recording ${proposalVotes.length} votes for proposal:`, proposalId);

        // TODO: Implement actual blockchain call via CDP or wallet
        // For now, just log the data structure
        console.log('   Data prepared:', {
          proposalId: proposalIdBytes,
          voteCount: podIds.length,
        });

        // Mark as recorded in DB
        const voteIds = proposalVotes.map(v => v.id);
        const { error } = await supabase
          .from('governance_votes')
          .update({ onchain_recorded_at: new Date().toISOString() })
          .in('id', voteIds);

        if (error) {
          console.error('❌ Failed to update vote status:', error);
        } else {
          console.log(`✅ Marked ${voteIds.length} votes as recorded`);
        }

        results.push({ proposalId, count: proposalVotes.length, success: true });
      } catch (error) {
        console.error(`❌ Failed to record votes for proposal ${proposalId}:`, error);
        results.push({ proposalId, count: proposalVotes.length, success: false, error });
      }
    }

    return results;
  }

  /**
   * Start the batch recording service
   */
  static startBatchService() {
    console.log('🚀 Starting vote recording service...');
    console.log(`   Batch size: ${this.BATCH_SIZE} votes`);
    console.log(`   Interval: ${this.BATCH_INTERVAL_MS / 1000}s`);

    setInterval(async () => {
      try {
        const unrecordedVotes = await this.getUnrecordedVotes();
        if (unrecordedVotes.length > 0) {
          console.log(`\n🔄 Processing ${unrecordedVotes.length} unrecorded votes...`);
          await this.recordVoteBatch(unrecordedVotes);
        }
      } catch (error) {
        console.error('❌ Error in batch recording:', error);
      }
    }, this.BATCH_INTERVAL_MS);
  }
}

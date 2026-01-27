/**
 * IPFS Aggregation Service
 *
 * When a proposal closes, aggregates all votes and uploads to IPFS via Pinata
 * Then posts the IPFS hash to the PodGovernance contract
 */

import { supabase } from '@/utils/supabaseClient';

interface VoteManifest {
  proposalId: string;
  podId: string;
  podName: string;
  title: string;
  description: string;
  createdAt: string;
  closedAt: string;
  votes: {
    voter: string;
    vote: string;
    signature: string;
    timestamp: string;
    hat_id: string;
  }[];
  tally: {
    for: number;
    against: number;
    abstain: number;
    total: number;
  };
  result: string; // 'approved' | 'rejected'
  metadata: {
    forumThreadId?: string;
    onchainProposalId?: string;
    transactionHash?: string;
  };
}

export class IPFSAggregationService {
  private static PINATA_JWT = process.env.PINATA_JWT;
  private static PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud';

  /**
   * Aggregate votes for a proposal
   */
  static async aggregateProposalVotes(proposalId: string): Promise<VoteManifest | null> {
    console.log(`📊 Aggregating votes for proposal: ${proposalId}`);

    // Get proposal details
    const { data: proposal, error: proposalError } = await supabase
      .from('pod_level_proposals')
      .select('*, pods(name)')
      .eq('id', proposalId)
      .single();

    if (proposalError || !proposal) {
      console.error('❌ Failed to fetch proposal:', proposalError);
      return null;
    }

    // Get all votes
    const { data: votes, error: votesError } = await supabase
      .from('governance_votes')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('timestamp', { ascending: true });

    if (votesError) {
      console.error('❌ Failed to fetch votes:', votesError);
      return null;
    }

    // Calculate tally
    const tally = {
      for: votes?.filter(v => v.vote === 'for').length || 0,
      against: votes?.filter(v => v.vote === 'against').length || 0,
      abstain: votes?.filter(v => v.vote === 'abstain').length || 0,
      total: votes?.length || 0,
    };

    // Determine result (simple majority)
    const result = tally.for > tally.against ? 'approved' : 'rejected';

    const manifest: VoteManifest = {
      proposalId: proposal.id,
      podId: proposal.pod_id,
      podName: proposal.pods?.name || 'Unknown Pod',
      title: proposal.title,
      description: proposal.description,
      createdAt: proposal.created_at,
      closedAt: new Date().toISOString(),
      votes: (votes || []).map(v => ({
        voter: v.voter_address,
        vote: v.vote,
        signature: v.signature || '',
        timestamp: v.timestamp,
        hat_id: v.hat_id,
      })),
      tally,
      result,
      metadata: {
        forumThreadId: proposal.metadata?.forum_thread_id,
        onchainProposalId: proposal.onchain_proposal_id,
        transactionHash: proposal.transaction_hash,
      },
    };

    console.log(`✅ Aggregated ${tally.total} votes`);
    console.log(`   Result: ${result} (For: ${tally.for}, Against: ${tally.against}, Abstain: ${tally.abstain})`);

    return manifest;
  }

  /**
   * Upload vote manifest to IPFS via Pinata
   */
  static async uploadToPinata(manifest: VoteManifest): Promise<string | null> {
    if (!this.PINATA_JWT) {
      console.error('❌ PINATA_JWT not configured');
      return null;
    }

    console.log('📤 Uploading vote manifest to IPFS...');

    try {
      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.PINATA_JWT}`,
        },
        body: JSON.stringify({
          pinataContent: manifest,
          pinataMetadata: {
            name: `proposal-${manifest.proposalId}-votes`,
            keyvalues: {
              proposalId: manifest.proposalId,
              podId: manifest.podId,
              result: manifest.result,
              voteCount: manifest.tally.total.toString(),
            },
          },
          pinataOptions: {
            cidVersion: 1,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('❌ Pinata upload failed:', error);
        return null;
      }

      const data = await response.json();
      const ipfsHash = data.IpfsHash;

      console.log(`✅ Uploaded to IPFS: ${ipfsHash}`);
      console.log(`   Gateway URL: ${this.PINATA_GATEWAY}/ipfs/${ipfsHash}`);

      return ipfsHash;
    } catch (error) {
      console.error('❌ Failed to upload to Pinata:', error);
      return null;
    }
  }

  /**
   * Complete aggregation: aggregate votes → upload to IPFS → post hash on-chain
   */
  static async aggregateAndUpload(proposalId: string): Promise<{
    success: boolean;
    ipfsHash?: string;
    manifest?: VoteManifest;
    error?: string;
  }> {
    try {
      // 1. Aggregate votes
      const manifest = await this.aggregateProposalVotes(proposalId);
      if (!manifest) {
        return { success: false, error: 'Failed to aggregate votes' };
      }

      // 2. Upload to IPFS
      const ipfsHash = await this.uploadToPinata(manifest);
      if (!ipfsHash) {
        return { success: false, error: 'Failed to upload to IPFS' };
      }

      // 3. Update proposal status in DB
      const { error: updateError } = await supabase
        .from('pod_level_proposals')
        .update({
          status: manifest.result === 'approved' ? 'approved' : 'rejected',
          metadata: {
            ...manifest.metadata,
            ipfs_hash: ipfsHash,
            vote_counts: manifest.tally,
          },
        })
        .eq('id', proposalId);

      if (updateError) {
        console.error('⚠️ Failed to update proposal status:', updateError);
      }

      // 4. TODO: Post IPFS hash to PodGovernance contract
      console.log('📝 TODO: Post IPFS hash to PodGovernance contract');
      console.log('   Call: aggregateVotes(proposalId, ipfsHash, voteCount)');

      return {
        success: true,
        ipfsHash,
        manifest,
      };
    } catch (error: any) {
      console.error('❌ Aggregation failed:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Check for proposals that need aggregation
   * (status = 'active' and voting_deadline has passed)
   */
  static async checkAndAggregateClosedProposals() {
    console.log('🔍 Checking for closed proposals...');

    const { data: proposals, error } = await supabase
      .from('pod_level_proposals')
      .select('*')
      .eq('status', 'proposed')
      .lt('voting_deadline', new Date().toISOString());

    if (error) {
      console.error('❌ Failed to fetch closed proposals:', error);
      return;
    }

    if (!proposals || proposals.length === 0) {
      console.log('✅ No proposals need aggregation');
      return;
    }

    console.log(`📊 Found ${proposals.length} closed proposals`);

    for (const proposal of proposals) {
      console.log(`\n🔄 Processing proposal: ${proposal.title} (${proposal.id})`);
      const result = await this.aggregateAndUpload(proposal.id);

      if (result.success) {
        console.log(`✅ Successfully aggregated: ${result.ipfsHash}`);
      } else {
        console.error(`❌ Failed to aggregate: ${result.error}`);
      }
    }
  }

  /**
   * Start the aggregation service (runs periodically)
   */
  static startAggregationService() {
    console.log('🚀 Starting IPFS aggregation service...');
    console.log('   Checking for closed proposals every 10 minutes');

    // Check immediately on start
    this.checkAndAggregateClosedProposals();

    // Then check every 10 minutes
    setInterval(() => {
      this.checkAndAggregateClosedProposals();
    }, 10 * 60 * 1000); // 10 minutes
  }
}

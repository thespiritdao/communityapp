import { supabase } from '@/utils/supabaseClient';

export interface GovernanceVote {
  id?: string;
  proposal_id: string;
  voter_address: string;
  vote: 'for' | 'against' | 'abstain';
  timestamp: string;
  hat_id: string;
  signature?: string;
}

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  proposal_type: 'pod_creation' | 'governance' | 'pod_level' | 'treasury' | 'other'; // ✅ NEW: pod_level
  status: 'draft' | 'active' | 'approved' | 'rejected' | 'executed';
  created_by: string;
  created_at: string;
  voting_deadline: string;
  required_approvals: number;
  current_approvals: number;
  pod_id?: string;
  contract_call?: any;
}

export class GovernanceService {
  /**
   * Submit a governance vote
   */
  static async submitVote(vote: GovernanceVote): Promise<void> {
    try {
      // CRITICAL: Verify session exists and has correct JWT structure
      const { data: sessionCheck } = await supabase.auth.getSession();

      if (!sessionCheck?.session) {
        throw new Error('No active Supabase session. Please ensure you are authenticated.');
      }

      const session = sessionCheck.session;
      const jwt = session.user;

      // Verify wallet_address exists in user_metadata
      const jwtWalletAddress = jwt.user_metadata?.wallet_address;
      if (!jwtWalletAddress) {
        throw new Error('JWT does not contain wallet_address in user_metadata. Auth flow may be incomplete.');
      }

      // Verify the vote is from the authenticated wallet (case-insensitive)
      const votingWallet = vote.voter_address.toLowerCase();
      const jwtWallet = jwtWalletAddress.toLowerCase();

      if (votingWallet !== jwtWallet) {
        throw new Error(`Wallet mismatch: voting as ${votingWallet} but authenticated as ${jwtWallet}`);
      }

      const rowToInsert = {
        proposal_id: vote.proposal_id,
        voter_address: votingWallet, // Use lowercase for consistency
        vote: vote.vote,
        timestamp: vote.timestamp,
        hat_id: vote.hat_id,
        signature: vote.signature,
        pod_id: (vote as any).pod_id ?? null,
      };

      // Use the EXISTING supabase client that already has the session
      const { error } = await supabase.from('governance_votes').upsert(
        rowToInsert,
        {
          onConflict: 'proposal_id,voter_address',
        },
      );

      if (error) {
        console.error('Failed to insert vote:', error.message);
        throw error;
      }

      // Update proposal approval count
      await this.updateProposalApprovalCount(vote.proposal_id);
    } catch (error) {
      console.error('Failed to submit governance vote:', error);
      throw error;
    }
  }

  /**
   * Get votes for a specific proposal
   */
  static async getProposalVotes(proposalId: string): Promise<GovernanceVote[]> {
    try {
      const { data, error } = await supabase
        .from('governance_votes')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to get proposal votes:', error);
      return [];
    }
  }

  /**
   * Get user's vote for a specific proposal
   */
  static async getUserVote(
    proposalId: string,
    userAddress: string,
  ): Promise<GovernanceVote | null> {
    try {
      const { data, error } = await supabase
        .from('governance_votes')
        .select('*')
        .eq('proposal_id', proposalId)
        .eq('voter_address', userAddress.toLowerCase())  // ✅ Match lowercase storage
        .single();

      if (error) {
        // Handle different error codes gracefully - don't log 406 errors repeatedly
        if (error.code === 'PGRST116') {
          // No rows found - user hasn't voted yet
          return null;
        } else if (
          error.code === 'PGRST301' ||
          error.message?.includes('No acceptable') ||
          error.message?.includes('Not Acceptable')
        ) {
          // 406 Not Acceptable - silently return null, user hasn't voted
          return null;
        } else {
          throw error;
        }
      }
      return data || null;
    } catch (error) {
      // Only log unexpected errors, not the common 406 ones
      if (
        !(error as any).message?.includes('Not Acceptable') &&
        !(error as any).message?.includes('No acceptable')
      ) {
        console.error('Failed to get user vote:', error);
      }
      return null;
    }
  }

  /**
   * Update proposal approval count based on votes
   */
  static async updateProposalApprovalCount(proposalId: string): Promise<void> {
    try {
      console.log(`🔄 Updating approval count for proposal: ${proposalId}`);

      // Count 'for' votes
      const { count: forCount, error: forError } = await supabase
        .from('governance_votes')
        .select('*', { count: 'exact', head: true })
        .eq('proposal_id', proposalId)
        .eq('vote', 'for');

      if (forError) {
        console.error('Error counting for votes:', forError);
        throw forError;
      }

      // Count 'against' votes
      const { count: againstCount, error: againstError } = await supabase
        .from('governance_votes')
        .select('*', { count: 'exact', head: true })
        .eq('proposal_id', proposalId)
        .eq('vote', 'against');

      if (againstError) {
        console.error('Error counting against votes:', againstError);
        throw againstError;
      }

      const approvalCount = forCount || 0;
      const rejectionCount = againstCount || 0;
      const totalVotes = approvalCount + rejectionCount;

      console.log(
        `📊 Proposal ${proposalId} vote count: ${approvalCount} for, ${rejectionCount} against, ${totalVotes} total`,
      );

      // ✅ FIX: Don't auto-change status after voting
      // Keep proposals visible for continued voting
      // Vote counts are tracked, but status remains 'proposed' until explicit action

      console.log(
        `📊 Proposal ${proposalId}: ${approvalCount} for, ${rejectionCount} against, ${totalVotes} total votes`
      );
      console.log('✅ Vote counted successfully. Status remains "proposed" for continued voting.');

      // Don't change status automatically - return early
      return;

      // Validate the new status is allowed
      const allowedStatuses = [
        'draft',
        'proposed',
        'active',
        'approved',
        'rejected',
        'executed',
        'archived',
      ];
      if (!allowedStatuses.includes(newStatus)) {
        console.warn(
          `⚠️ Invalid status '${newStatus}' - falling back to 'proposed'`,
        );
        newStatus = 'proposed';
      }

      console.log(
        `📝 Attempting to update pod ${proposalId} to status: ${newStatus}`,
      );

      // Update the pod status - use maybeSingle() instead of single() to handle no results
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Set is_active based on status
      if (newStatus === 'active') {
        updateData.is_active = true;
      } else if (newStatus === 'rejected') {
        updateData.is_active = false;
      }

      const { data: updatedPod, error: updateError } = await supabase
        .from('pods')
        .update(updateData)
        .eq('id', proposalId)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('❌ Failed to update pod status:', updateError);

        // If it's a constraint violation, provide helpful context
        if (updateError.code === '23514') {
          console.error(
            '💡 Database constraint violation - the status value may not be allowed by the pods_status_check constraint',
          );
          console.error('   Current attempt to set status to:', newStatus);
          console.error(
            '   Allowed values should include: draft, proposed, active, approved, rejected, executed, archived',
          );
        }

        throw updateError;
      }

      if (updatedPod) {
        console.log(
          `✅ Pod "${updatedPod.name}" (${proposalId}) status successfully updated to: ${newStatus}`,
        );

        // If approved, we could trigger additional actions here
        if (newStatus === 'approved') {
          console.log('🎉 Pod approved! Ready for activation.');
          // TODO: Could trigger Hat minting, treasury deployment, etc.
        } else if (newStatus === 'rejected') {
          console.log('❌ Pod rejected by governance.');
        }
      } else {
        console.warn('⚠️ No pod found with ID:', proposalId);
      }
    } catch (error) {
      console.error('Failed to update proposal approval count:', error);
    }
  }

  /**
   * Get all governance proposals with vote counts
   */
  static async getGovernanceProposals(): Promise<GovernanceProposal[]> {
    try {
      // For now, we'll get pod proposals as governance proposals
      // In a full implementation, you'd have a dedicated governance_proposals table
      const { data: pods, error } = await supabase
        .from('pods')
        .select('*')
        .in('status', ['proposed', 'draft', 'approved', 'rejected'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get vote counts for each pod
      const proposalsWithVotes = await Promise.all(
        (pods || []).map(async (pod) => {
          // Get current vote counts
          const { count: forCount } = await supabase
            .from('governance_votes')
            .select('*', { count: 'exact', head: true })
            .eq('proposal_id', pod.id)
            .eq('vote', 'for');

          const { count: againstCount } = await supabase
            .from('governance_votes')
            .select('*', { count: 'exact', head: true })
            .eq('proposal_id', pod.id)
            .eq('vote', 'against');

          const { count: abstainCount } = await supabase
            .from('governance_votes')
            .select('*', { count: 'exact', head: true })
            .eq('proposal_id', pod.id)
            .eq('vote', 'abstain');

          const proposal: GovernanceProposal = {
            id: pod.id,
            title: `Create Pod: ${pod.name}`,
            description: pod.description,
            proposal_type: 'pod_creation' as const,
            status:
              pod.status === 'approved'
                ? ('approved' as const)
                : pod.status === 'rejected'
                  ? ('rejected' as const)
                  : pod.status === 'proposed'
                    ? ('active' as const)
                    : ('draft' as const),
            created_by: pod.created_by_address,
            created_at: pod.created_at,
            voting_deadline: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000,
            ).toISOString(), // 7 days from now
            required_approvals: 1, // Simple threshold for demo
            current_approvals: forCount || 0,
            pod_id: pod.id,
          };

          return {
            ...proposal,
            vote_counts: {
              for: forCount || 0,
              against: againstCount || 0,
              abstain: abstainCount || 0,
              total:
                (forCount || 0) + (againstCount || 0) + (abstainCount || 0),
            },
          };
        }),
      );

      return proposalsWithVotes;
    } catch (error) {
      console.error('Failed to get governance proposals:', error);
      return [];
    }
  }

  /**
   * Create a new governance proposal (for future use)
   */
  static async createProposal(
    proposal: Omit<
      GovernanceProposal,
      'id' | 'created_at' | 'current_approvals'
    >,
  ): Promise<string> {
    try {
      const proposalId = `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const { error } = await supabase.from('governance_proposals').insert({
        id: proposalId,
        title: proposal.title,
        description: proposal.description,
        proposal_type: proposal.proposal_type,
        status: proposal.status,
        created_by: proposal.created_by,
        voting_deadline: proposal.voting_deadline,
        required_approvals: proposal.required_approvals,
        pod_id: proposal.pod_id,
        contract_call: proposal.contract_call,
      });

      if (error) throw error;
      return proposalId;
    } catch (error) {
      console.error('Failed to create governance proposal:', error);
      throw error;
    }
  }

  /**
   * ✅ NEW: Create a pod-level proposal
   * These are governance proposals specific to a pod (not DAO-wide)
   * Only members of the specified pod with governanceParticipation can vote
   */
  static async createPodLevelProposal(data: {
    title: string;
    description: string;
    pod_id: string;
    created_by: string;
    governance_tier?: 'DAO_CONSTITUTIONAL' | 'POD_TREASURY_BINDING' | 'POD_OPERATIONAL';
    metadata?: Record<string, any>;
    onchain_proposal_id?: string;
    transaction_hash?: string;
  }): Promise<string> {
    try {
      const { data: proposal, error } = await supabase
        .from('pod_level_proposals')
        .insert({
          title: data.title,
          description: data.description,
          pod_id: data.pod_id,
          created_by: data.created_by.toLowerCase(),
          status: 'proposed',
          governance_tier: data.governance_tier ?? 'POD_OPERATIONAL',
          voting_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          metadata: data.metadata || {},
          onchain_proposal_id: data.onchain_proposal_id,
          transaction_hash: data.transaction_hash,
        })
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Pod-level proposal created:', proposal.id);
      return proposal.id;
    } catch (error) {
      console.error('Failed to create pod-level proposal:', error);
      throw error;
    }
  }

  /**
   * ✅ NEW: Get all pod-level proposals with vote counts
   * Optionally filter by pod_id
   */
  static async getPodLevelProposals(podId?: string): Promise<any[]> {
    try {
      let query = supabase
        .from('pod_level_proposals')
        .select('*, pods(name, description)')
        .in('status', ['proposed', 'active', 'approved', 'rejected'])
        .order('created_at', { ascending: false });

      if (podId) {
        query = query.eq('pod_id', podId);
      }

      const { data: proposals, error } = await query;

      if (error) throw error;

      // Get vote counts for each proposal
      const proposalsWithVotes = await Promise.all(
        (proposals || []).map(async (proposal) => {
          const votes = await this.getProposalVotes(proposal.id);

          const voteCount = {
            for: votes.filter((v) => v.vote === 'for').length,
            against: votes.filter((v) => v.vote === 'against').length,
            abstain: votes.filter((v) => v.vote === 'abstain').length,
            total: votes.length,
          };

          return {
            ...proposal,
            vote_counts: voteCount,
          };
        }),
      );

      return proposalsWithVotes;
    } catch (error) {
      console.error('Failed to get pod-level proposals:', error);
      return [];
    }
  }

  /**
   * ✅ NEW: Get a single pod-level proposal by ID
   */
  static async getPodLevelProposal(proposalId: string): Promise<any | null> {
    try {
      const { data: proposal, error } = await supabase
        .from('pod_level_proposals')
        .select('*, pods(name, description)')
        .eq('id', proposalId)
        .single();

      if (error) throw error;

      // Get vote counts
      const votes = await this.getProposalVotes(proposalId);
      const voteCount = {
        for: votes.filter((v) => v.vote === 'for').length,
        against: votes.filter((v) => v.vote === 'against').length,
        abstain: votes.filter((v) => v.vote === 'abstain').length,
        total: votes.length,
      };

      return {
        ...proposal,
        vote_counts: voteCount,
      };
    } catch (error) {
      console.error('Failed to get pod-level proposal:', error);
      return null;
    }
  }
}

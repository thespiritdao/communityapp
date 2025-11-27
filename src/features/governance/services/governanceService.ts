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
  proposal_type: 'pod_creation' | 'governance' | 'treasury' | 'other';
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
      const { error } = await supabase
        .from('governance_votes')
        .upsert({
          proposal_id: vote.proposal_id,
          voter_address: vote.voter_address,
          vote: vote.vote,
          timestamp: vote.timestamp,
          hat_id: vote.hat_id,
          signature: vote.signature
        }, {
          onConflict: 'proposal_id,voter_address'
        });

      if (error) throw error;

      console.log('✅ Vote submitted successfully:', {
        proposal_id: vote.proposal_id,
        vote: vote.vote,
        has_signature: !!vote.signature,
        signature_preview: vote.signature ? vote.signature.substring(0, 20) + '...' : 'null',
        full_vote_data: {
          proposal_id: vote.proposal_id,
          voter_address: vote.voter_address,
          vote: vote.vote,
          timestamp: vote.timestamp,
          hat_id: vote.hat_id,
          signature: vote.signature ? vote.signature.substring(0, 20) + '...' : 'null'
        }
      });

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
  static async getUserVote(proposalId: string, userAddress: string): Promise<GovernanceVote | null> {
    try {
      const { data, error } = await supabase
        .from('governance_votes')
        .select('*')
        .eq('proposal_id', proposalId)
        .eq('voter_address', userAddress)
        .single();

      if (error) {
        // Handle different error codes gracefully - don't log 406 errors repeatedly
        if (error.code === 'PGRST116') {
          // No rows found - user hasn't voted yet
          return null;
        } else if (error.code === 'PGRST301' || error.message?.includes('No acceptable') || error.message?.includes('Not Acceptable')) {
          // 406 Not Acceptable - silently return null, user hasn't voted
          return null;
        } else {
          throw error;
        }
      }
      return data || null;
    } catch (error) {
      // Only log unexpected errors, not the common 406 ones
      if (!error.message?.includes('Not Acceptable') && !error.message?.includes('No acceptable')) {
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

      console.log(`📊 Proposal ${proposalId} vote count: ${approvalCount} for, ${rejectionCount} against, ${totalVotes} total`);

      // Determine new status based on votes
      let newStatus = 'proposed'; // default
      
      // For initial deployment: 1 approval vote moves to active (simplified workflow)
      // In production, you'd want more sophisticated thresholds
      if (approvalCount >= 1 && approvalCount > rejectionCount) {
        newStatus = 'active'; // Skip 'approved' state - go directly to active
      } else if (rejectionCount > approvalCount && totalVotes >= 1) {
        newStatus = 'rejected';
      } else if (totalVotes === 0) {
        // No votes yet, keep as draft/proposed
        console.log('No votes yet, keeping current status');
        return;
      }

      // Validate the new status is allowed
      const allowedStatuses = ['draft', 'proposed', 'active', 'approved', 'rejected', 'executed', 'archived'];
      if (!allowedStatuses.includes(newStatus)) {
        console.warn(`⚠️ Invalid status '${newStatus}' - falling back to 'proposed'`);
        newStatus = 'proposed';
      }

      console.log(`📝 Attempting to update pod ${proposalId} to status: ${newStatus}`);

      // Update the pod status - use maybeSingle() instead of single() to handle no results
      const updateData: any = { 
        status: newStatus,
        updated_at: new Date().toISOString()
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
          console.error('💡 Database constraint violation - the status value may not be allowed by the pods_status_check constraint');
          console.error('   Current attempt to set status to:', newStatus);
          console.error('   Allowed values should include: draft, proposed, active, approved, rejected, executed, archived');
        }
        
        throw updateError;
      }
      
      if (updatedPod) {
        console.log(`✅ Pod "${updatedPod.name}" (${proposalId}) status successfully updated to: ${newStatus}`);
        
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
            status: pod.status === 'approved' ? 'approved' as const : 
                    pod.status === 'rejected' ? 'rejected' as const :
                    pod.status === 'proposed' ? 'active' as const : 'draft' as const,
            created_by: pod.created_by_address,
            created_at: pod.created_at,
            voting_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
            required_approvals: 1, // Simple threshold for demo
            current_approvals: forCount || 0,
            pod_id: pod.id
          };

          return {
            ...proposal,
            vote_counts: {
              for: forCount || 0,
              against: againstCount || 0,
              abstain: abstainCount || 0,
              total: (forCount || 0) + (againstCount || 0) + (abstainCount || 0)
            }
          };
        })
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
  static async createProposal(proposal: Omit<GovernanceProposal, 'id' | 'created_at' | 'current_approvals'>): Promise<string> {
    try {
      const proposalId = `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const { error } = await supabase
        .from('governance_proposals')
        .insert({
          id: proposalId,
          title: proposal.title,
          description: proposal.description,
          proposal_type: proposal.proposal_type,
          status: proposal.status,
          created_by: proposal.created_by,
          voting_deadline: proposal.voting_deadline,
          required_approvals: proposal.required_approvals,
          pod_id: proposal.pod_id,
          contract_call: proposal.contract_call
        });

      if (error) throw error;
      return proposalId;
    } catch (error) {
      console.error('Failed to create governance proposal:', error);
      throw error;
    }
  }
}
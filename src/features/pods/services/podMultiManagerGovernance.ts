/**
 * Multi-Manager Pod Governance Service
 * Implements HATS Protocol best practices for requiring multiple manager approval
 * for critical pod operations like status changes, archiving, and deletion
 */

import { supabase } from '../../../utils/supabaseClient';

export interface GovernanceProposal {
  id: string;
  pod_id: string;
  proposal_type:
    | 'status_change'
    | 'delete_pod'
    | 'archive_pod'
    | 'edit_description'
    | 'update_image';
  proposal_data: any;
  proposed_by: string;
  required_approvals: number;
  current_approvals: string[]; // Array of wallet addresses
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  created_at: string;
  expires_at: string;
}

export interface ProposalVote {
  proposal_id: string;
  voter_address: string;
  vote: 'approve' | 'reject';
  vote_reason?: string;
  voted_at: string;
}

export class PodMultiManagerGovernance {
  private static readonly MINIMUM_MANAGERS_REQUIRED = 3;
  private static readonly PROPOSAL_DURATION_HOURS = 72; // 3 days

  /**
   * Get all active managers for a pod
   */
  static async getPodManagers(podId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('pod_members')
        .select('wallet_address')
        .eq('pod_id', podId)
        .eq('role', 'manager')
        .eq('status', 'active');

      if (error) throw error;
      return data?.map((member) => member.wallet_address) || [];
    } catch (error) {
      console.error('Error fetching pod managers:', error);
      return [];
    }
  }

  /**
   * Check if user can manage pod (is a manager)
   */
  static async canManagePod(
    podId: string,
    userAddress: string,
  ): Promise<boolean> {
    const managers = await this.getPodManagers(podId);
    return managers.includes(userAddress.toLowerCase());
  }

  /**
   * Check if pod has enough managers for governance
   */
  static async hasEnoughManagers(podId: string): Promise<boolean> {
    const managers = await this.getPodManagers(podId);
    return managers.length >= this.MINIMUM_MANAGERS_REQUIRED;
  }

  /**
   * Create a new governance proposal
   */
  static async createProposal(
    podId: string,
    proposalType: GovernanceProposal['proposal_type'],
    proposalData: any,
    proposedBy: string,
  ): Promise<{ success: boolean; proposalId?: string; error?: string }> {
    try {
      // Check if user can propose
      const canManage = await this.canManagePod(podId, proposedBy);
      if (!canManage) {
        return {
          success: false,
          error: 'Only pod managers can create proposals',
        };
      }

      // Check if pod has enough managers
      const hasEnoughManagers = await this.hasEnoughManagers(podId);
      if (!hasEnoughManagers) {
        return {
          success: false,
          error: `Minimum ${this.MINIMUM_MANAGERS_REQUIRED} managers required for governance`,
        };
      }

      const managers = await this.getPodManagers(podId);
      const requiredApprovals = Math.ceil(managers.length * 0.67); // 67% majority

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.PROPOSAL_DURATION_HOURS);

      const { data, error } = await supabase
        .from('pod_governance_proposals')
        .insert({
          pod_id: podId,
          proposal_type: proposalType,
          proposal_data: proposalData,
          proposed_by: proposedBy,
          required_approvals: requiredApprovals,
          current_approvals: [proposedBy], // Proposer automatically approves
          status: 'pending',
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, proposalId: data.id };
    } catch (error) {
      console.error('Error creating proposal:', error);
      return { success: false, error: 'Failed to create proposal' };
    }
  }

  /**
   * Vote on a proposal
   */
  static async voteOnProposal(
    proposalId: string,
    voterAddress: string,
    vote: 'approve' | 'reject',
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get proposal details
      const { data: proposal, error: proposalError } = await supabase
        .from('pod_governance_proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (proposalError || !proposal) {
        return { success: false, error: 'Proposal not found' };
      }

      // Check if voter is a manager
      const canManage = await this.canManagePod(proposal.pod_id, voterAddress);
      if (!canManage) {
        return { success: false, error: 'Only pod managers can vote' };
      }

      // Check if proposal is still active
      if (
        proposal.status !== 'pending' ||
        new Date() > new Date(proposal.expires_at)
      ) {
        return { success: false, error: 'Proposal is no longer active' };
      }

      // Record the vote
      const { error: voteError } = await supabase
        .from('pod_governance_votes')
        .upsert({
          proposal_id: proposalId,
          voter_address: voterAddress,
          vote: vote,
          vote_reason: reason,
          voted_at: new Date().toISOString(),
        });

      if (voteError) throw voteError;

      // Update proposal approvals
      if (vote === 'approve') {
        const updatedApprovals = [
          ...new Set([...proposal.current_approvals, voterAddress]),
        ];

        const { error: updateError } = await supabase
          .from('pod_governance_proposals')
          .update({
            current_approvals: updatedApprovals,
            status:
              updatedApprovals.length >= proposal.required_approvals
                ? 'approved'
                : 'pending',
          })
          .eq('id', proposalId);

        if (updateError) throw updateError;
      }

      return { success: true };
    } catch (error) {
      console.error('Error voting on proposal:', error);
      return { success: false, error: 'Failed to record vote' };
    }
  }

  /**
   * Execute an approved proposal
   */
  static async executeProposal(
    proposalId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: proposal, error } = await supabase
        .from('pod_governance_proposals')
        .select('*')
        .eq('id', proposalId)
        .eq('status', 'approved')
        .single();

      if (error || !proposal) {
        return { success: false, error: 'Approved proposal not found' };
      }

      // Execute based on proposal type
      let executionResult: { success: boolean; error?: string } = { success: false, error: 'Unknown proposal type' };

      switch (proposal.proposal_type) {
        case 'status_change':
          executionResult = await this.executeStatusChange(proposal);
          break;
        case 'edit_description':
          executionResult = await this.executeDescriptionEdit(proposal);
          break;
        case 'update_image':
          executionResult = await this.executeImageUpdate(proposal);
          break;
        case 'archive_pod':
          executionResult = await this.executeArchivePod(proposal);
          break;
        case 'delete_pod':
          executionResult = await this.executeDeletePod(proposal);
          break;
      }

      if (executionResult.success) {
        // Mark proposal as executed
        await supabase
          .from('pod_governance_proposals')
          .update({ status: 'executed' })
          .eq('id', proposalId);
      }

      return executionResult;
    } catch (error) {
      console.error('Error executing proposal:', error);
      return { success: false, error: 'Failed to execute proposal' };
    }
  }

  /**
   * Get active proposals for a pod
   */
  static async getActiveProposals(
    podId: string,
  ): Promise<GovernanceProposal[]> {
    try {
      const { data, error } = await supabase
        .from('pod_governance_proposals')
        .select('*')
        .eq('pod_id', podId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching active proposals:', error);
      return [];
    }
  }

  // Private execution methods
  private static async executeStatusChange(
    proposal: GovernanceProposal,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { newStatus } = proposal.proposal_data;

      const { error } = await supabase
        .from('pods')
        .update({ status: newStatus })
        .eq('id', proposal.pod_id);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to update pod status' };
    }
  }

  private static async executeDescriptionEdit(
    proposal: GovernanceProposal,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { newDescription } = proposal.proposal_data;

      const { error } = await supabase
        .from('pods')
        .update({ description: newDescription })
        .eq('id', proposal.pod_id);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to update pod description' };
    }
  }

  private static async executeImageUpdate(
    proposal: GovernanceProposal,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { newImageUrl } = proposal.proposal_data;

      const { error } = await supabase
        .from('pods')
        .update({ image_url: newImageUrl })
        .eq('id', proposal.pod_id);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to update pod image' };
    }
  }

  private static async executeArchivePod(
    proposal: GovernanceProposal,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('pods')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
        })
        .eq('id', proposal.pod_id);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to archive pod' };
    }
  }

  private static async executeDeletePod(
    proposal: GovernanceProposal,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Note: In production, you might want to soft delete or transfer ownership
      // rather than hard delete, depending on your business requirements
      const { error } = await supabase
        .from('pods')
        .update({
          status: 'deleted',
          deleted_at: new Date().toISOString(),
        })
        .eq('id', proposal.pod_id);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to delete pod' };
    }
  }
}

export default PodMultiManagerGovernance;

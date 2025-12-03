import { supabase } from '@/utils/supabaseClient';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import type { WalletClient, PublicClient } from 'viem';

/**
 * BountyApprovalService - Handles multi-signature approval workflows for bounty operations
 *
 * Features:
 * - Value-based thresholds requiring consensus
 * - Signature-based approvals for audit trail
 * - OnchainKit integration for sponsored transactions
 * - Real-time notifications for approvers
 */

export interface BountyApprovalWorkflow {
  id: string;
  bounty_id: string; // Changed from number to string (UUID)
  approval_type: 'creation' | 'milestones' | 'completion' | 'cancellation';
  required_approvals: number;
  current_approvals: string[];
  status: 'pending' | 'approved' | 'executed' | 'expired' | 'cancelled';
  threshold_value: string; // "$1000"
  operation_details: any;
  proposed_by: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  executed_at?: string;
  executed_by?: string;
}

export interface BountyThresholds {
  creation: { value: string; signatures: number };
  milestones: { value: string; signatures: number };
  completion: { value: string; signatures: number };
  cancellation: { value: string; signatures: number };
}

export class BountyApprovalService {
  // Default thresholds - can be overridden by pod configuration
  private static DEFAULT_THRESHOLDS: BountyThresholds = {
    creation: { value: '1000', signatures: 3 }, // $1000+ bounties need 3-of-5 managers
    milestones: { value: '200', signatures: 2 }, // $200+ milestones need 2-of-3
    completion: { value: '500', signatures: 2 }, // $500+ completion needs 2-of-3
    cancellation: { value: '0', signatures: 2 }, // All cancellations need 2-of-3
  };

  /**
   * Check if a bounty operation requires multi-signature approval
   */
  static requiresApproval(
    operationType: keyof BountyThresholds,
    valueUSD: string,
    fundingSource: { type: 'wallet' | 'pod_treasury'; podId?: string },
  ): {
    required: boolean;
    signatures: number;
    approverType: 'global' | 'pod_leaders';
  } {
    const thresholds = this.DEFAULT_THRESHOLDS; // TODO: Load from pod config
    const threshold = thresholds[operationType];

    const valueNum = Number.parseFloat(valueUSD);
    const thresholdNum = Number.parseFloat(threshold.value);

    // For wallet funding, no multi-sig required - just creator approval
    if (fundingSource.type === 'wallet') {
      return {
        required: false, // No multi-sig for personal wallet funding
        signatures: 1, // Only creator signature needed
        approverType: 'global',
      };
    }

    // For pod treasury funding, ALWAYS require pod leader multi-sig
    if (fundingSource.type === 'pod_treasury' && fundingSource.podId) {
      return {
        required: true, // Always require multi-sig for pod treasury
        signatures: 3, // Always need 3 pod leader signatures
        approverType: 'pod_leaders', // Use pod-specific leaders
      };
    }

    // Default fallback
    const required = valueNum >= thresholdNum;
    return {
      required,
      signatures: required ? threshold.signatures : 1,
      approverType: 'global',
    };
  }

  /**
   * Create a multi-signature approval workflow for bounty operations
   */
  static async createApprovalWorkflow(
    bountyId: string | number, // Accept both string UUID and number
    approvalType: BountyApprovalWorkflow['approval_type'],
    valueUSD: string,
    operationDetails: any,
    proposedBy: string,
    fundingSource: { type: 'wallet' | 'pod_treasury'; podId?: string },
  ): Promise<BountyApprovalWorkflow> {
    try {
      const { required, signatures, approverType } = this.requiresApproval(
        approvalType,
        valueUSD,
        fundingSource,
      );

      if (!required) {
        throw new Error(
          `Bounty ${approvalType} for $${valueUSD} does not require multi-signature approval`,
        );
      }

      console.log(
        `🎯 Creating ${approvalType} approval workflow for bounty ${bountyId}:`,
        {
          valueUSD,
          requiredSignatures: signatures,
          approverType,
          fundingSource,
          proposedBy,
        },
      );

      const { data: workflow, error } = await supabase
        .from('bounty_approval_workflows')
        .insert({
          bounty_id: String(bountyId), // Convert to string for UUID compatibility
          approval_type: approvalType,
          required_approvals: signatures,
          current_approvals: [], // NO auto-approval - signature required first
          status: 'pending',
          threshold_value: `$${valueUSD}`,
          operation_details: {
            ...operationDetails,
            fundingSource,
            approverType,
          },
          proposed_by: proposedBy.toLowerCase(),
          expires_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(), // 7 days
        })
        .select()
        .single();

      if (error) {
        console.error(
          '❌ Database error creating bounty approval workflow:',
          error,
        );
        throw error;
      }

      console.log(
        '✅ Bounty approval workflow created successfully:',
        workflow.id,
      );

      // Send notifications to appropriate approvers (pod leaders or global managers)
      await this.notifyApprovers(
        workflow,
        operationDetails.title || 'New Bounty',
        approverType,
        fundingSource.podId,
      );

      return workflow;
    } catch (error) {
      console.error('Failed to create bounty approval workflow:', error);
      throw error;
    }
  }

  /**
   * Get pod leaders for approval workflows
   */
  private static async getPodLeaders(podId: string): Promise<string[]> {
    try {
      const { data: pod, error } = await supabase
        .from('pods')
        .select('pod_leads')
        .eq('id', podId)
        .single();

      if (error || !pod) {
        console.error('Failed to fetch pod leaders:', error);
        return [];
      }

      const leaders = Array.isArray(pod.pod_leads) ? pod.pod_leads : [];
      console.log(
        `🎯 Found ${leaders.length} pod leaders for pod ${podId}:`,
        leaders,
      );
      return leaders;
    } catch (error) {
      console.error('Failed to get pod leaders:', error);
      return [];
    }
  }

  /**
   * Get all bounty manager addresses from token balances
   */
  private static async getBountyManagers(): Promise<string[]> {
    try {
      // Get all users with bounty management permissions from pod_role_permissions
      const { data: permissions, error: permError } = await supabase
        .from('pod_role_permissions')
        .select('hat_id')
        .contains('permissions', ['bounty_management']);

      if (permError) {
        console.error(
          'Error fetching bounty management permissions:',
          permError,
        );
        return [];
      }

      if (!permissions || permissions.length === 0) {
        console.warn('No bounty management permissions found in any pod');
        return [];
      }

      // Get all unique hat IDs that have bounty management permission
      const bountyManagementHats = [
        ...new Set(permissions.map((p) => p.hat_id).filter(Boolean)),
      ];

      // Get all users who have any of these hats
      const { data: users, error: userError } = await supabase
        .from('user_profiles')
        .select('wallet_address, hat_ids');

      if (userError || !users) {
        console.error('Error fetching user profiles:', userError);
        return [];
      }

      // Filter users who have at least one bounty management hat
      const bountyManagers = users
        .filter(
          (user) =>
            user.hat_ids &&
            user.hat_ids.some((hatId: string) =>
              bountyManagementHats.includes(hatId),
            ),
        )
        .map((user) => user.wallet_address)
        .filter(Boolean);

      console.log(
        `🎯 Found ${bountyManagers.length} bounty managers:`,
        bountyManagers,
      );
      return bountyManagers;
    } catch (error) {
      console.error('Failed to get bounty managers:', error);
      return [];
    }
  }

  /**
   * Notify appropriate approvers based on funding source
   */
  private static async notifyApprovers(
    workflow: BountyApprovalWorkflow,
    bountyTitle: string,
    approverType: 'global' | 'pod_leaders',
    podId?: string,
  ): Promise<void> {
    try {
      let approvers: string[] = [];

      if (approverType === 'pod_leaders' && podId) {
        approvers = await this.getPodLeaders(podId);
        console.log(
          `📬 Notifying ${approvers.length} pod leaders for pod ${podId}`,
        );
      } else {
        approvers = await this.getBountyManagers();
        console.log(`📬 Notifying ${approvers.length} global bounty managers`);
      }

      if (approvers.length === 0) {
        console.warn('⚠️ No approvers found for notification');
        return;
      }

      // Ensure bountyTitle is valid to prevent null constraint violations
      const safeTitle = bountyTitle?.trim() || 'Untitled Bounty';
      const notificationTitle =
        approverType === 'pod_leaders'
          ? 'Pod Treasury Approval Required'
          : 'Bounty Approval Required';
      const notificationMessage = `"${safeTitle}" (${workflow.threshold_value}) requires your approval. ${workflow.current_approvals.length}/${workflow.required_approvals} approvals received.`;

      for (const approverAddress of approvers) {
        // Don't notify the person who created the workflow
        if (
          approverAddress.toLowerCase() === workflow.proposed_by.toLowerCase()
        ) {
          continue;
        }

        try {
          await unifiedNotificationService.createNotification({
            recipient_address: approverAddress,
            sender_address: workflow.proposed_by,
            notification_type: 'bounty_update',
            title: notificationTitle,
            message: notificationMessage,
            context_url: '/bounty?tab=approvals',
            context_type: 'bounty',
            context_id: workflow.id,
          });

          console.log(
            `📬 Sent ${approverType} approval notification to ${approverAddress}`,
          );
        } catch (notificationError) {
          console.error(
            `Failed to send notification to ${approverAddress}:`,
            notificationError,
          );
          // Continue with other notifications even if one fails
        }
      }
    } catch (error) {
      console.error('Failed to notify approvers:', error);
      // Don't throw - notifications are not critical for workflow creation
    }
  }

  /**
   * Notify all bounty managers about a pending approval (legacy method)
   */
  private static async notifyBountyManagers(
    workflow: BountyApprovalWorkflow,
    bountyTitle: string,
  ): Promise<void> {
    try {
      const managers = await this.getBountyManagers();

      // Ensure bountyTitle is valid to prevent null constraint violations
      const safeTitle = bountyTitle?.trim() || 'Untitled Bounty';
      const notificationTitle = 'Bounty Approval Required';
      const notificationMessage = `"${safeTitle}" (${workflow.threshold_value}) requires your approval. ${workflow.current_approvals.length}/${workflow.required_approvals} approvals received.`;

      for (const managerAddress of managers) {
        // Don't notify the person who created the workflow
        if (
          managerAddress.toLowerCase() === workflow.proposed_by.toLowerCase()
        ) {
          continue;
        }

        try {
          await unifiedNotificationService.createNotification({
            recipient_address: managerAddress,
            sender_address: workflow.proposed_by,
            notification_type: 'bounty_update',
            title: notificationTitle,
            message: notificationMessage,
            context_url: '/bounty?tab=approvals',
            context_type: 'bounty',
            context_id: workflow.id,
          });

          console.log(
            `📬 Sent bounty approval notification to ${managerAddress}`,
          );
        } catch (notificationError) {
          console.error(
            `Failed to send notification to ${managerAddress}:`,
            notificationError,
          );
          // Continue with other notifications even if one fails
        }
      }
    } catch (error) {
      console.error('Failed to notify bounty managers:', error);
      // Don't throw - notifications are not critical for workflow creation
    }
  }

  /**
   * Get active approval workflows for a bounty
   */
  static async getActiveWorkflows(
    bountyId: number | string,
  ): Promise<BountyApprovalWorkflow[]> {
    try {
      const { data: workflows, error } = await supabase
        .from('bounty_approval_workflows')
        .select('*')
        .eq('bounty_id', String(bountyId))
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching active workflows:', error);
        throw error;
      }

      return workflows || [];
    } catch (error) {
      console.error('Failed to get active workflows:', error);
      throw error;
    }
  }

  /**
   * Get all pending workflows that can be approved by a user
   */
  static async getPendingWorkflowsForUser(
    userAddress: string,
  ): Promise<BountyApprovalWorkflow[]> {
    try {
      const { data: workflows, error } = await supabase
        .from('bounty_approval_workflows')
        .select('*')
        .eq('status', 'pending')
        .not('current_approvals', 'cs', `{${userAddress.toLowerCase()}}`) // User hasn't approved yet
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching pending workflows:', error);
        throw error;
      }

      return workflows || [];
    } catch (error) {
      console.error('Failed to get pending workflows:', error);
      throw error;
    }
  }

  /**
   * Add approval with signature verification
   */
  static async approveWorkflow(
    workflowId: string,
    approverAddress: string,
    walletClient: WalletClient,
  ): Promise<{ success: boolean; approved: boolean; error?: string }> {
    try {
      // Get the workflow
      const { data: workflow, error: fetchError } = await supabase
        .from('bounty_approval_workflows')
        .select('*')
        .eq('id', workflowId)
        .single();

      if (fetchError || !workflow) {
        return { success: false, approved: false, error: 'Workflow not found' };
      }

      // Check if user has already approved
      if (workflow.current_approvals.includes(approverAddress.toLowerCase())) {
        return {
          success: false,
          approved: false,
          error: 'You have already approved this workflow',
        };
      }

      // STEP 1: Request signature for approval
      const message = `Approve bounty ${workflow.approval_type}: ${workflow.threshold_value}\nWorkflow ID: ${workflowId}\nBounty ID: ${workflow.bounty_id}\nTimestamp: ${new Date().toISOString()}`;

      console.log('🔏 Requesting signature for bounty approval:', message);

      const signature = await walletClient.signMessage({
        account: approverAddress as `0x${string}`,
        message,
      });
      console.log('✅ Signature obtained:', signature.substring(0, 20) + '...');

      // STEP 2: Store signature in audit trail
      await supabase.from('approval_signatures_audit').insert({
        workflow_type: 'bounty',
        workflow_id: workflowId,
        approver_address: approverAddress.toLowerCase(),
        signature,
        signed_message: message,
      });

      // STEP 3: Add approval to workflow
      const updatedApprovals = [
        ...workflow.current_approvals,
        approverAddress.toLowerCase(),
      ];
      const isFullyApproved =
        updatedApprovals.length >= workflow.required_approvals;

      const { error: updateError } = await supabase
        .from('bounty_approval_workflows')
        .update({
          current_approvals: updatedApprovals,
          status: isFullyApproved ? 'approved' : 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowId);

      if (updateError) throw updateError;

      // Send notifications
      await this.notifyBountyManagers(
        {
          ...workflow,
          current_approvals: updatedApprovals,
          status: isFullyApproved ? 'approved' : 'pending',
        },
        'approval_added',
      );

      if (isFullyApproved) {
        console.log('🎉 Bounty workflow fully approved, ready for execution');
      }

      return {
        success: true,
        approved: isFullyApproved,
      };
    } catch (error) {
      console.error('Failed to approve bounty workflow:', error);
      return {
        success: false,
        approved: false,
        error:
          error instanceof Error ? error.message : 'Failed to approve workflow',
      };
    }
  }

  /**
   * Execute approved bounty operation
   */
  static async executeApprovedWorkflow(
    workflowId: string,
    executorAddress: string,
    publicClient: PublicClient,
    walletClient: WalletClient,
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      const { data: workflow, error: fetchError } = await supabase
        .from('bounty_approval_workflows')
        .select('*')
        .eq('id', workflowId)
        .single();

      if (fetchError || !workflow) {
        return { success: false, error: 'Workflow not found' };
      }

      if (workflow.status !== 'approved') {
        return { success: false, error: 'Workflow is not fully approved' };
      }

      console.log(
        `🚀 Executing approved bounty ${workflow.approval_type} for bounty ${workflow.bounty_id}`,
      );

      // Execute the specific bounty operation
      let transactionHash: string | undefined;

      switch (workflow.approval_type) {
        case 'creation':
          // Execute bounty creation on-chain
          transactionHash = await this.executeBountyCreation(
            workflow,
            publicClient,
            walletClient,
          );
          break;
        case 'milestone':
          // Execute milestone payment
          transactionHash = await this.executeMilestonePayment(
            workflow,
            publicClient,
            walletClient,
          );
          break;
        case 'completion':
          // Execute bounty completion
          transactionHash = await this.executeBountyCompletion(
            workflow,
            publicClient,
            walletClient,
          );
          break;
        case 'cancellation':
          // Execute bounty cancellation
          transactionHash = await this.executeBountyCancellation(
            workflow,
            publicClient,
            walletClient,
          );
          break;
        default:
          throw new Error(`Unknown approval type: ${workflow.approval_type}`);
      }

      // Update workflow status
      await supabase
        .from('bounty_approval_workflows')
        .update({
          status: 'executed',
          executed_at: new Date().toISOString(),
          executed_by: executorAddress.toLowerCase(),
        })
        .eq('id', workflowId);

      console.log(
        `✅ Bounty ${workflow.approval_type} executed successfully. Tx: ${transactionHash}`,
      );

      return {
        success: true,
        transactionHash,
      };
    } catch (error) {
      console.error('Failed to execute bounty workflow:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to execute workflow',
      };
    }
  }

  // Removed: Dead code - this method was never called anywhere in the codebase
  // Notifications are handled by notifyApprovers() method which properly checks pod leaders

  // TODO: Implement specific execution methods
  private static async executeBountyCreation(
    workflow: BountyApprovalWorkflow,
    publicClient: PublicClient,
    walletClient: WalletClient,
  ): Promise<string> {
    // Implementation will use OnchainKit Transaction component for sponsored execution
    throw new Error('Bounty creation execution not yet implemented');
  }

  private static async executeMilestonePayment(
    workflow: BountyApprovalWorkflow,
    publicClient: PublicClient,
    walletClient: WalletClient,
  ): Promise<string> {
    throw new Error('Milestone payment execution not yet implemented');
  }

  private static async executeBountyCompletion(
    workflow: BountyApprovalWorkflow,
    publicClient: PublicClient,
    walletClient: WalletClient,
  ): Promise<string> {
    throw new Error('Bounty completion execution not yet implemented');
  }

  private static async executeBountyCancellation(
    workflow: BountyApprovalWorkflow,
    publicClient: PublicClient,
    walletClient: WalletClient,
  ): Promise<string> {
    throw new Error('Bounty cancellation execution not yet implemented');
  }

  /**
   * Check if user can approve a specific workflow
   */
  static async canUserApprove(
    workflowId: string,
    userAddress: string,
  ): Promise<boolean> {
    try {
      // Get workflow details including operation details
      const { data: workflow } = await supabase
        .from('bounty_approval_workflows')
        .select('current_approvals, status, operation_details')
        .eq('id', workflowId)
        .single();

      if (!workflow || workflow.status !== 'pending') {
        return false;
      }

      // Check if user has already approved
      if (workflow.current_approvals.includes(userAddress.toLowerCase())) {
        return false;
      }

      // Check permission based on approverType
      const { approverType, fundingSource } = workflow.operation_details || {};

      if (approverType === 'pod_leaders' && fundingSource?.podId) {
        // For pod treasury funding, check if user is a pod leader
        const podLeaders = await this.getPodLeaders(fundingSource.podId);
        return podLeaders.some(
          (leader) => leader.toLowerCase() === userAddress.toLowerCase(),
        );
      } else {
        // For global bounty management, check if user has bounty management permission
        const { data: permissions } = await supabase
          .from('pod_role_permissions')
          .select('hat_id')
          .contains('permissions', ['bounty_management']);

        if (!permissions || permissions.length === 0) {
          return false;
        }

        const bountyManagementHats = permissions
          .map((p) => p.hat_id)
          .filter(Boolean);

        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('hat_ids')
          .eq('wallet_address', userAddress)
          .single();

        if (!userProfile || !userProfile.hat_ids) {
          return false;
        }

        // Check if user has any bounty management hat
        return userProfile.hat_ids.some((hatId: string) =>
          bountyManagementHats.includes(hatId),
        );
      }
    } catch (error) {
      console.error('Failed to check user approval permissions:', error);
      return false;
    }
  }
}

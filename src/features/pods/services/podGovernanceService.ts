import { supabase } from '@/utils/supabaseClient';
import type { Pod } from '@/features/events/types/event';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { getExecutivePodManagers } from '../utils/podNotificationHelpers';
import { PodRolePermissionsService } from './PodRolePermissionsService';
import { ExecutivePodNotificationService } from './ExecutivePodNotificationService';
import type { EligibilityCriteria } from './EligibilityService';
import { getCurrentSession } from '@/features/identity/utils/serverAuth';

export interface PodCreationData {
  id: string;
  name: string;
  description: string;
  parent_pod_id: string | null;
  parent_hat_id?: string; // ✅ NEW: Parent HAT ID for efficient child index queries
  pod_leads: string[];
  accountability_signatures: Record<string, AccountabilitySignature>;
  created_by_address: string;
  pod_image_url: string;
  pod_metadata: Record<string, any>;
  status: 'draft' | 'proposed' | 'active' | 'inactive';
  is_active: boolean;
  management_hat_id?: string;
  membership_hat_id?: string;
  treasury_contract_address?: string;
  proxy_contract_address?: string; // NEW: Proxy contract address
  proxy_admin_hat_id?: string; // NEW: Proxy admin HAT ID
  leaderEligibilityCriteria?: EligibilityCriteria[];
  memberEligibilityCriteria?: EligibilityCriteria[];
}

export interface AccountabilitySignature {
  address: string;
  signature: string;
  timestamp: string;
  statement: string;
  isValid: boolean;
}

export interface GovernanceProposalData {
  title: string;
  body: string;
  targetContract: string;
  functionName: string;
  args: any[];
  forumThreadId?: string;
}

export class PodGovernanceService {
  /**
   * Generate governance proposal for pod approval
   */
  static async generatePodApprovalProposal(
    podData: PodCreationData,
    parentPods: Pod[],
  ): Promise<GovernanceProposalData> {
    const parentPod = parentPods.find((p) => p.id === podData.parent_pod_id);

    const proposalTitle = `Approve New Pod: ${podData.name}`;

    // Get creator profile for display
    let creatorDisplay = `\`${podData.created_by_address}\``;
    try {
      const { data: creatorProfile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('wallet_address', podData.created_by_address.toLowerCase())
        .single();

      if (creatorProfile?.first_name || creatorProfile?.last_name) {
        creatorDisplay =
          `${creatorProfile.first_name || ''} ${creatorProfile.last_name || ''}`.trim();
      }
    } catch (error) {
      console.log('Could not fetch creator profile, using address');
    }

    // Get pod leads display with profiles
    let podLeadsDisplay = 'No pod leads assigned';
    let profiles: any[] = [];

    if (podData.pod_leads && podData.pod_leads.length > 0) {
      try {
        const { data: fetchedProfiles } = await supabase
          .from('user_profiles')
          .select('wallet_address, first_name, last_name')
          .in(
            'wallet_address',
            podData.pod_leads.map((addr) => addr.toLowerCase()),
          );

        profiles = fetchedProfiles || [];

        const leadsWithNames = podData.pod_leads.map((address) => {
          const profile = profiles.find(
            (p) => p.wallet_address.toLowerCase() === address.toLowerCase(),
          );
          if (profile?.first_name || profile?.last_name) {
            return `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
          }
          return `\`${address}\``;
        });

        podLeadsDisplay = `${leadsWithNames.join(', ')} (${podData.pod_leads.length} member${podData.pod_leads.length !== 1 ? 's' : ''})`;
      } catch (error) {
        podLeadsDisplay = `${podData.pod_leads.join(', ')} (${podData.pod_leads.length} member${podData.pod_leads.length !== 1 ? 's' : ''})`;
      }
    }

    const proposalBody = `
# **Pod Creation Proposal**

**Pod Name:** ${podData.name}  
**Description:** ${podData.description}  
**Parent Pod:** ${parentPod?.name || 'Root'}  
**Pod Leads:** ${podLeadsDisplay}  
**Created by:** ${creatorDisplay}

### Pod Overview
${podData.description}

### Leadership Team
${
  podData.pod_leads && podData.pod_leads.length > 0
    ? podData.pod_leads
        .map((lead, index) => {
          const signature =
            podData.accountability_signatures[lead.toLowerCase()];
          // Try to get profile name from profiles we fetched earlier
          const profile = profiles?.find(
            (p) => p.wallet_address.toLowerCase() === lead.toLowerCase(),
          );
          const displayName =
            profile?.first_name || profile?.last_name
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
              : `\`${lead}\``;
          return `**Lead ${index + 1}:** ${displayName} ${signature?.isValid ? '✅ Accountability Statement Signed' : '❌ Signature Pending'}`;
        })
        .join('\n')
    : '*No pod leads have been assigned yet. Pod leads can be added after approval.*'
}

### Accountability Compliance
${
  podData.pod_leads && podData.pod_leads.length > 0
    ? 'All pod leads have signed the SpiritDAO Pod Leadership Accountability Statement, committing to:'
    : 'Upon assignment of pod leads, they will be required to sign the SpiritDAO Pod Leadership Accountability Statement, committing to:'
}
- Acting with integrity and transparency
- Compliance with DAO terms of service
- Responsible stewardship of DAO resources
- Personal liability for network actions
- Community-first decision making

### Governance Structure
- **Parent Pod:** ${parentPod?.name || 'SpiritDAO Root'}
- **Management Model:** Multi-signature leadership (${podData.pod_leads.length} leads)
- **Treasury:** Dedicated pod treasury contract with multi-sig controls
- **Token Gating:** HATS-based membership and management roles

### Technical Implementation
Upon approval, the following will be automatically deployed:
1. **HATS Creation:** Management and membership hats for role-based access
2. **Treasury Deployment:** Dedicated PodTreasury contract for fund management
3. **Access Controls:** Integration with existing event, forum, and bounty systems
4. **Governance Integration:** Participation in DAO-wide decision making

### Requested Permissions
This pod requests permission to:
- Create and manage events within their domain
- Receive and distribute treasury funds from event registrations
- Manage pod-specific forum discussions and threads
- Create bounties and manage completion workflows
- Participate in DAO governance as a recognized entity

---

**Voting Options:**
- **FOR:** Approve pod creation and activate all requested permissions
- **AGAINST:** Reject pod creation proposal
- **ABSTAIN:** No position on this proposal

**Pod ID:** \`${podData.id}\`  
**Created by:** \`${podData.created_by_address}\`  
**Proposal Generated:** ${new Date().toISOString()}

---
*This proposal was auto-generated by the Pod Creation System v1.0*
    `.trim();

    return {
      title: proposalTitle,
      body: proposalBody,
      targetContract:
        process.env.NEXT_PUBLIC_POD_CREATION_CONTRACT ||
        '0x43C124Df0dFb324CCC742808D9FdF62C764f2644',
      functionName: 'activatePod',
      args: [podData.id],
    };
  }

  /**
   * Create pod in database with draft status
   */
  static async createPodProposal(podData: PodCreationData): Promise<string> {
    try {
      // Ensure user session is valid
      const session = await getCurrentSession();
      if (!session?.user?.id) {
        throw new Error('Authentication required');
      }

      // Insert pod proposal
      const { data: podResult, error: podError } = await supabase
        .from('pods')
        .insert({
          id: podData.id,
          name: podData.name,
          description: podData.description,
          parent_pod_id: podData.parent_pod_id,
          pod_leads: podData.pod_leads,
          created_by_address: podData.created_by_address,
          pod_image_url: podData.pod_image_url,
          pod_metadata: podData.pod_metadata,
          status: 'draft',
          is_active: false,
          token_type: 'HATS', // Default to HATS-based tokens
          management_hat_id: podData.management_hat_id,
          membership_hat_id: podData.membership_hat_id,
          treasury_contract_address: podData.treasury_contract_address,
          proxy_contract_address: podData.proxy_contract_address || null, // NEW: Store proxy address
          proxy_admin_hat_id: podData.proxy_admin_hat_id || null, // NEW: Store proxy admin HAT ID
        })
        .select()
        .single();

      if (podError) throw podError;

      // Store accountability signatures
      const signatureInserts = Object.values(
        podData.accountability_signatures,
      ).map((sig) => ({
        pod_id: podData.id,
        signer_address: sig.address,
        signature_data: sig.signature,
        signed_at: sig.timestamp,
        accountability_statement: sig.statement,
        is_valid: sig.isValid,
      }));

      const { error: sigError } = await supabase
        .from('pod_accountability_signatures')
        .insert(signatureInserts);

      if (sigError) throw sigError;

      // Initialize default role permissions with eligibility criteria
      if (podData.management_hat_id && podData.membership_hat_id) {
        console.log(
          '🔐 Setting up role permissions with eligibility criteria...',
        );

        // Create leader role with custom eligibility criteria if provided
        await PodRolePermissionsService.createRolePermission({
          pod_id: podData.id,
          hat_id: podData.management_hat_id,
          role_name: 'Pod Leader',
          permissions: {
            chatAccess: true,
            governanceParticipation: true,
            eventCreation: true,
            treasuryViewing: true,
            memberManagement: true,
            subPodCreation: true,
            roleAssignment: true,
            forumModeration: false,
            bountyManagement: true,
            marketplaceAccess: true,
          },
          eligibility_criteria: podData.leaderEligibilityCriteria || [],
          max_holders: 5,
          created_by: podData.created_by_address,
        });

        // Create member role with custom eligibility criteria if provided
        await PodRolePermissionsService.createRolePermission({
          pod_id: podData.id,
          hat_id: podData.membership_hat_id,
          role_name: 'Pod Member',
          permissions: {
            chatAccess: true,
            governanceParticipation: true,
            eventCreation: false,
            treasuryViewing: false,
            memberManagement: false,
            subPodCreation: false,
            roleAssignment: false,
            forumModeration: false,
            bountyManagement: false,
            marketplaceAccess: true,
          },
          eligibility_criteria: podData.memberEligibilityCriteria || [],
          max_holders: 100,
          created_by: podData.created_by_address,
        });

        console.log('✅ Role permissions configured with eligibility criteria');
      }

      // 🆕 ADD LEADERS TO active_pod_members TABLE
      // This ensures leaders can access chats and other pod features immediately
      try {
        const { HatsMembershipService } = await import(
          './HatsMembershipService'
        );

        console.log('👥 Adding pod leaders to active_pod_members table...');

        for (const leaderAddress of podData.pod_leads) {
          await HatsMembershipService.addPodMember(
            podData.id,
            leaderAddress,
            'leader',
            podData.management_hat_id,
          );
        }

        console.log(
          `✅ Added ${podData.pod_leads.length} leader(s) to active_pod_members`,
        );
      } catch (membershipError) {
        console.error(
          '⚠️ Failed to add leaders to active_pod_members:',
          membershipError,
        );
        // Don't fail pod creation if membership indexing fails
      }

      // Notify executive pod holders about the new pod approval request
      try {
        const parentPod = await this.getParentPodInfo(podData.parent_pod_id);

        await ExecutivePodNotificationService.notifyExecutivePodHolders({
          type: 'pod_approval_request',
          podId: podData.id,
          podName: podData.name,
          podDescription: podData.description,
          createdBy: podData.created_by_address,
          parentPodName: parentPod?.name || 'SpiritDAO Root',
          podLeads: podData.pod_leads,
          contextUrl: `/governance`,
        });

        console.log(
          '🔔 Executive pod holders notified about pod approval request',
        );
      } catch (notificationError) {
        console.error(
          'Failed to notify executive pod holders:',
          notificationError,
        );
        // Don't fail the pod creation if notification fails
      }

      return podData.id;
    } catch (error) {
      console.error('Failed to create pod proposal:', error);
      throw error;
    }
  }

  /**
   * Get parent pod information
   */
  static async getParentPodInfo(
    parentPodId: string | null,
  ): Promise<Pod | null> {
    if (!parentPodId) return null;

    try {
      const { data, error } = await supabase
        .from('pods')
        .select('*')
        .eq('id', parentPodId)
        .single();

      if (error) {
        console.error('Error fetching parent pod info:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error getting parent pod info:', error);
      return null;
    }
  }

  /**
   * Submit governance proposal through existing system
   */
  static async submitGovernanceProposal(
    proposalData: GovernanceProposalData,
    creatorAddress: string,
  ): Promise<string> {
    try {
      // Here you would integrate with the existing CreateProposalForm logic
      // For now, we'll simulate the process and return a proposal ID

      console.log('Submitting governance proposal:', {
        title: proposalData.title,
        bodyLength: proposalData.body.length,
        targetContract: proposalData.targetContract,
        functionName: proposalData.functionName,
        args: proposalData.args,
        creator: creatorAddress,
      });

      // In a real implementation, this would:
      // 1. Create a forum thread for discussion
      // 2. Submit the on-chain governance proposal
      // 3. Trigger governance notifications
      // 4. Return the proposal ID

      const simulatedProposalId = `prop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      return simulatedProposalId;
    } catch (error) {
      console.error('Failed to submit governance proposal:', error);
      throw error;
    }
  }

  /**
   * Approve pod proposal (executive action)
   */
  static async approvePodProposal(
    podId: string,
    approverAddress: string,
    proposalId?: string,
  ): Promise<void> {
    try {
      // Update pod status to active
      const { data: podData, error: updateError } = await supabase
        .from('pods')
        .update({
          status: 'active',
          is_active: true,
          governance_proposal_id: proposalId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', podId)
        .select('name, created_by_address')
        .single();

      if (updateError) throw updateError;

      // Notify pod creator of approval
      if (podData) {
        await ExecutivePodNotificationService.notifyPodStatusUpdate(
          podId,
          podData.name,
          'approved',
          podData.created_by_address,
          approverAddress,
        );
      }

      console.log(`✅ Pod ${podId} approved by ${approverAddress}`);
    } catch (error) {
      console.error('Failed to approve pod proposal:', error);
      throw error;
    }
  }

  /**
   * Reject pod proposal (executive action)
   */
  static async rejectPodProposal(
    podId: string,
    rejectorAddress: string,
    reason?: string,
  ): Promise<void> {
    try {
      // Update pod status to rejected
      const { data: podData, error: updateError } = await supabase
        .from('pods')
        .update({
          status: 'rejected',
          is_active: false,
          pod_metadata: supabase.sql`pod_metadata || ${JSON.stringify({
            rejection_reason: reason,
            rejected_by: rejectorAddress,
            rejected_at: new Date().toISOString(),
          })}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', podId)
        .select('name, created_by_address')
        .single();

      if (updateError) throw updateError;

      // Notify pod creator of rejection
      if (podData) {
        await ExecutivePodNotificationService.notifyPodStatusUpdate(
          podId,
          podData.name,
          'rejected',
          podData.created_by_address,
          rejectorAddress,
        );
      }

      console.log(`❌ Pod ${podId} rejected by ${rejectorAddress}`);
    } catch (error) {
      console.error('Failed to reject pod proposal:', error);
      throw error;
    }
  }

  /**
   * Update pod status after governance approval
   */
  static async activatePod(
    podId: string,
    hatIds: { managementHatId: string; membershipHatId: string },
    treasuryAddress: string,
  ): Promise<void> {
    try {
      console.log(`🚀 Activating pod ${podId} with HAT integration...`);

      // Get pod details for role creation
      const { data: pod, error: podError } = await supabase
        .from('pods')
        .select('name, created_by_address')
        .eq('id', podId)
        .single();

      if (podError || !pod) {
        throw new Error(`Failed to get pod details: ${podError?.message}`);
      }

      // Update pod status first
      const { error } = await supabase
        .from('pods')
        .update({
          status: 'active',
          is_active: true,
          management_hat_id: hatIds.managementHatId,
          membership_hat_id: hatIds.membershipHatId,
          treasury_contract_address: treasuryAddress,
        })
        .eq('id', podId);

      if (error) throw error;

      console.log(`✅ Pod ${podId} status updated to active`);

      // Create default role permissions for the activated pod
      try {
        console.log(`🎩 Creating role permissions for pod ${podId}...`);

        await PodRolePermissionsService.initializeDefaultRoles(
          podId,
          hatIds.managementHatId,
          hatIds.membershipHatId,
          pod.created_by_address || 'system',
        );

        console.log(`✅ Role permissions created for pod ${podId}`);
      } catch (roleError) {
        console.error(
          `⚠️ Failed to create role permissions for pod ${podId}:`,
          roleError,
        );
        // Don't throw here - pod activation should succeed even if role creation fails
        // Role permissions can be created manually later if needed
      }

      console.log(
        `🎉 Pod ${podId} activated successfully with role permissions`,
      );
    } catch (error) {
      console.error('Failed to activate pod:', error);
      throw error;
    }
  }

  /**
   * Get pod proposal by ID
   */
  static async getPodProposal(podId: string): Promise<PodCreationData | null> {
    try {
      const { data: pod, error: podError } = await supabase
        .from('pods')
        .select('*')
        .eq('id', podId)
        .single();

      if (podError) throw podError;
      if (!pod) return null;

      // Get accountability signatures
      const { data: signatures, error: sigError } = await supabase
        .from('pod_accountability_signatures')
        .select('*')
        .eq('pod_id', podId);

      if (sigError) throw sigError;

      // Transform signatures to expected format
      const accountabilitySignatures: Record<string, AccountabilitySignature> =
        {};
      for (const sig of signatures || []) {
        accountabilitySignatures[sig.signer_address.toLowerCase()] = {
          address: sig.signer_address,
          signature: sig.signature_data,
          timestamp: sig.signed_at,
          statement: sig.accountability_statement,
          isValid: sig.is_valid,
        };
      }

      return {
        id: pod.id,
        name: pod.name,
        description: pod.description,
        parent_pod_id: pod.parent_pod_id,
        pod_leads: pod.pod_leads || [],
        accountability_signatures: accountabilitySignatures,
        created_by_address: pod.created_by_address,
        pod_image_url: pod.pod_image_url,
        pod_metadata: pod.pod_metadata || {},
        status: pod.status,
        is_active: pod.is_active,
        management_hat_id: pod.management_hat_id,
        membership_hat_id: pod.membership_hat_id,
        treasury_contract_address: pod.treasury_contract_address,
      };
    } catch (error) {
      console.error('Failed to get pod proposal:', error);
      throw error;
    }
  }

  /**
   * List all pods with optional filtering
   * Note: Uses the dedicated 'pods' table, not 'tokens' table
   * All pods are tokens, but not all tokens are pods (events, permissions, etc. also create tokens)
   */
  static async getPods(filters?: {
    status?: string;
    parentPodId?: string;
  }): Promise<Pod[]> {
    try {
      console.log(
        '🔄 PodGovernanceService: Getting pods from dedicated pods table...',
      );

      // Check authentication status
      const session = await getCurrentSession();
      console.log(
        '🔐 PodGovernanceService: User authentication status:',
        !!session?.user?.id,
      );

      let query = supabase.from('pods').select(`
        *,
        pod_image_url,
        management_hat_id,
        membership_hat_id,
        treasury_contract_address
      `);

      if (filters?.status) {
        query = query.eq('status', filters.status);
        console.log('🔍 Filtering by status:', filters.status);
      } else {
        console.log('🔍 Getting ALL pods (no status filter)');
      }

      if (filters?.parentPodId) {
        query = query.eq('parent_pod_id', filters.parentPodId);
        console.log('🔍 Filtering by parent pod ID:', filters.parentPodId);
      }

      const { data, error } = await query.order('created_at', {
        ascending: false,
      });

      console.log('🔍 PodGovernanceService query result:', {
        dataLength: data?.length || 0,
        error: error?.message || 'none',
        errorCode: error?.code || 'none',
        sampleData:
          data
            ?.slice(0, 2)
            ?.map((p) => ({ id: p.id, name: p.name, status: p.status })) || [],
      });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Failed to get pods:', error);
      throw error;
    }
  }

  /**
   * Get pods where the user has leadership access
   * This includes pods where the user is in the pod_leads array or is the creator
   */
  static async getUserLeadershipPods(userAddress: string): Promise<Pod[]> {
    try {
      console.log(
        '🔄 PodGovernanceService: Getting leadership pods for user:',
        userAddress,
      );

      if (!userAddress) {
        console.log('❌ No user address provided');
        return [];
      }

      // Query for pods where user is either a pod lead or the creator
      const { data, error } = await supabase
        .from('pods')
        .select(`
          *,
          pod_image_url,
          management_hat_id,
          membership_hat_id,
          treasury_contract_address
        `)
        .or(
          `pod_leads.cs.{${userAddress.toLowerCase()}},created_by_address.eq.${userAddress.toLowerCase()}`,
        )
        .order('created_at', { ascending: false });

      console.log('🔍 PodGovernanceService leadership query result:', {
        dataLength: data?.length || 0,
        error: error?.message || 'none',
        sampleData:
          data?.slice(0, 2)?.map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            pod_leads: p.pod_leads,
            created_by_address: p.created_by_address,
          })) || [],
      });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Failed to get user leadership pods:', error);
      // Return empty array instead of throwing to prevent page crashes
      return [];
    }
  }

  /**
   * Insert a new accountability signature for a pod leader
   */
  static async addAccountabilitySignature(
    podId: string,
    signature: AccountabilitySignature,
  ): Promise<void> {
    const { error } = await supabase
      .from('pod_accountability_signatures')
      .insert({
        pod_id: podId,
        signer_address: signature.address,
        signature_data: signature.signature,
        signed_at: signature.timestamp,
        accountability_statement: signature.statement,
        is_valid: signature.isValid,
      });

    if (error) throw error;
  }

  /**
   * Get all accountability signatures for a pod
   */
  static async getAccountabilitySignatures(
    podId: string,
  ): Promise<AccountabilitySignature[]> {
    const { data, error } = await supabase
      .from('pod_accountability_signatures')
      .select('*')
      .eq('pod_id', podId)
      .order('signed_at', { ascending: true });

    if (error) throw error;

    return (data || []).map((sig) => ({
      address: sig.signer_address,
      signature: sig.signature_data,
      timestamp: sig.signed_at,
      statement: sig.accountability_statement,
      isValid: sig.is_valid,
    }));
  }

  /**
   * Update pod status
   */
  static async updatePodStatus(
    podId: string,
    status: 'draft' | 'proposed' | 'active' | 'inactive',
    extra?: Partial<{
      management_hat_id: string;
      membership_hat_id: string;
      treasury_contract_address: string;
    }>,
  ): Promise<void> {
    const { error } = await supabase
      .from('pods')
      .update({ status, ...(extra || {}) })
      .eq('id', podId);
    if (error) throw error;
  }

  /**
   * Update pod treasury address (for direct treasury deployment)
   */
  static async updatePodTreasuryAddress(
    podId: string,
    treasuryAddress: string,
  ): Promise<void> {
    console.log(
      `🏦 Updating pod ${podId} with treasury address: ${treasuryAddress}`,
    );

    const { error } = await supabase
      .from('pods')
      .update({
        treasury_contract_address: treasuryAddress,
        // Ensure pod is marked as active if it has a treasury
        status: 'active',
        // Removed is_active since it doesn't exist in schema
      })
      .eq('id', podId);

    if (error) {
      console.error('❌ Failed to update pod treasury address:', error);
      throw error;
    }

    console.log(`✅ Pod ${podId} treasury address updated successfully`);
  }

  /**
   * Notify invited leaders to sign accountability agreement
   *
   * MIGRATED: Phase 2 - Now uses unifiedNotificationService
   */
  static async notifyPodInvites(
    podId: string,
    podName: string,
    recipients: string[],
    creatorAddress: string,
  ): Promise<void> {
    const notifications = recipients.map((recipient) =>
      unifiedNotificationService.createNotification({
        recipient_address: recipient.toLowerCase(),
        sender_address: creatorAddress.toLowerCase(),
        notification_type: 'user_mentioned',
        title: 'Pod Leadership Invitation',
        message: `You have been invited to co-lead the pod "${podName}". Please review and sign the leadership agreement.`,
        context_type: 'governance',
        context_id: podId,
        context_url: `/pods/${podId}`,
        priority: 'high',
      }),
    );

    await Promise.all(notifications);
  }

  /**
   * Notify Executive Pod leaders that a pod is ready for approval (consensus currently set to 1)
   *
   * MIGRATED: Phase 2 - Now uses unifiedNotificationService and podNotificationHelpers
   */
  static async notifyExecutiveForApproval(
    podId: string,
    podName: string,
    creatorAddress: string,
  ): Promise<void> {
    try {
      // Check if notification was already sent for this pod to prevent spam
      const { data: existingNotifications, error } = await supabase
        .from('general_notifications')
        .select('id')
        .eq('context_id', podId)
        .eq('notification_type', 'user_mentioned')
        .eq('title', 'Pod Approval Required')
        .limit(1);

      if (error) {
        console.error('Error checking existing notifications:', error);
      }

      // If notification already exists, don't send duplicates
      if (existingNotifications && existingNotifications.length > 0) {
        console.log(
          `📄 Pod approval notification already sent for ${podName} (${podId})`,
        );
        return;
      }

      // Get executive pod managers using new helper function
      const managers = await getExecutivePodManagers();
      if (!managers || managers.length === 0) {
        console.log(
          '⚠️ No Executive Pod managers found for approval notification',
        );
        return;
      }

      console.log(
        `📨 Sending pod approval notification for ${podName} to ${managers.length} Executive Pod members`,
      );

      await Promise.all(
        managers.map((manager) =>
          unifiedNotificationService.createNotification({
            recipient_address: manager.wallet_address.toLowerCase(),
            sender_address: creatorAddress.toLowerCase(),
            notification_type: 'user_mentioned',
            category: 'general',
            title: 'Pod Approval Required',
            message: `New pod "${podName}" is ready for Executive approval. Consensus threshold is set to 1 for testing.`,
            context_type: 'governance',
            context_id: podId,
            context_url: `/pods/${podId}`,
            priority: 'high',
          }),
        ),
      );

      console.log(
        `✅ Pod approval notifications sent successfully for ${podName}`,
      );
    } catch (error) {
      console.error(
        `❌ Failed to send pod approval notifications for ${podName}:`,
        error,
      );
    }
  }
}

/**
 * Hook for pod governance operations
 */
export function usePodGovernance() {
  const createPodProposal = async (
    podData: PodCreationData,
    parentPods: Pod[],
  ) => {
    // Create pod in database
    const podId = await PodGovernanceService.createPodProposal(podData);

    // Generate governance proposal
    const proposalData = await PodGovernanceService.generatePodApprovalProposal(
      podData,
      parentPods,
    );

    // Submit to governance system
    const proposalId = await PodGovernanceService.submitGovernanceProposal(
      proposalData,
      podData.created_by_address,
    );

    return { podId, proposalId };
  };

  return {
    createPodProposal,
    activatePod: PodGovernanceService.activatePod,
    getPodProposal: PodGovernanceService.getPodProposal,
    getPods: PodGovernanceService.getPods,
  };
}

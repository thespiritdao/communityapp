import type { Pod, MemberRef, PodServiceConfig } from '../types';
import { PodDatabaseService } from './PodDatabaseService';
import { PodRolePermissionsService } from './PodRolePermissionsService';
import { HatsMigrationService } from './hatsMigrationService';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { getExecutivePodManagers } from '../utils/podNotificationHelpers';
import { getCurrentSession } from '@/features/identity/utils/serverAuth';
import { supabase } from '@/utils/supabaseClient';
import type { EligibilityCriteria } from './EligibilityService';

export interface PodCreationData {
  id: string;
  name: string;
  description: string;
  parent_pod_id: string | null;
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

/**
 * PodCoreService - Unified service for all pod operations
 *
 * Consolidates functionality from:
 * - PodService (basic CRUD operations)
 * - PodGovernanceService (governance and approval workflows)
 * - Parts of hatToggleService (pod activation/deactivation)
 *
 * Provides clean, efficient API for pod management with proper error handling
 * and authentication checks.
 */
export class PodCoreService {
  // ==========================================
  // BASIC POD OPERATIONS (from PodService)
  // ==========================================

  /**
   * Get a single pod by ID with full details
   */
  static async getPodById(id: string): Promise<Pod | null> {
    try {
      console.log('🔍 PodCoreService.getPodById:', id);

      const result = await PodDatabaseService.getPodById(id);

      if (result.error) {
        if (result.error === 'Pod not found') {
          return null;
        }
        throw new Error(result.error);
      }

      console.log('🏦 Pod retrieved:', result.data?.name);
      return result.data;
    } catch (error) {
      console.error(`Failed to fetch pod ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get all pods with optional filtering and sorting
   */
  static async getAllPods(config: PodServiceConfig = {}): Promise<Pod[]> {
    try {
      console.log('🔄 PodCoreService: Getting all pods...');

      const databaseConfig = {
        includeInactive: config.includeInactive,
        orderBy: 'created_at',
        ascending: false,
      };

      const result = await PodDatabaseService.getPods(databaseConfig);

      if (result.error) {
        throw new Error(result.error);
      }

      let pods = result.data || [];

      // Apply additional filters
      if (config.status) {
        pods = pods.filter((pod) => pod.status === config.status);
        console.log('🔍 Filtered by status:', config.status);
      }

      if (config.parentPodId) {
        pods = pods.filter((pod) => pod.parent_pod_id === config.parentPodId);
        console.log('🔍 Filtered by parent pod ID:', config.parentPodId);
      }

      console.log('📊 Query result:', {
        count: pods.length,
        totalFromDb: result.count || 0,
      });

      return pods;
    } catch (error) {
      console.error('Failed to get pods:', error);
      throw error;
    }
  }

  /**
   * Get pods where user has leadership access
   */
  static async getUserLeadershipPods(userAddress: string): Promise<Pod[]> {
    try {
      console.log('🔄 Getting leadership pods for:', userAddress);

      if (!userAddress) {
        return [];
      }

      const result =
        await PodDatabaseService.getUserLeadershipPods(userAddress);
      if (result.error) {
        console.error('Failed to get user leadership pods:', result.error);
        return [];
      }

      console.log('📊 Leadership pods:', result.data?.length || 0);
      return result.data || [];
    } catch (error) {
      console.error('Failed to get user leadership pods:', error);
      return [];
    }
  }

  // ==========================================
  // POD CREATION & GOVERNANCE (from PodGovernanceService)
  // ==========================================

  /**
   * Create pod with governance workflow
   */
  static async createPod(podData: PodCreationData): Promise<string> {
    try {
      console.log(`🏗️ Creating pod: ${podData.name}`);

      // Ensure user session is valid
      const session = await getCurrentSession();
      if (!session?.user?.id) {
        throw new Error('Authentication required');
      }

      // Insert pod into database
      const result = await PodDatabaseService.createPod({
        id: podData.id,
        name: podData.name,
        description: podData.description,
        parent_pod_id: podData.parent_pod_id,
        pod_leads: podData.pod_leads,
        created_by_address: podData.created_by_address,
        pod_image_url: podData.pod_image_url,
        pod_metadata: podData.pod_metadata,
        management_hat_id: podData.management_hat_id,
        membership_hat_id: podData.membership_hat_id,
        treasury_contract_address: podData.treasury_contract_address,
      } as any);

      if (result.error) throw new Error(result.error);
      if (!result.data) throw new Error('Pod creation returned no data');
      console.log(`✅ Pod created: ${result.data.id}`);

      // Store accountability signatures if provided
      if (Object.keys(podData.accountability_signatures).length > 0) {
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

        const sigResult =
          await PodDatabaseService.createAccountabilitySignatures(
            signatureInserts,
          );
        if (sigResult.error) {
          console.warn('Failed to store signatures:', sigResult.error);
          // Don't fail pod creation if signatures fail
        }
      }

      // Initialize role permissions if HAT IDs provided
      if (podData.management_hat_id && podData.membership_hat_id) {
        try {
          await this.initializePodRolePermissions(
            podData.id,
            podData.management_hat_id,
            podData.membership_hat_id,
            podData.created_by_address,
            podData.leaderEligibilityCriteria,
            podData.memberEligibilityCriteria,
          );
        } catch (roleError) {
          console.warn('Failed to create role permissions:', roleError);
          // Don't fail pod creation
        }
      }

      // Notify executive pod holders about approval request
      try {
        await this.notifyExecutiveForApproval(
          podData.id,
          podData.name,
          podData.created_by_address,
        );
      } catch (notificationError) {
        console.warn(
          'Failed to send approval notifications:',
          notificationError,
        );
        // Don't fail pod creation
      }

      return podData.id;
    } catch (error) {
      console.error('Failed to create pod:', error);
      throw error;
    }
  }

  /**
   * Update pod status and properties
   */
  static async updatePodStatus(
    podId: string,
    status: 'draft' | 'proposed' | 'active' | 'inactive',
    updates?: Partial<Pod>,
  ): Promise<void> {
    try {
      console.log(`🔄 Updating pod ${podId} status to: ${status}`);

      const updateData = {
        status,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      const result = await PodDatabaseService.updatePod(podId, updateData);
      if (result.error) throw new Error(result.error);
      console.log(`✅ Pod ${podId} status updated successfully`);
    } catch (error) {
      console.error(`Failed to update pod status:`, error);
      throw error;
    }
  }

  /**
   * Activate pod with HAT integration
   */
  static async activatePod(
    podId: string,
    hatIds: { managementHatId: string; membershipHatId: string },
    treasuryAddress: string,
  ): Promise<void> {
    try {
      console.log(`🚀 Activating pod ${podId} with HAT integration...`);

      // Get pod details
      const pod = await this.getPodById(podId);
      if (!pod) {
        throw new Error(`Pod ${podId} not found`);
      }

      // Update pod status and HAT IDs
      await this.updatePodStatus(podId, 'active', {
        management_hat_id: hatIds.managementHatId,
        membership_hat_id: hatIds.membershipHatId,
        treasury_contract_address: treasuryAddress,
        is_active: true,
      });

      // Initialize role permissions if not already done
      try {
        await PodRolePermissionsService.initializeDefaultRoles(
          podId,
          hatIds.managementHatId,
          hatIds.membershipHatId,
          pod.created_by_address || 'system',
        );
        console.log(`✅ Role permissions created for pod ${podId}`);
      } catch (roleError) {
        console.warn(
          `Role permission creation failed for pod ${podId}:`,
          roleError,
        );
        // Don't fail activation
      }

      console.log(`🎉 Pod ${podId} activated successfully`);
    } catch (error) {
      console.error('Failed to activate pod:', error);
      throw error;
    }
  }

  // ==========================================
  // POD DEACTIVATION (from hatToggleService integration)
  // ==========================================

  /**
   * Deactivate pod (mark as inactive, deactivate HATs)
   */
  static async deactivatePod(
    podId: string,
    userAddress: string,
  ): Promise<void> {
    try {
      console.log(`🔴 Deactivating pod ${podId} by user ${userAddress}`);

      // Verify user has permission to deactivate
      const pod = await this.getPodById(podId);
      if (!pod) {
        throw new Error('Pod not found');
      }

      const canManage = this.canUserManagePod(pod, userAddress);
      if (!canManage) {
        throw new Error('User does not have permission to deactivate this pod');
      }

      // Use HATs migration service for proper HAT deactivation
      await HatsMigrationService.deactivatePod(podId);

      console.log(`✅ Pod ${podId} deactivated successfully`);
    } catch (error) {
      console.error('Failed to deactivate pod:', error);
      throw error;
    }
  }

  /**
   * Reactivate pod
   */
  static async reactivatePod(
    podId: string,
    userAddress: string,
  ): Promise<void> {
    try {
      console.log(`🟢 Reactivating pod ${podId} by user ${userAddress}`);

      // Verify permissions
      const pod = await this.getPodById(podId);
      if (!pod) {
        throw new Error('Pod not found');
      }

      const canManage = this.canUserManagePod(pod, userAddress);
      if (!canManage) {
        throw new Error('User does not have permission to reactivate this pod');
      }

      // Use HATs migration service for proper HAT reactivation
      await HatsMigrationService.reactivatePod(podId);

      console.log(`✅ Pod ${podId} reactivated successfully`);
    } catch (error) {
      console.error('Failed to reactivate pod:', error);
      throw error;
    }
  }

  // ==========================================
  // MEMBER MANAGEMENT
  // ==========================================

  /**
   * Get pod leaders
   */
  static async getPodLeaders(podId: string): Promise<MemberRef[]> {
    try {
      const pod = await this.getPodById(podId);
      if (!pod?.pod_leads) {
        return [];
      }
      return pod.pod_leads.map((wallet) => ({ wallet }));
    } catch (error) {
      console.error(`Failed to get pod leaders for ${podId}:`, error);
      return [];
    }
  }

  /**
   * Get pod members with role information
   */
  static async getPodMembers(
    podId: string,
    membershipType?: 'leader' | 'member' | 'admin',
  ): Promise<MemberRef[]> {
    try {
      // Try indexed member data first
      try {
        let query = supabase
          .from('active_pod_members')
          .select('wallet, membership_type, joined_at, hat_id')
          .eq('pod_id', podId)
          .order('joined_at', { ascending: false });

        if (membershipType) {
          query = query.eq('membership_type', membershipType);
        }

        const { data, error } = await query;

        if (error && error.code === '42P01') {
          // Table doesn't exist, fall back to pod leaders
          throw new Error('Member table not found');
        } else if (error) {
          throw error;
        }

        return (data || []).map((member) => ({ wallet: member.wallet }));
      } catch (fallbackError) {
        console.log('🔄 Falling back to pod leaders from pods table');

        // Fallback to pod leaders
        if (!membershipType || membershipType === 'leader') {
          return await this.getPodLeaders(podId);
        }

        return [];
      }
    } catch (error) {
      console.error(`Failed to get pod members for ${podId}:`, error);
      return [];
    }
  }

  // ==========================================
  // ACCOUNTABILITY SIGNATURES
  // ==========================================

  /**
   * Add accountability signature
   */
  static async addAccountabilitySignature(
    podId: string,
    signature: AccountabilitySignature,
  ): Promise<void> {
    const result = await PodDatabaseService.addAccountabilitySignature(
      podId,
      signature,
    );
    if (result.error) throw new Error(result.error);
  }

  /**
   * Get accountability signatures for pod
   */
  static async getAccountabilitySignatures(
    podId: string,
  ): Promise<AccountabilitySignature[]> {
    console.log(
      '🔍 PodCoreService.getAccountabilitySignatures called for pod:',
      podId,
    );
    const result = await PodDatabaseService.getAccountabilitySignatures(podId);
    if (result.error) throw new Error(result.error);

    console.log('🔍 Raw database result before mapping:', result.data);
    const mapped = (result.data || []).map((sig) => {
      console.log('🔍 Mapping signature:', {
        input_address: sig.address,
        input_signature: sig.signature ? 'present' : 'missing',
        output_address: sig.address,
        output_signature: sig.signature,
      });
      return {
        address: sig.address,
        signature: sig.signature,
        timestamp: sig.timestamp,
        statement: sig.statement,
        isValid: sig.isValid,
      };
    });

    console.log('🔍 Final mapped signatures:', mapped);
    return mapped;
  }

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================

  /**
   * Check if user can manage pod
   * CRITICAL FIX: Now checks pod_members table (source of truth for HAT-based permissions)
   */
  static async canUserManagePod(pod: Pod, userAddress: string): Promise<boolean> {
    if (!userAddress) return false;

    const normalizedAddress = userAddress.toLowerCase();

    // Check 1: Is user the pod creator?
    if (pod.created_by_address?.toLowerCase() === normalizedAddress) {
      return true;
    }

    // Check 2: Is user in pod_leads array? (backwards compatibility)
    const isInLeadsArray = pod.pod_leads?.some(
      (lead) => lead.toLowerCase() === normalizedAddress,
    ) ?? false;

    if (isInLeadsArray) {
      return true;
    }

    // Check 3: CRITICAL FIX - Check pod_members table (HAT-based membership)
    try {
      const membership = await this.checkPodMembership(pod.id, normalizedAddress);

      if (membership.is_member && membership.membership_type === 'leader') {
        console.log(`✅ User ${normalizedAddress} is leader in pod_members table`);
        return true;
      }
    } catch (dbError) {
      console.error('❌ Error checking pod membership:', dbError);
    }

    // Check 4: Check for Executive Pod membership (full access to all pods)
    try {
      const { data: execPod } = await supabase
        .from('pods')
        .select('id')
        .eq('name', 'Executive Pod')
        .maybeSingle();

      if (execPod) {
        const execMembership = await this.checkPodMembership(execPod.id, normalizedAddress);

        if (execMembership.is_member && execMembership.membership_type === 'leader') {
          console.log(`✅ User ${normalizedAddress} is Executive Pod leader - has access to all pods`);
          return true;
        }
      }
    } catch (execError) {
      console.error('❌ Error checking executive pod membership:', execError);
    }

    return false;
  }

  /**
   * DEPRECATED: Synchronous version for backwards compatibility
   * WARNING: Only checks pod_leads array, does NOT check pod_members table
   */
  static canUserManagePodSync(pod: Pod, userAddress: string): boolean {
    if (!userAddress) return false;

    return (
      pod.created_by_address?.toLowerCase() === userAddress.toLowerCase() ||
      (pod.pod_leads?.some(
        (lead) => lead.toLowerCase() === userAddress.toLowerCase(),
      ) ?? false)
    );
  }

  /**
   * Check pod membership for user
   */
  static async checkPodMembership(
    podId: string,
    walletAddress: string,
  ): Promise<{
    is_member: boolean;
    membership_type?: 'leader' | 'member' | 'admin';
    joined_at?: string;
    hat_id?: string;
  }> {
    try {
      // Check indexed membership data
      const { data, error } = await supabase
        .from('active_pod_members')
        .select('membership_type, joined_at, hat_id')
        .eq('pod_id', podId)
        .eq('wallet', walletAddress.toLowerCase())
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        return {
          is_member: true,
          membership_type: data.membership_type,
          joined_at: data.joined_at,
          hat_id: data.hat_id,
        };
      }

      // Fallback: check pod leadership
      const pod = await this.getPodById(podId);
      if (pod?.pod_leads) {
        const isLeader = pod.pod_leads.some(
          (leader) => leader.toLowerCase() === walletAddress.toLowerCase(),
        );

        if (isLeader) {
          return {
            is_member: true,
            membership_type: 'leader',
            joined_at: pod.created_at || new Date().toISOString(),
            hat_id: pod.management_hat_id ?? undefined,
          };
        }
      }

      return { is_member: false };
    } catch (error) {
      console.error(`Failed to check pod membership:`, error);
      return { is_member: false };
    }
  }

  // ==========================================
  // PRIVATE HELPER METHODS
  // ==========================================

  /**
   * Initialize role permissions for new pod
   */
  private static async initializePodRolePermissions(
    podId: string,
    managementHatId: string,
    membershipHatId: string,
    createdBy: string,
    leaderCriteria?: EligibilityCriteria[],
    memberCriteria?: EligibilityCriteria[],
  ): Promise<void> {
    console.log(`🔐 Initializing role permissions for pod ${podId}...`);

    // Create leader role
    await PodRolePermissionsService.createRolePermission({
      pod_id: podId,
      token_address: managementHatId,
      role_name: 'Pod Leader',
      permissions: {
        chatAccess: true,
        chatModeration: true,
        forumAccess: true,
        forumModeration: false,
        governanceParticipation: true,
        eventCreation: true,
        treasuryViewing: true,
        treasuryManagement: true,
        memberManagement: true,
        subPodCreation: true,
        roleAssignment: true,
        bountyManagement: true,
        marketplaceAccess: true,
        marketplaceManage: true,
        knowledgeBaseAccess: true,
        knowledgeBaseManage: true,
      },
      eligibility_criteria: leaderCriteria || [],
      max_holders: 5,
      created_by: createdBy,
    });

    // Create member role
    await PodRolePermissionsService.createRolePermission({
      pod_id: podId,
      token_address: membershipHatId,
      role_name: 'Pod Member',
      permissions: {
        chatAccess: true,
        chatModeration: false,
        forumAccess: true,
        forumModeration: false,
        governanceParticipation: true,
        eventCreation: true,
        treasuryViewing: false,
        treasuryManagement: false,
        memberManagement: false,
        subPodCreation: false,
        roleAssignment: false,
        bountyManagement: false,
        marketplaceAccess: true,
        marketplaceManage: false,
        knowledgeBaseAccess: false,
        knowledgeBaseManage: false,
      },
      eligibility_criteria: memberCriteria || [],
      max_holders: 10000,
      created_by: createdBy,
    });

    console.log(`✅ Role permissions initialized for pod ${podId}`);
  }

  /**
   * Notify executive pod for approval
   *
   * MIGRATED: Phase 2 - Now uses unifiedNotificationService and podNotificationHelpers
   */
  private static async notifyExecutiveForApproval(
    podId: string,
    podName: string,
    creatorAddress: string,
  ): Promise<void> {
    try {
      // Check if notification already sent
      const { data: existing } = await supabase
        .from('general_notifications')
        .select('id')
        .eq('context_id', podId)
        .eq('notification_type', 'user_mentioned')
        .eq('title', 'Pod Approval Required')
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`📄 Approval notification already sent for ${podName}`);
        return;
      }

      // Get executive managers using new helper function
      const managers = await getExecutivePodManagers();
      if (!managers || managers.length === 0) {
        console.log(
          '⚠️ No Executive Pod managers found for approval notification',
        );
        return;
      }

      console.log(
        `📨 Sending approval notification for ${podName} to ${managers.length} executives`,
      );

      await Promise.all(
        managers.map((manager) =>
          unifiedNotificationService.createNotification({
            recipient_address: manager.wallet_address.toLowerCase(),
            sender_address: creatorAddress.toLowerCase(),
            notification_type: 'user_mentioned',
            title: 'Pod Approval Required',
            message: `New pod "${podName}" is ready for Executive approval.`,
            context_type: 'governance',
            context_id: podId,
            context_url: `/pods/${podId}`,
            priority: 'high',
          }),
        ),
      );

      console.log(`✅ Approval notifications sent for ${podName}`);
    } catch (error) {
      console.error(
        `Failed to send approval notifications for ${podName}:`,
        error,
      );
      throw error;
    }
  }
}

/**
 * React hook for pod core operations
 */
export function usePodCore() {
  return {
    getPodById: PodCoreService.getPodById,
    getAllPods: PodCoreService.getAllPods,
    getUserLeadershipPods: PodCoreService.getUserLeadershipPods,
    createPod: PodCoreService.createPod,
    updatePodStatus: PodCoreService.updatePodStatus,
    activatePod: PodCoreService.activatePod,
    deactivatePod: PodCoreService.deactivatePod,
    reactivatePod: PodCoreService.reactivatePod,
    canUserManagePod: PodCoreService.canUserManagePod,
  };
}

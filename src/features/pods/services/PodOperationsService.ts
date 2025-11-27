/**
 * Pod Operations Service - High-level pod operations with transaction management
 *
 * Provides user-friendly pod operations that integrate with the TransactionRunner
 * for feedback and the RPC queue for rate limiting.
 */

import {
  createTransactionRunner,
  type TransactionResult,
  type TransactionUpdateCallback,
} from '@/lib/transactions/TransactionRunner';
import { globalRpcQueue } from '@/lib/rpc/RpcQueue';
import { HatsCoreService } from '../../../services/hatsCoreService';
import { HatsModulesService } from '../../../services/hatsModulesService';
import { PodService } from './PodService';
import { MemberIndexingService } from './MemberIndexingService';
import { supabase } from '../../../utils/supabaseClient';
import type { PublicClient, WalletClient } from 'viem';

export interface CreatePodParams {
  name: string;
  description: string;
  parentPodId: string;
  podLeads: string[];
  image?: string;
  createdByAddress: string;
  eligibilityRules?: any[];
  treasuryConfig?: {
    threshold: number;
    signers: string[];
  };
}

export interface UpdateMembersParams {
  podId: string;
  addMembers?: string[];
  removeMembers?: string[];
  membershipType?: 'leader' | 'member' | 'admin';
  updatedByAddress: string;
}

export interface TreasuryTransactionParams {
  podId: string;
  to: string;
  value: string;
  data?: string;
  description: string;
  executedByAddress: string;
}

export class PodOperationsService {
  private hatsService: HatsCoreService;
  private modulesService: HatsModulesService;

  constructor(
    private publicClient: PublicClient,
    private walletClient?: WalletClient,
  ) {
    this.hatsService = new HatsCoreService(publicClient, walletClient);
    this.modulesService = new HatsModulesService(publicClient, walletClient);
  }

  /**
   * Create a new pod with full HAT integration and treasury setup
   */
  async createPod(
    params: CreatePodParams,
    onUpdate?: TransactionUpdateCallback,
  ): Promise<
    TransactionResult<{
      podId: string;
      managementHatId: string;
      membershipHatId: string;
      treasuryAddress?: string;
    }>
  > {
    const runner = createTransactionRunner('CREATE_POD', onUpdate);

    return runner.execute([
      // Step 1: Validate pod configuration
      async (onProgress) => {
        onProgress?.({ status: 'running' });

        // Validate pod name uniqueness
        const existingPods = await PodService.searchPods(params.name, 1);
        if (existingPods.length > 0) {
          throw new Error(`Pod with name "${params.name}" already exists`);
        }

        // Validate parent pod exists
        const parentPod = await PodService.getPodById(params.parentPodId);
        if (!parentPod) {
          throw new Error(`Parent pod ${params.parentPodId} not found`);
        }

        // Validate pod leads are valid addresses
        for (const leader of params.podLeads) {
          if (!/^0x[a-fA-F0-9]{40}$/.test(leader)) {
            throw new Error(`Invalid address format: ${leader}`);
          }
        }

        return { validated: true };
      },

      // Step 2: Create HATs (management and membership)
      async (onProgress) => {
        onProgress?.({ status: 'running' });

        await this.hatsService.initialize();

        // Create management HAT (for pod leaders)
        const managementHat = await this.hatsService.createHat({
          name: `${params.name} - Management`,
          description: `Management HAT for ${params.name} pod`,
          parentHatId: params.parentPodId, // Parent pod's management HAT
          maxSupply: params.podLeads.length.toString(),
          details: JSON.stringify({
            type: 'pod_management',
            podName: params.name,
          }),
          imageUri: params.image || '',
        });

        // Create membership HAT (for pod members)
        const membershipHat = await this.hatsService.createHat({
          name: `${params.name} - Membership`,
          description: `Membership HAT for ${params.name} pod`,
          parentHatId: managementHat.hatId, // Child of management HAT
          maxSupply: '1000', // Allow many members
          details: JSON.stringify({
            type: 'pod_membership',
            podName: params.name,
          }),
          imageUri: params.image || '',
        });

        // Mint management HATs to pod leaders
        for (const leader of params.podLeads) {
          await this.hatsService.mintHat({
            hatId: managementHat.hatId,
            wearer: leader,
          });
        }

        return {
          managementHatId: managementHat.hatId,
          membershipHatId: membershipHat.hatId,
        };
      },

      // Step 3: Deploy treasury contract (if configured)
      async (onProgress) => {
        onProgress?.({ status: 'running' });

        let treasuryAddress: string | undefined;

        if (params.treasuryConfig) {
          // Deploy pod treasury using modules service
          const treasury = await this.modulesService.deployPodTreasury({
            podName: params.name,
            managementHatId: '', // Will be set from previous step
            threshold: params.treasuryConfig.threshold,
            signers: params.treasuryConfig.signers,
          });

          treasuryAddress = treasury.treasuryAddress;
        }

        return { treasuryAddress };
      },

      // Step 4: Save pod to database
      async (onProgress) => {
        onProgress?.({ status: 'running' });

        // Get results from previous steps
        const managementHatId = arguments[1]?.managementHatId;
        const membershipHatId = arguments[1]?.membershipHatId;
        const treasuryAddress = arguments[2]?.treasuryAddress;

        const result = await PodService.createPod({
          ...params,
          // Add HAT and treasury data
          managementHatId,
          membershipHatId,
          treasuryAddress,
        });

        // Trigger initial member indexing
        await MemberIndexingService.indexPodMembership(
          {
            id: result.podId,
            management_hat_id: managementHatId,
            membership_hat_id: membershipHatId,
          },
          {
            pods_processed: 0,
            members_added: 0,
            members_removed: 0,
            members_updated: 0,
            errors: [],
          },
        );

        return {
          podId: result.podId,
          managementHatId,
          membershipHatId,
          treasuryAddress,
        };
      },
    ]);
  }

  /**
   * Update pod members (add/remove with HAT management)
   */
  async updateMembers(
    params: UpdateMembersParams,
    onUpdate?: TransactionUpdateCallback,
  ): Promise<
    TransactionResult<{ membersAdded: number; membersRemoved: number }>
  > {
    const runner = createTransactionRunner('UPDATE_MEMBERS', onUpdate);

    return runner.execute([
      // Step 1: Validate member changes
      async (onProgress) => {
        onProgress?.({ status: 'running' });

        const pod = await PodService.getPodById(params.podId);
        if (!pod) {
          throw new Error(`Pod ${params.podId} not found`);
        }

        // Validate addresses
        const allAddresses = [
          ...(params.addMembers || []),
          ...(params.removeMembers || []),
        ];
        for (const address of allAddresses) {
          if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            throw new Error(`Invalid address format: ${address}`);
          }
        }

        return { pod };
      },

      // Step 2: Update HAT assignments
      async (onProgress) => {
        onProgress?.({ status: 'running' });

        const { pod } = arguments[0];
        await this.hatsService.initialize();

        let membersAdded = 0;
        let membersRemoved = 0;

        const targetHatId =
          params.membershipType === 'leader'
            ? pod.management_hat_id
            : pod.membership_hat_id;

        if (!targetHatId) {
          throw new Error(`No ${params.membershipType} HAT configured for pod`);
        }

        // Add new members
        if (params.addMembers?.length) {
          for (const address of params.addMembers) {
            try {
              await this.hatsService.mintHat({
                hatId: targetHatId,
                wearer: address,
              });
              membersAdded++;
            } catch (error) {
              console.error(
                `Failed to mint HAT ${targetHatId} to ${address}:`,
                error,
              );
              throw error;
            }
          }
        }

        // Remove members
        if (params.removeMembers?.length) {
          for (const address of params.removeMembers) {
            try {
              await this.hatsService.revokeHat({
                hatId: targetHatId,
                wearer: address,
              });
              membersRemoved++;
            } catch (error) {
              console.error(
                `Failed to revoke HAT ${targetHatId} from ${address}:`,
                error,
              );
              throw error;
            }
          }
        }

        return { membersAdded, membersRemoved };
      },

      // Step 3: Sync database with blockchain state
      async (onProgress) => {
        onProgress?.({ status: 'running' });

        // Trigger member indexing to sync database
        const { pod } = arguments[0];
        await MemberIndexingService.indexPodMembership(pod, {
          pods_processed: 0,
          members_added: 0,
          members_removed: 0,
          members_updated: 0,
          errors: [],
        });

        const { membersAdded, membersRemoved } = arguments[1];
        return { membersAdded, membersRemoved };
      },
    ]);
  }

  /**
   * Execute treasury transaction
   */
  async executeTreasuryTransaction(
    params: TreasuryTransactionParams,
    onUpdate?: TransactionUpdateCallback,
  ): Promise<TransactionResult<{ txHash: string; safe: string }>> {
    const runner = createTransactionRunner('TREASURY_TRANSACTION', onUpdate);

    return runner.execute([
      // Step 1: Prepare transaction
      async (onProgress) => {
        onProgress?.({ status: 'running' });

        const pod = await PodService.getPodById(params.podId);
        if (!pod) {
          throw new Error(`Pod ${params.podId} not found`);
        }

        if (!pod.treasury_contract_address) {
          throw new Error('Pod does not have a treasury configured');
        }

        // Validate executor has management access
        const membership = await PodService.checkPodMembership(
          params.podId,
          params.executedByAddress,
        );
        if (!membership.is_member || membership.membership_type !== 'leader') {
          throw new Error('Only pod leaders can execute treasury transactions');
        }

        return {
          pod,
          treasuryAddress: pod.treasury_contract_address,
        };
      },

      // Step 2: Execute transaction
      async (onProgress) => {
        onProgress?.({ status: 'running' });

        const { treasuryAddress } = arguments[0];

        // Use treasury service to execute transaction
        // This would integrate with Safe or custom treasury contract
        const result = await globalRpcQueue.enqueueHighPriority(async () => {
          // TODO: Implement actual treasury transaction execution
          // This would depend on the treasury implementation (Safe, custom contract, etc.)
          throw new Error('Treasury transaction execution not yet implemented');
        });

        return result;
      },

      // Step 3: Confirm transaction
      async (onProgress) => {
        onProgress?.({ status: 'running' });

        const txResult = arguments[1];

        // Wait for transaction confirmation
        const receipt = await this.publicClient.waitForTransactionReceipt({
          hash: txResult.txHash as `0x${string}`,
        });

        // Log transaction in database
        await supabase.from('pod_treasury_transactions').insert({
          pod_id: params.podId,
          tx_hash: txResult.txHash,
          to_address: params.to,
          value: params.value,
          data: params.data,
          description: params.description,
          executed_by: params.executedByAddress,
          block_number: receipt.blockNumber.toString(),
          status: 'confirmed',
        });

        return {
          txHash: txResult.txHash,
          safe: arguments[0].treasuryAddress,
        };
      },
    ]);
  }

  /**
   * Get pod operation status and capabilities
   */
  async getPodCapabilities(
    podId: string,
    userAddress: string,
  ): Promise<{
    canManageMembers: boolean;
    canExecuteTreasuryTx: boolean;
    canEditPodSettings: boolean;
    hasTreasury: boolean;
    memberCount: number;
    lastIndexedAt: string | null;
  }> {
    const [pod, membership, stats] = await Promise.all([
      PodService.getPodById(podId),
      PodService.checkPodMembership(podId, userAddress),
      PodService.getPodMemberStats(podId),
    ]);

    if (!pod) {
      throw new Error(`Pod ${podId} not found`);
    }

    const isLeader =
      membership.is_member && membership.membership_type === 'leader';

    return {
      canManageMembers: isLeader,
      canExecuteTreasuryTx: isLeader && !!pod.treasury_contract_address,
      canEditPodSettings: isLeader,
      hasTreasury: !!pod.treasury_contract_address,
      memberCount: stats.total_members,
      lastIndexedAt: stats.last_indexed_at,
    };
  }

  /**
   * Trigger manual member indexing for a pod
   */
  async triggerMemberIndexing(podId: string): Promise<{
    membersAdded: number;
    membersRemoved: number;
    errors: string[];
  }> {
    const pod = await PodService.getPodById(podId);
    if (!pod) {
      throw new Error(`Pod ${podId} not found`);
    }

    const stats = {
      pods_processed: 0,
      members_added: 0,
      members_removed: 0,
      members_updated: 0,
      errors: [],
    };

    await MemberIndexingService.indexPodMembership(pod, stats);

    return {
      membersAdded: stats.members_added,
      membersRemoved: stats.members_removed,
      errors: stats.errors,
    };
  }

  /**
   * Invite a user to become a pod leader
   * Sends notification and user can accept via pod management page
   */
  async inviteLeader(
    podId: string,
    inviteeAddress: string,
    inviterAddress: string,
    podName: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate addresses
      if (!/^0x[a-fA-F0-9]{40}$/.test(inviteeAddress)) {
        throw new Error(`Invalid invitee address format: ${inviteeAddress}`);
      }

      // Validate pod exists
      const pod = await PodService.getPodById(podId);
      if (!pod) {
        throw new Error(`Pod ${podId} not found`);
      }

      // Import notification service dynamically to avoid circular dependency
      const { unifiedNotificationService } = await import(
        '@/services/unifiedNotificationService'
      );

      // Send invitation notification
      await unifiedNotificationService.createNotification({
        recipient_address: inviteeAddress.toLowerCase(),
        sender_address: inviterAddress.toLowerCase(),
        notification_type: 'pod_leadership_invitation' as any,
        title: 'Pod Leadership Invitation',
        message: `You've been invited to become a leader of "${podName}". Visit the pod page to accept or decline.`,
        context_type: 'governance',
        context_id: podId,
        context_url: `/pods/${podId}`,
        priority: 'high',
        metadata: {
          pod_id: podId,
          pod_name: podName,
          inviter_address: inviterAddress,
          invitation_type: 'leader',
        },
      });

      console.log(
        `✅ Leadership invitation sent to ${inviteeAddress} for pod ${podId}`,
      );

      return { success: true };
    } catch (error) {
      console.error('Error sending leadership invitation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

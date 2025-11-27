import { supabase } from '@/utils/supabaseClient';
import { PodService } from './PodService';
import { HatDeactivationService } from './hatDeactivationService';
import { PodProxyDeletionService } from './PodProxyDeletionService';
import { publicClient } from '@/config/wagmi.client';
import type { WalletClient, PublicClient } from 'viem';

/**
 * PodDeletionService - Handles complete pod deletion with Hats Protocol integration
 *
 * This service ensures proper cleanup of:
 * - Hat tokens (deactivation/burning)
 * - Treasury contracts
 * - Database records
 * - Member access revocation
 */
const HATS_CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;

const HATS_ABI = [
  {
    name: 'setHatStatus',
    type: 'function',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_newStatus', type: 'bool' },
    ],
    outputs: [{ name: 'toggled', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

export class PodDeletionService {
  /**
   * Prepare Hat deactivation transactions for OnchainKit
   * NOTE: This method is now deprecated in favor of the direct HatDeactivationService approach
   * which requires two separate transactions per hat (toggle module + core contract)
   */
  static async prepareHatDeactivationTransactions(
    pod: any,
    userAddress: string,
    publicClient: PublicClient,
  ): Promise<{ calls: any[] } | null> {
    try {
      console.log(
        '⚠️ WARNING: prepareHatDeactivationTransactions is deprecated.',
      );
      console.log(
        '   Use HatDeactivationService.deactivateHat() instead for proper two-step deactivation.',
      );
      console.log('🔍 Preparing legacy Hat deactivation transactions:', {
        pod_name: pod.name,
        pod_id: pod.id,
        management_hat_id: pod.management_hat_id,
        membership_hat_id: pod.membership_hat_id,
        user_address: userAddress,
      });

      const calls = [];

      // Check Management Hat
      if (
        pod.management_hat_id &&
        HatDeactivationService.isValidHatId(pod.management_hat_id)
      ) {
        console.log(`📋 Checking Management Hat: ${pod.management_hat_id}`);

        const status = await HatDeactivationService.getHatStatus(
          publicClient,
          pod.management_hat_id,
        );
        if (status?.isActive) {
          // Check if toggle module is a special Hats Protocol address
          const isNullToggleModule =
            status.toggle.toLowerCase() ===
            '0x0000000000000000000000000000000000004a75';
          const isPassthroughModule =
            status.toggle.toLowerCase() === HATS_CONTRACT_ADDRESS.toLowerCase();

          if (isNullToggleModule || isPassthroughModule) {
            // For null/passthrough toggle modules, call setHatStatus directly on Hats contract
            calls.push({
              address: HATS_CONTRACT_ADDRESS,
              abi: HATS_ABI,
              functionName: 'setHatStatus',
              args: [BigInt(pod.management_hat_id), false],
            });
          } else {
            // CRITICAL FIX: Check if toggle module is user's wallet (humanistic toggle)
            const isUserWallet =
              status.toggle.toLowerCase() === userAddress.toLowerCase();
            // CRITICAL FIX: Check if toggle is PodAuthProxy (doesn't implement setHatStatus)
            const isPodAuthProxy =
              pod.proxy_contract_address &&
              status.toggle.toLowerCase() ===
                pod.proxy_contract_address.toLowerCase();

            if (isUserWallet) {
              console.log(
                '🎯 HUMANISTIC TOGGLE DETECTED: User wallet as toggle, using direct Hats contract',
              );
              // For user wallet toggles, call setHatStatus directly on Hats contract
              calls.push({
                address: HATS_CONTRACT_ADDRESS,
                abi: HATS_ABI,
                functionName: 'setHatStatus',
                args: [BigInt(pod.management_hat_id), false],
              });
            } else if (isPodAuthProxy) {
              // ✅ CRITICAL FIX: Proxy doesn't have admin permissions on Management HAT
              // Management HAT admin = Community Pod HAT (parent), NOT Proxy Admin HAT
              // Solution: Use direct Hats contract calls with user's Community Pod admin permissions
              // User must wear Community Pod HAT to execute these calls
              console.log(
                '🎯 PODAUTHPROXY TOGGLE DETECTED: Using direct Hats contract (requires Community Pod admin)',
              );
              console.log(
                "   This approach works for BOTH old and new pods with Spencer's solution",
              );

              // Step 1: Transfer toggle from proxy → user (via HATS contract changeHatToggle)
              // Requires: User must wear Management HAT's admin (Community Pod HAT)
              calls.push({
                address: HATS_CONTRACT_ADDRESS,
                abi: [
                  {
                    name: 'changeHatToggle',
                    type: 'function',
                    inputs: [
                      { name: '_hatId', type: 'uint256' },
                      { name: '_newToggle', type: 'address' },
                    ],
                    outputs: [],
                    stateMutability: 'nonpayable',
                  },
                ],
                functionName: 'changeHatToggle',
                args: [
                  BigInt(pod.management_hat_id),
                  userAddress as `0x${string}`,
                ],
              });

              // Step 2: Deactivate HAT as new toggle (user)
              calls.push({
                address: HATS_CONTRACT_ADDRESS,
                abi: HATS_ABI,
                functionName: 'setHatStatus',
                args: [BigInt(pod.management_hat_id), false],
              });
            } else {
              console.log(
                '🎯 EXTERNAL TOGGLE DETECTED: Using universal two-step approach (transfer toggle → deactivate)',
              );
              // For ANY external contract toggle (unknown type), use safe universal approach:
              // Step 1: Transfer toggle to user via HATS contract changeHatToggle
              calls.push({
                address: HATS_CONTRACT_ADDRESS,
                abi: [
                  {
                    name: 'changeHatToggle',
                    type: 'function',
                    inputs: [
                      { name: '_hatId', type: 'uint256' },
                      { name: '_newToggle', type: 'address' },
                    ],
                    outputs: [],
                    stateMutability: 'nonpayable',
                  },
                ],
                functionName: 'changeHatToggle',
                args: [
                  BigInt(pod.management_hat_id),
                  userAddress as `0x${string}`,
                ],
              });
              // Step 2: Deactivate HAT as new toggle (user)
              calls.push({
                address: HATS_CONTRACT_ADDRESS,
                abi: HATS_ABI,
                functionName: 'setHatStatus',
                args: [BigInt(pod.management_hat_id), false],
              });
            }
          }
        }
      }

      // Check Membership Hat
      if (
        pod.membership_hat_id &&
        HatDeactivationService.isValidHatId(pod.membership_hat_id)
      ) {
        console.log(`📋 Checking Membership Hat: ${pod.membership_hat_id}`);

        const status = await HatDeactivationService.getHatStatus(
          publicClient,
          pod.membership_hat_id,
        );
        if (status?.isActive) {
          // Check if toggle module is a special Hats Protocol address
          const isNullToggleModule =
            status.toggle.toLowerCase() ===
            '0x0000000000000000000000000000000000004a75';
          const isPassthroughModule =
            status.toggle.toLowerCase() === HATS_CONTRACT_ADDRESS.toLowerCase();

          if (isNullToggleModule || isPassthroughModule) {
            // For null/passthrough toggle modules, call setHatStatus directly on Hats contract
            calls.push({
              address: HATS_CONTRACT_ADDRESS,
              abi: HATS_ABI,
              functionName: 'setHatStatus',
              args: [BigInt(pod.membership_hat_id), false],
            });
          } else {
            // CRITICAL FIX: Check if toggle module is user's wallet (humanistic toggle)
            const isUserWallet =
              status.toggle.toLowerCase() === userAddress.toLowerCase();
            // CRITICAL FIX: Check if toggle is PodAuthProxy (doesn't implement setHatStatus)
            const isPodAuthProxy =
              pod.proxy_contract_address &&
              status.toggle.toLowerCase() ===
                pod.proxy_contract_address.toLowerCase();

            if (isUserWallet) {
              console.log(
                '🎯 HUMANISTIC TOGGLE DETECTED: User wallet as toggle, using direct Hats contract',
              );
              // For user wallet toggles, call setHatStatus directly on Hats contract
              calls.push({
                address: HATS_CONTRACT_ADDRESS,
                abi: HATS_ABI,
                functionName: 'setHatStatus',
                args: [BigInt(pod.membership_hat_id), false],
              });
            } else if (isPodAuthProxy) {
              // ✅ CRITICAL FIX: Proxy doesn't have admin permissions on Membership HAT
              // Solution: Use direct Hats contract calls with user's Community Pod admin permissions
              console.log(
                '🎯 PODAUTHPROXY TOGGLE DETECTED (Membership HAT): Using direct Hats contract (requires Community Pod admin)',
              );

              // Step 1: Transfer toggle from proxy → user (via HATS contract changeHatToggle)
              calls.push({
                address: HATS_CONTRACT_ADDRESS,
                abi: [
                  {
                    name: 'changeHatToggle',
                    type: 'function',
                    inputs: [
                      { name: '_hatId', type: 'uint256' },
                      { name: '_newToggle', type: 'address' },
                    ],
                    outputs: [],
                    stateMutability: 'nonpayable',
                  },
                ],
                functionName: 'changeHatToggle',
                args: [
                  BigInt(pod.membership_hat_id),
                  userAddress as `0x${string}`,
                ],
              });

              // Step 2: Deactivate HAT as new toggle (user)
              calls.push({
                address: HATS_CONTRACT_ADDRESS,
                abi: HATS_ABI,
                functionName: 'setHatStatus',
                args: [BigInt(pod.membership_hat_id), false],
              });
            } else {
              console.log(
                '🎯 EXTERNAL TOGGLE DETECTED: Using universal two-step approach (transfer toggle → deactivate)',
              );
              // For ANY external contract toggle (unknown type), use safe universal approach:
              // Step 1: Transfer toggle to user via HATS contract changeHatToggle
              calls.push({
                address: HATS_CONTRACT_ADDRESS,
                abi: [
                  {
                    name: 'changeHatToggle',
                    type: 'function',
                    inputs: [
                      { name: '_hatId', type: 'uint256' },
                      { name: '_newToggle', type: 'address' },
                    ],
                    outputs: [],
                    stateMutability: 'nonpayable',
                  },
                ],
                functionName: 'changeHatToggle',
                args: [
                  BigInt(pod.membership_hat_id),
                  userAddress as `0x${string}`,
                ],
              });
              // Step 2: Deactivate HAT as new toggle (user)
              calls.push({
                address: HATS_CONTRACT_ADDRESS,
                abi: HATS_ABI,
                functionName: 'setHatStatus',
                args: [BigInt(pod.membership_hat_id), false],
              });
            }
          }
        }
      }

      if (calls.length === 0) {
        console.log('📋 No active hats to deactivate');
        return null;
      }

      console.log(
        `✅ Prepared ${calls.length} hat deactivation transaction(s) using corrected approach:`,
        {
          calls: calls.map((call) => ({
            address: call.address,
            functionName: call.functionName,
            args: call.args.map((arg) =>
              typeof arg === 'bigint' ? arg.toString() : arg,
            ),
          })),
        },
      );
      return { calls };
    } catch (error) {
      console.error('Failed to prepare hat deactivation transactions:', error);
      return null;
    }
  }

  /**
   * Delete pod from database only (after successful hat deactivation)
   */
  static async deletePodDatabase(
    podId: string,
    userAddress: string,
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Verify deletion permissions
      const canDeleteResult = await this.canDeletePod(podId, userAddress);
      if (!canDeleteResult.canDelete) {
        return {
          success: false,
          error: canDeleteResult.reason || 'Cannot delete pod',
        };
      }

      const pod = await PodService.getPodById(podId);
      if (!pod) {
        return { success: false, error: 'Pod not found' };
      }

      console.log(`🗑️ Starting database deletion for: ${pod.name} (${podId})`);

      // Clean up treasury if exists
      if (pod.treasury_contract_address) {
        console.log(
          `💰 Treasury cleanup for: ${pod.treasury_contract_address}`,
        );
        // TODO: Implement treasury cleanup/transfer logic
      }

      // Remove all member records
      console.log('👥 Removing member records...');
      const { error: memberError } = await supabase
        .from('pod_members')
        .delete()
        .eq('pod_id', podId);

      if (
        memberError &&
        !(memberError.message && memberError.message.includes('not found'))
      ) {
        console.error('Failed to remove member records:', memberError);
      }

      // Remove role permissions
      console.log('🔐 Removing role permissions...');
      const { error: roleError } = await supabase
        .from('pod_role_permissions')
        .delete()
        .eq('pod_id', podId);

      if (
        roleError &&
        !(roleError.message && roleError.message.includes('not found'))
      ) {
        console.error('Failed to remove role permissions:', roleError);
      }

      // Delete the pod from database
      console.log('📝 Deleting pod from database...');
      const { error: deleteError } = await supabase
        .from('pods')
        .delete()
        .eq('id', podId);

      if (deleteError) {
        throw deleteError;
      }

      console.log(
        `✅ Pod successfully deleted from database: ${pod.name} (${podId})`,
      );

      // Log deletion event for audit trail
      await this.logDeletionEvent(podId, pod.name, userAddress);

      return { success: true };
    } catch (error) {
      console.error('Pod database deletion failed:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete pod from database',
      };
    }
  }

  /**
   * Check if a pod can be deleted based on leadership requirements
   */
  static async canDeletePod(
    podId: string,
    userAddress: string,
  ): Promise<{
    canDelete: boolean;
    reason?: string;
    leaderCount?: number;
    requiredLeaders?: number;
  }> {
    try {
      const pod = await PodService.getPodById(podId);
      if (!pod) {
        return { canDelete: false, reason: 'Pod not found' };
      }

      // Check if user is a pod leader
      const isLeader =
        pod.pod_leads?.some(
          (lead) => lead.toLowerCase() === userAddress.toLowerCase(),
        ) || false;

      if (!isLeader) {
        return { canDelete: false, reason: 'Only pod leaders can delete pods' };
      }

      // Count current leaders
      const leaderCount = pod.pod_leads?.length || 0;

      // For production, require minimum 3 leaders
      // For testing, allow 1 leader (configurable via environment)
      const requiredLeaders = process.env.NEXT_PUBLIC_MIN_POD_LEADERS
        ? Number.parseInt(process.env.NEXT_PUBLIC_MIN_POD_LEADERS)
        : 3;

      if (leaderCount < requiredLeaders) {
        return {
          canDelete: false,
          reason: `Pod must have at least ${requiredLeaders} leaders to enable deletion`,
          leaderCount,
          requiredLeaders,
        };
      }

      // Check if pod has active sub-pods
      const { data: subPods } = await supabase
        .from('pods')
        .select('id')
        .eq('parent_pod_id', podId)
        .eq('status', 'active');

      if (subPods && subPods.length > 0) {
        return {
          canDelete: false,
          reason:
            'Cannot delete pod with active sub-pods. Deactivate sub-pods first.',
          leaderCount,
          requiredLeaders,
        };
      }

      return {
        canDelete: true,
        leaderCount,
        requiredLeaders,
      };
    } catch (error) {
      console.error('Error checking pod deletion eligibility:', error);
      return {
        canDelete: false,
        reason: 'Failed to verify deletion permissions',
      };
    }
  }

  /**
   * Delete a pod with full Hats Protocol cleanup
   */
  static async deletePod(
    podId: string,
    userAddress: string,
    walletClient?: WalletClient | null,
  ): Promise<{
    success: boolean;
    error?: string;
    hatDeactivationResults?: {
      managementHat?: {
        success: boolean;
        transactionHash?: string;
        error?: string;
      };
      membershipHat?: {
        success: boolean;
        transactionHash?: string;
        error?: string;
      };
    };
  }> {
    try {
      // Verify deletion permissions
      const canDeleteResult = await this.canDeletePod(podId, userAddress);
      if (!canDeleteResult.canDelete) {
        return {
          success: false,
          error: canDeleteResult.reason || 'Cannot delete pod',
        };
      }

      const pod = await PodService.getPodById(podId);
      if (!pod) {
        return { success: false, error: 'Pod not found' };
      }

      console.log(
        `🗑️ Starting pod deletion process for: ${pod.name} (${podId})`,
      );

      const hatDeactivationResults: {
        managementHat?: {
          success: boolean;
          transactionHash?: string;
          error?: string;
        };
        membershipHat?: {
          success: boolean;
          transactionHash?: string;
          error?: string;
        };
      } = {};

      // Step 1: Handle Hat tokens with actual on-chain deactivation
      // CRITICAL: All blockchain operations must succeed before database deletions
      // NEW: Use PodProxyDeletionService for v2.0 pods with proxy contracts
      if (pod.management_hat_id || pod.membership_hat_id) {
        console.log('🎩 Processing Hat tokens for deactivation...');

        if (!walletClient) {
          console.error(
            `❌ CRITICAL: No wallet client provided for Hat deactivation`,
          );
          return {
            success: false,
            error:
              'Wallet client required for Hat deactivation. Pod data preserved.',
            hatDeactivationResults,
          };
        }

        // PROXY-AWARE DEACTIVATION (v2.0 architecture)
        // This method automatically detects if pod uses proxy pattern and routes accordingly
        const deactivationResult =
          await PodProxyDeletionService.deactivateAllPodHats(
            publicClient,
            walletClient,
            pod,
            userAddress,
          );

        // Map results to expected format
        if (deactivationResult.managementHat) {
          hatDeactivationResults.managementHat = {
            success: deactivationResult.managementHat.success,
            transactionHash: deactivationResult.managementHat.transactionHash,
            error: deactivationResult.managementHat.error,
          };
        }

        if (deactivationResult.membershipHat) {
          hatDeactivationResults.membershipHat = {
            success: deactivationResult.membershipHat.success,
            transactionHash: deactivationResult.membershipHat.transactionHash,
            error: deactivationResult.membershipHat.error,
          };
        }

        // Check if deactivation succeeded
        if (!deactivationResult.success) {
          console.error(
            `❌ CRITICAL: Hat deactivation failed: ${deactivationResult.error}`,
          );
          return {
            success: false,
            error: `Failed to deactivate hats: ${deactivationResult.error}. Pod data preserved.`,
            hatDeactivationResults,
          };
        }

        console.log(
          '✅ All required Hat deactivations completed successfully. Proceeding with database cleanup...',
        );
      }

      // Step 2: Clean up treasury if exists
      if (pod.treasury_contract_address) {
        console.log(
          `💰 Treasury cleanup for: ${pod.treasury_contract_address}`,
        );
        // TODO: Implement treasury cleanup/transfer logic
        // This would involve transferring remaining funds to a designated address
      }

      // Step 3: Remove all member records
      console.log('👥 Removing member records...');
      const { error: memberError } = await supabase
        .from('pod_members')
        .delete()
        .eq('pod_id', podId);

      if (
        memberError &&
        !(memberError.message && memberError.message.includes('not found'))
      ) {
        console.error('Failed to remove member records:', memberError);
      } else if (
        memberError?.message &&
        memberError.message.includes('not found')
      ) {
        console.log('📋 pod_members table not found - skipping member cleanup');
      }

      // Step 4: Remove role permissions
      console.log('🔐 Removing role permissions...');
      const { error: roleError } = await supabase
        .from('pod_role_permissions')
        .delete()
        .eq('pod_id', podId);

      if (
        roleError &&
        !(roleError.message && roleError.message.includes('not found'))
      ) {
        console.error('Failed to remove role permissions:', roleError);
      } else if (
        roleError?.message &&
        roleError.message.includes('not found')
      ) {
        console.log(
          '📋 pod_role_permissions table not found - skipping role cleanup',
        );
      }

      // Step 5: Delete the pod from database
      console.log('📝 Deleting pod from database...');
      const { error: deleteError } = await supabase
        .from('pods')
        .delete()
        .eq('id', podId);

      if (deleteError) {
        throw deleteError;
      }

      console.log(`✅ Pod successfully deleted: ${pod.name} (${podId})`);

      // Step 6: Log deletion event for audit trail
      await this.logDeletionEvent(podId, pod.name, userAddress);

      return {
        success: true,
        hatDeactivationResults,
      };
    } catch (error) {
      console.error('Pod deletion failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete pod',
      };
    }
  }

  /**
   * Log pod deletion event for audit trail
   */
  private static async logDeletionEvent(
    podId: string,
    podName: string,
    deletedBy: string,
  ): Promise<void> {
    try {
      const { error } = await supabase.from('pod_audit_log').insert({
        pod_id: podId,
        action: 'pod_deleted',
        performed_by: deletedBy,
        details: {
          pod_name: podName,
          deleted_at: new Date().toISOString(),
        },
      });

      if (error) {
        // If audit table doesn't exist, just log to console
        if (
          error.code === 'PGRST116' ||
          (error.message && error.message.includes('not found'))
        ) {
          console.log(
            `📋 Audit log (table not found): Pod "${podName}" deleted by ${deletedBy}`,
          );
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Failed to log deletion event (non-critical):', error);
      // Non-critical, don't throw - just log to console as fallback
      console.log(
        `📋 Audit log (fallback): Pod "${podName}" (${podId}) deleted by ${deletedBy} at ${new Date().toISOString()}`,
      );
    }
  }

  /**
   * Request pod deletion with multi-signature approval
   * For production use when multiple leaders need to approve
   */
  static async requestPodDeletion(
    podId: string,
    requestedBy: string,
  ): Promise<{
    success: boolean;
    proposalId?: string;
    error?: string;
  }> {
    try {
      const pod = await PodService.getPodById(podId);
      if (!pod) {
        return { success: false, error: 'Pod not found' };
      }

      // Create a deletion proposal that requires approval from other leaders
      const { data, error } = await supabase
        .from('pod_deletion_proposals')
        .insert({
          pod_id: podId,
          pod_name: pod.name,
          proposed_by: requestedBy,
          required_approvals: Math.ceil((pod.pod_leads?.length || 0) * 0.66), // 2/3 majority
          current_approvals: [requestedBy],
          status: 'pending',
          expires_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(), // 7 days
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`📋 Deletion proposal created for pod ${podId}: ${data.id}`);

      return {
        success: true,
        proposalId: data.id,
      };
    } catch (error) {
      console.error('Failed to create deletion proposal:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create deletion proposal',
      };
    }
  }

  /**
   * Approve a pod deletion proposal
   */
  static async approveDeletionProposal(
    proposalId: string,
    approvedBy: string,
    walletClient?: WalletClient | null,
  ): Promise<{
    success: boolean;
    deleted?: boolean;
    error?: string;
    hatDeactivationResults?: {
      managementHat?: {
        success: boolean;
        transactionHash?: string;
        error?: string;
      };
      membershipHat?: {
        success: boolean;
        transactionHash?: string;
        error?: string;
      };
    };
  }> {
    try {
      // Get the proposal
      const { data: proposal, error: fetchError } = await supabase
        .from('pod_deletion_proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (fetchError || !proposal) {
        return { success: false, error: 'Proposal not found' };
      }

      // Check if user is a pod leader
      const pod = await PodService.getPodById(proposal.pod_id);
      if (!pod?.pod_leads?.includes(approvedBy)) {
        return {
          success: false,
          error: 'Only pod leaders can approve deletion',
        };
      }

      // Add approval if not already approved
      const currentApprovals = proposal.current_approvals || [];
      if (!currentApprovals.includes(approvedBy)) {
        currentApprovals.push(approvedBy);

        // Update proposal
        const { error: updateError } = await supabase
          .from('pod_deletion_proposals')
          .update({
            current_approvals: currentApprovals,
            updated_at: new Date().toISOString(),
          })
          .eq('id', proposalId);

        if (updateError) throw updateError;
      }

      // Check if we have enough approvals
      if (currentApprovals.length >= proposal.required_approvals) {
        // Execute deletion with wallet client for hat deactivation
        const deleteResult = await this.deletePod(
          proposal.pod_id,
          approvedBy,
          walletClient,
        );

        // Update proposal status
        await supabase
          .from('pod_deletion_proposals')
          .update({
            status: deleteResult.success ? 'completed' : 'failed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', proposalId);

        return {
          success: true,
          deleted: deleteResult.success,
          hatDeactivationResults: deleteResult.hatDeactivationResults,
        };
      }

      return { success: true, deleted: false };
    } catch (error) {
      console.error('Failed to approve deletion proposal:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to approve deletion',
      };
    }
  }
}

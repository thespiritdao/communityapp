import { PodRolePermissionsService } from './PodRolePermissionsService';
import { PodService } from './PodService';
import { EligibilityService } from './EligibilityService';
import type { HatPermissions } from '@/services/hatPermissionsService';
import { supabase } from '@/utils/supabaseClient';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { HATS_PROTOCOL_ADDRESS } from '@/constants/hatsProtocol';
import HatsProtocolABI from '@/abis/HatsProtocol.json';

/**
 * PodAccessControlService - Real-time access control using role permissions
 *
 * Integrates with existing pod management infrastructure to provide
 * HAT-based permission checking for all pod operations.
 */
export class PodAccessControlService {
  /**
   * Check if user has access to manage a specific pod
   * ⚠️ SECURITY: This checks BOTH permissions AND eligibility criteria
   *
   * 🆕 PURE ENFORCEMENT: Everyone (including creators) must meet eligibility criteria
   * No special bypasses - criteria are enforced at HAT mint time via pre-mint check
   */
  static async canManagePod(
    userWallet: string,
    podId: string,
  ): Promise<boolean> {
    try {
      console.log(
        `🔐 Checking management access for ${userWallet} in pod ${podId}`,
      );

      // Step 1: Get user's pod membership
      const userMembership = await PodService.checkPodMembership(
        podId,
        userWallet,
      );

      if (!userMembership.is_member) {
        console.log('❌ User is not a pod member');
        return false;
      }

      // Step 2: Get the user's role permissions
      const { data: userRole, error } = await supabase
        .from('pod_role_permissions')
        .select('*')
        .eq('pod_id', podId)
        .eq('token_address', userMembership.hat_id)
        .eq('is_active', true)
        .single();

      if (error || !userRole) {
        console.log('❌ Could not find user role permissions');
        return false;
      }

      // Step 3: Check if role has management permission
      if (!userRole.permissions?.memberManagement) {
        console.log('❌ Role does not have memberManagement permission');
        return false;
      }

      // Step 4: ⚠️ CRITICAL - Check eligibility criteria (agreements, token requirements, etc.)
      if (
        userRole.eligibility_criteria &&
        userRole.eligibility_criteria.length > 0
      ) {
        console.log(
          `🔍 Checking eligibility criteria for role ${userRole.role_name}`,
        );

        const eligibilityCheck =
          await EligibilityService.checkEligibilityHybrid(
            userWallet,
            podId,
            userRole.id,
            'database', // Use database check for speed (can upgrade to 'both' for onchain verification)
          );

        if (!eligibilityCheck.eligible) {
          console.log(
            '❌ User does not meet eligibility criteria:',
            eligibilityCheck,
          );
          return false;
        }

        console.log('✅ User meets all eligibility criteria');
      }

      // Step 5: 🔐 HYBRID SECURITY - Verify on-chain HAT ownership (source of truth)
      // This prevents stale database memberships from granting access if HAT was revoked on-chain
      console.log(`🔗 Verifying on-chain HAT ownership for ${userWallet}`);

      try {
        const publicClient = createPublicClient({
          chain: base,
          transport: http(),
        });

        const hatBalance = await publicClient.readContract({
          address: HATS_PROTOCOL_ADDRESS,
          abi: HatsProtocolABI,
          functionName: 'balanceOf',
          args: [userWallet as `0x${string}`, BigInt(userMembership.hat_id)],
        });

        if (hatBalance === 0n) {
          console.log(
            '❌ User no longer holds HAT token on-chain (database stale)',
          );
          return false;
        }

        console.log('✅ User holds HAT token on-chain - verified');
      } catch (onchainError) {
        console.error(
          '❌ Failed to verify HAT ownership on-chain:',
          onchainError,
        );
        // Fail closed: deny access if we cannot verify on-chain ownership
        return false;
      }

      console.log('✅ User has management access (all checks passed)');
      return true;
    } catch (error) {
      console.error(
        `Failed to check pod management access for ${userWallet}:`,
        error,
      );
      return false;
    }
  }

  /**
   * General permission check with eligibility verification
   * ⚠️ SECURITY: Always checks eligibility criteria before granting access
   */
  private static async checkPermissionWithEligibility(
    userWallet: string,
    podId: string,
    permissionKey: keyof HatPermissions,
  ): Promise<boolean> {
    try {
      // Step 1: Get user's pod membership
      const userMembership = await PodService.checkPodMembership(
        podId,
        userWallet,
      );

      if (!userMembership.is_member) {
        return false;
      }

      // Step 2: Get the user's role permissions
      const { data: userRole } = await supabase
        .from('pod_role_permissions')
        .select('*')
        .eq('pod_id', podId)
        .eq('token_address', userMembership.hat_id)
        .eq('is_active', true)
        .single();

      if (!userRole || !userRole.permissions?.[permissionKey]) {
        return false;
      }

      // Step 3: Check eligibility criteria if they exist
      if (
        userRole.eligibility_criteria &&
        userRole.eligibility_criteria.length > 0
      ) {
        const eligibilityCheck =
          await EligibilityService.checkEligibilityHybrid(
            userWallet,
            podId,
            userRole.id,
            'database',
          );

        return eligibilityCheck.eligible;
      }

      return true;
    } catch (error) {
      console.error(`Failed to check permission ${permissionKey}:`, error);
      return false;
    }
  }

  /**
   * Check if user can access pod chat
   */
  static async canAccessPodChat(
    userWallet: string,
    podId: string,
  ): Promise<boolean> {
    return this.checkPermissionWithEligibility(userWallet, podId, 'chatAccess');
  }

  /**
   * Check if user can create events for a pod
   */
  static async canCreateEvents(
    userWallet: string,
    podId: string,
  ): Promise<boolean> {
    return this.checkPermissionWithEligibility(
      userWallet,
      podId,
      'eventCreation',
    );
  }

  /**
   * Check if user can view pod treasury
   */
  static async canViewTreasury(
    userWallet: string,
    podId: string,
  ): Promise<boolean> {
    return this.checkPermissionWithEligibility(
      userWallet,
      podId,
      'treasuryViewing',
    );
  }

  /**
   * Check if user can participate in governance for a pod
   */
  static async canParticipateInGovernance(
    userWallet: string,
    podId: string,
  ): Promise<boolean> {
    return this.checkPermissionWithEligibility(
      userWallet,
      podId,
      'governanceParticipation',
    );
  }

  /**
   * Check if user can create sub-pods
   */
  static async canCreateSubPods(
    userWallet: string,
    podId: string,
  ): Promise<boolean> {
    return this.checkPermissionWithEligibility(
      userWallet,
      podId,
      'subPodCreation',
    );
  }

  /**
   * Check if user can assign roles to other members
   */
  static async canAssignRoles(
    userWallet: string,
    podId: string,
  ): Promise<boolean> {
    return this.checkPermissionWithEligibility(
      userWallet,
      podId,
      'roleAssignment',
    );
  }

  /**
   * Get all permissions for a user in a pod
   */
  static async getUserPodPermissions(
    userWallet: string,
    podId: string,
  ): Promise<HatPermissions | null> {
    try {
      // Get all role permissions for this pod that the user has
      const rolePermissions =
        await PodRolePermissionsService.getPodRolePermissions(podId);

      // Check which roles the user has via pod membership
      const userMembership = await PodService.checkPodMembership(
        podId,
        userWallet,
      );

      if (!userMembership.is_member) {
        return null;
      }

      // Find the user's role permissions
      const userRolePermissions = rolePermissions.find(
        (role) => role.token_address === userMembership.hat_id,
      );

      return userRolePermissions?.permissions || null;
    } catch (error) {
      console.error(
        `Failed to get user pod permissions for ${userWallet}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Comprehensive access check for pod management UI
   */
  static async getPodAccessSummary(
    userWallet: string,
    podId: string,
  ): Promise<{
    canManage: boolean;
    canAccessChat: boolean;
    canCreateEvents: boolean;
    canViewTreasury: boolean;
    canParticipateInGovernance: boolean;
    canCreateSubPods: boolean;
    canAssignRoles: boolean;
    permissions: HatPermissions | null;
    membershipType?: string;
  }> {
    try {
      console.log(
        `🔍 Checking comprehensive pod access for ${userWallet} in pod ${podId}`,
      );

      // Run all permission checks in parallel for efficiency
      const [
        canManage,
        canAccessChat,
        canCreateEvents,
        canViewTreasury,
        canParticipateInGovernance,
        canCreateSubPods,
        canAssignRoles,
        permissions,
        membership,
      ] = await Promise.all([
        this.canManagePod(userWallet, podId),
        this.canAccessPodChat(userWallet, podId),
        this.canCreateEvents(userWallet, podId),
        this.canViewTreasury(userWallet, podId),
        this.canParticipateInGovernance(userWallet, podId),
        this.canCreateSubPods(userWallet, podId),
        this.canAssignRoles(userWallet, podId),
        this.getUserPodPermissions(userWallet, podId),
        PodService.checkPodMembership(podId, userWallet),
      ]);

      const accessSummary = {
        canManage,
        canAccessChat,
        canCreateEvents,
        canViewTreasury,
        canParticipateInGovernance,
        canCreateSubPods,
        canAssignRoles,
        permissions,
        membershipType: membership.membership_type,
      };

      console.log(`✅ Pod access summary for ${userWallet}:`, {
        podId,
        canManage,
        membershipType: membership.membership_type,
        hasPermissions: !!permissions,
      });

      return accessSummary;
    } catch (error) {
      console.error(
        `Failed to get pod access summary for ${userWallet}:`,
        error,
      );
      return {
        canManage: false,
        canAccessChat: false,
        canCreateEvents: false,
        canViewTreasury: false,
        canParticipateInGovernance: false,
        canCreateSubPods: false,
        canAssignRoles: false,
        permissions: null,
      };
    }
  }

  /**
   * Middleware function for API routes to check pod access
   */
  static async requirePodPermission(
    userWallet: string,
    podId: string,
    requiredPermission: keyof HatPermissions,
  ): Promise<{ allowed: boolean; error?: string }> {
    try {
      if (!userWallet) {
        return { allowed: false, error: 'Authentication required' };
      }

      const hasPermission = await PodRolePermissionsService.checkUserPermission(
        userWallet,
        podId,
        requiredPermission,
      );

      if (!hasPermission) {
        return {
          allowed: false,
          error: `Missing required permission: ${requiredPermission}`,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Permission check failed:', error);
      return {
        allowed: false,
        error: 'Permission check failed',
      };
    }
  }

  /**
   * Helper to validate pod management access for UI components
   */
  static async validatePodManagementAccess(
    userWallet: string,
    podId: string,
  ): Promise<{
    hasAccess: boolean;
    accessLevel: 'none' | 'member' | 'leader' | 'admin';
    permissions: HatPermissions | null;
  }> {
    try {
      const membership = await PodService.checkPodMembership(podId, userWallet);

      if (!membership.is_member) {
        return {
          hasAccess: false,
          accessLevel: 'none',
          permissions: null,
        };
      }

      const permissions = await this.getUserPodPermissions(userWallet, podId);
      const canManage = await this.canManagePod(userWallet, podId);

      let accessLevel: 'none' | 'member' | 'leader' | 'admin' = 'member';

      if (
        membership.membership_type === 'admin' ||
        (permissions?.roleAssignment && canManage)
      ) {
        accessLevel = 'admin';
      } else if (membership.membership_type === 'leader' || canManage) {
        accessLevel = 'leader';
      }

      return {
        hasAccess: true,
        accessLevel,
        permissions,
      };
    } catch (error) {
      console.error('Failed to validate pod management access:', error);
      return {
        hasAccess: false,
        accessLevel: 'none',
        permissions: null,
      };
    }
  }
}

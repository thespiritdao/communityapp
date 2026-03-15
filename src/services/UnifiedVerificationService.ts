import { supabase } from '@/utils/supabaseClient';
import { PodRolePermissionsService } from '@/features/pods/services/PodRolePermissionsService';
import { EligibilityService } from '@/features/pods/services/EligibilityService';
import HatMetadataService from './HatMetadataService';
import type { HatPermissions } from './hatPermissionsService';

/**
 * Unified verification service that combines database-driven access control
 * with blockchain-verifiable permissions via HAT metadata
 */

export interface VerificationResult {
  hasAccess: boolean;
  source: 'database' | 'blockchain' | 'hybrid';
  permissions: Partial<HatPermissions>;
  eligibility: {
    meets: boolean;
    criteriaResults: any;
    reason?: string;
  };
  metadata?: {
    ipfsHash?: string;
    lastSynced?: string;
    syncStatus: 'synced' | 'outdated' | 'no_metadata';
  };
}

export interface MembershipStatus {
  isMember: boolean;
  activeRoles: string[];
  permissions: HatPermissions;
  eligibilityStatus: Record<string, { eligible: boolean; evaluation: any }>;
  verificationSource: 'database' | 'blockchain' | 'hybrid';
}

export class UnifiedVerificationService {
  /**
   * Verify user permissions for a specific pod with hybrid approach
   * Checks database first for speed, blockchain for verification
   */
  static async verifyUserAccess(
    userAddress: string,
    podId: string,
    requiredPermission?: keyof HatPermissions,
  ): Promise<VerificationResult> {
    try {
      console.log(`🔍 Verifying access for ${userAddress} in pod ${podId}`, {
        requiredPermission,
      });

      // 1. Fast database check first
      const dbResult = await this.verifyDatabaseAccess(
        userAddress,
        podId,
        requiredPermission,
      );

      // 2. If specific permission required, check it quickly
      if (requiredPermission && dbResult.permissions[requiredPermission]) {
        console.log(
          '✅ Database verification successful for specific permission',
        );
        return dbResult;
      }

      // 3. For comprehensive verification, also check blockchain metadata
      const blockchainResult = await this.verifyBlockchainAccess(
        userAddress,
        podId,
      );

      // 4. Combine results with preference for blockchain data if available
      return this.combineVerificationResults(dbResult, blockchainResult);
    } catch (error) {
      console.error('❌ Verification failed:', error);
      return {
        hasAccess: false,
        source: 'database',
        permissions: {},
        eligibility: {
          meets: false,
          criteriaResults: {},
          reason: 'Verification error',
        },
      };
    }
  }

  /**
   * Database-driven verification (fast, for immediate UI decisions)
   */
  private static async verifyDatabaseAccess(
    userAddress: string,
    podId: string,
    requiredPermission?: keyof HatPermissions,
  ): Promise<VerificationResult> {
    try {
      // Get user's roles in the pod
      const { data: userRoles, error } = await supabase
        .from('pod_members')
        .select(`
          role_id,
          pod_role_permissions!inner(
            id,
            permissions,
            eligibility_criteria,
            is_active
          )
        `)
        .eq('pod_id', podId)
        .eq('wallet_address', userAddress)
        .eq('status', 'active');

      if (error) throw error;

      if (!userRoles || userRoles.length === 0) {
        return {
          hasAccess: false,
          source: 'database',
          permissions: {},
          eligibility: {
            meets: false,
            criteriaResults: {},
            reason: 'Not a member of this pod',
          },
        };
      }

      // Aggregate permissions from all active roles
      const aggregatedPermissions: HatPermissions = {
        chatAccess: false,
        governanceParticipation: false,
        eventCreation: false,
        treasuryViewing: false,
        treasuryManagement: false,
        memberManagement: false,
        subPodCreation: false,
        roleAssignment: false,
        forumModeration: false,
        chatModeration: false,
        forumAccess: false,
        bountyManagement: false,
        marketplaceAccess: false,
        marketplaceManage: false,
        knowledgeBaseAccess: false,
        knowledgeBaseManage: false,
      };

      const eligibilityResults: any = {};

      for (const userRole of userRoles) {
        const rolePerms = userRole.pod_role_permissions as any;
        if (rolePerms && rolePerms.is_active) {
          // Merge permissions (OR logic - if any role grants permission, user has it)
          Object.keys(aggregatedPermissions).forEach((key) => {
            const permKey = key as keyof HatPermissions;
            if (rolePerms.permissions[permKey]) {
              aggregatedPermissions[permKey] = true;
            }
          });

          // Check eligibility for this role
          if (
            rolePerms.eligibility_criteria &&
            rolePerms.eligibility_criteria.length > 0
          ) {
            try {
              const eligibilityCheck =
                await EligibilityService.evaluateCriteria({
                  userAddress,
                  podId,
                  roleId: rolePerms.id,
                  criteria: rolePerms.eligibility_criteria,
                });
              eligibilityResults[rolePerms.id] = eligibilityCheck;
            } catch (error) {
              console.warn(
                `Failed to check eligibility for role ${rolePerms.id}:`,
                error,
              );
            }
          }
        }
      }

      const hasRequiredPermission = requiredPermission
        ? aggregatedPermissions[requiredPermission]
        : Object.values(aggregatedPermissions).some(Boolean);

      return {
        hasAccess: hasRequiredPermission,
        source: 'database',
        permissions: aggregatedPermissions,
        eligibility: {
          meets: Object.values(eligibilityResults).every(
            (result: any) => result.eligible,
          ),
          criteriaResults: eligibilityResults,
        },
      };
    } catch (error) {
      console.error('Database verification failed:', error);
      throw error;
    }
  }

  /**
   * Blockchain-driven verification (slower, for verification and auditing)
   */
  private static async verifyBlockchainAccess(
    userAddress: string,
    podId: string,
  ): Promise<VerificationResult> {
    try {
      // Get roles with blockchain metadata
      const roles =
        await PodRolePermissionsService.getPodRolePermissions(podId);
      const blockchainRoles = roles.filter((role) => role.metadata_hash);

      if (blockchainRoles.length === 0) {
        return {
          hasAccess: false,
          source: 'blockchain',
          permissions: {},
          eligibility: {
            meets: false,
            criteriaResults: {},
            reason: 'No blockchain metadata found',
          },
          metadata: {
            syncStatus: 'no_metadata',
          },
        };
      }

      const aggregatedPermissions: HatPermissions = {
        chatAccess: false,
        governanceParticipation: false,
        eventCreation: false,
        treasuryViewing: false,
        treasuryManagement: false,
        memberManagement: false,
        subPodCreation: false,
        roleAssignment: false,
        forumModeration: false,
        chatModeration: false,
        forumAccess: false,
        bountyManagement: false,
        marketplaceAccess: false,
        marketplaceManage: false,
        knowledgeBaseAccess: false,
        knowledgeBaseManage: false,
      };

      let foundMetadata = false;
      let latestSync: string | undefined;

      // Check each role's blockchain metadata
      for (const role of blockchainRoles) {
        if (role.metadata_hash) {
          try {
            const verification = await HatMetadataService.verifyPermissions(
              role.metadata_hash,
              userAddress,
            );

            if (verification.metadata) {
              foundMetadata = true;
              if (
                role.last_synced_at &&
                (!latestSync || role.last_synced_at > latestSync)
              ) {
                latestSync = role.last_synced_at;
              }

              // Merge permissions from blockchain metadata
              Object.keys(verification.hasPermission).forEach((key) => {
                const permKey = key as keyof HatPermissions;
                if (verification.hasPermission[permKey]) {
                  aggregatedPermissions[permKey] = true;
                }
              });
            }
          } catch (error) {
            console.warn(
              `Failed to verify metadata for role ${role.id}:`,
              error,
            );
          }
        }
      }

      return {
        hasAccess: Object.values(aggregatedPermissions).some(Boolean),
        source: 'blockchain',
        permissions: aggregatedPermissions,
        eligibility: {
          meets: true, // Blockchain verification assumes eligibility was checked at grant time
          criteriaResults: {},
          reason: 'Verified via blockchain metadata',
        },
        metadata: {
          lastSynced: latestSync,
          syncStatus: foundMetadata ? 'synced' : 'no_metadata',
        },
      };
    } catch (error) {
      console.error('Blockchain verification failed:', error);
      throw error;
    }
  }

  /**
   * Combine database and blockchain verification results
   */
  private static combineVerificationResults(
    dbResult: VerificationResult,
    blockchainResult: VerificationResult,
  ): VerificationResult {
    // If blockchain has metadata, prefer it for permissions verification
    if (blockchainResult.metadata?.syncStatus === 'synced') {
      return {
        hasAccess: blockchainResult.hasAccess || dbResult.hasAccess,
        source: 'hybrid',
        permissions: {
          // Use database permissions as base, override with blockchain where available
          ...dbResult.permissions,
          ...blockchainResult.permissions,
        },
        eligibility: dbResult.eligibility, // Keep database eligibility checks (more current)
        metadata: blockchainResult.metadata,
      };
    }

    // Otherwise, use database result with metadata status
    return {
      ...dbResult,
      source: 'hybrid',
      metadata: blockchainResult.metadata || {
        syncStatus: 'no_metadata',
      },
    };
  }

  /**
   * Get comprehensive membership status for a user in a pod
   */
  static async getMembershipStatus(
    userAddress: string,
    podId: string,
  ): Promise<MembershipStatus> {
    try {
      const verificationResult = await this.verifyUserAccess(
        userAddress,
        podId,
      );

      // Get active roles
      const { data: userRoles, error } = await supabase
        .from('pod_members')
        .select('role_id, pod_role_permissions!inner(role_name)')
        .eq('pod_id', podId)
        .eq('wallet_address', userAddress)
        .eq('status', 'active');

      if (error) throw error;

      const activeRoles =
        userRoles?.map((r) => (r.pod_role_permissions as any).role_name) || [];

      // Get eligibility status for all pod roles
      const allRoles =
        await PodRolePermissionsService.getPodRolePermissions(podId);
      const eligibilityStatus: Record<
        string,
        { eligible: boolean; evaluation: any }
      > = {};

      for (const role of allRoles) {
        try {
          const eligibilityCheck =
            await PodRolePermissionsService.checkUserEligibility(
              userAddress,
              role.id,
            );
          eligibilityStatus[role.role_name] = eligibilityCheck;
        } catch (error) {
          console.warn(
            `Failed to check eligibility for role ${role.role_name}:`,
            error,
          );
          eligibilityStatus[role.role_name] = {
            eligible: false,
            evaluation: {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          };
        }
      }

      return {
        isMember: verificationResult.hasAccess,
        activeRoles,
        permissions: verificationResult.permissions as HatPermissions,
        eligibilityStatus,
        verificationSource: verificationResult.source,
      };
    } catch (error) {
      console.error('Failed to get membership status:', error);
      throw error;
    }
  }

  /**
   * Quick permission check for UI authorization
   * Uses cached database data for speed
   */
  static async quickPermissionCheck(
    userAddress: string,
    podId: string,
    permission: keyof HatPermissions,
  ): Promise<boolean> {
    try {
      // Use simple database function for speed
      return await PodRolePermissionsService.checkUserPermission(
        userAddress,
        podId,
        permission,
      );
    } catch (error) {
      console.error('Quick permission check failed:', error);
      return false;
    }
  }

  /**
   * Sync permissions from database to blockchain
   * Used when user wants verifiable membership
   */
  static async syncPermissionsToBlockchain(
    podId: string,
    roleId: string,
    walletClient?: any,
    updateOnChain = true,
  ): Promise<{
    success: boolean;
    ipfsHash?: string;
    txHash?: string;
    error?: string;
  }> {
    try {
      // Fetch the role to get the actual HAT ID
      const { data: role, error: roleError } = await supabase
        .from('pod_role_permissions')
        .select('token_address')
        .eq('id', roleId)
        .single();

      if (roleError || !role || !role.token_address) {
        throw new Error(
          `Role not found or missing token address: ${roleError?.message || 'No token address found'}`,
        );
      }

      console.log(
        '🎯 UnifiedVerificationService using token address from database:',
        role.token_address,
      );

      return await HatMetadataService.syncRoleToHatMetadata({
        roleId,
        podId,
        hatId: role.token_address, // Use actual token address from database
        walletClient,
        updateOnChain,
      });
    } catch (error) {
      console.error('Failed to sync permissions to blockchain:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      };
    }
  }

  /**
   * Validate that blockchain and database permissions are in sync
   */
  static async validateSync(podId: string): Promise<{
    inSync: boolean;
    discrepancies: Array<{
      roleId: string;
      roleName: string;
      issue: string;
      recommendation: string;
    }>;
  }> {
    try {
      const roles =
        await PodRolePermissionsService.getPodRolePermissions(podId);
      const discrepancies: any[] = [];

      for (const role of roles) {
        if (role.metadata_hash) {
          try {
            const metadata = await HatMetadataService.getFromIPFS(
              role.metadata_hash,
            );
            if (metadata) {
              // Compare database permissions with blockchain metadata
              const dbPermissions = role.permissions;
              const blockchainPermissions = metadata.permissions;

              const permissionsMatch = Object.keys(dbPermissions).every(
                (key) => {
                  const permKey = key as keyof HatPermissions;
                  return (
                    dbPermissions[permKey] === blockchainPermissions[permKey]
                  );
                },
              );

              if (!permissionsMatch) {
                discrepancies.push({
                  roleId: role.id,
                  roleName: role.role_name,
                  issue: 'Permissions mismatch between database and blockchain',
                  recommendation:
                    'Sync permissions to blockchain to ensure consistency',
                });
              }

              // Check if sync is recent (within 24 hours)
              if (role.last_synced_at) {
                const syncAge =
                  Date.now() - new Date(role.last_synced_at).getTime();
                const hoursOld = syncAge / (1000 * 60 * 60);

                if (hoursOld > 24) {
                  discrepancies.push({
                    roleId: role.id,
                    roleName: role.role_name,
                    issue: `Last sync was ${Math.round(hoursOld)} hours ago`,
                    recommendation:
                      'Consider re-syncing to ensure metadata is current',
                  });
                }
              }
            }
          } catch (error) {
            discrepancies.push({
              roleId: role.id,
              roleName: role.role_name,
              issue: 'Cannot retrieve blockchain metadata',
              recommendation:
                'Re-sync permissions to restore blockchain verification',
            });
          }
        } else {
          discrepancies.push({
            roleId: role.id,
            roleName: role.role_name,
            issue: 'No blockchain metadata found',
            recommendation: 'Deploy to blockchain for verifiable membership',
          });
        }
      }

      return {
        inSync: discrepancies.length === 0,
        discrepancies,
      };
    } catch (error) {
      console.error('Sync validation failed:', error);
      throw error;
    }
  }
}

export default UnifiedVerificationService;

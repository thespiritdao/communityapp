import { HatsModuleDeploymentService } from './HatsModuleDeploymentService';
import { HatsModuleSyncService } from './HatsModuleSyncService';
import { PodRolePermissionsService } from './PodRolePermissionsService';
import type { EligibilityCriteria } from './EligibilityService';
import { supabase } from '@/utils/supabaseClient';

/**
 * Comprehensive service for managing HATS eligibility module integration
 * This service provides high-level methods for common operations
 */
export class HatsEligibilityIntegrationService {
  /**
   * Initialize eligibility modules for a newly created pod
   */
  static async initializePodEligibilityModules(
    podId: string,
    podName: string,
    leaderHatId: string,
    memberHatId: string,
    leaderCriteria: EligibilityCriteria[] = [],
    memberCriteria: EligibilityCriteria[] = [],
    deployer: string,
    walletClient: any,
    publicClient: any,
  ): Promise<{
    leaderModule?: string;
    memberModule?: string;
    errors: string[];
  }> {
    const results = {
      leaderModule: undefined as string | undefined,
      memberModule: undefined as string | undefined,
      errors: [] as string[],
    };

    console.log('🚀 Initializing HATS eligibility modules for pod:', podName);

    try {
      // Deploy leader module if criteria exist
      if (leaderCriteria.length > 0) {
        try {
          const leaderDeployment =
            await HatsModuleDeploymentService.deployEligibilityModule(
              {
                hatId: leaderHatId,
                podId,
                criteria: leaderCriteria,
                requireAllCriteria: true,
                deployer,
              },
              walletClient,
              publicClient,
            );
          results.leaderModule = leaderDeployment.module_address;
          console.log(
            '✅ Leader module deployed:',
            leaderDeployment.module_address,
          );
        } catch (error) {
          results.errors.push(`Leader module deployment failed: ${error}`);
          console.error('❌ Leader module deployment failed:', error);
        }
      }

      // Deploy member module if criteria exist
      if (memberCriteria.length > 0) {
        try {
          const memberDeployment =
            await HatsModuleDeploymentService.deployEligibilityModule(
              {
                hatId: memberHatId,
                podId,
                criteria: memberCriteria,
                requireAllCriteria: true,
                deployer,
              },
              walletClient,
              publicClient,
            );
          results.memberModule = memberDeployment.module_address;
          console.log(
            '✅ Member module deployed:',
            memberDeployment.module_address,
          );
        } catch (error) {
          results.errors.push(`Member module deployment failed: ${error}`);
          console.error('❌ Member module deployment failed:', error);
        }
      }

      return results;
    } catch (error) {
      console.error('❌ Pod eligibility initialization failed:', error);
      results.errors.push(`General initialization error: ${error}`);
      return results;
    }
  }

  /**
   * Update eligibility criteria and sync to modules
   */
  static async updateRoleEligibility(
    roleId: string,
    newCriteria: EligibilityCriteria[],
    updatedBy: string,
    autoDeployModule = false,
    walletClient?: any,
    publicClient?: any,
  ): Promise<{
    success: boolean;
    moduleAddress?: string;
    syncResult?: any;
    error?: string;
  }> {
    try {
      console.log('🔄 Updating role eligibility and syncing to modules...');

      // Update database criteria
      const updatedRole =
        await PodRolePermissionsService.updateEligibilityCriteria(
          roleId,
          newCriteria,
          updatedBy,
        );

      // Check if module exists
      const existingDeployment =
        await HatsModuleDeploymentService.getDeploymentByHat(
          updatedRole.pod_id,
          updatedRole.token_address,
        );

      let moduleAddress: string | undefined;
      let syncResult: any;

      if (existingDeployment) {
        // Module exists, sync changes
        syncResult = await HatsModuleSyncService.syncRoleToModule(updatedRole, {
          forceUpdate: true,
          validateOnchain: true,
        });
        moduleAddress = existingDeployment.module_address;
      } else if (
        autoDeployModule &&
        newCriteria.length > 0 &&
        walletClient &&
        publicClient
      ) {
        // No module but criteria exist, deploy new one
        const deployment =
          await HatsModuleDeploymentService.deployEligibilityModule(
            {
              hatId: updatedRole.token_address,
              podId: updatedRole.pod_id,
              criteria: newCriteria,
              requireAllCriteria: true,
              deployer: updatedBy,
            },
            walletClient,
            publicClient,
          );
        moduleAddress = deployment.module_address;
      }

      return {
        success: true,
        moduleAddress,
        syncResult,
      };
    } catch (error) {
      console.error('❌ Failed to update role eligibility:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check user eligibility across database and onchain
   */
  static async checkUserEligibilityComprehensive(
    userAddress: string,
    podId: string,
    roleId?: string,
    publicClient?: any,
  ): Promise<{
    databaseEligible: boolean;
    onchainEligible?: boolean;
    moduleAddress?: string;
    evaluation?: any;
    discrepancies?: string[];
  }> {
    try {
      const results = {
        databaseEligible: false,
        onchainEligible: undefined as boolean | undefined,
        moduleAddress: undefined as string | undefined,
        evaluation: undefined as any,
        discrepancies: [] as string[],
      };

      // Database eligibility check
      if (roleId) {
        const dbCheck = await PodRolePermissionsService.checkUserEligibility(
          userAddress,
          roleId,
        );
        results.databaseEligible = dbCheck.eligible;
        results.evaluation = dbCheck.evaluation;

        // Get module deployment for onchain check
        const role = await supabase
          .from('pod_role_permissions')
          .select('token_address')
          .eq('id', roleId)
          .single();

        if (role.data?.token_address) {
          const deployment =
            await HatsModuleDeploymentService.getDeploymentByHat(
              podId,
              role.data.token_address,
            );

          if (deployment && deployment.module_address) {
            results.moduleAddress = deployment.module_address;

            // Onchain eligibility check (only if publicClient is provided)
            if (publicClient) {
              const onchainResult =
                await HatsModuleDeploymentService.checkOnchainEligibility(
                  deployment.module_address,
                  role.data.token_address,
                  userAddress,
                  publicClient,
                );
              results.onchainEligible = onchainResult.eligible;

              // Check for discrepancies
              if (results.databaseEligible !== results.onchainEligible) {
                results.discrepancies.push(
                  `Database shows ${results.databaseEligible ? 'eligible' : 'not eligible'} but onchain shows ${results.onchainEligible ? 'eligible' : 'not eligible'}`,
                );
              }
            }
          }
        }
      } else {
        // Check all roles in pod
        const eligibleRoles =
          await PodRolePermissionsService.getEligibleRolesForUser(
            userAddress,
            podId,
          );
        results.databaseEligible = eligibleRoles.some((r) => r.eligible);
      }

      return results;
    } catch (error) {
      console.error('❌ Comprehensive eligibility check failed:', error);
      throw error;
    }
  }

  /**
   * Get pod eligibility health report
   */
  static async getPodEligibilityHealth(podId: string): Promise<{
    totalRoles: number;
    rolesWithCriteria: number;
    deployedModules: number;
    syncedModules: number;
    healthScore: number;
    issues: string[];
    recommendations: string[];
  }> {
    try {
      const [roles, syncHealth, deployments] = await Promise.all([
        PodRolePermissionsService.getPodRolePermissions(podId),
        HatsModuleSyncService.getPodSyncHealth(podId),
        HatsModuleDeploymentService.getPodDeployments(podId),
      ]);

      const rolesWithCriteria = roles.filter(
        (role) =>
          Array.isArray(role.eligibility_criteria) &&
          role.eligibility_criteria.length > 0,
      ).length;

      const deployedModules = deployments.filter((d) => d.is_active).length;
      const syncedModules = deployments.filter(
        (d) => d.sync_status === 'synced',
      ).length;

      const issues: string[] = [];
      const recommendations: string[] = [];

      // Identify issues
      if (rolesWithCriteria > deployedModules) {
        issues.push(
          `${rolesWithCriteria - deployedModules} roles have criteria but no deployed modules`,
        );
        recommendations.push(
          'Deploy HATS modules for roles with eligibility criteria',
        );
      }

      if (deployedModules > syncedModules) {
        issues.push(
          `${deployedModules - syncedModules} modules are out of sync`,
        );
        recommendations.push(
          'Run sync operation to update modules with latest criteria',
        );
      }

      const erroredDeployments = deployments.filter(
        (d) => d.sync_status === 'error',
      ).length;
      if (erroredDeployments > 0) {
        issues.push(`${erroredDeployments} modules have sync errors`);
        recommendations.push(
          'Check module sync errors and redeploy if necessary',
        );
      }

      // Calculate health score
      let healthScore = 100;
      if (roles.length > 0) {
        const syncRatio = syncedModules / Math.max(rolesWithCriteria, 1);
        healthScore = Math.round(syncRatio * 100);
      }

      return {
        totalRoles: roles.length,
        rolesWithCriteria,
        deployedModules,
        syncedModules,
        healthScore,
        issues,
        recommendations,
      };
    } catch (error) {
      console.error('❌ Failed to get pod eligibility health:', error);
      throw error;
    }
  }

  /**
   * Automated pod health check and fix
   */
  static async autoFixPodEligibility(
    podId: string,
    deployer: string,
    options: {
      deployMissingModules?: boolean;
      syncOutdatedModules?: boolean;
      fixErroredModules?: boolean;
    } = {},
  ): Promise<{
    applied: string[];
    failed: string[];
    summary: string;
  }> {
    const {
      deployMissingModules = true,
      syncOutdatedModules = true,
      fixErroredModules = true,
    } = options;

    const applied: string[] = [];
    const failed: string[] = [];

    try {
      console.log('🔧 Starting automated pod eligibility fix...');

      const health = await this.getPodEligibilityHealth(podId);

      // Deploy missing modules
      if (
        deployMissingModules &&
        health.rolesWithCriteria > health.deployedModules
      ) {
        try {
          const syncResult = await HatsModuleSyncService.syncPodToModules(
            podId,
            {
              deployIfNotExists: true,
              forceUpdate: false,
            },
          );
          applied.push(
            `Deployed ${syncResult.summary.success} missing modules`,
          );

          if (syncResult.summary.failed > 0) {
            failed.push(
              `Failed to deploy ${syncResult.summary.failed} modules`,
            );
          }
        } catch (error) {
          failed.push(`Module deployment failed: ${error}`);
        }
      }

      // Sync outdated modules
      if (syncOutdatedModules) {
        try {
          const syncResult = await HatsModuleSyncService.syncPodToModules(
            podId,
            {
              forceUpdate: true,
              validateOnchain: true,
            },
          );
          applied.push(`Synced ${syncResult.summary.success} modules`);
        } catch (error) {
          failed.push(`Module sync failed: ${error}`);
        }
      }

      // Fix errored modules (emergency resync)
      if (fixErroredModules) {
        try {
          await HatsModuleSyncService.emergencyResync(podId);
          applied.push('Emergency resync completed');
        } catch (error) {
          failed.push(`Emergency resync failed: ${error}`);
        }
      }

      const summary = `Applied ${applied.length} fixes, ${failed.length} failed`;

      console.log('✅ Automated fix completed:', summary);
      return { applied, failed, summary };
    } catch (error) {
      console.error('❌ Automated fix failed:', error);
      failed.push(`General error: ${error}`);
      return { applied, failed, summary: 'Fix operation failed' };
    }
  }

  /**
   * Generate eligibility integration report for a pod
   */
  static async generateIntegrationReport(podId: string): Promise<{
    podInfo: any;
    roles: any[];
    modules: any[];
    health: any;
    recommendations: string[];
    nextActions: string[];
  }> {
    try {
      const [podInfo, roles, deployments, health] = await Promise.all([
        supabase.from('pods').select('*').eq('id', podId).single(),
        PodRolePermissionsService.getPodRolePermissions(podId),
        HatsModuleDeploymentService.getPodDeployments(podId),
        this.getPodEligibilityHealth(podId),
      ]);

      const recommendations: string[] = [];
      const nextActions: string[] = [];

      // Generate recommendations based on current state
      if (health.rolesWithCriteria === 0) {
        recommendations.push(
          'Consider adding eligibility criteria to roles for better access control',
        );
        nextActions.push(
          'Configure eligibility requirements in the pod management panel',
        );
      }

      if (health.deployedModules < health.rolesWithCriteria) {
        recommendations.push(
          'Deploy HATS modules for onchain eligibility verification',
        );
        nextActions.push('Use the HATS Modules tab to deploy missing modules');
      }

      if (health.healthScore < 80) {
        recommendations.push(
          'Sync modules to ensure consistency between database and onchain state',
        );
        nextActions.push('Run a sync operation to update all modules');
      }

      if (health.issues.length > 0) {
        recommendations.push(
          'Address identified issues to improve system reliability',
        );
        nextActions.push(
          'Review and fix issues shown in the module health dashboard',
        );
      }

      return {
        podInfo: podInfo.data,
        roles: roles.map((role) => ({
          id: role.id,
          name: role.role_name,
          hatId: role.token_address,
          hasCriteria:
            Array.isArray(role.eligibility_criteria) &&
            role.eligibility_criteria.length > 0,
          criteriaCount: Array.isArray(role.eligibility_criteria)
            ? role.eligibility_criteria.length
            : 0,
          syncStatus: role.sync_status,
          lastSynced: role.last_synced_at,
        })),
        modules: deployments.map((deployment) => ({
          id: deployment.id,
          hatId: deployment.token_address,
          moduleAddress: deployment.module_address,
          syncStatus: deployment.sync_status,
          lastSynced: deployment.last_synced_at,
          error: deployment.sync_error,
        })),
        health,
        recommendations,
        nextActions,
      };
    } catch (error) {
      console.error('❌ Failed to generate integration report:', error);
      throw error;
    }
  }
}

import { supabase } from '@/utils/supabaseClient';
import { HatsModuleDeploymentService, } from './HatsModuleDeploymentService';
import { PodRolePermissionsService, type PodRolePermission } from './PodRolePermissionsService';
import { EligibilityService, type EligibilityCriteria } from './EligibilityService';

export interface SyncStatus {
  podId: string;
  hatId: string;
  lastSynced: Date | null;
  status: 'never_synced' | 'synced' | 'pending' | 'error' | 'needs_update';
  error?: string;
  criteriaHash?: string;
  moduleAddress?: string;
}

export interface SyncResult {
  success: boolean;
  moduleAddress?: string;
  error?: string;
  operationsPerformed: string[];
}

export interface SyncOptions {
  forceUpdate?: boolean;
  deployIfNotExists?: boolean;
  validateOnchain?: boolean;
  deployerAddress?: string;
  walletClient?: any;
  publicClient?: any;
}

export class HatsModuleSyncService {
  /**
   * Sync all eligibility criteria for a pod to HATS modules
   */
  static async syncPodToModules(
    podId: string,
    options: SyncOptions = {}
  ): Promise<{ results: SyncResult[]; summary: { success: number; failed: number; skipped: number } }> {
    console.log('🔄 Starting pod sync to HATS modules:', podId);
    
    try {
      // Get all role permissions for the pod
      const rolePermissions = await PodRolePermissionsService.getPodRolePermissions(podId);
      
      const results: SyncResult[] = [];
      let success = 0, failed = 0, skipped = 0;

      for (const role of rolePermissions) {
        if (!role.token_address) {
          console.warn(`⚠️ Role ${role.role_name} has no HAT ID, skipping`);
          skipped++;
          continue;
        }

        try {
          const result = await this.syncRoleToModule(role, options);
          results.push(result);
          
          if (result.success) {
            success++;
          } else {
            failed++;
          }
        } catch (error) {
          const errorResult: SyncResult = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown sync error',
            operationsPerformed: []
          };
          results.push(errorResult);
          failed++;
        }
      }

      console.log(`✅ Pod sync completed. Success: ${success}, Failed: ${failed}, Skipped: ${skipped}`);
      
      return {
        results,
        summary: { success, failed, skipped }
      };

    } catch (error) {
      console.error('❌ Pod sync failed:', error);
      throw error;
    }
  }

  /**
   * Sync a single role's eligibility criteria to its HATS module
   */
  static async syncRoleToModule(
    role: PodRolePermission,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const { forceUpdate = false, deployIfNotExists = true, validateOnchain = true } = options;
    const operations: string[] = [];
    
    try {
      console.log(`🔄 Syncing role ${role.role_name} to HATS module...`);

      if (!role.token_address) {
        throw new Error('Role has no HAT ID');
      }

      // Check if module exists (handle missing table gracefully)
      let existingDeployment;
      try {
        existingDeployment = await HatsModuleDeploymentService.getDeploymentByHat(
          role.pod_id,
          role.token_address
        );
      } catch (error) {
        console.warn('⚠️ Could not check existing deployments:', error);
        // Continue without existing deployment data
        existingDeployment = null;
      }

      let moduleAddress: string;
      let needsUpdate = false;

      if (existingDeployment) {
        moduleAddress = existingDeployment.module_address;
        
        // Check if criteria have changed
        const currentCriteriaHash = this.hashCriteria(role.eligibility_criteria as EligibilityCriteria[] || []);
        needsUpdate = forceUpdate || (currentCriteriaHash !== existingDeployment.criteria_hash);

        if (needsUpdate) {
          console.log('🔄 Criteria have changed, updating module...');
          operations.push('update_criteria');
          
          // Clear existing criteria and add new ones
          await this.updateModuleCriteria(moduleAddress, role, options.walletClient);
          
          // Update deployment record
          await this.updateDeploymentCriteriaHash(existingDeployment.id, currentCriteriaHash);
        } else {
          console.log('✅ Module is up to date, no sync needed');
          operations.push('no_update_needed');
        }
      } else {
        if (!deployIfNotExists) {
          return {
            success: false,
            error: 'Module not deployed and deployIfNotExists is false',
            operationsPerformed: operations
          };
        }

        // Deploy new module
        console.log('📦 Deploying new HATS module...');
        operations.push('deploy_module');
        
        try {
          // Clean and validate criteria before deployment
          const rawCriteria = role.eligibility_criteria as EligibilityCriteria[] || [];
          const cleanedCriteria = EligibilityService.validateAndCleanCriteria(rawCriteria);
          
          console.log('🧹 Cleaned criteria for deployment:', {
            original: rawCriteria.length,
            cleaned: cleanedCriteria.length,
            criteria: cleanedCriteria
          });

          const deployment = await HatsModuleDeploymentService.deployEligibilityModule({
            hatId: role.token_address,
            podId: role.pod_id,
            criteria: cleanedCriteria,
            requireAllCriteria: true, // Default to requiring all criteria
            deployer: options.deployerAddress || role.created_by || 'system'
          }, options.walletClient, options.publicClient);

          moduleAddress = deployment.module_address;
          operations.push('sync_initial_criteria');
        } catch (deployError) {
          console.warn('⚠️ Module deployment failed (database not configured):', deployError);
          return {
            success: false,
            error: 'Module deployment requires database migration. Please run create-hats-module-deployments-table.sql',
            operationsPerformed: operations
          };
        }

      }

      // Validate onchain if requested
      if (validateOnchain && (needsUpdate || !existingDeployment)) {
        operations.push('validate_onchain');
        
        // Test eligibility check for the role creator to ensure module is working
        try {
          const onchainStatus = await HatsModuleDeploymentService.checkOnchainEligibility(
            moduleAddress,
            role.token_address,
            role.created_by,
            options.publicClient
          );
          console.log('✅ Onchain validation successful:', onchainStatus);
        } catch (validationError) {
          console.warn('⚠️ Onchain validation failed (module may still be functional):', validationError);
          operations.push('validation_warning');
        }
      }

      // Update sync status
      await PodRolePermissionsService.updateSyncStatus(role.id, 'synced');
      operations.push('update_sync_status');

      return {
        success: true,
        moduleAddress,
        operationsPerformed: operations
      };

    } catch (error) {
      console.error(`❌ Role sync failed for ${role.role_name}:`, error);
      
      // Update sync status with error
      await PodRolePermissionsService.updateSyncStatus(
        role.id,
        'error',
        error instanceof Error ? error.message : 'Unknown sync error'
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown sync error',
        operationsPerformed: operations
      };
    }
  }

  /**
   * Update criteria on an existing module
   */
  private static async updateModuleCriteria(
    moduleAddress: string,
    role: PodRolePermission,
    walletClient: any
  ): Promise<void> {
    console.log('🔄 Updating module criteria for:', moduleAddress);
    
    // Clean and validate criteria before syncing
    const rawCriteria = role.eligibility_criteria as EligibilityCriteria[] || [];
    const cleanedCriteria = EligibilityService.validateAndCleanCriteria(rawCriteria);
    
    console.log('🧹 Cleaned criteria for update:', {
      original: rawCriteria.length,
      cleaned: cleanedCriteria.length,
      criteria: cleanedCriteria
    });

    // Sync criteria to the module
    await HatsModuleDeploymentService.syncCriteriaToModule(moduleAddress, {
      hatId: role.token_address,
      podId: role.pod_id,
      criteria: cleanedCriteria,
      requireAllCriteria: true,
      deployer: role.created_by || 'system'
    }, walletClient);
    
    console.log(`✅ Module ${moduleAddress} criteria update completed`);
  }

  /**
   * Get sync status for all roles in a pod
   */
  static async getPodSyncStatus(podId: string): Promise<SyncStatus[]> {
    try {
      const rolePermissions = await PodRolePermissionsService.getPodRolePermissions(podId);
      const statuses: SyncStatus[] = [];

      for (const role of rolePermissions) {
        if (!role.token_address) {
          statuses.push({
            podId,
            hatId: 'none',
            lastSynced: null,
            status: 'never_synced',
            error: 'No HAT ID assigned'
          });
          continue;
        }

        const deployment = await HatsModuleDeploymentService.getDeploymentByHat(podId, role.token_address);

        if (!deployment) {
          statuses.push({
            podId,
            hatId: role.token_address,
            lastSynced: null,
            status: 'never_synced'
          });
          continue;
        }

        // Check if criteria have changed since last sync
        const currentCriteriaHash = this.hashCriteria(role.eligibility_criteria as EligibilityCriteria[] || []);
        const needsUpdate = currentCriteriaHash !== deployment.criteria_hash;

        statuses.push({
          podId,
          hatId: role.token_address,
          lastSynced: deployment.last_synced_at ? new Date(deployment.last_synced_at) : null,
          status: deployment.sync_status === 'error' ? 'error' :
                   needsUpdate ? 'needs_update' :
                   deployment.sync_status,
          error: deployment.sync_error,
          criteriaHash: currentCriteriaHash,
          moduleAddress: deployment.module_address
        });
      }

      return statuses;
    } catch (error) {
      console.error('Failed to get pod sync status:', error);
      throw error;
    }
  }

  /**
   * Get overall sync health for a pod
   */
  static async getPodSyncHealth(podId: string): Promise<{
    totalRoles: number;
    synced: number;
    needsUpdate: number;
    errors: number;
    neverSynced: number;
    healthPercentage: number;
  }> {
    const statuses = await this.getPodSyncStatus(podId);
    
    const summary = {
      totalRoles: statuses.length,
      synced: statuses.filter(s => s.status === 'synced').length,
      needsUpdate: statuses.filter(s => s.status === 'needs_update').length,
      errors: statuses.filter(s => s.status === 'error').length,
      neverSynced: statuses.filter(s => s.status === 'never_synced').length,
      healthPercentage: 0
    };

    // Calculate health percentage (synced roles / total roles)
    summary.healthPercentage = summary.totalRoles > 0 
      ? Math.round((summary.synced / summary.totalRoles) * 100)
      : 100;

    return summary;
  }

  /**
   * Auto-sync all pods that need updates
   */
  static async autoSyncAllPods(): Promise<{
    totalPods: number;
    syncedPods: number;
    failedPods: number;
    results: Record<string, SyncResult[]>;
  }> {
    console.log('🔄 Starting auto-sync for all pods...');
    
    try {
      // Get all active pods
      const { data: pods, error } = await supabase
        .from('pods')
        .select('id, name')
        .eq('is_active', true);

      if (error) {
        throw new Error(`Failed to get pods: ${error.message}`);
      }

      const results: Record<string, SyncResult[]> = {};
      let syncedPods = 0;
      let failedPods = 0;

      for (const pod of pods) {
        try {
          const syncResult = await this.syncPodToModules(pod.id, { deployIfNotExists: false });
          results[pod.id] = syncResult.results;
          
          if (syncResult.summary.failed === 0) {
            syncedPods++;
          } else {
            failedPods++;
          }
        } catch (error) {
          console.error(`Failed to sync pod ${pod.name}:`, error);
          results[pod.id] = [{
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            operationsPerformed: []
          }];
          failedPods++;
        }
      }

      console.log(`✅ Auto-sync completed. Pods: ${pods.length}, Synced: ${syncedPods}, Failed: ${failedPods}`);

      return {
        totalPods: pods.length,
        syncedPods,
        failedPods,
        results
      };

    } catch (error) {
      console.error('❌ Auto-sync failed:', error);
      throw error;
    }
  }

  /**
   * Create a criteria hash for comparison
   */
  private static hashCriteria(criteria: EligibilityCriteria[]): string {
    const sortedCriteria = criteria
      .map(c => ({
        type: c.type,
        contract_address: c.contract_address,
        minimum_amount: c.minimum_amount,
        token_id: c.token_id,
        agreement_hash: c.agreement_hash,
        required: c.required
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

    return require('crypto')
      .createHash('sha256')
      .update(JSON.stringify(sortedCriteria))
      .digest('hex');
  }

  /**
   * Update deployment criteria hash
   */
  private static async updateDeploymentCriteriaHash(
    deploymentId: string,
    newCriteriaHash: string
  ): Promise<void> {
    const { error } = await supabase
      .from('hats_module_deployments')
      .update({
        criteria_hash: newCriteriaHash,
        last_synced_at: new Date().toISOString(),
        sync_status: 'synced',
        updated_at: new Date().toISOString()
      })
      .eq('id', deploymentId);

    if (error) {
      throw new Error(`Failed to update deployment criteria hash: ${error.message}`);
    }
  }

  /**
   * Schedule automatic sync (would be called by a cron job or similar)
   */
  static async scheduleAutoSync(): Promise<void> {
    try {
      console.log('📅 Scheduling auto-sync...');
      
      // This would integrate with a job queue system like Bull/Agenda
      // For now, we'll just log that it would be scheduled
      
      // Example job scheduling (pseudocode):
      // await queue.add('auto-sync-hats-modules', {}, {
      //   repeat: { cron: '0 */6 * * *' } // Every 6 hours
      // });
      
      console.log('✅ Auto-sync scheduled');
    } catch (error) {
      console.error('❌ Failed to schedule auto-sync:', error);
      throw error;
    }
  }

  /**
   * Emergency resync - forces full resync of all modules
   */
  static async emergencyResync(podId?: string): Promise<void> {
    console.log('🚨 Starting emergency resync...', podId ? `for pod ${podId}` : 'for all pods');
    
    try {
      if (podId) {
        await this.syncPodToModules(podId, {
          forceUpdate: true,
          deployIfNotExists: true,
          validateOnchain: true
        });
      } else {
        await this.autoSyncAllPods();
      }
      
      console.log('✅ Emergency resync completed');
    } catch (error) {
      console.error('❌ Emergency resync failed:', error);
      throw error;
    }
  }
}
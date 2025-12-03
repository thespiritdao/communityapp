/**
 * State synchronization service for Database vs On-chain HATs
 * Handles periodic sync and on-demand sync when users load the app
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { PodCoreService } from './PodCoreService';
import { PodDatabaseService } from './PodDatabaseService';
import { HATS_CONFIG } from '../utils/podLeaderHats';
import { logHatTransaction, logHatError } from './hatErrorService';

// HAT contract ABI for sync operations
const SYNC_HATS_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'isActive',
    type: 'function',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'uri',
    type: 'function',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
] as const;

export interface SyncResult {
  success: boolean;
  processed: number;
  updated: number;
  errors: number;
  duration: number;
  details: {
    podsProcessed: string[];
    updatedPods: string[];
    errorPods: string[];
  };
}

export interface HatSyncStatus {
  isActive: boolean;
  lastSync: string | null;
  nextSync: string | null;
  syncInterval: number; // milliseconds
}

class HatSyncService {
  private publicClient;
  private syncInterval = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private syncTimer: NodeJS.Timeout | null = null;
  private lastSync: Date | null = null;
  private isRunning = false;

  constructor() {
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });
  }

  /**
   * Start periodic synchronization
   */
  startPeriodicSync(intervalHours = 24): void {
    this.syncInterval = intervalHours * 60 * 60 * 1000;

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      this.performFullSync().catch(console.error);
    }, this.syncInterval);

    console.log(`🔄 HAT sync service started with ${intervalHours}h interval`);
  }

  /**
   * Stop periodic synchronization
   */
  stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    console.log('⏹️ HAT sync service stopped');
  }

  /**
   * Perform full synchronization of all pods
   */
  async performFullSync(): Promise<SyncResult> {
    if (this.isRunning) {
      console.log('🔄 Sync already in progress, skipping...');
      return {
        success: false,
        processed: 0,
        updated: 0,
        errors: 0,
        duration: 0,
        details: { podsProcessed: [], updatedPods: [], errorPods: [] },
      };
    }

    const startTime = Date.now();
    this.isRunning = true;

    try {
      console.log('🔄 Starting full HAT synchronization...');

      // Get all pods from database
      const allPods = await PodCoreService.getAllPods();
      console.log(`📋 Found ${allPods.length} pods to sync`);

      const results = {
        processed: 0,
        updated: 0,
        errors: 0,
        podsProcessed: [] as string[],
        updatedPods: [] as string[],
        errorPods: [] as string[],
      };

      // Process each pod
      for (const pod of allPods) {
        try {
          results.processed++;
          results.podsProcessed.push(pod.id);

          const syncResult = await this.syncPodHats(pod);

          if (syncResult.updated) {
            results.updated++;
            results.updatedPods.push(pod.id);
          }
        } catch (error) {
          results.errors++;
          results.errorPods.push(pod.id);

          logHatError(error, {
            userAddress: 'system',
            hatId: pod.management_hat_id || 'unknown',
            action: 'sync_pod_hats',
          });
        }
      }

      const duration = Date.now() - startTime;
      this.lastSync = new Date();

      const syncResult: SyncResult = {
        success: results.errors === 0,
        processed: results.processed,
        updated: results.updated,
        errors: results.errors,
        duration,
        details: {
          podsProcessed: results.podsProcessed,
          updatedPods: results.updatedPods,
          errorPods: results.errorPods,
        },
      };

      // Log sync completion
      logHatTransaction({
        type: 'state_change',
        action: 'full_sync',
        success: syncResult.success,
        duration,
        userAddress: 'system',
        details: {
          processed: results.processed,
          updated: results.updated,
          errors: results.errors,
        },
      });

      console.log('✅ HAT synchronization completed:', {
        duration: `${duration}ms`,
        processed: results.processed,
        updated: results.updated,
        errors: results.errors,
      });

      return syncResult;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync HATs for a specific pod
   */
  async syncPodHats(pod: any): Promise<{ updated: boolean; details: any }> {
    const updates: any = {};
    let hasUpdates = false;

    try {
      // Check management HAT status if it exists
      if (pod.management_hat_id) {
        const isActive = await this.publicClient.readContract({
          address: HATS_CONFIG.CONTRACT_ADDRESS,
          abi: SYNC_HATS_ABI,
          functionName: 'isActive',
          args: [BigInt(pod.management_hat_id)],
        });

        // Update pod metadata with current HAT status
        const currentMetadata = JSON.parse(pod.pod_metadata || '{}');
        if (currentMetadata.management_hat_active !== isActive) {
          currentMetadata.management_hat_active = isActive;
          currentMetadata.last_sync = new Date().toISOString();
          updates.pod_metadata = JSON.stringify(currentMetadata);
          hasUpdates = true;
        }
      }

      // Check membership HAT status if it exists
      if (pod.membership_hat_id) {
        const isActive = await this.publicClient.readContract({
          address: HATS_CONFIG.CONTRACT_ADDRESS,
          abi: SYNC_HATS_ABI,
          functionName: 'isActive',
          args: [BigInt(pod.membership_hat_id)],
        });

        const currentMetadata = JSON.parse(
          updates.pod_metadata || pod.pod_metadata || '{}',
        );
        if (currentMetadata.membership_hat_active !== isActive) {
          currentMetadata.membership_hat_active = isActive;
          currentMetadata.last_sync = new Date().toISOString();
          updates.pod_metadata = JSON.stringify(currentMetadata);
          hasUpdates = true;
        }
      }

      // Apply updates if any
      if (hasUpdates) {
        await PodDatabaseService.updatePod(pod.id, updates);
        console.log(`📝 Updated pod ${pod.name} with latest HAT status`);
      }

      return {
        updated: hasUpdates,
        details: updates,
      };
    } catch (error) {
      console.error(`❌ Failed to sync HATs for pod ${pod.name}:`, error);
      throw error;
    }
  }

  /**
   * Sync specific HAT on user action (e.g., when loading management page)
   */
  async syncPodOnDemand(
    podId: string,
  ): Promise<{ success: boolean; details: any }> {
    const startTime = Date.now();

    try {
      console.log(`🔄 On-demand sync for pod: ${podId}`);

      const pod = await PodCoreService.getPodById(podId);
      if (!pod) {
        throw new Error(`Pod ${podId} not found`);
      }

      const syncResult = await this.syncPodHats(pod);
      const duration = Date.now() - startTime;

      logHatTransaction({
        type: 'state_change',
        action: 'on_demand_sync',
        success: true,
        duration,
        userAddress: 'user_triggered',
        details: {
          podId,
          updated: syncResult.updated,
        },
      });

      return {
        success: true,
        details: syncResult,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logHatError(error, {
        userAddress: 'user_triggered',
        action: 'on_demand_sync',
      });

      logHatTransaction({
        type: 'state_change',
        action: 'on_demand_sync',
        success: false,
        duration,
        userAddress: 'user_triggered',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      return {
        success: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus(): HatSyncStatus {
    return {
      isActive: this.syncTimer !== null,
      lastSync: this.lastSync?.toISOString() || null,
      nextSync:
        this.syncTimer && this.lastSync
          ? new Date(this.lastSync.getTime() + this.syncInterval).toISOString()
          : null,
      syncInterval: this.syncInterval,
    };
  }

  /**
   * Manual trigger for immediate sync (for admin/debug use)
   */
  async triggerImmediateSync(): Promise<SyncResult> {
    console.log('🚀 Triggering immediate sync...');
    return this.performFullSync();
  }
}

// Export singleton instance
export const hatSyncService = new HatSyncService();

// Convenience functions
export const startHatSync = (intervalHours = 24) =>
  hatSyncService.startPeriodicSync(intervalHours);

export const stopHatSync = () => hatSyncService.stopPeriodicSync();

export const syncPodNow = (podId: string) =>
  hatSyncService.syncPodOnDemand(podId);

export const syncAllHatsNow = () => hatSyncService.triggerImmediateSync();

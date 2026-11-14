import { supabase } from '../../../utils/supabaseClient';

/**
 * Pod status helpers used by PodCoreService and usePods.
 *
 * This file previously also held a one-off migration of a specific hat tree
 * into the pods table. That migration is complete and was removed; pods are
 * now created through the normal creation flow and the database is the
 * source of truth for which hats belong to which pod.
 */
export class HatsMigrationService {
  /**
   * Scanning the chain for hats that have no pod row is disabled: the scan
   * made hundreds of RPC calls and caused app-wide rate limiting.
   */
  static async importOrphanedHats(_creatorAddress: string): Promise<void> {
    throw new Error(
      'Scanning for orphaned hats is disabled because it caused app-wide RPC rate limiting.',
    );
  }

  /** Deactivate a pod (set status to inactive). */
  static async deactivatePod(podId: string): Promise<void> {
    await this.setStatus(podId, 'inactive', 'deactivated_at');
  }

  /** Reactivate a pod (set status back to active). */
  static async reactivatePod(podId: string): Promise<void> {
    await this.setStatus(podId, 'active', 'reactivated_at');
  }

  private static async setStatus(
    podId: string,
    status: 'active' | 'inactive',
    timestampKey: 'deactivated_at' | 'reactivated_at',
  ): Promise<void> {
    try {
      const { data: currentPod, error: fetchError } = await supabase
        .from('pods')
        .select('pod_metadata')
        .eq('id', podId)
        .single();
      if (fetchError) throw fetchError;

      const updatedMetadata = {
        ...(currentPod?.pod_metadata || {}),
        [timestampKey]: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('pods')
        .update({ status, pod_metadata: updatedMetadata })
        .eq('id', podId);
      if (error) throw error;
    } catch (error) {
      console.error(`❌ Failed to set pod ${podId} to ${status}:`, error);
      throw error;
    }
  }
}

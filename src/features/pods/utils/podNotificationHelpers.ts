import { supabase } from '@/utils/supabaseClient';

/**
 * Pod Notification Helpers
 *
 * Utilities for pod-related notifications, extracted from legacy notificationService.ts
 * as part of Phase 2 consolidation.
 *
 * @see PHASE_2_NOTIFICATION_CONSOLIDATION_PLAN.md
 */

export interface ExecutiveManager {
  wallet_address: string;
}

/**
 * Get executive pod managers for notifications
 *
 * Migrated from legacy notificationService.getFulfillmentManagers('exec')
 *
 * This function retrieves all users who are leaders of the executive pod,
 * used for sending pod approval notifications and other executive-level alerts.
 *
 * @returns Array of executive managers with their wallet addresses
 *
 * @example
 * ```typescript
 * const executives = await getExecutivePodManagers();
 * for (const exec of executives) {
 *   await unifiedNotificationService.createNotification({
 *     recipient_address: exec.wallet_address,
 *     // ... notification details
 *   });
 * }
 * ```
 */
export async function getExecutivePodManagers(): Promise<ExecutiveManager[]> {
  try {
    console.log('🔍 Fetching executive pod managers...');

    // Strategy 1: Try active_pod_members table first (indexed membership data)
    try {
      const { data: activeMembersData, error: activeMembersError } =
        await supabase
          .from('active_pod_members')
          .select('wallet')
          .eq('pod_id', 'exec')
          .eq('membership_type', 'leader');

      if (
        !activeMembersError &&
        activeMembersData &&
        activeMembersData.length > 0
      ) {
        console.log(
          `✅ Found ${activeMembersData.length} executive managers from active_pod_members`,
        );
        return activeMembersData.map((member) => ({
          wallet_address: member.wallet,
        }));
      }

      // If error is not "table doesn't exist", throw it
      if (activeMembersError && activeMembersError.code !== '42P01') {
        throw activeMembersError;
      }

      console.log(
        '⚠️ active_pod_members table not found or empty, falling back to pods table',
      );
    } catch (indexedError) {
      console.log('⚠️ Indexed lookup failed, falling back to pods table');
    }

    // Strategy 2: Fallback to pods table (pod_leads array)
    const { data: podData, error: podError } = await supabase
      .from('pods')
      .select('pod_leads')
      .eq('id', 'exec')
      .eq('is_active', true)
      .single();

    if (podError) {
      // If executive pod doesn't exist, this is a critical error
      if (podError.code === 'PGRST116') {
        console.error('❌ Executive pod not found in database');
        return [];
      }
      throw podError;
    }

    if (!podData?.pod_leads || podData.pod_leads.length === 0) {
      console.warn('⚠️ Executive pod exists but has no leaders assigned');
      return [];
    }

    console.log(
      `✅ Found ${podData.pod_leads.length} executive managers from pods.pod_leads`,
    );
    return podData.pod_leads.map((wallet) => ({ wallet_address: wallet }));
  } catch (error) {
    console.error('❌ Error fetching executive pod managers:', error);

    // Return empty array instead of throwing to prevent notification failures
    // from breaking critical workflows (pod creation, etc.)
    return [];
  }
}

/**
 * Get pod managers for any pod (not just executive)
 *
 * Generic version of the executive manager lookup that works for any pod.
 *
 * @param podId - The ID of the pod to get managers for
 * @returns Array of managers with their wallet addresses
 */
export async function getPodManagers(
  podId: string,
): Promise<ExecutiveManager[]> {
  try {
    console.log(`🔍 Fetching managers for pod: ${podId}`);

    // Strategy 1: Try active_pod_members table first
    try {
      const { data: activeMembersData, error: activeMembersError } =
        await supabase
          .from('active_pod_members')
          .select('wallet')
          .eq('pod_id', podId)
          .eq('membership_type', 'leader');

      if (
        !activeMembersError &&
        activeMembersData &&
        activeMembersData.length > 0
      ) {
        console.log(
          `✅ Found ${activeMembersData.length} managers from active_pod_members`,
        );
        return activeMembersData.map((member) => ({
          wallet_address: member.wallet,
        }));
      }

      if (activeMembersError && activeMembersError.code !== '42P01') {
        throw activeMembersError;
      }
    } catch (indexedError) {
      console.log('⚠️ Indexed lookup failed, falling back to pods table');
    }

    // Strategy 2: Fallback to pods table
    const { data: podData, error: podError } = await supabase
      .from('pods')
      .select('pod_leads')
      .eq('id', podId)
      .single();

    if (podError) {
      if (podError.code === 'PGRST116') {
        console.error(`❌ Pod ${podId} not found in database`);
        return [];
      }
      throw podError;
    }

    if (!podData?.pod_leads || podData.pod_leads.length === 0) {
      console.warn(`⚠️ Pod ${podId} exists but has no leaders assigned`);
      return [];
    }

    console.log(
      `✅ Found ${podData.pod_leads.length} managers from pods.pod_leads`,
    );
    return podData.pod_leads.map((wallet) => ({ wallet_address: wallet }));
  } catch (error) {
    console.error(`❌ Error fetching pod managers for ${podId}:`, error);
    return [];
  }
}

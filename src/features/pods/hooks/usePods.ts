import { useState, useEffect, useCallback } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { PodCoreService } from '../services/PodCoreService';
import { HatsMigrationService } from '../services/hatsMigrationService';
import type { Pod } from '../types';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { hasBetaTesterSuperuser } from '@/utils/betaTesterUtils';

export interface UsePodsConfig {
  filter?: 'all' | 'active' | 'draft' | 'proposed' | 'inactive';
  includeInactive?: boolean;
  userLeadershipOnly?: boolean;
}

export interface UsePodsReturn {
  pods: Pod[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  handleMigration: () => Promise<void>;
  handlePodToggle: (podId: string, currentStatus: string) => Promise<void>;
  canUserManagePod: (pod: Pod) => boolean;
  isMigrating: boolean;
  migrationMessage: string | null;
  processingPods: Set<string>;
}

/**
 * Optimized hook for pod loading and management
 * Consolidates logic from main pods page for better reusability
 */
export function usePods(config: UsePodsConfig = {}): UsePodsReturn {
  const { evmAddress: address } = useEvmAddress();
  const { userHats, userRoles } = useHatPermissions();
  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Migration state
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);

  // Pod operations state
  const [processingPods, setProcessingPods] = useState<Set<string>>(new Set());

  /**
   * Check if user has Executive Pod Leader access
   */
  const hasExecutivePodAccess = useCallback(() => {
    if (!address) return false;

    // Check if user is Executive Pod leader via HAT
    const EXECUTIVE_POD_LEADER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;
    const hasExecHat = userHats?.some(
      (hat) => hat.toLowerCase() === EXECUTIVE_POD_LEADER_HAT?.toLowerCase()
    );

    if (hasExecHat) {
      return true;
    }

    // Check via roles (Executive Pod membership)
    const hasExecRole = userRoles?.some(
      (role) => role.name === 'Executive Pod Leader' ||
                role.name?.includes('Executive Pod')
    );

    return hasExecRole || false;
  }, [address, userHats, userRoles]);

  /**
   * Load pods with current configuration
   */
  const loadPods = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔄 Loading pods with config:', config);

      let allPods: Pod[] = [];

      if (config.userLeadershipOnly && address) {
        // Get pods where user has leadership access
        allPods = await PodCoreService.getUserLeadershipPods(address);
      } else {
        // Get all pods with filtering
        const serviceConfig = {
          status: config.filter === 'all' ? undefined : config.filter,
          includeInactive:
            config.includeInactive || config.filter === 'inactive',
        };
        allPods = await PodCoreService.getAllPods(serviceConfig);
      }

      // VISIBILITY FILTERING: Hide Community Pod and Top Hat from non-executive members
      // 🔧 FIX: Use userHats instead of userRoles - Beta Tester is a standalone HAT
      const isBetaTester = hasBetaTesterSuperuser(userHats);
      const isExecutiveMember = hasExecutivePodAccess();

      // Only executive pod members (and not beta testers) should see Community Pod and Top Hat
      if (!isExecutiveMember && !isBetaTester) {
        allPods = allPods.filter(pod => {
          const podName = pod.name?.toLowerCase() || '';
          // Filter out Community Pod and Top Hat for non-exec members
          return podName !== 'community pod' && podName !== 'top hat';
        });
        console.log('🔒 Filtered pods for non-executive member');
      } else if (isBetaTester && !isExecutiveMember) {
        // Beta testers should NOT see Community Pod or Top Hat
        allPods = allPods.filter(pod => {
          const podName = pod.name?.toLowerCase() || '';
          return podName !== 'community pod' && podName !== 'top hat';
        });
        console.log('🧪 Filtered pods for beta tester (hiding Community Pod and Top Hat)');
      }

      console.log('📋 Loaded pods:', allPods.length);
      setPods(allPods);
    } catch (err) {
      console.error('Failed to load pods:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pods');
    } finally {
      setLoading(false);
    }
  }, [
    config.filter,
    config.includeInactive,
    config.userLeadershipOnly,
    address,
    userRoles,
    userHats,
    hasExecutivePodAccess,
  ]);

  /**
   * Handle HAT migration (import orphaned HATs)
   */
  const handleMigration = useCallback(async () => {
    if (!address) {
      setMigrationMessage('Please connect your wallet first');
      return;
    }

    setIsMigrating(true);
    setMigrationMessage(null);

    try {
      console.log('🔄 Starting orphaned HAT import...');
      await HatsMigrationService.importOrphanedHats(address);
      setMigrationMessage('✅ Orphaned HAT import completed successfully!');

      // Reload pods after migration
      await loadPods();
    } catch (error) {
      console.error('❌ Migration failed:', error);
      setMigrationMessage(
        error instanceof Error ? error.message : 'Migration failed',
      );
    } finally {
      setIsMigrating(false);
    }
  }, [address, loadPods]);

  /**
   * Handle pod activation/deactivation toggle
   */
  const handlePodToggle = useCallback(
    async (podId: string, currentStatus: string) => {
      if (!address) return;

      setProcessingPods((prev) => new Set(prev).add(podId));

      try {
        if (currentStatus === 'active') {
          await PodCoreService.deactivatePod(podId, address);
        } else {
          await PodCoreService.reactivatePod(podId, address);
        }

        // Reload pods to reflect status change
        await loadPods();
      } catch (error) {
        console.error('❌ Failed to toggle pod status:', error);
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to toggle pod status',
        );
      } finally {
        setProcessingPods((prev) => {
          const next = new Set(prev);
          next.delete(podId);
          return next;
        });
      }
    },
    [address, loadPods],
  );

  /**
   * Check if user can manage specific pod
   *
   * CRITICAL FIX: Now checks userRoles from useHatPermissions which loads from active_pod_members table
   * This properly detects leaders even if they're not in pod_leads array
   */
  const canUserManagePod = useCallback(
    (pod: Pod) => {
      if (!address) return false;

      // Check 1: Is user in pod_leads array? (backwards compatibility)
      const isInLeadsArray = pod.pod_leads?.some(
        (lead) => lead.toLowerCase() === address.toLowerCase()
      ) ?? false;

      // Check 2: Is user a leader of this pod via HAT-based membership?
      // userRoles comes from useHatPermissions which loads from active_pod_members
      const isLeaderViaHat = userRoles?.some(
        (role) => role.podId === pod.id && role.isLeaderRole
      ) ?? false;

      const isLeader = isInLeadsArray || isLeaderViaHat;

      if (isLeader) {
        console.log('👑 [Pods] User is leader of pod:', pod.name);
      }

      // BETA TESTING: Beta Testers can ONLY manage Beta Testers Pod
      // 🔧 FIX: Use userHats instead of userRoles - Beta Tester is a standalone HAT, not a pod role
      const isBetaTester = hasBetaTesterSuperuser(userHats);
      if (isBetaTester) {
        const isBetaTestersPod = pod.name?.toLowerCase() === 'beta testers pod';
        if (isBetaTestersPod) {
          console.log('👑 [Pods] Beta Tester can manage Beta Testers Pod');
          return true;
        }
        // Beta testers cannot manage other pods (even if they're leaders)
        console.log('🔒 [Pods] Beta Tester cannot manage non-beta pod:', pod.name);
        return false;
      }

      // If user is a leader, grant management access
      if (isLeader) {
        return true;
      }

      // Executive Pod members can manage all pods (including Community Pod and Top Hat)
      const isExecutiveMember = hasExecutivePodAccess();
      if (isExecutiveMember) {
        console.log('👑 [Pods] Executive Pod member can manage pod:', pod.name);
        return true;
      }

      return false;
    },
    [address, userHats, userRoles, hasExecutivePodAccess],
  );

  /**
   * Manual refetch function
   */
  const refetch = useCallback(async () => {
    await loadPods();
  }, [loadPods]);

  // Load pods on mount and when dependencies change
  useEffect(() => {
    loadPods();
  }, [loadPods]);

  return {
    pods,
    loading,
    error,
    refetch,
    handleMigration,
    handlePodToggle,
    canUserManagePod,
    isMigrating,
    migrationMessage,
    processingPods,
  };
}

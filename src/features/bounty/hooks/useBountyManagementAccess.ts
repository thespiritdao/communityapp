import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { usePodModules } from '@/features/pods/hooks/usePodModules';
import { supabase } from '@/lib/supabase';

interface Pod {
  id: string;
  name: string;
  hat_id?: string;
  management_hat_id?: string;
  created_by_address?: string;
  pod_leads?: string[];
  status?: string;
}

interface BountyService {
  getPods: () => Promise<Pod[]>;
}

export const BountyService: BountyService = {
  getPods: async () => {
    const { data, error } = await supabase
      .from('pods')
      .select('*')
      // Don't filter by is_active - match Events behavior
      // Some pods may have is_active = false but still need bounty management
      .order('name', { ascending: true });

    if (error) {
      console.error('💰 [Bounties] Error fetching pods:', error);
      throw error;
    }

    console.log('💰 [Bounties] Loaded pods from database:', data?.length || 0);
    console.log(
      '💰 [Bounties] Pod names:',
      data?.map((p) => `${p.name} (${p.id})`).join(', '),
    );

    return data || [];
  },
};

export interface UseBountyManagementAccessReturn {
  managedPods: Pod[];
  isLoading: boolean;
  refreshAccess: () => Promise<void>;
  hasAccessToPod: (podId: string) => boolean;
}

/**
 * Hook for checking bounty management access with pod-specific permissions and module checks
 *
 * Permission Hierarchy:
 * 1. Module Level (pod-wide): bounties_enabled must be true
 * 2. Permission Level (role-specific): bountyManagement permission must be granted
 *
 * Both conditions must be satisfied for a user to manage bounties in a pod.
 */
export function useBountyManagementAccess(): UseBountyManagementAccessReturn {
  const { address } = useAccount();
  const { userRoles, isLoading: hatPermissionsLoading } = useHatPermissions();
  const { modules, loading: modulesLoading } = usePodModules();

  const [managedPods, setManagedPods] = useState<Pod[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create stable string representation of bounty modules to prevent infinite loops
  const bountiesModulesKey = useMemo(() => {
    const podIds = Object.keys(modules).sort();
    return podIds
      .map(
        (podId) => `${podId}:${modules[podId]?.bounties_enabled ? '1' : '0'}`,
      )
      .join(',');
  }, [modules]);

  const checkManagementAccess = useCallback(async () => {
    if (!address || hatPermissionsLoading || modulesLoading) {
      setManagedPods([]);
      setIsLoading(true);
      return;
    }

    try {
      setIsLoading(true);

      // Debug: Check modules data
      console.log('💰 [Bounties] Modules data:', {
        modulesCount: Object.keys(modules).length,
        modulesPodIds: Object.keys(modules),
        modulesData: modules,
      });

      // Fetch all active pods
      const allPods = await BountyService.getPods();
      console.log(
        `💰 [Bounties] Checking ${allPods.length} pods for bounty access...`,
      );

      // Filter pods where user has both module enabled AND bounty management permission
      const podsWithPermission = allPods.filter((pod) => {
        // Filter out Top Hat and system pods
        if (
          pod.name === 'Top Hat' ||
          pod.name?.toLowerCase().includes('top hat')
        ) {
          console.log(`💰 [Bounties] Filtered out ${pod.name}: Top Hat`);
          return false;
        }

        // Filter out pods with hat IDs ending in all zeros (root/system hats)
        if (pod.hat_id?.endsWith('000000000000000000000000')) {
          console.log(
            `💰 [Bounties] Filtered out ${pod.name}: System pod (hat ends in zeros)`,
          );
          return false;
        }

        // Check 1: Pod module for Bounties is enabled (pod-wide)
        const moduleData = modules[pod.id];
        const hasBountiesModule = moduleData?.bounties_enabled ?? false;

        // Check 2: User has bountyManagement permission (role-specific)
        const podRoles = userRoles.filter((role) => role.podId === pod.id);
        const hasPermission = podRoles.some(
          (role) => role.permissions?.bountyManagement,
        );

        console.log(
          `💰 [Bounties] Pod "${pod.name}" (${pod.id.substring(0, 8)}...):`,
          {
            module: hasBountiesModule,
            permission: hasPermission,
            moduleDataExists: !!moduleData,
            moduleData: moduleData,
            podIdInModules: pod.id in modules,
          },
        );

        // Must satisfy BOTH conditions
        return hasBountiesModule && hasPermission;
      });

      setManagedPods(podsWithPermission);

      if (podsWithPermission.length === 0) {
        console.log(
          '💰 [Bounties] No pods with bounty management access found',
        );
      } else {
        console.log(
          `💰 [Bounties] Found ${podsWithPermission.length} manageable pods:`,
          podsWithPermission.map((p) => p.name).join(', '),
        );
      }
    } catch (error) {
      console.error('💰 [Bounties] Error checking management access:', error);
      setManagedPods([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    address,
    userRoles,
    hatPermissionsLoading,
    modulesLoading,
    bountiesModulesKey,
  ]);

  // Check access when dependencies change
  useEffect(() => {
    checkManagementAccess();
  }, [checkManagementAccess]);

  // Helper function to check if user has access to a specific pod
  const hasAccessToPod = useCallback(
    (podId: string): boolean => {
      return managedPods.some((pod) => pod.id === podId);
    },
    [managedPods],
  );

  return {
    managedPods,
    isLoading,
    refreshAccess: checkManagementAccess,
    hasAccessToPod,
  };
}

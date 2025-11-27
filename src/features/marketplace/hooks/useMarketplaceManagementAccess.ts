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
  treasury_contract_address?: string;
}

interface MarketplaceService {
  getPods: () => Promise<Pod[]>;
}

export const MarketplaceService: MarketplaceService = {
  getPods: async () => {
    const { data, error } = await supabase
      .from('pods')
      .select('*')
      // Don't filter by is_active - match Events/Bounties behavior
      .order('name', { ascending: true });

    if (error) {
      console.error('🏪 [Marketplace] Error fetching pods:', error);
      throw error;
    }

    console.log('🏪 [Marketplace] Loaded pods from database:', data?.length || 0);
    console.log('🏪 [Marketplace] Pod names:', data?.map(p => `${p.name} (${p.id})`).join(', '));

    return data || [];
  }
};

export interface UseMarketplaceManagementAccessReturn {
  managedPods: Pod[];
  isLoading: boolean;
  refreshAccess: () => Promise<void>;
  hasAccessToPod: (podId: string) => boolean;
}

/**
 * Hook for checking marketplace management access with pod-specific permissions and module checks
 *
 * Permission Hierarchy:
 * 1. Module Level (pod-wide): marketplace_enabled must be true
 * 2. Permission Level (role-specific): marketplaceAccess permission must be granted
 *
 * Both conditions must be satisfied for a user to manage marketplace in a pod.
 */
export function useMarketplaceManagementAccess(): UseMarketplaceManagementAccessReturn {
  const { address } = useAccount();
  const { userRoles, isLoading: hatPermissionsLoading } = useHatPermissions();
  const { modules, loading: modulesLoading } = usePodModules();

  const [managedPods, setManagedPods] = useState<Pod[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create stable string representation of marketplace modules to prevent infinite loops
  const marketplaceModulesKey = useMemo(() => {
    const podIds = Object.keys(modules).sort();
    return podIds.map(podId => `${podId}:${modules[podId]?.marketplace_enabled ? '1' : '0'}`).join(',');
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
      console.log('🏪 [Marketplace] Modules data:', {
        modulesCount: Object.keys(modules).length,
        modulesPodIds: Object.keys(modules),
        modulesData: modules
      });

      // Fetch all pods
      const allPods = await MarketplaceService.getPods();
      console.log(`🏪 [Marketplace] Checking ${allPods.length} pods for marketplace access...`);

      // Filter pods where user has both module enabled AND marketplace management permission
      const podsWithPermission = allPods.filter(pod => {
        // Filter out Top Hat and system pods
        if (pod.name === 'Top Hat' || pod.name?.toLowerCase().includes('top hat')) {
          console.log(`🏪 [Marketplace] Filtered out ${pod.name}: Top Hat`);
          return false;
        }

        // Filter out pods with hat IDs ending in all zeros (root/system hats)
        if (pod.hat_id?.endsWith('000000000000000000000000')) {
          console.log(`🏪 [Marketplace] Filtered out ${pod.name}: System pod (hat ends in zeros)`);
          return false;
        }

        // Check 1: Pod module for Marketplace is enabled (pod-wide)
        const moduleData = modules[pod.id];
        const hasMarketplaceModule = moduleData?.marketplace_enabled ?? false;

        // Check 2: User has marketplaceAccess permission (role-specific)
        const podRoles = userRoles.filter(role => role.podId === pod.id);
        const hasPermission = podRoles.some(role => role.permissions?.marketplaceAccess);

        console.log(`🏪 [Marketplace] Pod "${pod.name}" (${pod.id.substring(0, 8)}...):`, {
          module: hasMarketplaceModule,
          permission: hasPermission,
          moduleDataExists: !!moduleData,
          moduleData: moduleData,
          podIdInModules: pod.id in modules
        });

        // Must satisfy BOTH conditions
        return hasMarketplaceModule && hasPermission;
      });

      setManagedPods(podsWithPermission);

      if (podsWithPermission.length === 0) {
        console.log('🏪 [Marketplace] No pods with marketplace management access found');
      } else {
        console.log(`🏪 [Marketplace] Found ${podsWithPermission.length} manageable pods:`,
          podsWithPermission.map(p => p.name).join(', '));
      }
    } catch (error) {
      console.error('🏪 [Marketplace] Error checking management access:', error);
      setManagedPods([]);
    } finally {
      setIsLoading(false);
    }
  }, [address, userRoles, hatPermissionsLoading, modulesLoading, marketplaceModulesKey]);

  // Check access when dependencies change
  useEffect(() => {
    checkManagementAccess();
  }, [checkManagementAccess]);

  // Helper function to check if user has access to a specific pod
  const hasAccessToPod = useCallback((podId: string): boolean => {
    return managedPods.some(pod => pod.id === podId);
  }, [managedPods]);

  return {
    managedPods,
    isLoading,
    refreshAccess: checkManagementAccess,
    hasAccessToPod
  };
}

/**
 * Hook for checking pod permissions using the Factory pattern
 * Replaces old authorization system with scalable factory-based permissions
 */

import { useState, useEffect } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { PodFactorySyncService } from '../services/PodFactorySyncService';

interface PodFactoryPermissions {
  canManageBounties: boolean;
  canUseTreasury: boolean;
  isLoading: boolean;
  error: string | null;
}

export function usePodFactoryPermissions(
  podId: string | null,
): PodFactoryPermissions {
  const address = useUserWallet();
  const [permissions, setPermissions] = useState<PodFactoryPermissions>({
    canManageBounties: false,
    canUseTreasury: false,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    async function checkPermissions() {
      if (!address || !podId || podId.trim() === '') {
        setPermissions({
          canManageBounties: false,
          canUseTreasury: false,
          isLoading: false,
          error: null,
        });
        return;
      }

      try {
        setPermissions((prev) => ({ ...prev, isLoading: true, error: null }));

        console.log(
          `🔍 Checking factory permissions for user ${address} on pod ${podId}`,
        );

        // Check permissions via factory contract
        const [canManageBounties, canUseTreasury] = await Promise.all([
          PodFactorySyncService.canManageBounties(address, podId),
          PodFactorySyncService.canUsePodTreasury(address, podId),
        ]);

        console.log(`✅ Factory permissions for ${podId}:`, {
          canManageBounties,
          canUseTreasury,
        });

        setPermissions({
          canManageBounties,
          canUseTreasury,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        console.error('Error checking factory permissions:', error);
        setPermissions({
          canManageBounties: false,
          canUseTreasury: false,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    checkPermissions();
  }, [address, podId]);

  return permissions;
}

// Convenience hook that matches the old interface for easy migration
export function usePodPermissions(podId: string) {
  const permissions = usePodFactoryPermissions(podId);

  return {
    canManageBounties: permissions.canManageBounties,
    canUseTreasury: permissions.canUseTreasury,
    isLoading: permissions.isLoading,
    error: permissions.error,
  };
}

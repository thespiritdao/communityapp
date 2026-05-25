/**
 * Hook for checking bounty permissions using DATABASE permissions (not on-chain factory)
 *
 * This hook checks the user's role permissions from the database,
 * which are managed via the pod manage page.
 *
 * Use this instead of usePodFactoryPermissions when you want to respect
 * the permission toggles in the pod management UI.
 */

import { useMemo } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { useHatPermissions } from '@/hooks/useHatPermissions';

interface BountyPermissions {
  canManageBounties: boolean;
  canUseTreasury: boolean;
  isLoading: boolean;
}

export function useBountyPermissions(podId: string | null): BountyPermissions {
  const address = useUserWallet();
  const { userRoles, isLoading } = useHatPermissions();

  const permissions = useMemo(() => {
    if (!address || !podId || podId.trim() === '') {
      return {
        canManageBounties: false,
        canUseTreasury: false,
      };
    }

    // Get user's roles for this specific pod
    const podRoles = userRoles.filter((role) => role.podId === podId);

    console.log(`🔍 [Bounty Permissions] Checking database permissions for pod ${podId}:`, {
      address,
      podRolesCount: podRoles.length,
      roles: podRoles.map(r => ({
        name: r.role_name,
        bountyManagement: r.permissions?.bountyManagement,
        treasuryManagement: r.permissions?.treasuryManagement,
      })),
    });

    // Check if user has bountyManagement permission in any role for this pod
    const canManageBounties = podRoles.some(
      (role) => role.permissions?.bountyManagement === true,
    );

    // Check if user has treasuryManagement permission in any role for this pod
    const canUseTreasury = podRoles.some(
      (role) => role.permissions?.treasuryManagement === true,
    );

    console.log(`✅ [Bounty Permissions] Result:`, {
      canManageBounties,
      canUseTreasury,
    });

    return {
      canManageBounties,
      canUseTreasury,
    };
  }, [address, podId, userRoles]);

  return {
    ...permissions,
    isLoading,
  };
}

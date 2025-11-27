'use client';

import { useMemo } from 'react';
import { useHatPermissions } from './useHatPermissions';
import type { HatPermissions } from '@/services/hatPermissionsService';

/**
 * Hook for checking a specific permission in a specific pod
 * Uses the unified database permission system
 *
 * @example
 * const canCreateBounty = usePodPermission('pod-id-123', 'bountyManagement');
 * const canVote = usePodPermission('pod-id-456', 'governanceParticipation');
 */
export function usePodPermission(
  podId: string | null | undefined,
  permissionKey: keyof HatPermissions
): boolean {
  const { userRoles } = useHatPermissions();

  const hasPermission = useMemo(() => {
    if (!podId || !userRoles || userRoles.length === 0) {
      return false;
    }

    // Check if user has a role in this pod with the required permission
    const hasAccess = userRoles.some(role => {
      const roleMatches = role.podId === podId;
      const permissionGranted = role.permissions?.[permissionKey] === true;

      if (roleMatches) {
        console.log(`🔐 Permission check for ${podId}:`, {
          permissionKey,
          roleName: role.roleName,
          roleHasPermission: permissionGranted,
          allPermissions: role.permissions
        });
      }

      return roleMatches && permissionGranted;
    });

    return hasAccess;
  }, [podId, permissionKey, userRoles]);

  return hasPermission;
}

/**
 * Hook for checking multiple permissions in a pod at once
 * Returns an object with boolean values for each permission
 *
 * @example
 * const permissions = usePodPermissions('pod-id-123', [
 *   'bountyManagement',
 *   'treasuryManagement',
 *   'memberManagement'
 * ]);
 * // permissions = { bountyManagement: true, treasuryManagement: false, ... }
 */
export function usePodPermissions(
  podId: string | null | undefined,
  permissionKeys: (keyof HatPermissions)[]
): Record<string, boolean> {
  const { userRoles } = useHatPermissions();

  const permissions = useMemo(() => {
    if (!podId || !userRoles || userRoles.length === 0) {
      return Object.fromEntries(
        permissionKeys.map(key => [key, false])
      );
    }

    // Find the user's role in this pod
    const podRole = userRoles.find(role => role.podId === podId);

    if (!podRole) {
      return Object.fromEntries(
        permissionKeys.map(key => [key, false])
      );
    }

    console.log(`🔐 Multi-permission check for ${podId}:`, {
      roleName: podRole.roleName,
      requestedPermissions: permissionKeys,
      rolePermissions: podRole.permissions
    });

    // Return object with requested permission values
    return Object.fromEntries(
      permissionKeys.map(key => [
        key,
        podRole.permissions?.[key] === true
      ])
    );
  }, [podId, permissionKeys, userRoles]);

  return permissions;
}

/**
 * Hook for getting the user's role in a specific pod
 * Returns the full role object including all permissions
 *
 * @example
 * const role = usePodRole('pod-id-123');
 * if (role?.isLeaderRole) {
 *   // User is a leader
 * }
 */
export function usePodRole(podId: string | null | undefined) {
  const { userRoles } = useHatPermissions();

  const role = useMemo(() => {
    if (!podId || !userRoles || userRoles.length === 0) {
      return null;
    }

    return userRoles.find(role => role.podId === podId) || null;
  }, [podId, userRoles]);

  return role;
}

/**
 * Hook for checking if user is a member of a pod (any role)
 *
 * @example
 * const isMember = useIsPodMember('pod-id-123');
 */
export function useIsPodMember(podId: string | null | undefined): boolean {
  const role = usePodRole(podId);
  return role !== null;
}

/**
 * Hook for checking if user is a leader of a pod
 *
 * @example
 * const isLeader = useIsPodLeader('pod-id-123');
 */
export function useIsPodLeader(podId: string | null | undefined): boolean {
  const role = usePodRole(podId);
  return role?.isLeaderRole === true;
}

/**
 * Hook for getting all pods the user is a member of
 *
 * @example
 * const myPods = useUserPods();
 * // Returns: [{ podId: 'pod-1', roleName: 'Leader', ... }, ...]
 */
export function useUserPods() {
  const { userRoles } = useHatPermissions();

  return useMemo(() => {
    if (!userRoles || userRoles.length === 0) {
      return [];
    }

    // Return unique pods (user might have multiple roles in same pod theoretically)
    const podMap = new Map();
    userRoles.forEach(role => {
      if (role.podId && !podMap.has(role.podId)) {
        podMap.set(role.podId, role);
      }
    });

    return Array.from(podMap.values());
  }, [userRoles]);
}

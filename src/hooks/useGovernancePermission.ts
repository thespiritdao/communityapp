'use client';

import { useMemo } from 'react';
import { useHatPermissions } from './useHatPermissions';

/**
 * Hook for checking governance participation permission in a specific pod
 *
 * ARCHITECTURE:
 * - DAO-wide governance: Pass podId = EXECUTIVE_POD_ID (or omit for default)
 * - Pod-level governance: Pass podId = specific pod's ID
 *
 * Users must have:
 * 1. Membership in the specified pod
 * 2. governanceParticipation permission set to true in that pod
 *
 * This enables:
 * - Executive Pod: DAO-wide governance, approving new pods
 * - Other Pods: Self-governance, internal proposals
 *
 * @param podId - Optional pod ID to check. Defaults to Executive Pod from env
 * @param context - Optional context string for logging (e.g., "pod_creation", "pod_internal")
 *
 * @example
 * // Check DAO-wide governance (Executive Pod)
 * const { canParticipate } = useGovernancePermission();
 *
 * // Check pod-level governance (specific pod)
 * const { canParticipate } = useGovernancePermission(podId, "pod_internal");
 */
export function useGovernancePermission(
  podId?: string | null,
  context?: string
) {
  const { userRoles, isLoading } = useHatPermissions();

  // Use provided podId, or fall back to Executive Pod from env
  const execPodId = process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID;
  const targetPodId = podId || execPodId;

  const result = useMemo(() => {
    if (!targetPodId) {
      console.warn('⚠️ No pod ID provided and NEXT_PUBLIC_GOVERNANCE_POD_ID not configured');
      return {
        canParticipate: false,
        canCreateProposal: false,
        canVote: false,
        governancePodId: null,
        governanceRole: null,
        isLoading: false,
        error: 'No governance pod specified'
      };
    }

    if (isLoading || !userRoles || userRoles.length === 0) {
      return {
        canParticipate: false,
        canCreateProposal: false,
        canVote: false,
        governancePodId: targetPodId,
        governanceRole: null,
        isLoading: true,
        error: null
      };
    }

    // Find user's role in the target pod
    const governanceRole = userRoles.find(role => role.podId === targetPodId);

    if (!governanceRole) {
      console.log(`ℹ️ User is not a member of pod ${targetPodId}${context ? ` (${context})` : ''}`);
      return {
        canParticipate: false,
        canCreateProposal: false,
        canVote: false,
        governancePodId: targetPodId,
        governanceRole: null,
        isLoading: false,
        error: null
      };
    }

    // Check governanceParticipation permission
    const hasPermission = governanceRole.permissions?.governanceParticipation === true;

    console.log('🏛️ Governance Permission Check:', {
      context: context || 'default',
      governancePodId: targetPodId,
      roleName: governanceRole.roleName,
      hasPermission,
      allPermissions: Object.keys(governanceRole.permissions || {})
    });

    return {
      canParticipate: hasPermission,
      canCreateProposal: hasPermission,
      canVote: hasPermission,
      governancePodId: targetPodId,
      governanceRole,
      isLoading: false,
      error: null
    };
  }, [userRoles, isLoading, targetPodId, context]);

  return result;
}

/**
 * Hook for checking if user is a member of the governance pod
 * (regardless of permission)
 *
 * @example
 * const isGovernanceMember = useIsGovernanceMember();
 */
export function useIsGovernanceMember(): boolean {
  const { userRoles } = useHatPermissions();
  const governancePodId = process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID;

  return useMemo(() => {
    if (!governancePodId || !userRoles || userRoles.length === 0) {
      return false;
    }

    return userRoles.some(role => role.podId === governancePodId);
  }, [userRoles, governancePodId]);
}

/**
 * Hook for checking if user is a leader of the governance pod
 *
 * @example
 * const isGovernanceLeader = useIsGovernanceLeader();
 */
export function useIsGovernanceLeader(): boolean {
  const { userRoles } = useHatPermissions();
  const governancePodId = process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID;

  return useMemo(() => {
    if (!governancePodId || !userRoles || userRoles.length === 0) {
      return false;
    }

    const governanceRole = userRoles.find(role => role.podId === governancePodId);
    return governanceRole?.isLeaderRole === true;
  }, [userRoles, governancePodId]);
}

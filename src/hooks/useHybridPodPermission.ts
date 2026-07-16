'use client';

import { useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { usePodPermission } from './usePodPermission';
import { useHatPermissions } from './useHatPermissions';
import { usePodEligibilityAgreements } from '@/features/pods/hooks/usePodEligibilityAgreements';
import { HATS_PROTOCOL_ADDRESS } from '@/constants/hatsProtocol';
import HatsProtocolABI from '@/abis/HatsProtocol.json';
import type { HatPermissions } from '@/services/hatPermissionsService';
import { useUserWallet } from './useUserWallet';
import { useDatabaseFirstPermissions } from './useDatabaseFirstPermissions';

/**
 * Hybrid Permission Hook - Security Model for Fund-Related Features
 *
 * This hook implements a two-factor permission check:
 * 1. ON-CHAIN: Verifies user currently holds the required HAT token (source of truth)
 * 2. DATABASE: Checks fine-grained permission flags
 *
 * Both checks must pass for features involving funds or critical operations.
 *
 * @param podId - The pod identifier
 * @param permissionKey - The permission to check (e.g., 'bountyManagement')
 * @returns boolean - true only if user has BOTH on-chain HAT AND database permission
 *
 * @example
 * // For bounty management (involves funds)
 * const canManageBounties = useHybridPodPermission('pod-123', 'bountyManagement');
 *
 * @security
 * Use this hook for ANY feature that:
 * - Allocates or manages funds
 * - Interacts with treasury
 * - Creates paid events
 * - Manages marketplace transactions
 * - Any operation where losing HAT should IMMEDIATELY revoke access
 */
export function useHybridPodPermission(
  podId: string | null | undefined,
  permissionKey: keyof HatPermissions,
): { hasPermission: boolean; isLoading: boolean; error: string | null } {
  // Use the canonical wallet for the on-chain hat balance check.
  // The canonical wallet is what holds the user's hats; the per-device
  // CDP wallet from useEvmAddress() doesn't.
  // See docs/spec-platform-identity-multi-wallet.md.
  const userWallet = useUserWallet();
  const address = (userWallet ?? undefined) as `0x${string}` | undefined;

  // Executive Pod Leaders have unfettered access to every pod's management,
  // consistent with useDatabaseFirstPermissions.canManagePodSync (which already
  // grants execs access and is what lets them REACH a pod's manage page). An
  // exec by definition won't hold the target pod's hat, so this override must
  // bypass the per-pod hat/role check below.
  const { isExecutiveLeader } = useDatabaseFirstPermissions();

  // Step 1: Get user's roles and HAT IDs from database
  const { userRoles, isLoading: rolesLoading } = useHatPermissions();

  // Step 2: Check database permission
  const hasDbPermission = usePodPermission(podId, permissionKey);

  // Step 3: Check agreement signatures (NEW - for accountability)
  const { hasUnsignedAgreements, loading: agreementsLoading } =
    usePodEligibilityAgreements(podId || '');

  // Step 4: Find the HAT ID for this pod
  const podRole = useMemo(() => {
    if (!podId || !userRoles || userRoles.length === 0) {
      return null;
    }
    return userRoles.find((role) => role.podId === podId);
  }, [podId, userRoles]);

  // Step 5: Check on-chain HAT ownership (if we have a HAT ID)
  const {
    data: hatBalance,
    isLoading: hatLoading,
    error: hatError,
  } = useReadContract({
    address: HATS_PROTOCOL_ADDRESS,
    abi: HatsProtocolABI,
    functionName: 'balanceOf',
    args: address && podRole?.hatId ? [address, podRole.hatId] : undefined,
    query: {
      enabled: Boolean(address && podRole?.hatId),
      // Cache for 10 seconds - balance can change if HAT is revoked
      staleTime: 10_000,
    },
  });

  // Compute final permission
  const result = useMemo(() => {
    // If still loading, return loading state
    if (rolesLoading || (podRole && hatLoading) || agreementsLoading) {
      return {
        hasPermission: false,
        isLoading: true,
        error: null,
      };
    }

    // If no wallet connected, no permission
    if (!address) {
      return {
        hasPermission: false,
        isLoading: false,
        error: null,
      };
    }

    // If no pod selected, no permission
    if (!podId) {
      return {
        hasPermission: false,
        isLoading: false,
        error: null,
      };
    }

    // Executive Pod Leaders get full access to every pod, even pods where they
    // hold no role/hat. This mirrors canManagePodSync's exec override and
    // bypasses the per-pod hat + DB + agreement checks below.
    if (isExecutiveLeader) {
      return {
        hasPermission: true,
        isLoading: false,
        error: null,
      };
    }

    // If user has no role in this pod, no permission
    if (!podRole) {
      console.log(`🔐 Hybrid check: No role found for pod ${podId}`);
      return {
        hasPermission: false,
        isLoading: false,
        error: null,
      };
    }

    // Check on-chain HAT balance
    const hasHat = hatBalance !== undefined && hatBalance !== null && (hatBalance as bigint) > 0n;

    // ✅ THREE-FACTOR CHECK: HAT + DB Permission + Agreement Signatures
    const allChecksPass = hasHat && hasDbPermission && !hasUnsignedAgreements;

    // Log the check for debugging
    console.log(`🔐 Hybrid permission check for ${podId}:`, {
      permissionKey,
      hasDbPermission,
      hasHat,
      hasUnsignedAgreements,
      hatId: podRole.hatId,
      hatBalance: hatBalance?.toString(),
      allChecksPass,
    });

    // If there was an error checking HAT, fail closed (deny access)
    if (hatError) {
      console.error('❌ Error checking HAT ownership:', hatError);
      return {
        hasPermission: false,
        isLoading: false,
        error: 'Failed to verify role ownership on-chain',
      };
    }

    // If user has unsigned agreements, deny access with clear message
    if (hasUnsignedAgreements) {
      console.log('⚠️ Access denied - unsigned agreements required');
      return {
        hasPermission: false,
        isLoading: false,
        error:
          'You must sign required agreements before accessing this feature',
      };
    }

    // All three checks must pass: HAT + DB Permission + Agreements
    return {
      hasPermission: allChecksPass,
      isLoading: false,
      error: null,
    };
  }, [
    address,
    podId,
    podRole,
    permissionKey,
    hasDbPermission,
    hasUnsignedAgreements,
    hatBalance,
    hatLoading,
    rolesLoading,
    agreementsLoading,
    hatError,
    isExecutiveLeader,
  ]);

  return result;
}

/**
 * Hybrid Permission Hook - Multiple Permissions
 *
 * Check multiple permissions at once using hybrid verification.
 *
 * @param podId - The pod identifier
 * @param permissionKeys - Array of permissions to check
 * @returns Object with boolean values for each permission
 *
 * @example
 * const { bountyManagement, treasuryManagement } = useHybridPodPermissions(
 *   'pod-123',
 *   ['bountyManagement', 'treasuryManagement']
 * );
 */
export function useHybridPodPermissions(
  podId: string | null | undefined,
  permissionKeys: (keyof HatPermissions)[],
): Record<string, boolean> {
  const results = permissionKeys.map((key) => ({
    key,
    result: useHybridPodPermission(podId, key),
  }));

  return useMemo(() => {
    return Object.fromEntries(
      results.map(({ key, result }) => [key, result.hasPermission]),
    );
  }, [results]);
}

/**
 * Get user's role in a pod (hybrid - verifies HAT on-chain)
 *
 * @param podId - The pod identifier
 * @returns Role object if user has valid HAT, null otherwise
 */
export function useHybridPodRole(podId: string | null | undefined) {
  const userWallet = useUserWallet();
  const address = userWallet as `0x${string}` | null;
  const { userRoles } = useHatPermissions();

  const podRole = useMemo(() => {
    if (!podId || !userRoles || userRoles.length === 0) {
      return null;
    }
    return userRoles.find((role) => role.podId === podId);
  }, [podId, userRoles]);

  // Verify HAT ownership on-chain
  const { data: hatBalance, isLoading } = useReadContract({
    address: HATS_PROTOCOL_ADDRESS,
    abi: HatsProtocolABI,
    functionName: 'balanceOf',
    args: address && podRole?.hatId ? [address, podRole.hatId] : undefined,
    query: {
      enabled: Boolean(address && podRole?.hatId),
      staleTime: 10_000,
    },
  });

  return useMemo(() => {
    if (isLoading || !podRole) {
      return null;
    }

    const hasHat = hatBalance !== undefined && hatBalance !== null && (hatBalance as bigint) > 0n;
    return hasHat ? podRole : null;
  }, [podRole, hatBalance, isLoading]);
}

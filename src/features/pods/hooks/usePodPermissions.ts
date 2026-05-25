import { useMemo, useState, useEffect } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { PodCoreService } from '../services/PodCoreService';
import type { Pod } from '../types';
import { supabase } from '@/utils/supabaseClient';

export interface UsePodPermissionsConfig {
  pod: Pod | null;
  userAddress?: string;
}

export interface UsePodPermissionsReturn {
  canManagePod: boolean;
  canSign: boolean;
  canApply: boolean;
  isLeader: boolean;
  isMember: boolean;
  isCreator: boolean;
  permissions: {
    canEdit: boolean;
    canDeactivate: boolean;
    canDelete: boolean;
    canInviteMembers: boolean;
    canViewTreasury: boolean;
  };
}

/**
 * Hook for determining user permissions for a specific pod
 * Handles all permission-related logic in one place
 */
export function usePodPermissions({
  pod,
  userAddress,
}: UsePodPermissionsConfig): UsePodPermissionsReturn {
  const address = useUserWallet();

  // Use provided address or connected wallet address
  const effectiveAddress = userAddress || address;

  // CRITICAL FIX: Check pod_members table for leader status
  const [isLeaderInDB, setIsLeaderInDB] = useState<boolean | null>(null);
  const [isExecutiveLeader, setIsExecutiveLeader] = useState<boolean>(false);

  useEffect(() => {
    const checkLeadershipInDatabase = async () => {
      if (!pod || !effectiveAddress) {
        setIsLeaderInDB(null);
        setIsExecutiveLeader(false);
        return;
      }

      try {
        const normalizedAddress = effectiveAddress.toLowerCase();

        // Check if user is leader in this pod's pod_members table
        const { data: podMembership } = await supabase
          .from('pod_members')
          .select('membership_type, is_active')
          .eq('pod_id', pod.id)
          .eq('wallet', normalizedAddress)
          .eq('is_active', true)
          .maybeSingle();

        setIsLeaderInDB(podMembership?.membership_type === 'leader');

        // Check if user is Executive Pod leader (access to all pods)
        const { data: execPod } = await supabase
          .from('pods')
          .select('id')
          .eq('name', 'Executive Pod')
          .maybeSingle();

        if (execPod) {
          const { data: execMembership } = await supabase
            .from('pod_members')
            .select('membership_type, is_active')
            .eq('pod_id', execPod.id)
            .eq('wallet', normalizedAddress)
            .eq('is_active', true)
            .maybeSingle();

          setIsExecutiveLeader(execMembership?.membership_type === 'leader' || false);
        }
      } catch (error) {
        console.error('❌ Error checking pod leadership:', error);
        setIsLeaderInDB(null);
        setIsExecutiveLeader(false);
      }
    };

    checkLeadershipInDatabase();
  }, [pod, effectiveAddress]);

  const permissions = useMemo(() => {
    if (!pod || !effectiveAddress) {
      return {
        canManagePod: false,
        canSign: false,
        canApply: false,
        isLeader: false,
        isMember: false,
        isCreator: false,
        permissions: {
          canEdit: false,
          canDeactivate: false,
          canDelete: false,
          canInviteMembers: false,
          canViewTreasury: false,
        },
      };
    }

    // Check if user is the pod creator
    const isCreator =
      pod.created_by_address?.toLowerCase() === effectiveAddress.toLowerCase();

    // CRITICAL FIX: Check pod_members table (source of truth) + pod_leads array (legacy)
    const isInLeadsArray = Boolean(
      pod.pod_leads?.some(
        (lead) => lead.toLowerCase() === effectiveAddress.toLowerCase(),
      ),
    );

    // User is a leader if they're in the array OR in the database OR Executive Pod leader
    const isLeader = isInLeadsArray || isLeaderInDB === true || isExecutiveLeader;

    // User can manage if they're creator OR leader (from any source)
    const canManagePod = isCreator || isLeader;

    // Check if user can sign accountability agreements
    const canSign = Boolean(
      effectiveAddress &&
        pod &&
        (isLeader || isCreator) &&
        (pod.status === 'draft' || pod.status === 'proposed'),
    );

    // Check if user is already a member
    const isMember = isLeader; // For now, leaders are considered members

    // TEST MODE: Add a URL parameter to test membership flow even as creator
    const isTestMode =
      typeof window !== 'undefined' &&
      new URL(window.location.href).searchParams.has('test-membership');

    // Check if user can apply to join (not a leader, has wallet connected, pod is active)
    const canApply = Boolean(
      effectiveAddress &&
        pod &&
        pod.status === 'active' &&
        (!isMember || isTestMode),
    );

    // Detailed permissions based on user role
    const detailedPermissions = {
      canEdit: canManagePod,
      canDeactivate: canManagePod && pod.status === 'active',
      canDelete: isCreator, // Only creator can delete pods
      canInviteMembers: canManagePod && pod.status === 'active',
      canViewTreasury: canManagePod || isMember,
    };

    console.log('🔍 Pod permissions calculated:', {
      podName: pod.name,
      isInLeadsArray,
      isLeaderInDB,
      isExecutiveLeader,
      canManagePod,
      isLeader,
    });

    return {
      canManagePod,
      canSign,
      canApply,
      isLeader,
      isMember,
      isCreator,
      permissions: detailedPermissions,
    };
  }, [pod, effectiveAddress, isLeaderInDB, isExecutiveLeader]);

  return permissions;
}

/**
 * Simplified hook that just checks if user can manage a pod
 */
export function useCanManagePod(
  pod: Pod | null,
  userAddress?: string,
): boolean {
  const { canManagePod } = usePodPermissions({ pod, userAddress });
  return canManagePod;
}

/**
 * Hook for checking specific pod permissions
 */
export function usePodPermissionCheck(
  pod: Pod | null,
  permission: keyof UsePodPermissionsReturn['permissions'],
  userAddress?: string,
): boolean {
  const { permissions } = usePodPermissions({ pod, userAddress });
  return permissions[permission];
}

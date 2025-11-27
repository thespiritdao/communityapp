import { useMemo } from 'react';
import { useAccount } from 'wagmi';
import { PodCoreService } from '../services/PodCoreService';
import type { Pod } from '../types';

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
  userAddress 
}: UsePodPermissionsConfig): UsePodPermissionsReturn {
  const { address } = useAccount();
  
  // Use provided address or connected wallet address
  const effectiveAddress = userAddress || address;

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
        }
      };
    }

    // Check if user is the pod creator
    const isCreator = pod.created_by_address?.toLowerCase() === effectiveAddress.toLowerCase();
    
    // Check if user is a pod leader
    const isLeader = Boolean(
      pod.pod_leads?.some(lead => lead.toLowerCase() === effectiveAddress.toLowerCase())
    );
    
    // Check if user can manage the pod (creator or leader)
    const canManagePod = PodCoreService.canUserManagePod(pod, effectiveAddress);
    
    // Check if user can sign accountability agreements
    const canSign = Boolean(
      effectiveAddress && 
      pod && 
      (isLeader || isCreator) &&
      (pod.status === 'draft' || pod.status === 'proposed')
    );
    
    // Check if user is already a member
    const isMember = isLeader; // For now, leaders are considered members
    
    // TEST MODE: Add a URL parameter to test membership flow even as creator
    const isTestMode = typeof window !== 'undefined' && 
                      new URL(window.location.href).searchParams.has('test-membership');
    
    // Check if user can apply to join (not a leader, has wallet connected, pod is active)
    const canApply = Boolean(
      effectiveAddress && 
      pod && 
      pod.status === 'active' && 
      (!isMember || isTestMode)
    );

    // Detailed permissions based on user role
    const detailedPermissions = {
      canEdit: canManagePod,
      canDeactivate: canManagePod && pod.status === 'active',
      canDelete: isCreator, // Only creator can delete pods
      canInviteMembers: canManagePod && pod.status === 'active',
      canViewTreasury: canManagePod || isMember,
    };

    return {
      canManagePod,
      canSign,
      canApply,
      isLeader,
      isMember,
      isCreator,
      permissions: detailedPermissions
    };
  }, [pod, effectiveAddress]);

  return permissions;
}

/**
 * Simplified hook that just checks if user can manage a pod
 */
export function useCanManagePod(pod: Pod | null, userAddress?: string): boolean {
  const { canManagePod } = usePodPermissions({ pod, userAddress });
  return canManagePod;
}

/**
 * Hook for checking specific pod permissions
 */
export function usePodPermissionCheck(
  pod: Pod | null,
  permission: keyof UsePodPermissionsReturn['permissions'],
  userAddress?: string
): boolean {
  const { permissions } = usePodPermissions({ pod, userAddress });
  return permissions[permission];
}
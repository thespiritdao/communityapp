'use client';

import { useState, useEffect, useMemo } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { useTokenBalances } from '../context/TokenBalancesContext';
import {
  type HatPermissions,
  type HatRole,
  getHatPermissionsService,
  HAT_ROLES,
} from '../services/hatPermissionsService';
import { supabase } from '../utils/supabaseClient';

interface UseHatPermissionsReturn {
  // State
  permissions: HatPermissions | null;
  userRoles: HatRole[];
  userHats: string[];
  isLoading: boolean;
  error: string | null;

  // Computed properties
  isPodLeader: boolean;
  canAccessChat: boolean;
  canParticipateInGovernance: boolean;
  canCreateEvents: boolean;
  canViewTreasury: boolean;
  canManageMembers: boolean;
  canCreateSubPods: boolean;
  managedPods: string[];

  // Methods
  hasPermission: (permission: keyof HatPermissions) => boolean;
  hasHat: (hatId: string) => boolean;
  checkHat: (hatId: string) => Promise<boolean>;
  refreshPermissions: () => Promise<void>;

  // Pod-specific permission checks (NEW)
  getPermissionsForPod: (podId: string) => HatPermissions | null;
  hasPermissionInPod: (
    podId: string,
    permission: keyof HatPermissions,
  ) => boolean;
}

/**
 * Custom hook for HAT-based permissions
 * Replaces database-driven permission checking with on-chain verification
 */
export const useHatPermissions = (): UseHatPermissionsReturn => {
  const { evmAddress: address } = useEvmAddress();
  const publicClient = usePublicClient();
  const {
    balances,
    isLoading: tokenLoading,
    error: tokenError,
  } = useTokenBalances();

  const [permissions, setPermissions] = useState<HatPermissions | null>(null);
  const [userRoles, setUserRoles] = useState<HatRole[]>([]);
  const [userHats, setUserHats] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Service instance
  const service = useMemo(() => {
    if (!publicClient) return null;
    return getHatPermissionsService(publicClient);
  }, [publicClient]);

  // Load user permissions and roles using existing token balance data + dynamic pod roles
  const loadUserData = async () => {
    if (!address || !balances) {
      setPermissions(null);
      setUserRoles([]);
      setUserHats([]);
      setError(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // console.log('🎩 Loading HAT permissions dynamically from database');

      // Initialize empty arrays - NO HARDCODED HATS
      const roles: HatRole[] = [];
      const hats: string[] = [];

      // ONLY DYNAMIC POD ROLES - Load ALL pods the user is a member/leader of
      // console.log(
      //   '🔍 useHatPermissions: Loading dynamic pod roles for',
      //   address,
      // );

      try {
        const { data: userPodMemberships, error: membershipError } =
          await supabase
            .from('active_pod_members')
            .select('*')
            .eq('wallet', address.toLowerCase())
            .eq('is_active', true);

        if (membershipError) {
          console.error('❌ Error loading pod memberships:', membershipError);
        } else if (userPodMemberships && userPodMemberships.length > 0) {
          // console.log(
          //   '🎯 useHatPermissions: Found',
          //   userPodMemberships.length,
          //   'pod memberships',
          // );

          // Load role details for each pod
          for (const membership of userPodMemberships) {
            const isLeader = membership.membership_type === 'leader';
            const hatId = membership.hat_id;
            const podId = membership.pod_id;
            const podName = membership.pod_name || 'Unknown Pod';

            if (!hatId) {
              console.warn('⚠️ Pod', podName, 'missing HAT ID');
              continue;
            }

            // CRITICAL FIX: Executive Pod Leaders get full permissions without database query
            const EXEC_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';
            if (podId === EXEC_POD_ID && isLeader) {
              // console.log('👑 Executive Pod Leader detected - granting full permissions');

              const execRole: HatRole = {
                hatId: hatId,
                name: 'Executive Pod Leader',
                podId: podId,
                isLeaderRole: true,
                permissions: {
                  chatAccess: true,
                  chatModeration: true,
                  forumAccess: true,
                  governanceParticipation: true,
                  eventCreation: true,
                  treasuryViewing: true,
                  treasuryManagement: true,
                  memberManagement: true,
                  subPodCreation: true,
                  roleAssignment: true,
                  forumModeration: true,
                  bountyManagement: true,
                  marketplaceAccess: true,
                  marketplaceManage: true,
                },
              };

              roles.push(execRole);
              hats.push(hatId);
              continue; // Skip pod_role_permissions query for Executive Pod
            }

            // Get role permissions from pod_role_permissions
            const { data: roleData, error: roleError } = await supabase
              .from('pod_role_permissions')
              .select('*')
              .eq('pod_id', podId)
              .eq('token_address', hatId)
              .maybeSingle();

            if (roleError || !roleData) {
              console.warn(
                '⚠️ No role permissions found for',
                podName,
                '- using defaults',
              );

              // Add role with default permissions
              const dynamicRole: HatRole = {
                hatId: hatId,
                name: isLeader ? `${podName} Leader` : `${podName} Member`,
                podId: podId,
                isLeaderRole: isLeader,
                permissions: {
                  chatAccess: true,
                  chatModeration: isLeader,
                  forumAccess: true,
                  governanceParticipation: isLeader,
                  eventCreation: isLeader,
                  treasuryViewing: isLeader,
                  treasuryManagement: isLeader,
                  memberManagement: isLeader,
                  subPodCreation: isLeader,
                  roleAssignment: isLeader,
                  forumModeration: isLeader,
                  bountyManagement: isLeader,
                  marketplaceAccess: true,
                  marketplaceManage: isLeader,
                },
              };

              roles.push(dynamicRole);
              hats.push(hatId);
            } else {
              // Use actual role permissions from database
              // CRITICAL FIX: Parse JSON string if permissions is stored as string
              let parsedPermissions: HatPermissions = {
                chatAccess: false,
                chatModeration: false,
                forumAccess: false,
                governanceParticipation: false,
                eventCreation: false,
                treasuryViewing: false,
                treasuryManagement: false,
                memberManagement: false,
                subPodCreation: false,
                roleAssignment: false,
                forumModeration: false,
                bountyManagement: false,
                marketplaceAccess: false,
                marketplaceManage: false,
              };

              try {
                const rawPermissions = typeof roleData.permissions === 'string'
                  ? JSON.parse(roleData.permissions)
                  : roleData.permissions;

                // Merge parsed permissions with defaults
                if (rawPermissions && typeof rawPermissions === 'object') {
                  parsedPermissions = { ...parsedPermissions, ...rawPermissions };
                }
              } catch (parseError) {
                console.error('❌ Failed to parse permissions for', podName, ':', parseError);
                // parsedPermissions already has safe defaults
              }

              const dynamicRole: HatRole = {
                hatId: hatId,
                name:
                  roleData.role_name ||
                  `${podName} ${isLeader ? 'Leader' : 'Member'}`,
                podId: podId,
                isLeaderRole: isLeader,
                permissions: parsedPermissions,
              };

              // Reduced verbosity - only log in development if needed
              // console.log('✅ Loaded role for', podName, ':', {
              //   roleName: dynamicRole.name,
              //   hatId: hatId.slice(0, 10) + '...',
              //   permissions: Object.keys(dynamicRole.permissions),
              // });

              roles.push(dynamicRole);
              hats.push(hatId);
            }
          }
        } else {
          // console.log('ℹ️ useHatPermissions: No dynamic pod memberships found');
        }
      } catch (dbError) {
        console.error('❌ Error loading dynamic pod roles:', dbError);
        // Continue with just hardcoded roles
      }

      // 🆕 ADD NON-POD HATS (Beta Tester, Advocate) from balances
      // These are not in active_pod_members because they're not pods
      // console.log('🎩 Checking for non-pod HATs from balances...');

      const BETA_TESTER_HAT = process.env.NEXT_PUBLIC_BETA_TESTER_HAT;
      const ADVOCATE_TOKEN = process.env.NEXT_PUBLIC_ADVOCATE;

      if (balances?.hasBetaTesterHat && BETA_TESTER_HAT) {
        // console.log('✅ Adding Beta Tester HAT to userHats');
        hats.push(BETA_TESTER_HAT);
        // Beta Tester doesn't need a "role" - it's just a HAT for access control
      }

      if ((balances as any)?.hasAdvocate && ADVOCATE_TOKEN) {
        // console.log('✅ Adding Advocate token to userHats');
        hats.push(ADVOCATE_TOKEN);
        // Advocate doesn't need a "role" - it's just a token for access control
      }

      // Calculate consolidated permissions from ALL roles
      const consolidatedPermissions: HatPermissions = {
        chatAccess: roles.some((r) => r.permissions?.chatAccess),
        chatModeration: roles.some((r) => r.permissions?.chatModeration),
        forumAccess: roles.some((r) => r.permissions?.forumAccess),
        governanceParticipation: roles.some(
          (r) => r.permissions?.governanceParticipation,
        ),
        eventCreation: roles.some((r) => r.permissions?.eventCreation),
        treasuryViewing: roles.some((r) => r.permissions?.treasuryViewing),
        treasuryManagement: roles.some(
          (r) => r.permissions?.treasuryManagement,
        ),
        memberManagement: roles.some((r) => r.permissions?.memberManagement),
        subPodCreation: roles.some((r) => r.permissions?.subPodCreation),
        roleAssignment: roles.some((r) => r.permissions?.roleAssignment),
        forumModeration: roles.some((r) => r.permissions?.forumModeration),
        bountyManagement: roles.some((r) => r.permissions?.bountyManagement),
        marketplaceAccess: roles.some((r) => r.permissions?.marketplaceAccess),
        marketplaceManage: roles.some((r) => r.permissions?.marketplaceManage),
      };

      setUserRoles(roles);
      setUserHats(hats);
      setPermissions(consolidatedPermissions);

      // console.log('✅ useHatPermissions: Final result:', {
      //   totalRoles: roles.length,
      //   totalHats: hats.length,
      //   roleNames: roles.map((r) => r.name),
      //   hatIds: hats.map((h) => h.slice(0, 10) + '...'),
      //   permissions: consolidatedPermissions,
      // });
    } catch (err) {
      console.error('❌ Failed to process HAT permissions:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to process permissions',
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Load data when address or token balances change
  useEffect(() => {
    loadUserData();
  }, [address, balances]);

  // Realtime subscription to refresh permissions when they change in database
  useEffect(() => {
    if (!address) return;

    // console.log(
    //   '🔄 Setting up realtime subscription for permission changes...',
    // );

    // Subscribe to pod_role_permissions changes
    const subscription = supabase
      .channel('pod-permissions-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'pod_role_permissions',
        },
        (payload) => {
          // console.log('🔔 Permission change detected:', payload);
          // console.log('🔄 Refreshing permissions...');
          loadUserData(); // Refresh permissions when database changes
        },
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      // console.log('🧹 Cleaning up permission subscription');
      subscription.unsubscribe();
    };
  }, [address]);

  // Computed properties
  const computedValues = useMemo(() => {
    if (!permissions) {
      return {
        isPodLeader: false,
        canAccessChat: false,
        canParticipateInGovernance: false,
        canCreateEvents: false,
        canViewTreasury: false,
        canManageMembers: false,
        canCreateSubPods: false,
        managedPods: [] as string[],
      };
    }

    const isPodLeader = userRoles.some((role) => role.isLeaderRole);
    const managedPods = userRoles
      .filter((role) => role.isLeaderRole && role.podId)
      .map((role) => role.podId!)
      .filter((podId, index, arr) => arr.indexOf(podId) === index); // Remove duplicates

    return {
      isPodLeader,
      canAccessChat: permissions.chatAccess,
      canParticipateInGovernance: permissions.governanceParticipation,
      canCreateEvents: permissions.eventCreation,
      canViewTreasury: permissions.treasuryViewing,
      canManageTreasury: permissions.treasuryManagement,
      canManageMembers: permissions.memberManagement,
      canCreateSubPods: permissions.subPodCreation,
      managedPods,
    };
  }, [permissions, userRoles]);

  // Methods
  const hasPermission = (permission: keyof HatPermissions): boolean => {
    return permissions?.[permission] ?? false;
  };

  const hasHat = (hatId: string): boolean => {
    return userHats.includes(hatId);
  };

  const checkHat = async (hatId: string): Promise<boolean> => {
    if (!address || !service) return false;
    return await service.hasHat(address, hatId);
  };

  const refreshPermissions = async (): Promise<void> => {
    // Simply reload from the current balances data
    loadUserData();
  };

  // Pod-specific permission methods (NEW)
  const getPermissionsForPod = (podId: string): HatPermissions | null => {
    if (!podId) return null;

    // Filter roles to only include those for the specified pod
    const podRoles = userRoles.filter((role) => role.podId === podId);

    if (podRoles.length === 0) {
      // console.log(`⚠️ No roles found for pod ${podId}`);
      return null;
    }

    // console.log(`🎯 Getting permissions for pod ${podId}:`, {
    //   rolesCount: podRoles.length,
    //   roleNames: podRoles.map((r) => r.name),
    // });

    // Calculate consolidated permissions for THIS POD ONLY
    const podPermissions: HatPermissions = {
      chatAccess: podRoles.some((r) => r.permissions?.chatAccess),
      chatModeration: podRoles.some((r) => r.permissions?.chatModeration),
      forumAccess: podRoles.some((r) => r.permissions?.forumAccess),
      governanceParticipation: podRoles.some(
        (r) => r.permissions?.governanceParticipation,
      ),
      eventCreation: podRoles.some((r) => r.permissions?.eventCreation),
      treasuryViewing: podRoles.some((r) => r.permissions?.treasuryViewing),
      treasuryManagement: podRoles.some(
        (r) => r.permissions?.treasuryManagement,
      ),
      memberManagement: podRoles.some((r) => r.permissions?.memberManagement),
      subPodCreation: podRoles.some((r) => r.permissions?.subPodCreation),
      roleAssignment: podRoles.some((r) => r.permissions?.roleAssignment),
      forumModeration: podRoles.some((r) => r.permissions?.forumModeration),
      bountyManagement: podRoles.some((r) => r.permissions?.bountyManagement),
      marketplaceAccess: podRoles.some((r) => r.permissions?.marketplaceAccess),
      marketplaceManage: podRoles.some((r) => r.permissions?.marketplaceManage),
    };

    // console.log(`✅ Pod ${podId} permissions:`, {
    //   chatModeration: podPermissions.chatModeration,
    //   forumModeration: podPermissions.forumModeration,
    // });

    return podPermissions;
  };

  const hasPermissionInPod = (
    podId: string,
    permission: keyof HatPermissions,
  ): boolean => {
    const podPermissions = getPermissionsForPod(podId);
    return podPermissions?.[permission] ?? false;
  };

  return {
    // State
    permissions,
    userRoles,
    userHats,
    isLoading: tokenLoading || isLoading,
    error: tokenError?.message || error,

    // Computed properties
    ...computedValues,

    // Methods
    hasPermission,
    hasHat,
    checkHat,
    refreshPermissions,

    // Pod-specific methods (NEW)
    getPermissionsForPod,
    hasPermissionInPod,
  };
};

export default useHatPermissions;

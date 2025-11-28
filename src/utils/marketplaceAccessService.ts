// src/utils/marketplaceAccessService.ts
'use client';

import { useAccount, usePublicClient } from 'wagmi';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const HATS_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: '_wearer', type: 'address' },
      { name: '_hatId', type: 'uint256' },
    ],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
  },
];

interface PodPermission {
  pod_id: string;
  hat_id: string;
  role_name: string;
  permissions: {
    chatAccess?: boolean;
    eventCreation?: boolean;
    roleAssignment?: boolean;
    subPodCreation?: boolean;
    forumModeration?: boolean;
    treasuryViewing?: boolean;
    bountyManagement?: boolean;
    memberManagement?: boolean;
    marketplaceAccess?: boolean;
    governanceParticipation?: boolean;
  };
  is_active: boolean;
}

/**
 * Enhanced marketplace access hook that checks:
 * 1. Executive Pod permissions (global marketplace access)
 * 2. Pod-specific marketplace permissions from pod_permission_lookup
 */
export const useEnhancedMarketplaceAccess = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [hasAccess, setHasAccess] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [accessDetails, setAccessDetails] = useState<{
    isExecutive: boolean;
    podAccess: string[]; // List of pod IDs where user has marketplace access
  }>({ isExecutive: false, podAccess: [] });

  useEffect(() => {
    const checkAccess = async () => {
      if (!address || !publicClient) {
        setHasAccess(false);
        setAccessDetails({ isExecutive: false, podAccess: [] });
        return;
      }

      setIsChecking(true);
      try {
        const hatsContract = process.env
          .NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;

        // Check Executive Pod access (global marketplace permissions)
        let isExecutive = false;
        const executiveLeaderHat = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;
        const executiveMemberHat = process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER;

        if (hatsContract && (executiveLeaderHat || executiveMemberHat)) {
          try {
            // Check if user is executive leader
            if (executiveLeaderHat) {
              const leaderBalance = await publicClient.readContract({
                address: hatsContract,
                abi: HATS_ABI,
                functionName: 'balanceOf',
                args: [address as `0x${string}`, executiveLeaderHat],
              });
              if (Number(leaderBalance) > 0) isExecutive = true;
            }

            // Check if user is executive member
            if (!isExecutive && executiveMemberHat) {
              const memberBalance = await publicClient.readContract({
                address: hatsContract,
                abi: HATS_ABI,
                functionName: 'balanceOf',
                args: [address as `0x${string}`, executiveMemberHat],
              });
              if (Number(memberBalance) > 0) isExecutive = true;
            }
          } catch (error) {
            console.error('Error checking executive pod access:', error);
          }
        }

        // Check pod-specific marketplace permissions
        const podAccessList: string[] = [];

        // Fetch all active pod permissions with marketplace access
        const { data: permissions, error } = await supabase
          .from('pod_permission_lookup')
          .select('*')
          .eq('is_active', true);

        if (!error && permissions) {
          // Check each permission that has marketplace access
          for (const perm of permissions as PodPermission[]) {
            if (perm.permissions?.marketplaceAccess) {
              try {
                const hasHat = await publicClient.readContract({
                  address: hatsContract,
                  abi: HATS_ABI,
                  functionName: 'balanceOf',
                  args: [
                    address as `0x${string}`,
                    perm.token_address as `0x${string}`,
                  ],
                });

                if (Number(hasHat) > 0) {
                  podAccessList.push(perm.pod_id);
                  console.log(
                    `User has marketplace access via ${perm.role_name} in pod ${perm.pod_id}`,
                  );
                }
              } catch (error) {
                console.error(`Error checking hat ${perm.token_address}:`, error);
              }
            }
          }
        }

        const finalHasAccess = isExecutive || podAccessList.length > 0;

        setHasAccess(finalHasAccess);
        setAccessDetails({ isExecutive, podAccess: podAccessList });

        console.log('Enhanced Marketplace Access Check:', {
          address,
          isExecutive,
          podAccess: podAccessList,
          hasAccess: finalHasAccess,
        });
      } catch (error) {
        console.error('Error checking marketplace access:', error);
        setHasAccess(false);
        setAccessDetails({ isExecutive: false, podAccess: [] });
      } finally {
        setIsChecking(false);
      }
    };

    checkAccess();
  }, [address, publicClient]);

  return { hasAccess, isChecking, accessDetails };
};

/**
 * Fetch tokens available for product gating
 * Excludes SELF and SYSTEM tokens, only returns role/badge tokens
 */
export const fetchMarketplaceTokens = async () => {
  try {
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .not('name', 'in', '($SELF,$SYSTEM)')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching marketplace tokens:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Failed to fetch marketplace tokens:', error);
    throw error;
  }
};

/**
 * Get pod-specific tokens for marketplace gating
 * Returns tokens associated with specific pods
 */
export const fetchPodTokensForMarketplace = async () => {
  try {
    // First get pod permissions
    const { data: permissions, error: permError } = await supabase
      .from('pod_permission_lookup')
      .select('pod_id, hat_id, role_name')
      .eq('is_active', true);

    if (permError) {
      console.error('Error fetching pod permissions:', error);
      throw permError;
    }

    // Then get associated tokens (excluding SELF/SYSTEM)
    const { data: tokens, error: tokenError } = await supabase
      .from('tokens')
      .select('*')
      .not('name', 'in', '($SELF,$SYSTEM)')
      .order('name', { ascending: true });

    if (tokenError) {
      console.error('Error fetching tokens:', tokenError);
      throw tokenError;
    }

    // Combine the data - map tokens to their pod contexts
    const podTokens = tokens?.map((token) => {
      // Find matching permission by token_address
      const matchingPermission = permissions?.find(
        (perm) =>
          perm.token_address === token.address || token.name.includes(perm.role_name),
      );

      return {
        ...token,
        pod_id: matchingPermission?.pod_id,
        role_name: matchingPermission?.role_name,
        display_name: matchingPermission
          ? `${token.name} (${matchingPermission.role_name})`
          : token.name,
      };
    });

    return podTokens || [];
  } catch (error) {
    console.error('Failed to fetch pod tokens:', error);
    throw error;
  }
};

/**
 * Fetch tokens that the current user can use for gating products
 * Only returns tokens for pods where the user has marketplace access
 */
export const fetchUserAuthorizedTokensForGating = async (
  userAddress: string,
  publicClient: any,
): Promise<any[]> => {
  try {
    if (!userAddress || !publicClient) {
      console.log('🎫 No user address or public client provided');
      return [];
    }

    const hatsContract = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
    if (!hatsContract) {
      console.error('🎫 HATS_CONTRACT not configured');
      return [];
    }

    console.log('🎫 Fetching authorized tokens for gating...');
    console.log('🎫 User address:', userAddress);
    console.log('🎫 Hats contract:', hatsContract);

    // First, check Executive Pod membership using same logic as fetchTokenBalances
    const executiveHatIds = [
      process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER,
      process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER,
    ].filter(Boolean);

    let hasExecutiveAccess = false;
    for (const hatId of executiveHatIds) {
      try {
        const balance = await publicClient.readContract({
          address: hatsContract,
          abi: HATS_ABI,
          functionName: 'balanceOf',
          args: [userAddress as `0x${string}`, hatId as `0x${string}`],
        });

        if (Number(balance) > 0) {
          hasExecutiveAccess = true;
          console.log(`🎫 User has Executive Pod access via hat: ${hatId}`);
          break;
        }
      } catch (error) {
        console.error(`🎫 Error checking executive hat ${hatId}:`, error);
      }
    }

    // Get all pod permissions with marketplace access, including pod names
    const { data: permissions, error: permError } = await supabase
      .from('pod_permission_lookup')
      .select(`
        *,
        pods!inner(
          name
        )
      `)
      .eq('is_active', true);

    if (permError) {
      console.error('🎫 Error fetching permissions:', permError);
      throw permError;
    }

    console.log(`🎫 Found ${permissions?.length || 0} pod permissions`);

    // Filter to permissions with marketplace access
    const marketplacePermissions =
      permissions?.filter((perm) => {
        try {
          const perms =
            typeof perm.permissions === 'string'
              ? JSON.parse(perm.permissions)
              : perm.permissions;

          return perms.marketplaceAccess === true;
        } catch {
          return false;
        }
      }) || [];

    console.log(
      `🎫 Found ${marketplacePermissions.length} marketplace permissions`,
    );

    // ✅ UNIFIED PERMISSIONS: Check marketplace_enabled module
    const { data: podModules, error: modulesError } = await supabase
      .from('pod_modules')
      .select('pod_id, marketplace_enabled');

    if (modulesError) {
      console.error('🎫 Error fetching pod modules:', modulesError);
    }

    // Create a map of pod_id -> marketplace_enabled
    const moduleMap = new Map<string, boolean>();
    podModules?.forEach((module) => {
      moduleMap.set(module.pod_id, module.marketplace_enabled ?? false);
    });

    console.log(
      `🎫 Loaded ${moduleMap.size} pod modules, marketplace enabled pods:`,
      Array.from(moduleMap.entries())
        .filter(([_, enabled]) => enabled)
        .map(([podId]) => podId),
    );

    // Check which hats the user actually holds and map to pod info
    const userPodAccess: Array<{
      podId: string;
      podName: string;
      roleName: string;
      hatId: string;
      isExecutive: boolean;
    }> = [];

    for (const perm of marketplacePermissions) {
      try {
        // ✅ UNIFIED PERMISSIONS: Two-tier check - module must be enabled
        const hasMarketplaceModule = moduleMap.get(perm.pod_id) ?? false;

        if (!hasMarketplaceModule) {
          const podName = perm.pods?.name || 'Unknown Pod';
          console.log(
            `🚫 [Token Gating] Skipping ${podName} - marketplace module disabled`,
          );
          continue;
        }

        const balance = await publicClient.readContract({
          address: hatsContract,
          abi: HATS_ABI,
          functionName: 'balanceOf',
          args: [userAddress as `0x${string}`, perm.token_address as `0x${string}`],
        });

        if (Number(balance) > 0) {
          // Check if this is an Executive Pod
          const podName = perm.pods?.name || 'Unknown Pod';
          const isExecutive =
            podName.toLowerCase().includes('executive') ||
            perm.role_name?.toLowerCase().includes('executive');

          userPodAccess.push({
            podId: perm.pod_id,
            podName: podName,
            roleName: perm.role_name,
            hatId: perm.token_address,
            isExecutive: isExecutive || hasExecutiveAccess, // Include if user has executive access via direct check
          });

          console.log(
            `✅ [Token Gating] User holds hat: ${perm.role_name} in ${podName} (Module: ON, Permission: YES)`,
          );
        }
      } catch (error) {
        console.error(`🎫 Error checking hat ${perm.token_address}:`, error);
      }
    }

    // Also add Executive Pod access if detected but not in marketplace permissions (Edge case)
    if (
      hasExecutiveAccess &&
      !userPodAccess.some((access) => access.isExecutive)
    ) {
      userPodAccess.push({
        podId: 'executive-pod-direct',
        podName: 'Executive Pod',
        roleName: 'Executive Pod Member/Leader',
        hatId: executiveHatIds[0] || '',
        isExecutive: true,
      });
    }

    console.log(`🎫 Total user pod access found: ${userPodAccess.length}`);

    // Get all available tokens, excluding SELF/SYSTEM
    const { data: tokens, error: tokenError } = await supabase
      .from('tokens')
      .select('*')
      .not('name', 'in', '($SELF,$SYSTEM)')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (tokenError) {
      console.error('🎫 Error fetching tokens:', tokenError);
      throw tokenError;
    }

    console.log(`🎫 Found ${tokens?.length || 0} available tokens`);

    const finalHasExecutiveAccess =
      hasExecutiveAccess || userPodAccess.some((access) => access.isExecutive);

    // Create authorized tokens list with both tokens and pod roles
    const authorizedTokens: any[] = [];

    // Add base tokens with appropriate access restrictions
    if (tokens) {
      const executiveOnlyTokens = ['poc', 'advocate']; // Proof of Curiosity, Advocate

      for (const token of tokens) {
        // Executive-only tokens require Executive Pod membership
        if (executiveOnlyTokens.includes(token.id)) {
          if (finalHasExecutiveAccess) {
            authorizedTokens.push({
              ...token,
              displayName: token.name,
              gatingType: 'token',
            });
          }
        } else {
          // Other tokens are available to any user with marketplace access
          if (userPodAccess.length > 0) {
            authorizedTokens.push({
              ...token,
              displayName: token.name,
              gatingType: 'token',
            });
          }
        }
      }
    }

    // Add pod role gating options (user can gate by their pod memberships)
    for (const podAccess of userPodAccess) {
      // Create a gating option for each pod the user is a member of
      const podToken = {
        id: `pod_${podAccess.podId}_${podAccess.roleName.toLowerCase().replace(/\s+/g, '_')}`,
        name: `${podAccess.roleName} Access`,
        displayName: `${podAccess.roleName} in ${podAccess.podName}`,
        description: `Gate for ${podAccess.roleName} members of ${podAccess.podName}`,
        gatingType: 'pod_role',
        podId: podAccess.podId,
        hatId: podAccess.hatId,
        podName: podAccess.podName,
        roleName: podAccess.roleName,
        isExecutive: podAccess.isExecutive,
      };
      authorizedTokens.push(podToken);
    }

    console.log(
      `🎫 User pod access:`,
      userPodAccess.map((a) => `${a.roleName} in ${a.podName}`),
    );
    console.log(`🏛️ Has Executive access: ${finalHasExecutiveAccess}`);
    console.log(`🎫 Total authorized options: ${authorizedTokens.length}`);
    console.log(
      `🎫 Base tokens: ${authorizedTokens
        .filter((t) => t.gatingType === 'token')
        .map((t) => t.name)
        .join(', ')}`,
    );
    console.log(
      `🎫 Pod role options: ${authorizedTokens
        .filter((t) => t.gatingType === 'pod_role')
        .map((t) => t.displayName)
        .join(', ')}`,
    );

    return authorizedTokens;
  } catch (error) {
    console.error('🎫 Failed to fetch user authorized tokens:', error);
    return [];
  }
};

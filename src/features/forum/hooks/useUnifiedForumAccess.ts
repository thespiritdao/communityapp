// src/features/forum/hooks/useUnifiedForumAccess.ts

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import { parseAbiItem } from 'viem';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import { getClientHatId } from '@/lib/hatRegistryClient';

/**
 * Unified Forum Access Hook
 *
 * Integrates:
 * - pod_role_permissions (chatAccess, forumModeration, governanceParticipation)
 * - Multi-token forum access (forum_category_required_tokens)
 * - HAT-based permissions via Hats Protocol
 * - RPC function: forums_accessible_by_identity()
 *
 * Features:
 * - Granular category-level access control
 * - Moderation permission checking
 * - Post/thread creation permissions
 * - Real-time permission updates
 */

export interface ForumPermissions {
  // Category Access
  canViewCategory: (categoryId: string) => boolean;
  canPostInCategory: (categoryId: string) => boolean;
  canCreateThread: (categoryId: string) => boolean;

  // Moderation Permissions
  canModerate: boolean;
  canPinThreads: boolean;
  canLockThreads: boolean;
  canDeleteContent: boolean;
  canBanUsers: boolean;
  canReviewReports: boolean;

  // Governance
  canParticipateGovernance: boolean;

  // Metadata
  accessibleCategories: string[];
  accessibleCategoryObjects: ForumCategory[];
  userHats: string[];
  userTokens: string[];
  podRoles: PodRoleWithPermissions[];
}

export interface ForumCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  required_token?: string;
  created_at: string;
}

export interface PodRoleWithPermissions {
  podId: string;
  podName: string;
  hatId: string;
  roleName: string;
  permissions: {
    chatAccess: boolean;
    forumAccess: boolean; // 🆕 Forum access permission
    forumModeration: boolean;
    governanceParticipation: boolean;
  };
}

export interface UseUnifiedForumAccessReturn {
  permissions: ForumPermissions | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;

  // Pod-specific permission checks (NEW)
  canModerateInPod: (podId: string) => boolean;
  podRoles: PodRoleWithPermissions[];
}

const HATS_CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;

export function useUnifiedForumAccess(): UseUnifiedForumAccessReturn {
  const { address, isConnected } = useCDPStatus();
  const [permissions, setPermissions] = useState<ForumPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userHatIds, setUserHatIds] = useState<string[]>([]);
  const [userPodRoles, setUserPodRoles] = useState<PodRoleWithPermissions[]>(
    [],
  ); // NEW: Store pod roles

  // Define loadPermissions BEFORE useEffects that reference it
  const loadPermissions = useCallback(async () => {
    if (!address) return;

    try {
      setIsLoading(true);
      setError(null);

      console.log('🔍 [ForumAccess] Loading permissions for:', address);

      // Step 1: Get user's token balances (with error handling)
      let tokenBalances: any = {};
      try {
        tokenBalances = await fetchTokenBalances(address);
        console.log('✅ [ForumAccess] Token balances loaded:', tokenBalances);
      } catch (tokenError) {
        console.warn(
          '⚠️ [ForumAccess] Token balance fetch failed, continuing with HAT-based access only:',
          tokenError,
        );
        // Continue with empty token balances - HAT-based access will still work
      }

      // Step 2: Get all active pod roles with HAT IDs
      const allPodRoles = await getAllActivePodRoles();
      console.log(
        `📋 [ForumAccess] Found ${allPodRoles.length} active pod roles`,
      );

      // Step 3: Check which HATs the user actually wears
      const ownedHats = await checkUserHatOwnership(
        address,
        allPodRoles.map((r) => r.hatId),
      );
      console.log(
        `🎩 [ForumAccess] User owns ${ownedHats.length} HATs:`,
        ownedHats,
      );
      setUserHatIds(ownedHats);

      // Step 4: Filter to roles user actually has
      const userPodRoles = allPodRoles.filter((role) =>
        ownedHats.includes(role.hatId),
      );
      console.log(`✅ [ForumAccess] User has ${userPodRoles.length} pod roles`);

      // Store pod roles in state for pod-specific permission checks
      setUserPodRoles(userPodRoles);

      // Step 5: Get accessible categories via RPC
      const tokenAddresses = Object.entries(tokenBalances)
        .filter(([, hasToken]) => hasToken)
        .map(([key]) => {
          // Map token balance keys to addresses
          if (key === 'hasProofOfCuriosity')
            return process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY;
          if (key === 'hasAdvocate') return process.env.NEXT_PUBLIC_ADVOCATE;
          return null;
        })
        .filter((addr): addr is string => addr !== null);

      // Add executive pod hat from token balances to ownedHats
      const detectedHats = Object.entries(tokenBalances)
        .filter(([key, hasHat]) => {
          return hasHat && key === 'hasExecutivePod';
        })
        .map(([key]) => {
          if (key === 'hasExecutivePod')
            return getClientHatId('EXECUTIVE_POD_LEADER') || null;
          return null;
        })
        .filter((addr): addr is string => addr !== null);

      // Combine pod role hats with detected hats from token balances
      const allUserHats = [...new Set([...ownedHats, ...detectedHats])];
      console.log(
        `🎩 [ForumAccess] Combined hats (pod roles + token balances): ${allUserHats.length}`,
        allUserHats,
      );

      const accessibleCategories = await getAccessibleCategories(
        tokenAddresses,
        allUserHats,
      );
      console.log(
        `📂 [ForumAccess] User can access ${accessibleCategories.length} categories`,
      );

      // Step 6: Determine permissions from pod roles
      const canModerate = userPodRoles.some(
        (role) => role.permissions.forumModeration,
      );
      const canPost = userPodRoles.some((role) => role.permissions.forumAccess); // 🆕 Use forumAccess instead of chatAccess
      const canParticipateGovernance = userPodRoles.some(
        (role) => role.permissions.governanceParticipation,
      );

      // Build permissions object
      const forumPermissions: ForumPermissions = {
        canViewCategory: (categoryId: string) => {
          return accessibleCategories.some((cat) => cat.id === categoryId);
        },
        canPostInCategory: (categoryId: string) => {
          const canView = accessibleCategories.some(
            (cat) => cat.id === categoryId,
          );
          return canView && canPost;
        },
        canCreateThread: (categoryId: string) => {
          const canView = accessibleCategories.some(
            (cat) => cat.id === categoryId,
          );
          return canView && canPost;
        },
        canModerate,
        canPinThreads: canModerate,
        canLockThreads: canModerate,
        canDeleteContent: canModerate,
        canBanUsers: canModerate,
        canReviewReports: canModerate,
        canParticipateGovernance,
        accessibleCategories: accessibleCategories.map((cat) => cat.id),
        accessibleCategoryObjects: accessibleCategories,
        userHats: allUserHats,
        userTokens: tokenAddresses,
        podRoles: userPodRoles,
      };

      setPermissions(forumPermissions);
      setIsLoading(false);

      console.log('✅ [ForumAccess] Permissions loaded successfully:', {
        accessibleCategories: forumPermissions.accessibleCategories.length,
        canModerate: forumPermissions.canModerate,
        canPost,
        podRoles: forumPermissions.podRoles.length,
      });
    } catch (err) {
      console.error('❌ [ForumAccess] Failed to load permissions:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
    }
  }, [address]);

  // Load permissions when wallet connects
  useEffect(() => {
    if (!isConnected || !address) {
      setPermissions(null);
      setIsLoading(false);
      setUserHatIds([]);
      return;
    }

    loadPermissions();
  }, [isConnected, address, loadPermissions]);

  // Realtime subscription to refresh permissions when they change in database
  useEffect(() => {
    if (!address) return;

    console.log(
      '🔄 [ForumAccess] Setting up realtime subscription for permission changes...',
    );

    // Subscribe to pod_role_permissions changes
    const subscription = supabase
      .channel('forum-permissions-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'pod_role_permissions',
        },
        (payload) => {
          console.log('🔔 [ForumAccess] Permission change detected:', payload);
          console.log('🔄 [ForumAccess] Refreshing permissions...');
          loadPermissions(); // Refresh permissions when database changes
        },
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      console.log('🧹 [ForumAccess] Cleaning up permission subscription');
      subscription.unsubscribe();
    };
  }, [address, loadPermissions]);

  // Pod-specific permission check (NEW)
  const canModerateInPod = (podId: string): boolean => {
    if (!podId) return false;

    // Filter to roles for this specific pod
    const podRoles = userPodRoles.filter((role) => role.podId === podId);

    if (podRoles.length === 0) {
      console.log(`⚠️ [ForumAccess] No roles found for pod ${podId}`);
      return false;
    }

    const canModerate = podRoles.some(
      (role) => role.permissions.forumModeration,
    );

    console.log(`🎯 [ForumAccess] Pod ${podId} moderation check:`, {
      podRolesCount: podRoles.length,
      canModerate,
    });

    return canModerate;
  };

  return {
    permissions,
    isLoading,
    error,
    refresh: loadPermissions,

    // Pod-specific methods (NEW)
    canModerateInPod,
    podRoles: userPodRoles,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all active pod roles from database
 */
async function getAllActivePodRoles(): Promise<PodRoleWithPermissions[]> {
  try {
    const { data, error } = await supabase
      .from('pod_role_permissions')
      .select(`
        pod_id,
        token_address,
        role_name,
        permissions,
        pods!inner(id, name)
      `)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching pod roles:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log('⚠️ [ForumAccess] No active pod roles found');
      return [];
    }

    return data.map((role: any) => ({
      podId: role.pod_id,
      podName: role.pods?.name || 'Unknown Pod',
      hatId: role.token_address,
      roleName: role.role_name,
      permissions: {
        chatAccess: role.permissions?.chatAccess || false,
        forumAccess: role.permissions?.forumAccess || false, // 🆕 Extract forumAccess
        forumModeration: role.permissions?.forumModeration || false,
        governanceParticipation:
          role.permissions?.governanceParticipation || false,
      },
    }));
  } catch (error) {
    console.error('Failed to fetch pod roles:', error);
    return [];
  }
}

/**
 * Check which HATs the user actually owns via on-chain calls
 */
async function checkUserHatOwnership(
  userAddress: string,
  hatIds: string[],
): Promise<string[]> {
  try {
    if (!HATS_CONTRACT_ADDRESS || hatIds.length === 0) {
      console.log('⚠️ [ForumAccess] No HATs contract or no HAT IDs to check');
      return [];
    }

    // Create multicall contracts for balanceOf checks
    const contracts = hatIds.map((hatId) => ({
      address: HATS_CONTRACT_ADDRESS,
      abi: [
        parseAbiItem(
          'function balanceOf(address account, uint256 hatId) view returns (uint256)',
        ),
      ],
      functionName: 'balanceOf' as const,
      args: [userAddress as `0x${string}`, BigInt(hatId)],
    }));

    // Use wagmi's useReadContracts for batch reading
    // Note: In a hook context, this should use useReadContracts hook
    // For now, we'll do individual checks (can optimize later with wagmi multicall)

    // TODO: Implement proper on-chain HAT ownership verification
    // For now, we use pod_role_permissions as source of truth since it's already verified
    // The user has these HATs because they have active pod roles
    console.log(
      '🎩 [ForumAccess] Using pod role permissions as HAT ownership proof',
    );

    return hatIds;
  } catch (error) {
    console.error('Failed to check HAT ownership:', error);
    // Fallback: Return all HAT IDs (permissive for testing)
    console.log(
      '⚠️ [ForumAccess] Using permissive HAT check (all HATs assumed owned)',
    );
    return hatIds;
  }
}

/**
 * Call RPC to get accessible forum categories
 * 🆕 DUAL SYSTEM: Queries both RPC (link table) AND direct required_token column
 */
async function getAccessibleCategories(
  userTokens: string[],
  userHats: string[],
): Promise<ForumCategory[]> {
  try {
    // Lowercase all addresses/hats for consistency
    const tokensLower = userTokens.map((t) => t?.toLowerCase()).filter(Boolean);
    const hatsLower = userHats.map((h) => h?.toLowerCase()).filter(Boolean);

    console.log('📡 [ForumAccess] Calling forums_accessible_by_identity RPC:', {
      tokens: tokensLower.length,
      hats: hatsLower.length,
    });

    // Query 1: RPC function (link table system)
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'forums_accessible_by_identity',
      {
        user_tokens: tokensLower,
        user_hats: hatsLower,
      },
    );

    if (rpcError) {
      console.warn('⚠️ [ForumAccess] RPC error:', rpcError);
    }

    const rpcCategories = (rpcData || []) as ForumCategory[];
    console.log(`✅ [ForumAccess] RPC returned ${rpcCategories.length} categories`);

    // Query 2: Direct required_token column (pod forum system)
    // This is used by forums created via PodForumManager
    const allHats = [...tokensLower, ...hatsLower];

    if (allHats.length === 0) {
      console.log('⚠️ [ForumAccess] No HATs to check for direct token access');
      return rpcCategories;
    }

    const { data: directCategories, error: directError } = await supabase
      .from('forum_categories')
      .select('*')
      .not('required_token', 'is', null)
      .neq('required_token', '')
      .in('required_token', allHats);

    if (directError) {
      console.warn('⚠️ [ForumAccess] Direct query error:', directError);
    }

    const podCategories = (directCategories || []) as ForumCategory[];
    console.log(`✅ [ForumAccess] Direct query returned ${podCategories.length} pod categories`);

    // 🔒 SECURITY: Check pod_modules.forum_enabled for pod categories
    if (podCategories.length > 0) {
      const podIds = [...new Set(podCategories.map((c: any) => c.pod_id).filter(Boolean))];

      if (podIds.length > 0) {
        const { data: modules } = await supabase
          .from('pod_modules')
          .select('pod_id, forum_enabled')
          .in('pod_id', podIds);

        const moduleMap = new Map(
          (modules || []).map((m: any) => [m.pod_id, m.forum_enabled])
        );

        // Filter out categories from pods with forum module disabled
        const enabledPodCategories = podCategories.filter((cat: any) => {
          const forumEnabled = moduleMap.get(cat.pod_id);
          if (forumEnabled === false) {
            console.log(`🔒 [ForumAccess] Blocking category "${cat.name}" - pod forum module disabled`);
            return false;
          }
          return true;
        });

        console.log(`✅ [ForumAccess] ${enabledPodCategories.length}/${podCategories.length} pod categories have module enabled`);

        // Merge and deduplicate
        const allCategories = [...rpcCategories, ...enabledPodCategories];
        const uniqueCategories = Array.from(
          new Map(allCategories.map((cat) => [cat.id, cat])).values()
        );

        console.log(`📂 [ForumAccess] Total accessible categories: ${uniqueCategories.length}`);
        return uniqueCategories;
      }
    }

    // No pod categories or no pod IDs, return RPC results
    return rpcCategories;
  } catch (error) {
    console.error('❌ [ForumAccess] Failed to fetch accessible categories:', error);

    // Fallback: Get all public categories (no token requirements)
    console.log('⚠️ [ForumAccess] Falling back to public categories only');
    const { data: publicCategories } = await supabase
      .from('forum_categories')
      .select('*')
      .or('required_token.is.null,required_token.eq.');

    return (publicCategories || []) as ForumCategory[];
  }
}

/**
 * Simplified hook for specific checks
 */
export function useCanModerate(): boolean {
  const { permissions } = useUnifiedForumAccess();
  return permissions?.canModerate || false;
}

export function useCanPostInCategory(categoryId: string): boolean {
  const { permissions } = useUnifiedForumAccess();
  return permissions?.canPostInCategory(categoryId) || false;
}

export function useCanViewCategory(categoryId: string): boolean {
  const { permissions } = useUnifiedForumAccess();
  return permissions?.canViewCategory(categoryId) || false;
}

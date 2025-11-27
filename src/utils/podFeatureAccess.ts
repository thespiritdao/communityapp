/**
 * Pod Feature Access Control - Unified Three-Tier System
 *
 * Enforces access control through three layers:
 * 1. Module Toggle: Is feature enabled for this pod?
 * 2. Token Gating: Does user have required Hat (membership)?
 * 3. Role Permission: Does user's role have permission?
 *
 * Usage:
 * ```typescript
 * const access = await checkPodFeatureAccess('chat', userAddress, podId);
 * if (!access.allowed) {
 *   return <AccessDenied reason={access.reason} />;
 * }
 * ```
 */

import { supabase } from '@/utils/supabaseClient';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';

export type PodFeature =
  | 'chat'
  | 'forum'
  | 'events'
  | 'bounties'
  | 'treasury'
  | 'marketplace';

export interface FeatureAccessResult {
  allowed: boolean;
  reason?: string;
  details?: {
    moduleEnabled?: boolean;
    hasHat?: boolean;
    hasPermission?: boolean;
    userRole?: 'leader' | 'member' | null;
  };
}

/**
 * Check if user can access a specific pod feature
 *
 * @param feature - The feature to check access for
 * @param userAddress - User's wallet address
 * @param podId - Pod ID to check access in
 * @returns FeatureAccessResult with allowed status and optional reason
 */
export async function checkPodFeatureAccess(
  feature: PodFeature,
  userAddress: string,
  podId: string,
): Promise<FeatureAccessResult> {
  try {
    console.log(
      `[PodFeatureAccess] Checking ${feature} access for ${userAddress} in pod ${podId}`,
    );

    // ============================================
    // TIER 1: Check Module Toggle (Pod-Level)
    // ============================================

    const { data: modules, error: moduleError } = await supabase
      .from('pod_modules')
      .select(`${feature}_enabled`)
      .eq('pod_id', podId)
      .single();

    if (moduleError) {
      console.error(
        '[PodFeatureAccess] Error fetching module config:',
        moduleError,
      );

      // If no module config found, create default
      if (moduleError.code === 'PGRST116') {
        console.log(
          '[PodFeatureAccess] No module config found, creating defaults',
        );
        const { error: insertError } = await supabase
          .from('pod_modules')
          .insert({
            pod_id: podId,
            chat_enabled: false,
            forum_enabled: false,
            treasury_enabled: true, // Treasury always enabled by default
            events_enabled: false,
            bounties_enabled: false,
          });

        if (insertError) {
          console.error(
            '[PodFeatureAccess] Error creating module config:',
            insertError,
          );
        }

        // After creation, check if requested feature is enabled (treasury only)
        const moduleEnabled = feature === 'treasury';
        if (!moduleEnabled) {
          return {
            allowed: false,
            reason: `${formatFeatureName(feature)} is not enabled for this pod`,
            details: { moduleEnabled: false },
          };
        }
      } else {
        return {
          allowed: false,
          reason: 'Error loading pod module configuration',
          details: { moduleEnabled: false },
        };
      }
    }

    const moduleEnabled = modules?.[`${feature}_enabled`];
    console.log(`[PodFeatureAccess] Module ${feature}_enabled:`, moduleEnabled);

    if (!moduleEnabled) {
      return {
        allowed: false,
        reason: `${formatFeatureName(feature)} is not enabled for this pod. Ask pod leaders to enable it in the Modules tab.`,
        details: { moduleEnabled: false },
      };
    }

    // ============================================
    // TIER 2: Check Token Gating (User Has Hat)
    // ============================================

    const tokenBalances = await fetchTokenBalances(userAddress);
    console.log('[PodFeatureAccess] Token balances:', tokenBalances);

    // Get pod's Hat IDs
    const { data: pod, error: podError } = await supabase
      .from('pods')
      .select('management_hat_id, membership_hat_id, name')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      console.error('[PodFeatureAccess] Error fetching pod:', podError);
      return {
        allowed: false,
        reason: 'Pod not found',
        details: { moduleEnabled: true, hasHat: false },
      };
    }

    // Check if user has Hat for this specific pod
    // Note: This is a simplified check - adjust based on your Hat ID structure
    const userHatId = await getUserHatIdInPod(userAddress, podId);

    if (!userHatId) {
      return {
        allowed: false,
        reason: `You don't have membership in ${pod.name}. You need a membership Hat to access pod features.`,
        details: {
          moduleEnabled: true,
          hasHat: false,
          userRole: null,
        },
      };
    }

    // Determine if user is leader or member
    const isLeader = userHatId === pod.management_hat_id;
    const isMember = userHatId === pod.membership_hat_id;
    const userRole: 'leader' | 'member' | null = isLeader
      ? 'leader'
      : isMember
        ? 'member'
        : null;

    console.log(
      '[PodFeatureAccess] User role:',
      userRole,
      'Hat ID:',
      userHatId,
    );

    if (!userRole) {
      return {
        allowed: false,
        reason: 'Invalid Hat for this pod',
        details: {
          moduleEnabled: true,
          hasHat: false,
          userRole: null,
        },
      };
    }

    // ============================================
    // TIER 3: Check Role Permissions
    // ============================================

    const { data: rolePermissions, error: permError } = await supabase
      .from('pod_role_permissions')
      .select('permissions')
      .eq('pod_id', podId)
      .eq('token_address', userHatId)
      .single();

    if (permError) {
      console.warn(
        '[PodFeatureAccess] No role permissions found, using defaults for',
        userRole,
      );

      // Default permissions if not configured
      if (userRole === 'leader') {
        // Leaders get all permissions by default
        return {
          allowed: true,
          details: {
            moduleEnabled: true,
            hasHat: true,
            hasPermission: true,
            userRole: 'leader',
          },
        };
      }
    }

    // Map feature to permission key
    const permissionKey = getPermissionKey(feature, userRole);

    if (!permissionKey) {
      // If no specific permission needed (e.g., basic access), allow
      return {
        allowed: true,
        details: {
          moduleEnabled: true,
          hasHat: true,
          hasPermission: true,
          userRole,
        },
      };
    }

    const hasPermission =
      rolePermissions?.permissions?.[permissionKey] || false;
    console.log(
      `[PodFeatureAccess] Permission ${permissionKey}:`,
      hasPermission,
    );

    if (!hasPermission) {
      return {
        allowed: false,
        reason: `Your role (${userRole}) does not have permission for this action. Contact pod leaders to update role permissions.`,
        details: {
          moduleEnabled: true,
          hasHat: true,
          hasPermission: false,
          userRole,
        },
      };
    }

    // ✅ All checks passed!
    console.log(`[PodFeatureAccess] ✅ Access granted for ${feature}`);
    return {
      allowed: true,
      details: {
        moduleEnabled: true,
        hasHat: true,
        hasPermission: true,
        userRole,
      },
    };
  } catch (error) {
    console.error('[PodFeatureAccess] Unexpected error:', error);
    return {
      allowed: false,
      reason: 'Error checking access permissions. Please try again.',
    };
  }
}

/**
 * Get user's Hat ID in a specific pod
 */
async function getUserHatIdInPod(
  userAddress: string,
  podId: string,
): Promise<string | null> {
  try {
    // Check pod_members table for user's Hat assignment
    const { data: member, error } = await supabase
      .from('pod_members')
      .select('hat_id, role')
      .eq('pod_id', podId)
      .eq('wallet_address', userAddress)
      .eq('status', 'active')
      .single();

    if (error || !member) {
      console.log('[PodFeatureAccess] User not found in pod_members table');
      return null;
    }

    return member.hat_id;
  } catch (error) {
    console.error('[PodFeatureAccess] Error fetching user Hat ID:', error);
    return null;
  }
}

/**
 * Map feature + role to specific permission key
 */
function getPermissionKey(
  feature: PodFeature,
  role: 'leader' | 'member',
): string | null {
  // Permission key mapping based on feature and role
  const permissionMap: Record<
    PodFeature,
    { leader: string | null; member: string | null }
  > = {
    chat: {
      leader: 'chatAccess',
      member: 'chatAccess',
    },
    forum: {
      leader: 'forumModeration',
      member: 'chatAccess', // Members need basic chat access to view forum
    },
    events: {
      leader: 'eventCreation',
      member: null, // Members can view events without special permission
    },
    bounties: {
      leader: 'bountyManagement',
      member: null, // Members can view bounties without special permission
    },
    treasury: {
      leader: 'treasuryManagement',
      member: 'treasuryViewing',
    },
    marketplace: {
      leader: 'marketplaceManage',
      member: 'marketplaceAccess',
    },
  };

  return permissionMap[feature]?.[role] || null;
}

/**
 * Format feature name for user-facing messages
 */
function formatFeatureName(feature: PodFeature): string {
  const names: Record<PodFeature, string> = {
    chat: 'Chat',
    forum: 'Forum',
    events: 'Events',
    bounties: 'Bounties',
    treasury: 'Treasury',
    marketplace: 'Marketplace',
  };
  return names[feature] || feature;
}

/**
 * Hook for React components to check feature access
 */
export function usePodFeatureAccess(
  feature: PodFeature,
  userAddress: string | undefined,
  podId: string | undefined,
) {
  const [accessCheck, setAccessCheck] = React.useState<
    { loading: true } | { loading: false; result: FeatureAccessResult }
  >({ loading: true });

  React.useEffect(() => {
    if (!userAddress || !podId) {
      setAccessCheck({
        loading: false,
        result: {
          allowed: false,
          reason: 'Wallet not connected',
        },
      });
      return;
    }

    checkPodFeatureAccess(feature, userAddress, podId).then((result) => {
      setAccessCheck({ loading: false, result });
    });
  }, [feature, userAddress, podId]);

  return accessCheck;
}

// Import React for hook (will be tree-shaken if not used)
import React from 'react';

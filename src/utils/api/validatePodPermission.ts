/**
 * Backend API utility for validating pod permissions
 * Uses unified database permission system
 */

import { supabase } from '@/utils/supabaseClient';
import type { HatPermissions } from '@/services/hatPermissionsService';

export interface PermissionValidationResult {
  allowed: boolean;
  error?: string;
  statusCode?: number;
  details?: {
    userId?: string;
    walletAddress?: string;
    podId?: string;
    permissionKey?: string;
    roleName?: string;
    hasPermission?: boolean;
  };
}

/**
 * Validates that a request has permission to perform an action on a pod
 *
 * Steps:
 * 1. Verify authentication session
 * 2. Verify wallet ownership
 * 3. Check pod membership
 * 4. Validate specific permission
 *
 * @param request - The Next.js request object
 * @param podId - The pod ID to check permissions for
 * @param permissionKey - The specific permission to check (e.g., 'bountyManagement')
 * @param walletAddress - Optional: wallet address from request body (if not provided, extracted from session)
 *
 * @returns PermissionValidationResult with allowed flag and error details
 *
 * @example
 * const validation = await validatePodPermission(request, podId, 'bountyManagement', walletAddress);
 * if (!validation.allowed) {
 *   return NextResponse.json({ error: validation.error }, { status: validation.statusCode });
 * }
 */
export async function validatePodPermission(
  request: Request,
  podId: string,
  permissionKey: keyof HatPermissions,
  walletAddress?: string
): Promise<PermissionValidationResult> {
  try {
    // Step 1: Verify authentication
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session) {
      console.error('❌ API Permission Check: No authenticated session');
      return {
        allowed: false,
        error: 'Unauthorized - Please sign in',
        statusCode: 401
      };
    }

    const userId = sessionData.session.user.id;

    // Step 2: Get user's wallet address if not provided
    let userWallet = walletAddress;

    if (!userWallet) {
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('wallet_address')
        .eq('user_id', userId)
        .single();

      if (!userProfile) {
        console.error('❌ API Permission Check: User profile not found');
        return {
          allowed: false,
          error: 'User profile not found',
          statusCode: 404
        };
      }

      userWallet = userProfile.wallet_address;
    }

    // Step 3: Verify wallet ownership (if wallet was provided in request)
    if (walletAddress) {
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('wallet_address')
        .eq('user_id', userId)
        .single();

      if (!userProfile || userProfile.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
        console.error('❌ API Permission Check: Wallet mismatch', {
          authenticated: userProfile?.wallet_address,
          claimed: walletAddress
        });
        return {
          allowed: false,
          error: 'Unauthorized - Wallet mismatch',
          statusCode: 403,
          details: {
            userId,
            walletAddress: userProfile?.wallet_address
          }
        };
      }
    }

    console.log('✅ API Permission Check: User authenticated:', userWallet);

    // Step 4: Get user's pod membership
    const { data: membership, error: membershipError } = await supabase
      .from('active_pod_members')
      .select('hat_id, membership_type')
      .eq('pod_id', podId)
      .eq('wallet', userWallet!.toLowerCase())
      .eq('is_active', true)
      .single();

    if (membershipError || !membership) {
      console.error('❌ API Permission Check: User not a member of pod', podId);
      return {
        allowed: false,
        error: 'Forbidden - You are not a member of this pod',
        statusCode: 403,
        details: {
          userId,
          walletAddress: userWallet,
          podId
        }
      };
    }

    console.log('📋 API Permission Check: Found pod membership:', {
      hat_id: membership.hat_id?.slice(0, 10) + '...',
      type: membership.membership_type
    });

    // Step 5: Get role permissions
    const { data: rolePermissions, error: roleError } = await supabase
      .from('pod_role_permissions')
      .select('permissions, role_name')
      .eq('pod_id', podId)
      .eq('token_address', membership.hat_id)
      .single();

    if (roleError || !rolePermissions) {
      console.error('❌ API Permission Check: Role permissions not found for HAT', membership.hat_id);
      return {
        allowed: false,
        error: 'Forbidden - Role permissions not configured',
        statusCode: 403,
        details: {
          userId,
          walletAddress: userWallet,
          podId,
          hatId: membership.hat_id
        }
      };
    }

    // Step 6: Parse and check specific permission
    const permissions = typeof rolePermissions.permissions === 'string'
      ? JSON.parse(rolePermissions.permissions)
      : rolePermissions.permissions;

    const hasPermission = permissions[permissionKey] === true;

    console.log('🔐 API Permission Check:', {
      role: rolePermissions.role_name,
      permissionKey,
      hasPermission,
      allPermissions: Object.keys(permissions)
    });

    if (!hasPermission) {
      console.error('❌ API Permission Check: User lacks required permission');
      return {
        allowed: false,
        error: `Forbidden - You do not have ${permissionKey} permission in this pod`,
        statusCode: 403,
        details: {
          userId,
          walletAddress: userWallet,
          podId,
          permissionKey,
          roleName: rolePermissions.role_name,
          hasPermission: false
        }
      };
    }

    // Success!
    console.log('✅ API Permission Check: Permission validated successfully');
    return {
      allowed: true,
      details: {
        userId,
        walletAddress: userWallet,
        podId,
        permissionKey,
        roleName: rolePermissions.role_name,
        hasPermission: true
      }
    };

  } catch (error) {
    console.error('❌ API Permission Check: Unexpected error:', error);
    return {
      allowed: false,
      error: 'Internal server error',
      statusCode: 500
    };
  }
}

/**
 * Simpler version that just checks if user is a pod member
 * Useful for read-only operations that don't need specific permissions
 */
export async function validatePodMembership(
  request: Request,
  podId: string,
  walletAddress?: string
): Promise<PermissionValidationResult> {
  try {
    // Step 1: Verify authentication
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session) {
      return {
        allowed: false,
        error: 'Unauthorized - Please sign in',
        statusCode: 401
      };
    }

    // Step 2: Get user's wallet
    let userWallet = walletAddress;

    if (!userWallet) {
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('wallet_address')
        .eq('user_id', sessionData.session.user.id)
        .single();

      if (!userProfile) {
        return {
          allowed: false,
          error: 'User profile not found',
          statusCode: 404
        };
      }

      userWallet = userProfile.wallet_address;
    }

    // Step 3: Check membership
    const { data: membership } = await supabase
      .from('active_pod_members')
      .select('hat_id, membership_type')
      .eq('pod_id', podId)
      .eq('wallet', userWallet.toLowerCase())
      .eq('is_active', true)
      .single();

    if (!membership) {
      return {
        allowed: false,
        error: 'Forbidden - You are not a member of this pod',
        statusCode: 403
      };
    }

    return {
      allowed: true,
      details: {
        walletAddress: userWallet,
        podId
      }
    };

  } catch (error) {
    console.error('❌ Membership Check: Unexpected error:', error);
    return {
      allowed: false,
      error: 'Internal server error',
      statusCode: 500
    };
  }
}

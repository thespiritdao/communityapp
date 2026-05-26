import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PodAccessControlService } from '../services/PodAccessControlService';
import type { HatPermissions } from '@/services/hatPermissionsService';

/**
 * Pod Authentication Middleware
 *
 * Provides middleware functions for Next.js API routes to integrate
 * real-time HAT-based permission checking.
 *
 * Authentication: Validates Supabase JWT from Authorization header,
 * then resolves the authenticated user's wallet from user_profiles.
 */

export interface PodAuthContext {
  userWallet: string;
  podId: string;
  hasAccess: boolean;
  accessLevel: 'none' | 'member' | 'leader' | 'admin';
  permissions: HatPermissions | null;
}

/**
 * Extract and verify user wallet from Supabase JWT session.
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Create Supabase client authenticated with that token
 * 3. Call supabase.auth.getUser() to cryptographically verify the JWT
 * 4. Look up the verified user's wallet address from user_profiles
 *
 * This prevents spoofing — the wallet address comes from the DB
 * after JWT verification, not from a client-supplied header.
 */
async function getUserWallet(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const accessToken = authHeader.slice(7);
  if (!accessToken) {
    return null;
  }

  try {
    // Create Supabase client authenticated with the user's JWT
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      },
    );

    // Cryptographically verify the JWT and get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.warn('Pod auth: JWT verification failed:', userError?.message);
      return null;
    }

    // Look up the verified user's canonical wallet address
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const { data: userProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('wallet_address')
      .eq('user_id', user.id)
      .single();

    if (!userProfile?.wallet_address) {
      console.warn('Pod auth: No wallet found for user:', user.id);
      return null;
    }

    return userProfile.wallet_address;
  } catch (error) {
    console.error('Pod auth: Wallet extraction failed:', error);
    return null;
  }
}

/**
 * Extract pod ID from request URL or body
 */
async function getPodId(request: NextRequest): Promise<string | null> {
  const url = new URL(request.url);

  // 1. URL path parameter (e.g., /api/pods/[id]/...)
  const pathMatch = url.pathname.match(/\/api\/pods\/([a-f0-9-]+)/);
  if (pathMatch) return pathMatch[1];

  // 2. Query parameter
  const queryPodId = url.searchParams.get('podId');
  if (queryPodId) return queryPodId;

  // 3. Request body (for POST/PUT requests)
  try {
    if (request.method !== 'GET') {
      const body = await request.clone().json();
      if (body.podId) return body.podId;
    }
  } catch {
    // Ignore JSON parse errors
  }

  return null;
}

/**
 * Middleware to validate pod access and inject context
 */
export async function withPodAuth(
  request: NextRequest,
  handler: (
    request: NextRequest,
    context: PodAuthContext,
  ) => Promise<NextResponse>,
  requiredPermission?: keyof HatPermissions,
): Promise<NextResponse> {
  try {
    const userWallet = await getUserWallet(request);
    if (!userWallet) {
      return NextResponse.json(
        { error: 'Authentication required: Valid session with linked wallet needed' },
        { status: 401 },
      );
    }

    const podId = await getPodId(request);
    if (!podId) {
      return NextResponse.json({ error: 'Pod ID required' }, { status: 400 });
    }

    console.log(`🔐 Pod auth check: ${userWallet} accessing pod ${podId}`);

    // Get comprehensive access information
    const accessInfo =
      await PodAccessControlService.validatePodManagementAccess(
        userWallet,
        podId,
      );

    // Check specific permission if required
    if (requiredPermission) {
      const permissionCheck =
        await PodAccessControlService.requirePodPermission(
          userWallet,
          podId,
          requiredPermission,
        );

      if (!permissionCheck.allowed) {
        console.log(
          `❌ Permission denied: ${userWallet} lacks ${requiredPermission} for pod ${podId}`,
        );
        return NextResponse.json(
          {
            error:
              permissionCheck.error ||
              `Missing required permission: ${requiredPermission}`,
          },
          { status: 403 },
        );
      }
    } else if (!accessInfo.hasAccess) {
      console.log(
        `❌ Access denied: ${userWallet} is not a member of pod ${podId}`,
      );
      return NextResponse.json(
        { error: 'Access denied: You are not a member of this pod' },
        { status: 403 },
      );
    }

    console.log(
      `✅ Access granted: ${userWallet} (${accessInfo.accessLevel}) to pod ${podId}`,
    );

    // Create context object
    const context: PodAuthContext = {
      userWallet,
      podId,
      hasAccess: accessInfo.hasAccess,
      accessLevel: accessInfo.accessLevel,
      permissions: accessInfo.permissions,
    };

    // Call the handler with context
    return await handler(request, context);
  } catch (error) {
    console.error('Pod auth middleware error:', error);
    return NextResponse.json(
      { error: 'Authentication check failed' },
      { status: 500 },
    );
  }
}

/**
 * Shorthand middleware for pod management routes
 */
export async function withPodManagement(
  request: NextRequest,
  handler: (
    request: NextRequest,
    context: PodAuthContext,
  ) => Promise<NextResponse>,
): Promise<NextResponse> {
  return withPodAuth(request, handler, 'memberManagement');
}

/**
 * Shorthand middleware for pod member routes (any access level)
 */
export async function withPodMembership(
  request: NextRequest,
  handler: (
    request: NextRequest,
    context: PodAuthContext,
  ) => Promise<NextResponse>,
): Promise<NextResponse> {
  return withPodAuth(request, handler); // No specific permission required, just membership
}

/**
 * Helper to create permission-specific middleware
 */
export function requirePermission(permission: keyof HatPermissions) {
  return async (
    request: NextRequest,
    handler: (
      request: NextRequest,
      context: PodAuthContext,
    ) => Promise<NextResponse>,
  ): Promise<NextResponse> => {
    return withPodAuth(request, handler, permission);
  };
}

/**
 * Response helpers for consistent API responses
 */
export const PodAuthResponse = {
  success: (data: any) => NextResponse.json({ success: true, data }),

  error: (message: string, status = 400) =>
    NextResponse.json({ success: false, error: message }, { status }),

  unauthorized: (message = 'Authentication required') =>
    NextResponse.json({ success: false, error: message }, { status: 401 }),

  forbidden: (message = 'Access denied') =>
    NextResponse.json({ success: false, error: message }, { status: 403 }),

  notFound: (message = 'Resource not found') =>
    NextResponse.json({ success: false, error: message }, { status: 404 }),
};

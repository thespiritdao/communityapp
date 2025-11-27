import { type NextRequest, NextResponse } from 'next/server';
import { PodAccessControlService } from '../services/PodAccessControlService';
import type { HatPermissions } from '@/services/hatPermissionsService';

/**
 * Pod Authentication Middleware
 *
 * Provides middleware functions for Next.js API routes to integrate
 * real-time HAT-based permission checking.
 */

export interface PodAuthContext {
  userWallet: string;
  podId: string;
  hasAccess: boolean;
  accessLevel: 'none' | 'member' | 'leader' | 'admin';
  permissions: HatPermissions | null;
}

/**
 * Extract user wallet from request headers or auth context
 */
function getUserWallet(request: NextRequest): string | null {
  // Try different auth methods

  // 1. Custom header (most common for frontend requests)
  const walletHeader = request.headers.get('x-wallet-address');
  if (walletHeader) return walletHeader;

  // 2. Authorization header (Bearer token format)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // TODO: Implement JWT token validation to extract wallet
    // For now, assume token IS the wallet address for testing
    if (token.startsWith('0x')) return token;
  }

  // 3. Query parameter (for GET requests)
  const url = new URL(request.url);
  const walletParam = url.searchParams.get('wallet');
  if (walletParam) return walletParam;

  return null;
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
    const userWallet = getUserWallet(request);
    if (!userWallet) {
      return NextResponse.json(
        { error: 'Authentication required: No wallet address found' },
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

// src/lib/apiPodGuard.ts
// Shared server-side guards for pod-scoped API routes — the G2 fix from
// src/guides/architecture/PERMISSION_AUTHORITY_SPEC.md. Every T2 (integrity-
// mutating) route must authenticate the caller's JWT and enforce the granular
// pod permission server-side; UI checks are cosmetic only.
//
// Built on the existing verified primitives:
//  - getWalletFromRequest (serverPodAuth): JWT → wallet, spoof-proof
//  - PodAccessControlService.requirePodPermission: management hat OR role hat
//    granting the permission (the universal authority rule)
//
// NOTE: uses jsonwebtoken via serverPodAuth → routes using these guards must
// run on the Node.js runtime (no `export const runtime = 'edge'`).

import { NextResponse } from 'next/server';
import { getWalletFromRequest } from '@/lib/serverPodAuth';
import { PodAccessControlService } from '@/features/pods/services/PodAccessControlService';
import type { HatPermissions } from '@/services/hatPermissionsService';

const deny = (error: string, status: number) =>
  NextResponse.json({ success: false, error }, { status });

/**
 * Authenticate the request's JWT and return the caller's wallet.
 * Returns a 401 Response if unauthenticated.
 */
export function requireWallet(req: Request): string | NextResponse {
  const wallet = getWalletFromRequest(req);
  if (!wallet) {
    return deny('Authentication required: send your session token', 401);
  }
  return wallet.toLowerCase();
}

/**
 * Authenticate AND enforce a granular pod permission (management hat OR a
 * role hat granting it). Returns the caller's wallet on success, or a
 * 401/403 Response.
 *
 * Usage:
 *   const walletOrDenied = await requirePodPermission(req, podId, 'roleAssignment');
 *   if (walletOrDenied instanceof Response) return walletOrDenied;
 *   const wallet = walletOrDenied;
 */
export async function requirePodPermission(
  req: Request,
  podId: string,
  permission: keyof HatPermissions,
): Promise<string | NextResponse> {
  const walletOrDenied = requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallet = walletOrDenied;

  const check = await PodAccessControlService.requirePodPermission(
    wallet,
    podId,
    permission,
  );
  if (!check.allowed) {
    return deny(check.error || `Missing required permission: ${String(permission)}`, 403);
  }
  return wallet;
}

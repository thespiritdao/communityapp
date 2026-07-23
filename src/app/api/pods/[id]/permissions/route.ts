import type { NextRequest } from 'next/server';
import {
  withPodManagement,
  PodAuthResponse,
  type PodAuthContext,
} from '@/features/pods/middleware/podAuthMiddleware';
import { PodRolePermissionsService } from '@/features/pods/services/PodRolePermissionsService';
import { PodAccessControlService } from '@/features/pods/services/PodAccessControlService';

/**
 * GET /api/pods/[id]/permissions
 * Get role permissions for a pod
 */
export async function GET(request: NextRequest): Promise<Response> {
  return withPodManagement(request, async (req, context: PodAuthContext) => {
    try {
      console.log(`📋 Fetching permissions for pod ${context.podId}`);

      // Get all role permissions for this pod
      const rolePermissions =
        await PodRolePermissionsService.getPodRolePermissions(context.podId);

      // Get user's current access summary
      const userAccess = await PodAccessControlService.getPodAccessSummary(
        context.userWallet,
        context.podId,
      );

      return PodAuthResponse.success({
        roles: rolePermissions,
        userAccess,
        podId: context.podId,
        requestedBy: context.userWallet,
      });
    } catch (error) {
      console.error(
        `Failed to fetch permissions for pod ${context.podId}:`,
        error,
      );
      return PodAuthResponse.error(
        error instanceof Error ? error.message : 'Failed to fetch permissions',
      );
    }
  });
}

/**
 * PUT /api/pods/[id]/permissions
 * Update role permissions for a pod
 */
export async function PUT(request: NextRequest): Promise<Response> {
  return withPodManagement(request, async (req, context: PodAuthContext) => {
    try {
      const body = await request.json();
      const { roleId, permissions, maxHolders } = body;

      if (!roleId || !permissions) {
        return PodAuthResponse.error('Role ID and permissions are required');
      }

      console.log(`🔧 Updating role permissions for pod ${context.podId}`);

      // Check if user can assign roles
      const canAssignRoles = await PodAccessControlService.canAssignRoles(
        context.userWallet,
        context.podId,
      );

      if (!canAssignRoles) {
        return PodAuthResponse.forbidden(
          'You do not have permission to modify role assignments',
        );
      }

      // Update the role permissions
      const updatedRole = await PodRolePermissionsService.updateRolePermission(
        roleId,
        {
          permissions,
          max_holders: maxHolders,
          updated_by: context.userWallet,
        },
      );

      // Mark as pending sync with blockchain
      await PodRolePermissionsService.updateSyncStatus(roleId, 'pending');

      console.log(`✅ Role permissions updated for pod ${context.podId}`);

      return PodAuthResponse.success({
        role: updatedRole,
        message: 'Role permissions updated successfully',
        syncStatus: 'pending',
      });
    } catch (error) {
      console.error(
        `Failed to update permissions for pod ${context.podId}:`,
        error,
      );
      return PodAuthResponse.error(
        error instanceof Error ? error.message : 'Failed to update permissions',
      );
    }
  });
}

/**
 * POST /api/pods/[id]/permissions/sync — RETIRED (2026-07-22).
 *
 * This was a stub that only marked a DB row 'synced' without touching Hats
 * Protocol (a "Phase 2 TODO" that never shipped). It has no callers. Real
 * on-chain role work happens where the transactions are actually sent:
 *   - role-hat minting: PodManagerControlPanel.createHat
 *   - bounty funder-hat authorization: syncBountyFunderHat (same component)
 * Returning 410 Gone rather than falsely reporting success, so nothing can rely
 * on this endpoint as if it enforced or synced anything.
 */
export async function POST(request: NextRequest): Promise<Response> {
  return withPodManagement(request, async () => {
    return PodAuthResponse.error(
      'Endpoint retired: role permissions are synced on-chain at mint/authorization time, not here.',
    );
  });
}

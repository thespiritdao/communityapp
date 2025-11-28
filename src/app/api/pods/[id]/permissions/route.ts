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
 * POST /api/pods/[id]/permissions/sync
 * Manually trigger sync with blockchain (for testing)
 */
export async function POST(request: NextRequest): Promise<Response> {
  return withPodManagement(request, async (req, context: PodAuthContext) => {
    try {
      const body = await request.json();
      const { roleId } = body;

      if (!roleId) {
        return PodAuthResponse.error('Role ID is required');
      }

      console.log(
        `🔄 Syncing role permissions with blockchain for pod ${context.podId}`,
      );

      // Get the role permission
      const role = await PodRolePermissionsService.getRolePermissionByHatId(
        context.podId,
        roleId,
      );

      if (!role) {
        return PodAuthResponse.notFound('Role not found');
      }

      // TODO: Phase 2 - Implement actual HAT Protocol sync
      console.log('🎩 Future blockchain sync:', {
        podId: context.podId,
        roleId: roleId,
        hatId: role.token_address,
        permissions: role.permissions,
        action: 'This will sync with HATs Protocol smart contract',
      });

      // For now, just mark as synced
      await PodRolePermissionsService.updateSyncStatus(role.id, 'synced');

      return PodAuthResponse.success({
        message: 'Role permissions sync initiated',
        roleId: roleId,
        hatId: role.token_address,
        syncStatus: 'synced',
      });
    } catch (error) {
      console.error(
        `Failed to sync permissions for pod ${context.podId}:`,
        error,
      );
      return PodAuthResponse.error(
        error instanceof Error ? error.message : 'Failed to sync permissions',
      );
    }
  });
}

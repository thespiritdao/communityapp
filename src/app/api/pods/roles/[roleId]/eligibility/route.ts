import { type NextRequest, NextResponse } from 'next/server';
import { PodRolePermissionsService } from '@/features/pods/services/PodRolePermissionsService';
import type { EligibilityCriteria } from '@/features/pods/services/EligibilityService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    // Next.js 15: params is now async
    const { roleId } = await params;
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');

    if (!roleId) {
      return NextResponse.json(
        { error: 'Role ID is required' },
        { status: 400 },
      );
    }

    // Get role permission details including eligibility criteria
    const rolePermission =
      await PodRolePermissionsService.getRolePermissionByHatId(
        '', // We'll need to get this from the role record
        roleId,
      );

    if (!rolePermission) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const response: any = {
      roleId,
      roleName: rolePermission.role_name,
      eligibilityCriteria: rolePermission.eligibility_criteria || [],
      maxHolders: rolePermission.max_holders,
      currentHolders: rolePermission.current_holders,
    };

    // If userAddress is provided, check their eligibility
    if (userAddress) {
      const eligibilityCheck =
        await PodRolePermissionsService.checkUserEligibility(
          userAddress,
          roleId,
        );

      response.userEligibility = {
        userAddress,
        eligible: eligibilityCheck.eligible,
        evaluation: eligibilityCheck.evaluation,
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to get role eligibility info:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to get role info',
      },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    // Next.js 15: params is now async
    const { roleId } = await params;
    const body = await request.json();
    const { eligibilityCriteria, updatedBy } = body;

    if (!roleId || !updatedBy) {
      return NextResponse.json(
        { error: 'Role ID and updatedBy are required' },
        { status: 400 },
      );
    }

    if (!Array.isArray(eligibilityCriteria)) {
      return NextResponse.json(
        { error: 'eligibilityCriteria must be an array' },
        { status: 400 },
      );
    }

    const updatedRole =
      await PodRolePermissionsService.updateEligibilityCriteria(
        roleId,
        eligibilityCriteria as EligibilityCriteria[],
        updatedBy,
      );

    return NextResponse.json({
      roleId,
      roleName: updatedRole.role_name,
      eligibilityCriteria: updatedRole.eligibility_criteria,
      updatedAt: updatedRole.updated_at,
    });
  } catch (error) {
    console.error('Failed to update role eligibility criteria:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to update criteria',
      },
      { status: 500 },
    );
  }
}

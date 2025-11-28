import { type NextRequest, NextResponse } from 'next/server';
import { PodRolePermissionsService } from '@/features/pods/services/PodRolePermissionsService';
import { EligibilityService } from '@/features/pods/services/EligibilityService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Next.js 15: params is now async
    const { id: podId } = await params;
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');
    const roleId = searchParams.get('roleId');

    if (!podId) {
      return NextResponse.json(
        { error: 'Pod ID is required' },
        { status: 400 },
      );
    }

    if (!userAddress) {
      return NextResponse.json(
        { error: 'User address is required' },
        { status: 400 },
      );
    }

    // If roleId is specified, check eligibility for that specific role
    if (roleId) {
      const eligibilityCheck =
        await PodRolePermissionsService.checkUserEligibility(
          userAddress,
          roleId,
        );

      return NextResponse.json({
        podId,
        userAddress,
        roleId,
        eligible: eligibilityCheck.eligible,
        evaluation: eligibilityCheck.evaluation,
      });
    }

    // Otherwise, get all eligible roles for the user in this pod
    const eligibleRoles =
      await PodRolePermissionsService.getEligibleRolesForUser(
        userAddress,
        podId,
      );

    return NextResponse.json({
      podId,
      userAddress,
      eligibleRoles: eligibleRoles.map(({ role, eligible, evaluation }) => ({
        roleId: role.id,
        roleName: role.role_name,
        hatId: role.token_address,
        eligible,
        evaluation,
      })),
    });
  } catch (error) {
    console.error('Failed to check eligibility:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to check eligibility',
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Next.js 15: params is now async
    const { id: podId } = await params;
    const body = await request.json();
    const { userAddress, criteria, roleId } = body;

    if (!podId || !userAddress || !criteria) {
      return NextResponse.json(
        { error: 'Pod ID, user address, and criteria are required' },
        { status: 400 },
      );
    }

    const evaluation = await EligibilityService.evaluateCriteria({
      userAddress,
      podId,
      roleId,
      criteria,
    });

    return NextResponse.json({
      podId,
      userAddress,
      roleId,
      evaluation,
    });
  } catch (error) {
    console.error('Failed to evaluate eligibility criteria:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to evaluate criteria',
      },
      { status: 500 },
    );
  }
}

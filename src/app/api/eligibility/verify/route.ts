import { type NextRequest, NextResponse } from 'next/server';
import { EligibilityService } from '@/features/pods/services/EligibilityService';
import type { EligibilityCriteria } from '@/features/pods/services/EligibilityService';

/**
 * Standalone eligibility verification endpoint
 * Allows checking eligibility against custom criteria without requiring existing role records
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, criteria, podId, roleId, options } = body;

    if (!userAddress || !criteria) {
      return NextResponse.json(
        { error: 'User address and criteria are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(criteria)) {
      return NextResponse.json(
        { error: 'Criteria must be an array' },
        { status: 400 }
      );
    }

    // Validate each criterion has required fields
    for (const criterion of criteria) {
      if (!criterion.type) {
        return NextResponse.json(
          { error: 'Each criterion must have a type' },
          { status: 400 }
        );
      }
    }

    const evaluation = await EligibilityService.evaluateCriteria({
      userAddress,
      podId: podId || null,
      roleId: roleId || null,
      criteria: criteria as EligibilityCriteria[]
    });

    return NextResponse.json({
      userAddress,
      podId: podId || null,
      roleId: roleId || null,
      evaluation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to verify eligibility:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify eligibility' },
      { status: 500 }
    );
  }
}

/**
 * Batch eligibility verification
 * Check multiple users against the same criteria
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddresses, criteria, podId, roleId } = body;

    if (!Array.isArray(userAddresses) || !criteria) {
      return NextResponse.json(
        { error: 'User addresses array and criteria are required' },
        { status: 400 }
      );
    }

    if (userAddresses.length === 0) {
      return NextResponse.json(
        { error: 'At least one user address is required' },
        { status: 400 }
      );
    }

    if (userAddresses.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 user addresses allowed per batch' },
        { status: 400 }
      );
    }

    const results = await Promise.allSettled(
      userAddresses.map(async (userAddress: string) => {
        const evaluation = await EligibilityService.evaluateCriteria({
          userAddress,
          podId: podId || null,
          roleId: roleId || null,
          criteria: criteria as EligibilityCriteria[]
        });

        return {
          userAddress,
          evaluation
        };
      })
    );

    const successful = results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);

    const failed = results
      .filter(result => result.status === 'rejected')
      .map((result, index) => ({
        userAddress: userAddresses[index],
        error: (result as PromiseRejectedResult).reason?.message || 'Unknown error'
      }));

    return NextResponse.json({
      podId: podId || null,
      roleId: roleId || null,
      totalRequested: userAddresses.length,
      successful: successful.length,
      failed: failed.length,
      results: successful,
      errors: failed,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to batch verify eligibility:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to batch verify eligibility' },
      { status: 500 }
    );
  }
}
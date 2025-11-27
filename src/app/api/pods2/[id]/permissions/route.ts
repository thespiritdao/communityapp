/**
 * Pods2 API - Permission Checking Routes
 * GET /api/pods2/[id]/permissions?address=0x... - Check user permissions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, Address } from 'viem';
import { base } from 'viem/chains';
import { PodPermissionService } from '@/features/pods2/services/PodPermissionService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

/**
 * GET /api/pods2/[id]/permissions
 * Check user's permissions in a pod
 *
 * Query params:
 * - address: User's wallet address (required)
 * - useCache: Whether to use cached data (default: true)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('address');
    const useCache = searchParams.get('useCache') !== 'false';

    if (!userAddress) {
      return NextResponse.json(
        { error: 'Address parameter required' },
        { status: 400 },
      );
    }

    // Get pod
    const { data: pod, error: podError } = await supabase
      .from('pods2')
      .select('*')
      .eq('id', id)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    // If using cache, check database first
    let cachedPermissions = null;
    if (useCache) {
      const { data: member } = await supabase
        .from('pod_members2')
        .select('*')
        .eq('pod_id', id)
        .eq('wallet_address', userAddress.toLowerCase())
        .eq('is_active', true)
        .maybeSingle();

      if (member) {
        // Return cached permissions based on role
        const isAdmin = member.role === 'admin';
        cachedPermissions = {
          level: member.role,
          canManagePod: isAdmin,
          canManageMembers: isAdmin,
          canCreateEvents: isAdmin,
          canManageTreasury: isAdmin,
          canCreateProposals: true,
          canCreateThreads: true,
          canModerateContent: isAdmin,
          hasAccess:
            member.is_active && member.is_eligible && member.in_good_standing,
          cached: true,
          lastVerified: member.last_verified_at,
        };
      }
    }

    // Always get fresh permissions from blockchain
    const permissions = await PodPermissionService.getUserPermissions(
      publicClient,
      userAddress as Address,
      BigInt(pod.admin_hat_id),
      BigInt(pod.member_hat_id),
    );

    // Get detailed member status
    const adminStatus = await PodPermissionService.getMemberStatus(
      publicClient,
      userAddress as Address,
      BigInt(pod.admin_hat_id),
    );

    const memberStatus = await PodPermissionService.getMemberStatus(
      publicClient,
      userAddress as Address,
      BigInt(pod.member_hat_id),
    );

    return NextResponse.json({
      pod: {
        id: pod.id,
        name: pod.name,
        adminHatId: pod.admin_hat_id,
        memberHatId: pod.member_hat_id,
      },
      user: {
        address: userAddress,
        permissions,
        cached: cachedPermissions,
        blockchain: {
          admin: adminStatus,
          member: memberStatus,
          effectiveRole: permissions.level,
        },
      },
    });
  } catch (error) {
    console.error('GET /api/pods2/[id]/permissions error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/pods2/[id]/permissions/batch
 * Check permissions for multiple users at once
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { addresses } = body;

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json(
        { error: 'addresses array required' },
        { status: 400 },
      );
    }

    if (addresses.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 addresses per batch' },
        { status: 400 },
      );
    }

    // Get pod
    const { data: pod, error: podError } = await supabase
      .from('pods2')
      .select('*')
      .eq('id', id)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    // Batch check access levels
    const accessMap = await PodPermissionService.batchCheckAccess(
      publicClient,
      addresses.map((addr) => addr as Address),
      BigInt(pod.admin_hat_id),
      BigInt(pod.member_hat_id),
    );

    // Convert to array format
    const results = await Promise.all(
      addresses.map(async (address) => {
        const access = accessMap.get(address as Address);
        const permissions = await PodPermissionService.getUserPermissions(
          publicClient,
          address as Address,
          BigInt(pod.admin_hat_id),
          BigInt(pod.member_hat_id),
        );

        return {
          address,
          isAdmin: access?.isAdmin || false,
          isMember: access?.isMember || false,
          permissions,
        };
      }),
    );

    return NextResponse.json({
      pod: {
        id: pod.id,
        name: pod.name,
      },
      results,
      total: results.length,
    });
  } catch (error) {
    console.error('POST /api/pods2/[id]/permissions/batch error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

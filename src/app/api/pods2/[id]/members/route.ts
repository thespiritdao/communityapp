/**
 * Pods2 API - Member Management Routes
 * GET /api/pods2/[id]/members - List pod members
 * POST /api/pods2/[id]/members - Add member (after on-chain mint)
 * DELETE /api/pods2/[id]/members - Remove member (after on-chain revoke)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, Address } from 'viem';
import { base } from 'viem/chains';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const HATS_PROTOCOL_ADDRESS =
  '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as const;

const HATS_ABI = [
  {
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    name: 'isWearerOfHat',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    name: 'isEligible',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    name: 'isInGoodStanding',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * GET /api/pods2/[id]/members
 * List all members of a pod with their current blockchain status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role'); // 'admin', 'member', or null for all
    const verifyOnChain = searchParams.get('verify') === 'true';

    // Get pod
    const { data: pod, error: podError } = await supabase
      .from('pods2')
      .select('*')
      .eq('id', id)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    // Get cached members
    let query = supabase
      .from('pod_members2')
      .select('*')
      .eq('pod_id', id)
      .order('joined_at', { ascending: false });

    if (role) {
      query = query.eq('role', role);
    }

    const { data: members, error: membersError } = await query;

    if (membersError) {
      return NextResponse.json(
        { error: 'Failed to fetch members', details: membersError.message },
        { status: 500 },
      );
    }

    // Optionally verify each member on-chain
    const membersWithStatus = await Promise.all(
      (members || []).map(async (member) => {
        let onChainStatus = null;

        if (verifyOnChain) {
          try {
            const [isWearer, isEligible, inGoodStanding] = await Promise.all([
              publicClient.readContract({
                address: HATS_PROTOCOL_ADDRESS,
                abi: HATS_ABI,
                functionName: 'isWearerOfHat',
                args: [member.wallet_address as Address, BigInt(member.hat_id)],
              }),
              publicClient.readContract({
                address: HATS_PROTOCOL_ADDRESS,
                abi: HATS_ABI,
                functionName: 'isEligible',
                args: [member.wallet_address as Address, BigInt(member.hat_id)],
              }),
              publicClient.readContract({
                address: HATS_PROTOCOL_ADDRESS,
                abi: HATS_ABI,
                functionName: 'isInGoodStanding',
                args: [member.wallet_address as Address, BigInt(member.hat_id)],
              }),
            ]);

            onChainStatus = {
              isWearer: isWearer as boolean,
              isEligible: isEligible as boolean,
              inGoodStanding: inGoodStanding as boolean,
              hasAccess: (isWearer && isEligible && inGoodStanding) as boolean,
            };
          } catch (err) {
            console.warn(
              'Failed to verify member on-chain:',
              member.wallet_address,
              err,
            );
          }
        }

        return {
          address: member.wallet_address,
          role: member.role,
          hatId: member.hat_id,
          joinedAt: member.joined_at,
          lastVerifiedAt: member.last_verified_at,
          cached: {
            isActive: member.is_active,
            isEligible: member.is_eligible,
            inGoodStanding: member.in_good_standing,
          },
          onChain: onChainStatus,
        };
      }),
    );

    return NextResponse.json({
      pod: {
        id: pod.id,
        name: pod.name,
        adminHatId: pod.admin_hat_id,
        memberHatId: pod.member_hat_id,
      },
      members: membersWithStatus,
      total: membersWithStatus.length,
    });
  } catch (error) {
    console.error('GET /api/pods2/[id]/members error:', error);
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
 * POST /api/pods2/[id]/members
 * Sync member after on-chain hat mint
 * Client sends transaction hash, we verify and update database
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { transactionHash, memberAddress, role } = body;

    if (!transactionHash || !memberAddress || !role) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: transactionHash, memberAddress, role',
        },
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

    // Wait for transaction
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash as `0x${string}`,
      timeout: 60_000,
    });

    if (receipt.status !== 'success') {
      return NextResponse.json(
        { error: 'Transaction failed' },
        { status: 400 },
      );
    }

    // Determine which hat based on role
    const hatId = role === 'admin' ? pod.admin_hat_id : pod.member_hat_id;

    // Verify member actually has the hat
    const isWearer = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: HATS_ABI,
      functionName: 'isWearerOfHat',
      args: [memberAddress as Address, BigInt(hatId)],
    });

    if (!isWearer) {
      return NextResponse.json(
        { error: 'Member does not wear the hat on-chain' },
        { status: 400 },
      );
    }

    // Check eligibility and standing
    const [isEligible, inGoodStanding] = await Promise.all([
      publicClient.readContract({
        address: HATS_PROTOCOL_ADDRESS,
        abi: HATS_ABI,
        functionName: 'isEligible',
        args: [memberAddress as Address, BigInt(hatId)],
      }),
      publicClient.readContract({
        address: HATS_PROTOCOL_ADDRESS,
        abi: HATS_ABI,
        functionName: 'isInGoodStanding',
        args: [memberAddress as Address, BigInt(hatId)],
      }),
    ]);

    // Upsert member
    const { data: member, error: upsertError } = await supabase
      .from('pod_members2')
      .upsert(
        {
          pod_id: id,
          wallet_address: memberAddress.toLowerCase(),
          hat_id: hatId,
          role,
          is_active: true,
          is_eligible: isEligible as boolean,
          in_good_standing: inGoodStanding as boolean,
          joined_at: new Date().toISOString(),
          last_verified_at: new Date().toISOString(),
        },
        {
          onConflict: 'pod_id,wallet_address,hat_id',
        },
      )
      .select()
      .single();

    if (upsertError) {
      return NextResponse.json(
        { error: 'Failed to save member', details: upsertError.message },
        { status: 500 },
      );
    }

    // Log sync
    await supabase.from('pod_sync_log2').insert({
      pod_id: id,
      sync_type: 'members_updated',
      block_number: receipt.blockNumber.toString(),
      transaction_hash: transactionHash,
      status: 'success',
    });

    return NextResponse.json({
      success: true,
      member: {
        address: member.wallet_address,
        role: member.role,
        hatId: member.hat_id,
        isActive: member.is_active,
        isEligible: member.is_eligible,
        inGoodStanding: member.in_good_standing,
        transactionHash,
      },
    });
  } catch (error) {
    console.error('POST /api/pods2/[id]/members error:', error);
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
 * DELETE /api/pods2/[id]/members
 * Mark member as inactive after on-chain hat revocation
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { memberAddress, verifyOnChain = true } = body;

    if (!memberAddress) {
      return NextResponse.json(
        { error: 'Missing memberAddress' },
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

    // If verification requested, check blockchain
    if (verifyOnChain) {
      const [isAdminWearer, isMemberWearer] = await Promise.all([
        publicClient.readContract({
          address: HATS_PROTOCOL_ADDRESS,
          abi: HATS_ABI,
          functionName: 'isWearerOfHat',
          args: [memberAddress as Address, BigInt(pod.admin_hat_id)],
        }),
        publicClient.readContract({
          address: HATS_PROTOCOL_ADDRESS,
          abi: HATS_ABI,
          functionName: 'isWearerOfHat',
          args: [memberAddress as Address, BigInt(pod.member_hat_id)],
        }),
      ]);

      // If they still wear any hat, don't mark inactive
      if (isAdminWearer || isMemberWearer) {
        return NextResponse.json(
          { error: 'Member still wears a hat on-chain' },
          { status: 400 },
        );
      }
    }

    // Mark all memberships as inactive
    const { error: updateError } = await supabase
      .from('pod_members2')
      .update({
        is_active: false,
        last_verified_at: new Date().toISOString(),
      })
      .eq('pod_id', id)
      .eq('wallet_address', memberAddress.toLowerCase());

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update member', details: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Member marked as inactive',
      address: memberAddress,
    });
  } catch (error) {
    console.error('DELETE /api/pods2/[id]/members error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

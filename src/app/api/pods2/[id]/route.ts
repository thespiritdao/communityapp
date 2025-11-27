/**
 * Pods2 API - Individual Pod Routes
 * GET /api/pods2/[id] - Get pod details
 * PATCH /api/pods2/[id] - Update pod status
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

const POD_FACTORY_V2_ADDRESS = process.env.NEXT_PUBLIC_POD_FACTORY_V2_ADDRESS as Address;

const POD_FACTORY_ABI = [
  {
    inputs: [{ name: 'podId', type: 'bytes32' }],
    name: 'getPod',
    outputs: [{
      components: [
        { name: 'podId', type: 'bytes32' },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'imageURI', type: 'string' },
        { name: 'creator', type: 'address' },
        { name: 'leaders', type: 'address[]' },
        { name: 'topHatId', type: 'uint256' },
        { name: 'adminHatId', type: 'uint256' },
        { name: 'memberHatId', type: 'uint256' },
        { name: 'createdAt', type: 'uint256' },
        { name: 'isLinked', type: 'bool' },
        { name: 'status', type: 'uint8' }
      ],
      name: '',
      type: 'tuple'
    }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'topHatId', type: 'uint256' }],
    name: 'getPodIdFromTopHat',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

/**
 * GET /api/pods2/[id]
 * Get detailed pod information
 * Supports both UUID and podIdHash (bytes32)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Check if ID is UUID format or bytes32 hash
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let query = supabase
      .from('pods2')
      .select(`
        *,
        pod_members2(
          wallet_address,
          hat_id,
          role,
          is_active,
          is_eligible,
          in_good_standing,
          joined_at
        )
      `);

    if (isUUID) {
      query = query.eq('id', id);
    } else {
      // Assume it's a podIdHash
      query = query.eq('pod_id_hash', id);
    }

    const { data: pod, error } = await query.single();

    if (error || !pod) {
      return NextResponse.json(
        { error: 'Pod not found' },
        { status: 404 }
      );
    }

    // Verify against blockchain (optional, for real-time accuracy)
    const verifyBlockchain = request.nextUrl.searchParams.get('verify') === 'true';

    let blockchainData = null;
    if (verifyBlockchain) {
      try {
        blockchainData = await publicClient.readContract({
          address: POD_FACTORY_V2_ADDRESS,
          abi: POD_FACTORY_ABI,
          functionName: 'getPod',
          args: [pod.pod_id_hash as `0x${string}`],
        });
      } catch (err) {
        console.warn('Failed to verify blockchain data:', err);
      }
    }

    // Aggregate member statistics
    const members = pod.pod_members2 || [];
    const admins = members.filter((m: any) => m.role === 'admin' && m.is_active);
    const regularMembers = members.filter((m: any) => m.role === 'member' && m.is_active);

    return NextResponse.json({
      pod: {
        id: pod.id,
        podIdHash: pod.pod_id_hash,
        name: pod.name,
        description: pod.description,
        imageUri: pod.image_uri,
        tophatId: pod.tophat_id,
        adminHatId: pod.admin_hat_id,
        memberHatId: pod.member_hat_id,
        creatorAddress: pod.creator_address,
        leaderAddresses: pod.leader_addresses,
        status: pod.status,
        isLinkedTree: pod.is_linked_tree,
        createdAt: pod.created_at,
        lastSyncedAt: pod.last_synced_at,

        // Member statistics
        admins: admins.map((m: any) => ({
          address: m.wallet_address,
          joinedAt: m.joined_at,
          isEligible: m.is_eligible,
          inGoodStanding: m.in_good_standing,
        })),
        members: regularMembers.map((m: any) => ({
          address: m.wallet_address,
          joinedAt: m.joined_at,
          isEligible: m.is_eligible,
          inGoodStanding: m.in_good_standing,
        })),
        adminCount: admins.length,
        memberCount: regularMembers.length,
        totalMembers: admins.length + regularMembers.length,
      },
      blockchainData: blockchainData ? {
        status: (blockchainData as any).status === 0 ? 'active' : 'inactive',
        leaderCount: (blockchainData as any).leaders.length,
        // Add more fields as needed
      } : null,
    });

  } catch (error) {
    console.error('GET /api/pods2/[id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/pods2/[id]
 * Update pod metadata in database cache
 * NOTE: For status changes, transaction must be sent on-chain first
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { transactionHash, updateType } = body;

    if (updateType === 'status' && !transactionHash) {
      return NextResponse.json(
        { error: 'Transaction hash required for status updates' },
        { status: 400 }
      );
    }

    // For status updates, verify transaction first
    if (updateType === 'status') {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash as `0x${string}`,
        timeout: 60_000,
      });

      if (receipt.status !== 'success') {
        return NextResponse.json(
          { error: 'Transaction failed' },
          { status: 400 }
        );
      }
    }

    // Get current pod
    const { data: pod, error: fetchError } = await supabase
      .from('pods2')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !pod) {
      return NextResponse.json(
        { error: 'Pod not found' },
        { status: 404 }
      );
    }

    // Read latest data from blockchain
    const blockchainData = await publicClient.readContract({
      address: POD_FACTORY_V2_ADDRESS,
      abi: POD_FACTORY_ABI,
      functionName: 'getPod',
      args: [pod.pod_id_hash as `0x${string}`],
    }) as any;

    // Update database with blockchain state
    const { data: updatedPod, error: updateError } = await supabase
      .from('pods2')
      .update({
        status: blockchainData.status === 0 ? 'active' : 'inactive',
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update pod', details: updateError.message },
        { status: 500 }
      );
    }

    // Log sync
    await supabase.from('pod_sync_log2').insert({
      pod_id: pod.id,
      sync_type: 'status_changed',
      block_number: transactionHash ? '0' : null,
      transaction_hash: transactionHash || null,
      status: 'success',
    });

    return NextResponse.json({
      success: true,
      pod: {
        id: updatedPod.id,
        status: updatedPod.status,
        lastSyncedAt: updatedPod.last_synced_at,
      },
    });

  } catch (error) {
    console.error('PATCH /api/pods2/[id] error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

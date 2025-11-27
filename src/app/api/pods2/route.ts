/**
 * Pods2 API - Main Routes
 * GET /api/pods2 - List all pods
 * POST /api/pods2 - Create new pod
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, Address } from 'viem';
import { base } from 'viem/chains';

// Initialize clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const POD_FACTORY_V2_ADDRESS = process.env
  .NEXT_PUBLIC_POD_FACTORY_V2_ADDRESS as Address;
const HATS_PROTOCOL_ADDRESS =
  '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as const;

// MINIMAL Pod Factory ABI (updated for PodFactoryV2_Minimal)
const POD_FACTORY_ABI = [
  {
    inputs: [],
    name: 'getAllPodIds',
    outputs: [{ name: '', type: 'bytes32[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'podId', type: 'bytes32' }],
    name: 'getPod',
    outputs: [
      {
        components: [
          { name: 'podId', type: 'bytes32' },
          { name: 'name', type: 'string' },
          { name: 'creator', type: 'address' },
          { name: 'topHatId', type: 'uint256' },
          { name: 'adminHatId', type: 'uint256' },
          { name: 'memberHatId', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'podId', type: 'bytes32' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: true, name: 'topHatId', type: 'uint256' },
      { indexed: false, name: 'adminHatId', type: 'uint256' },
      { indexed: false, name: 'memberHatId', type: 'uint256' },
    ],
    name: 'PodCreated',
    type: 'event',
  },
] as const;

/**
 * GET /api/pods2
 * List all pods with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'active';
    const creator = searchParams.get('creator');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let query = supabase
      .from('pods2')
      .select(`
        *,
        pod_members2!inner(
          wallet_address,
          role,
          is_active
        )
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (creator) {
      query = query.eq('creator_address', creator.toLowerCase());
    }

    const { data: pods, error } = await query;

    if (error) {
      console.error('Failed to fetch pods:', error);
      return NextResponse.json(
        { error: 'Failed to fetch pods', details: error.message },
        { status: 500 },
      );
    }

    // Aggregate member data
    const podsWithCounts =
      pods?.map((pod) => {
        const members = pod.pod_members2 || [];
        const adminCount = members.filter(
          (m: any) => m.role === 'admin' && m.is_active,
        ).length;
        const memberCount = members.filter(
          (m: any) => m.role === 'member' && m.is_active,
        ).length;

        return {
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
          adminCount,
          memberCount,
          totalMembers: adminCount + memberCount,
        };
      }) || [];

    return NextResponse.json({
      pods: podsWithCounts,
      total: pods?.length || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('GET /api/pods2 error:', error);
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
 * POST /api/pods2
 * Create a new pod
 *
 * This endpoint expects the transaction to already be sent by the client.
 * It watches for the PodCreated event and syncs to database.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionHash, expectedPodData } = body;

    if (!transactionHash) {
      return NextResponse.json(
        { error: 'Transaction hash required' },
        { status: 400 },
      );
    }

    // Wait for transaction to be mined
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash as `0x${string}`,
      timeout: 60_000, // 60 seconds
    });

    if (receipt.status !== 'success') {
      return NextResponse.json(
        { error: 'Transaction failed', receipt },
        { status: 400 },
      );
    }

    // Find PodCreated event in logs
    const podCreatedLog = receipt.logs.find((log) => {
      try {
        const decoded = publicClient.decodeEventLog({
          abi: POD_FACTORY_ABI,
          data: log.data,
          topics: log.topics,
        });
        return decoded.eventName === 'PodCreated';
      } catch {
        return false;
      }
    });

    if (!podCreatedLog) {
      return NextResponse.json(
        { error: 'PodCreated event not found in transaction' },
        { status: 404 },
      );
    }

    // Decode the event (MINIMAL contract - only 5 fields)
    const event = publicClient.decodeEventLog({
      abi: POD_FACTORY_ABI,
      data: podCreatedLog.data,
      topics: podCreatedLog.topics,
    }) as any;

    const { podId, creator, topHatId, adminHatId, memberHatId } = event.args;

    // Read full pod data from contract (MINIMAL struct)
    const podData = (await publicClient.readContract({
      address: POD_FACTORY_V2_ADDRESS,
      abi: POD_FACTORY_ABI,
      functionName: 'getPod',
      args: [podId],
    })) as any;

    // Get description, imageURI, and leaders from expectedPodData (NOT on-chain)
    const description = expectedPodData?.description || '';
    const imageURI = expectedPodData?.imageURI || '';
    const leaders = expectedPodData?.leaders || [creator];

    // Insert into database
    const { data: insertedPod, error: insertError } = await supabase
      .from('pods2')
      .insert({
        pod_id_hash: podId,
        name: podData.name,
        description: description, // From client, not contract
        image_uri: imageURI, // From client, not contract
        tophat_id: topHatId.toString(),
        admin_hat_id: adminHatId.toString(),
        member_hat_id: memberHatId.toString(),
        creator_address: creator.toLowerCase(),
        leader_addresses: leaders.map((addr: string) => addr.toLowerCase()),
        status: podData.active ? 'active' : 'inactive', // Changed from status enum to boolean
        is_linked_tree: false, // Minimal contract always creates independent trees
        created_at_block: receipt.blockNumber.toString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert pod:', insertError);
      return NextResponse.json(
        {
          error: 'Failed to save pod to database',
          details: insertError.message,
        },
        { status: 500 },
      );
    }

    // Insert leaders as admin members
    const memberInserts = leaders.map((leader: string) => ({
      pod_id: insertedPod.id,
      wallet_address: leader.toLowerCase(),
      hat_id: adminHatId.toString(),
      role: 'admin',
      is_active: true,
      is_eligible: true,
      in_good_standing: true,
    }));

    const { error: membersError } = await supabase
      .from('pod_members2')
      .insert(memberInserts);

    if (membersError) {
      console.warn('Failed to insert pod members:', membersError);
      // Non-fatal, continue
    }

    // Log sync
    await supabase.from('pod_sync_log2').insert({
      pod_id: insertedPod.id,
      sync_type: 'created',
      block_number: receipt.blockNumber.toString(),
      transaction_hash: transactionHash,
      status: 'success',
    });

    return NextResponse.json({
      success: true,
      pod: {
        id: insertedPod.id,
        podIdHash: podId,
        name: podData.name,
        topHatId: topHatId.toString(),
        adminHatId: adminHatId.toString(),
        memberHatId: memberHatId.toString(),
        transactionHash,
        blockNumber: receipt.blockNumber.toString(),
      },
    });
  } catch (error) {
    console.error('POST /api/pods2 error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

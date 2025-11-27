/**
 * Pods2 API - Blockchain Sync Routes
 * POST /api/pods2/sync - Sync pods from blockchain events
 * POST /api/pods2/sync/members - Sync members for a pod
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
const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as const;

const POD_FACTORY_ABI = [
  {
    inputs: [],
    name: 'getAllPodIds',
    outputs: [{ name: '', type: 'bytes32[]' }],
    stateMutability: 'view',
    type: 'function'
  },
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
    anonymous: false,
    inputs: [
      { indexed: true, name: 'podId', type: 'bytes32' },
      { indexed: false, name: 'name', type: 'string' },
      { indexed: true, name: 'topHatId', type: 'uint256' },
      { indexed: false, name: 'adminHatId', type: 'uint256' },
      { indexed: false, name: 'memberHatId', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: false, name: 'leaders', type: 'address[]' },
      { indexed: false, name: 'isLinked', type: 'bool' }
    ],
    name: 'PodCreated',
    type: 'event'
  }
] as const;

const HATS_ABI = [
  {
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' }
    ],
    name: 'isWearerOfHat',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' }
    ],
    name: 'isEligible',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' }
    ],
    name: 'isInGoodStanding',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
] as const;

/**
 * POST /api/pods2/sync
 * Full sync of all pods from blockchain
 * Use with caution - can be resource intensive
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromBlock, toBlock, fullResync = false } = body;

    // Get deployment block from env or use default
    const deploymentBlock = BigInt(process.env.POD_FACTORY_V2_DEPLOYMENT_BLOCK || '0');
    const startBlock = fromBlock ? BigInt(fromBlock) : deploymentBlock;
    const endBlock = toBlock ? BigInt(toBlock) : await publicClient.getBlockNumber();

    console.log(`Syncing pods from block ${startBlock} to ${endBlock}`);

    // Fetch PodCreated events
    const logs = await publicClient.getLogs({
      address: POD_FACTORY_V2_ADDRESS,
      event: POD_FACTORY_ABI[2], // PodCreated event
      fromBlock: startBlock,
      toBlock: endBlock,
    });

    console.log(`Found ${logs.length} PodCreated events`);

    const syncResults = [];
    let successCount = 0;
    let errorCount = 0;

    for (const log of logs) {
      try {
        const { podId, name, topHatId, adminHatId, memberHatId, creator, leaders, isLinked } = log.args;

        if (!podId) continue;

        // Check if pod already exists
        const { data: existing } = await supabase
          .from('pods2')
          .select('id')
          .eq('pod_id_hash', podId)
          .maybeSingle();

        if (existing && !fullResync) {
          console.log(`Pod ${name} already synced, skipping`);
          continue;
        }

        // Read full pod data from contract
        const podData = await publicClient.readContract({
          address: POD_FACTORY_V2_ADDRESS,
          abi: POD_FACTORY_ABI,
          functionName: 'getPod',
          args: [podId],
        }) as any;

        // Upsert pod
        const { data: pod, error: podError } = await supabase
          .from('pods2')
          .upsert({
            pod_id_hash: podId,
            name: podData.name,
            description: podData.description,
            image_uri: podData.imageURI,
            tophat_id: topHatId!.toString(),
            admin_hat_id: adminHatId!.toString(),
            member_hat_id: memberHatId!.toString(),
            creator_address: creator!.toLowerCase(),
            leader_addresses: leaders!.map((addr: string) => addr.toLowerCase()),
            status: podData.status === 0 ? 'active' : 'inactive',
            is_linked_tree: isLinked!,
            created_at_block: log.blockNumber.toString(),
            last_synced_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (podError) {
          console.error(`Failed to upsert pod ${name}:`, podError);
          errorCount++;
          syncResults.push({
            podId,
            name,
            success: false,
            error: podError.message,
          });
          continue;
        }

        // Insert leaders as admin members
        for (const leader of leaders!) {
          await supabase
            .from('pod_members2')
            .upsert(
              {
                pod_id: pod.id,
                wallet_address: leader.toLowerCase(),
                hat_id: adminHatId!.toString(),
                role: 'admin',
                is_active: true,
                is_eligible: true,
                in_good_standing: true,
                last_verified_at: new Date().toISOString(),
              },
              {
                onConflict: 'pod_id,wallet_address,hat_id',
              }
            );
        }

        // Log sync
        await supabase.from('pod_sync_log2').insert({
          pod_id: pod.id,
          sync_type: 'full_sync',
          block_number: log.blockNumber.toString(),
          transaction_hash: log.transactionHash,
          status: 'success',
        });

        successCount++;
        syncResults.push({
          podId,
          name,
          success: true,
          dbId: pod.id,
        });

      } catch (err) {
        console.error('Error syncing pod:', err);
        errorCount++;
        syncResults.push({
          podId: log.args.podId,
          name: log.args.name,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalEvents: logs.length,
        successCount,
        errorCount,
        fromBlock: startBlock.toString(),
        toBlock: endBlock.toString(),
      },
      results: syncResults,
    });

  } catch (error) {
    console.error('POST /api/pods2/sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pods2/sync/members
 * Sync members for a specific pod by checking all TransferSingle events
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { podId, fromBlock } = body;

    if (!podId) {
      return NextResponse.json(
        { error: 'podId required' },
        { status: 400 }
      );
    }

    // Get pod
    const { data: pod, error: podError } = await supabase
      .from('pods2')
      .select('*')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      return NextResponse.json(
        { error: 'Pod not found' },
        { status: 404 }
      );
    }

    console.log(`Syncing members for pod ${pod.name}`);

    // For simplicity, we'll verify existing members in database
    // In production, you'd also scan TransferSingle events from Hats Protocol

    const { data: members } = await supabase
      .from('pod_members2')
      .select('*')
      .eq('pod_id', podId);

    const verifiedMembers = [];
    const errors = [];

    for (const member of members || []) {
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

        // Update member status
        await supabase
          .from('pod_members2')
          .update({
            is_active: isWearer as boolean,
            is_eligible: isEligible as boolean,
            in_good_standing: inGoodStanding as boolean,
            last_verified_at: new Date().toISOString(),
          })
          .eq('id', member.id);

        verifiedMembers.push({
          address: member.wallet_address,
          role: member.role,
          isWearer,
          isEligible,
          inGoodStanding,
        });

      } catch (err) {
        console.error(`Failed to verify member ${member.wallet_address}:`, err);
        errors.push({
          address: member.wallet_address,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Log sync
    await supabase.from('pod_sync_log2').insert({
      pod_id: podId,
      sync_type: 'members_updated',
      block_number: '0',
      status: errors.length === 0 ? 'success' : 'error',
      error_message: errors.length > 0 ? `${errors.length} member(s) failed verification` : null,
    });

    return NextResponse.json({
      success: true,
      pod: {
        id: pod.id,
        name: pod.name,
      },
      summary: {
        totalMembers: members?.length || 0,
        verified: verifiedMembers.length,
        errors: errors.length,
      },
      members: verifiedMembers,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('PUT /api/pods2/sync/members error:', error);
    return NextResponse.json(
      { error: 'Member sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

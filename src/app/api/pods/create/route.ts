// src/app/api/pods/create/route.ts
// Server-side pod creation: calls createPodProposal on PodCreationManagerV2.
// The contract holds COMMUNITY_PODS_PARENT hat and calls createHat internally.
// Gas is sponsored because PodCreationManager is whitelisted with Coinbase Paymaster.
//
// NOTE: This route is only needed if the user's smart wallet cannot call
// createPodProposal directly (e.g. during transition). Once PodCreationManagerV2
// is deployed and whitelisted, the client can call it directly via OnChainKit.

import { type NextRequest, NextResponse } from 'next/server';
import { createWalletClient, decodeEventLog } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import { createConfiguredPublicClient, getWriteTransport } from '@/utils/rpcClient';

export const runtime = 'nodejs';

const POD_CREATION_MANAGER = process.env.NEXT_PUBLIC_POD_CREATION_MANAGER as `0x${string}`;

const POD_CREATION_MANAGER_ABI = [
  {
    name: 'createPodProposal',
    type: 'function',
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'imageURI', type: 'string' },
      { name: 'podLeads', type: 'address[]' },
    ],
    outputs: [{ name: 'managementHatId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'PodProposed',
    type: 'event',
    inputs: [
      { name: 'podId', type: 'string', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'podLeads', type: 'address[]', indexed: false },
      { name: 'managementHatId', type: 'uint256', indexed: false },
      { name: 'vetoDeadline', type: 'uint256', indexed: false },
    ],
  },
] as const;

function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return (
      payload.wallet_address ||
      payload.user_metadata?.wallet_address ||
      null
    );
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const callerAddress = getWalletFromToken(token);
    if (!callerAddress) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, podLeaders, imageURI, podId, parentPodId } = body;

    if (!name || !podLeaders?.length || !podId) {
      return NextResponse.json(
        { error: 'Missing required fields: name, podLeaders, podId' },
        { status: 400 },
      );
    }

    if (!POD_CREATION_MANAGER) {
      return NextResponse.json(
        { error: 'POD_CREATION_MANAGER not configured' },
        { status: 500 },
      );
    }

    // Server wallet — used only as a fallback if the client can't call the contract directly.
    // Ideally the client calls createPodProposal via OnChainKit (gas sponsored by Coinbase).
    const ADMIN_PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!ADMIN_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Server configuration error: no admin key' }, { status: 500 });
    }

    const adminAccount = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`);

    const publicClient = createConfiguredPublicClient();

    const walletClient = createWalletClient({
      account: adminAccount,
      chain: base,
      transport: getWriteTransport(),
    });

    const IMAGE_URI = imageURI ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=400&background=bfe7c6&color=000&bold=true`;

    const podLeadAddresses = podLeaders.map((a: string) => a as `0x${string}`);

    console.log(`Pod create API: calling createPodProposal for "${name}" (podId: ${podId})`);
    console.log(`  Contract: ${POD_CREATION_MANAGER}`);
    console.log(`  Pod leads: ${podLeadAddresses.join(', ')}`);

    const hash = await walletClient.writeContract({
      address: POD_CREATION_MANAGER,
      abi: POD_CREATION_MANAGER_ABI,
      functionName: 'createPodProposal',
      args: [podId, name, description || '', IMAGE_URI, podLeadAddresses],
    });

    console.log(`Pod create API: tx submitted: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });

    if (receipt.status !== 'success') {
      throw new Error('createPodProposal transaction failed on-chain');
    }

    // Extract managementHatId from PodProposed event
    let managementHatId: string | null = null;
    for (const log of receipt.logs) {
      if (log.address?.toLowerCase() !== POD_CREATION_MANAGER.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: POD_CREATION_MANAGER_ABI,
          data: log.data,
          topics: log.topics,
          eventName: 'PodProposed',
        });
        managementHatId = (decoded.args as any).managementHatId.toString();
        break;
      } catch {
        // not this log
      }
    }

    if (!managementHatId) {
      throw new Error('Could not extract managementHatId from PodProposed event');
    }

    console.log(`Pod create API: management hat ID: ${managementHatId}`);

    // Save pod to DB as pending_review
    const { data: savedPod, error: dbError } = await supabaseAdmin
      .from('pods')
      .insert({
        id: podId,
        name,
        description: description || '',
        parent_pod_id: parentPodId || null,
        pod_leads: podLeadAddresses.map((a: string) => a.toLowerCase()),
        created_by_address: callerAddress.toLowerCase(),
        pod_image_url: IMAGE_URI,
        pod_metadata: { txHash: hash, createdAt: new Date().toISOString() },
        status: 'pending_review',
        is_active: false,
        management_hat_id: managementHatId,
        // The contract keys pods by this same string — required by the review route
        blockchain_pod_id: podId,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Pod create API: DB save failed:', dbError);
      // Non-fatal — hat already created on-chain
      return NextResponse.json({
        success: true,
        managementHatId,
        txHash: hash,
        podId,
        warning: 'DB save failed: ' + dbError.message,
      });
    }

    console.log(`Pod create API: pod saved (${savedPod.id}), status: pending_review`);

    // Fire-and-forget: notify relevant pod leaders of the new application
    const notifyUrl = new URL('/api/pods/notify-leaders', req.url);
    // notify-leaders now requires the caller's session; forward ours.
    fetch(notifyUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.get('authorization')
          ? { Authorization: req.headers.get('authorization') as string }
          : {}),
      },
      body: JSON.stringify({
        podId: savedPod.id,
        podName: name,
        parentPodId: parentPodId || null,
      }),
    }).catch((e) => console.error('Pod create API: notify-leaders failed:', e));

    return NextResponse.json({
      success: true,
      managementHatId,
      txHash: hash,
      podId: savedPod.id,
    });
  } catch (err: any) {
    console.error('Pod create API error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

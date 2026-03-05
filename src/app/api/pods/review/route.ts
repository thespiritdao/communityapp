// src/app/api/pods/review/route.ts
// Pod review — activate or veto pending pods.
// For community-level pods: caller must wear the exec hat.
// For sub-pods: caller must wear the parent pod's management hat.
// On activation, deploys a PodCreationManagerV2 for the pod via the factory
// so pod leaders can later approve their own sub-pods.

import { type NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { getHatId } from '@/lib/hatRegistry';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_POD_CREATION_MANAGER_FACTORY as `0x${string}` | undefined;

const POD_MANAGER_ABI = [
  {
    name: 'activatePod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'vetoPod',
    type: 'function',
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'reason', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const FACTORY_ABI = [
  {
    name: 'deployManager',
    type: 'function',
    inputs: [
      { name: 'podUUID', type: 'string' },
      { name: 'parentHatId', type: 'uint256' },
      { name: 'execHatId', type: 'uint256' },
      { name: 'defaultTokens', type: 'address[]' },
      { name: 'managerOwner', type: 'address' },
    ],
    outputs: [{ name: 'manager', type: 'address' }],
    stateMutability: 'nonpayable',
  },
] as const;

const HATS_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// Decode the ManagerDeployed event to extract the deployed address
const MANAGER_DEPLOYED_EVENT = {
  name: 'ManagerDeployed',
  type: 'event',
  inputs: [
    { name: 'podUUID', type: 'string', indexed: true },
    { name: 'manager', type: 'address', indexed: true },
    { name: 'parentHatId', type: 'uint256', indexed: false },
    { name: 'execHatId', type: 'uint256', indexed: false },
  ],
} as const;

function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const callerAddress = getWalletFromToken(token);
    if (!callerAddress) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { podId, action, reason } = await req.json();

    if (!podId || !action || !['activate', 'veto'].includes(action)) {
      return NextResponse.json({ error: 'Missing or invalid fields: podId, action (activate|veto)' }, { status: 400 });
    }

    const ADMIN_PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!ADMIN_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Server configuration error: no admin key' }, { status: 500 });
    }

    // Load the pod to find which creation manager to call and which hat gates approval
    const { data: pod, error: podError } = await supabaseAdmin
      .from('pods')
      .select('id, name, blockchain_pod_id, management_hat_id, parent_pod_id, creation_manager_address')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    if (!pod.blockchain_pod_id) {
      return NextResponse.json({ error: 'Pod has no blockchain_pod_id — cannot call contract' }, { status: 400 });
    }

    // Determine which manager contract to call.
    // The pod was created under a parent; that parent's creation_manager_address is the contract to call.
    let managerAddress: `0x${string}` | null = null;
    let approverHatId: string | null = null;

    if (pod.parent_pod_id) {
      const { data: parentPod } = await supabaseAdmin
        .from('pods')
        .select('creation_manager_address, management_hat_id')
        .eq('id', pod.parent_pod_id)
        .single();

      managerAddress = (parentPod?.creation_manager_address as `0x${string}`) || null;
      approverHatId = parentPod?.management_hat_id || null;
    }

    // Fall back to community-level manager (exec-gated)
    if (!managerAddress) {
      managerAddress = process.env.NEXT_PUBLIC_POD_CREATION_MANAGER as `0x${string}`;
      approverHatId = (await getHatId('EXECUTIVE_POD_LEADER')) || null;
    }

    if (!managerAddress) {
      return NextResponse.json({ error: 'No creation manager configured for this pod' }, { status: 500 });
    }

    if (!approverHatId) {
      return NextResponse.json({ error: 'Approver hat not configured' }, { status: 500 });
    }

    const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

    // Verify caller wears the approver hat on-chain
    const balance = await publicClient.readContract({
      address: HATS_CONTRACT,
      abi: HATS_ABI,
      functionName: 'balanceOf',
      args: [callerAddress as `0x${string}`, BigInt(approverHatId)],
    });

    if ((balance as bigint) === 0n) {
      return NextResponse.json({ error: 'Forbidden: caller does not wear the required approval hat' }, { status: 403 });
    }

    const adminAccount = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({ account: adminAccount, chain: base, transport: http(RPC_URL) });

    // Call activatePod or vetoPod on the manager contract
    let hash: `0x${string}`;
    if (action === 'activate') {
      hash = await walletClient.writeContract({
        address: managerAddress,
        abi: POD_MANAGER_ABI,
        functionName: 'activatePod',
        args: [pod.blockchain_pod_id],
      });
    } else {
      hash = await walletClient.writeContract({
        address: managerAddress,
        abi: POD_MANAGER_ABI,
        functionName: 'vetoPod',
        args: [pod.blockchain_pod_id, reason || 'Vetoed'],
      });
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== 'success') {
      throw new Error(`${action} transaction failed on-chain`);
    }

    // On activation: deploy a PodCreationManagerV2 for this pod via the factory
    // so it can approve its own sub-pods later
    let deployedManagerAddress: string | null = null;
    if (action === 'activate' && FACTORY_ADDRESS && pod.management_hat_id) {
      try {
        const deployHash = await walletClient.writeContract({
          address: FACTORY_ADDRESS,
          abi: FACTORY_ABI,
          functionName: 'deployManager',
          args: [
            pod.id,
            BigInt(pod.management_hat_id),
            BigInt(pod.management_hat_id), // pod leaders gate their own sub-pods
            [], // no default tokens needed (sub-pods don't auto-deploy treasury)
            adminAccount.address,
          ],
        });

        const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash, timeout: 60_000 });

        // Extract deployed address from ManagerDeployed event
        if (deployReceipt.status === 'success') {
          const { decodeEventLog } = await import('viem');
          for (const log of deployReceipt.logs) {
            try {
              const decoded = decodeEventLog({
                abi: [MANAGER_DEPLOYED_EVENT],
                data: log.data,
                topics: log.topics,
                eventName: 'ManagerDeployed',
              });
              deployedManagerAddress = (decoded.args as any).manager as string;
              break;
            } catch {
              // not this log
            }
          }
        }

        if (deployedManagerAddress) {
          console.log(`✅ Deployed sub-pod manager for ${pod.name}:`, deployedManagerAddress);
        }
      } catch (deployErr: any) {
        // Non-fatal — pod is activated, manager can be deployed manually later
        console.warn('⚠️ Failed to deploy sub-pod manager (non-fatal):', deployErr.message);
      }
    }

    // Update DB
    if (action === 'activate') {
      await supabaseAdmin
        .from('pods')
        .update({
          status: 'active',
          is_active: true,
          ...(deployedManagerAddress ? { creation_manager_address: deployedManagerAddress } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', podId);
    } else {
      await supabaseAdmin
        .from('pods')
        .update({ status: 'vetoed', is_active: false, updated_at: new Date().toISOString() })
        .eq('id', podId);
    }

    return NextResponse.json({
      success: true,
      action,
      txHash: hash,
      ...(deployedManagerAddress ? { subPodManagerAddress: deployedManagerAddress } : {}),
    });
  } catch (err: any) {
    console.error('Pod review API error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

// GET: list pending pods for a given context
// ?scope=exec  → all community-level pending pods (for exec dashboard)
// ?scope=pod&parentId=<uuid> → pending sub-pods under a specific pod (for pod leaders)
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const callerAddress = getWalletFromToken(token);
    if (!callerAddress) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') || 'exec';
    const parentId = searchParams.get('parentId');

    let query = supabaseAdmin
      .from('pods')
      .select('id, name, description, pod_leads, created_by_address, pod_image_url, pod_metadata, created_at, status, parent_pod_id, management_hat_id')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false });

    if (scope === 'pod' && parentId) {
      // Sub-pods pending review under a specific parent pod
      query = query.eq('parent_pod_id', parentId);
    } else {
      // Community-level pods: parent is the community pods parent
      const COMMUNITY_PARENT_UUID = '86d2d359-2e38-4267-b7b7-c7f6155063e2';
      query = query.eq('parent_pod_id', COMMUNITY_PARENT_UUID);
    }

    const { data: pods, error } = await query;
    if (error) throw error;

    return NextResponse.json({ pods: pods || [] });
  } catch (err: any) {
    console.error('Pod review list error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

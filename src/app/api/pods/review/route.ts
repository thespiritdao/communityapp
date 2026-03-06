// src/app/api/pods/review/route.ts
// Pod review — authorize and record activate/veto actions for pending pods.
//
// Flow (gas-sponsored):
//   1. POST { action: 'authorize', podId, pendingAction } — verify hat ownership on-chain,
//      return { authorized, contractAddress, functionName, encodedCallData, blockchainPodId }
//   2. Client executes the call via sendUserOperation with useCdpPaymaster: true (gasless)
//   3. POST { action: 'dbUpdate', podId, pendingAction, txHash } — update DB status
//
// For community-level pods: caller must wear the exec hat.
// For sub-pods: caller must wear the parent pod's management hat.

import { type NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { getHatId } from '@/lib/hatRegistry';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;

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

// Read management hat ID from the contract after activation
const POD_MANAGER_VIEW_ABI = [
  {
    name: 'getPodData',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'podId', type: 'string' },
          { name: 'name', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'imageURI', type: 'string' },
          { name: 'podLeads', type: 'address[]' },
          { name: 'managementHatId', type: 'uint256' },
          { name: 'treasuryContract', type: 'address' },
          { name: 'creator', type: 'address' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

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

async function resolveManagerAndHat(pod: {
  id: string;
  parent_pod_id: string | null;
  management_hat_id: string | null;
  creation_manager_address: string | null;
}) {
  const COMMUNITY_PARENT_UUID = '86d2d359-2e38-4267-b7b7-c7f6155063e2';
  const isCommunityLevel = !pod.parent_pod_id || pod.parent_pod_id === COMMUNITY_PARENT_UUID;

  if (isCommunityLevel) {
    return {
      managerAddress: process.env.NEXT_PUBLIC_POD_CREATION_MANAGER as `0x${string}` | null,
      approverHatId: (await getHatId('EXECUTIVE_POD_LEADER')) || null,
    };
  }

  const { data: parentPod } = await supabaseAdmin
    .from('pods')
    .select('creation_manager_address, management_hat_id')
    .eq('id', pod.parent_pod_id)
    .single();

  return {
    managerAddress: ((parentPod?.creation_manager_address as `0x${string}`) ||
      (process.env.NEXT_PUBLIC_POD_CREATION_MANAGER as `0x${string}`)) ?? null,
    approverHatId: parentPod?.management_hat_id || null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const callerAddress = getWalletFromToken(token);
    if (!callerAddress) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const body = await req.json();
    const { podId, action } = body;

    if (!podId || !action || !['authorize', 'dbUpdate'].includes(action)) {
      return NextResponse.json(
        { error: 'Missing or invalid fields: podId, action (authorize|dbUpdate)' },
        { status: 400 },
      );
    }

    // ── Phase 1: authorize ──────────────────────────────────────────────────
    // Verify the caller wears the required hat on-chain, then return the
    // encoded calldata for the client to execute via CDP smart wallet.
    if (action === 'authorize') {
      const { pendingAction, reason } = body;
      if (!pendingAction || !['activate', 'veto'].includes(pendingAction)) {
        return NextResponse.json(
          { error: 'Missing or invalid pendingAction (activate|veto)' },
          { status: 400 },
        );
      }

      const { data: pod, error: podError } = await supabaseAdmin
        .from('pods')
        .select('id, name, blockchain_pod_id, management_hat_id, parent_pod_id, creation_manager_address')
        .eq('id', podId)
        .single();

      if (podError || !pod) {
        return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
      }

      if (!pod.blockchain_pod_id) {
        return NextResponse.json(
          { error: 'Pod has no blockchain_pod_id — cannot call contract' },
          { status: 400 },
        );
      }

      const { managerAddress, approverHatId } = await resolveManagerAndHat(pod);

      if (!managerAddress) {
        return NextResponse.json({ error: 'No creation manager configured for this pod' }, { status: 500 });
      }
      if (!approverHatId) {
        return NextResponse.json({ error: 'Approver hat not configured' }, { status: 500 });
      }

      const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

      const balance = await publicClient.readContract({
        address: HATS_CONTRACT,
        abi: HATS_ABI,
        functionName: 'balanceOf',
        args: [callerAddress as `0x${string}`, BigInt(approverHatId)],
      });

      if ((balance as bigint) === 0n) {
        return NextResponse.json(
          { error: 'Forbidden: caller does not wear the required approval hat' },
          { status: 403 },
        );
      }

      // Encode the calldata — the client will execute this via sendUserOperation
      const callData =
        pendingAction === 'activate'
          ? encodeFunctionData({
              abi: POD_MANAGER_ABI,
              functionName: 'activatePod',
              args: [pod.blockchain_pod_id],
            })
          : encodeFunctionData({
              abi: POD_MANAGER_ABI,
              functionName: 'vetoPod',
              args: [pod.blockchain_pod_id, reason || 'Vetoed'],
            });

      return NextResponse.json({
        authorized: true,
        contractAddress: managerAddress,
        callData,
        blockchainPodId: pod.blockchain_pod_id,
      });
    }

    // ── Phase 2: dbUpdate ───────────────────────────────────────────────────
    // Called after the client's UserOperation lands. Re-verify hat ownership
    // then update the DB record.
    if (action === 'dbUpdate') {
      const { pendingAction, txHash } = body;
      if (!pendingAction || !['activate', 'veto'].includes(pendingAction)) {
        return NextResponse.json(
          { error: 'Missing or invalid pendingAction (activate|veto)' },
          { status: 400 },
        );
      }

      const { data: pod, error: podError } = await supabaseAdmin
        .from('pods')
        .select('id, name, blockchain_pod_id, management_hat_id, parent_pod_id, creation_manager_address')
        .eq('id', podId)
        .single();

      if (podError || !pod) {
        return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
      }

      const { approverHatId, managerAddress } = await resolveManagerAndHat(pod);
      if (!approverHatId) {
        return NextResponse.json({ error: 'Approver hat not configured' }, { status: 500 });
      }

      const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

      const balance = await publicClient.readContract({
        address: HATS_CONTRACT,
        abi: HATS_ABI,
        functionName: 'balanceOf',
        args: [callerAddress as `0x${string}`, BigInt(approverHatId)],
      });

      if ((balance as bigint) === 0n) {
        return NextResponse.json(
          { error: 'Forbidden: caller does not wear the required approval hat' },
          { status: 403 },
        );
      }

      if (pendingAction === 'activate') {
        // Read management hat ID from the contract (it was set during createPodProposal)
        let managementHatId: string | null = pod.management_hat_id || null;
        if (!managementHatId && pod.blockchain_pod_id) {
          try {
            const onChainPod = await publicClient.readContract({
              address: managerAddress as `0x${string}`,
              abi: POD_MANAGER_VIEW_ABI,
              functionName: 'getPodData',
              args: [pod.blockchain_pod_id],
            }) as any;
            if (onChainPod?.managementHatId) {
              managementHatId = onChainPod.managementHatId.toString();
            }
          } catch (e) {
            console.warn('Could not fetch on-chain pod data:', e);
          }
        }

        await supabaseAdmin
          .from('pods')
          .update({
            status: 'active',
            is_active: true,
            ...(managementHatId ? { management_hat_id: managementHatId } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', podId);

        // Create pod_role_permissions so the permission system recognises pod leaders
        if (managementHatId) {
          try {
            const { data: existing } = await supabaseAdmin
              .from('pod_role_permissions')
              .select('id')
              .eq('pod_id', podId)
              .eq('token_address', managementHatId)
              .single();

            if (!existing) {
              await supabaseAdmin.from('pod_role_permissions').insert({
                pod_id: podId,
                token_address: managementHatId,
                role_name: 'Pod Leader',
                permissions: {
                  chatAccess: true,
                  chatModeration: true,
                  governanceParticipation: true,
                  eventCreation: true,
                  treasuryViewing: true,
                  treasuryManagement: true,
                  memberManagement: true,
                  subPodCreation: true,
                  roleAssignment: true,
                  forumAccess: true,
                  forumModeration: false,
                  bountyManagement: true,
                  marketplaceAccess: true,
                  marketplaceManage: true,
                },
                max_holders: 5,
                created_by: callerAddress,
                updated_by: callerAddress,
              });
              console.log(`Created pod_role_permissions for pod ${podId}, hat ${managementHatId}`);
            }
          } catch (roleErr: any) {
            // Non-fatal — pod is active, permissions can be set manually
            console.warn('Failed to create pod_role_permissions:', roleErr.message);
          }
        }
      } else {
        // Hard-delete vetoed pods — they should not appear anywhere in the app
        await supabaseAdmin.from('pods').delete().eq('id', podId);
      }

      return NextResponse.json({ success: true, pendingAction, txHash });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
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
      .in('status', ['pending_review', 'proposed'])
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

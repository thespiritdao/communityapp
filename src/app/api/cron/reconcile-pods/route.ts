// src/app/api/cron/reconcile-pods/route.ts
// Daily reconciler for two-phase write drift between chain and DB.
// Chain state (PodCreationManagerV2) is the source of truth for pods:
//   1. DB pods stuck in pending_review that are Active/Vetoed on-chain
//      (the client's phase-2 dbUpdate never landed) → finalize / delete
//   2. DB pods missing management_hat_id or blockchain_pod_id → backfill from chain
//   3. On-chain pods with no DB row (DB insert failed after on-chain success) → insert
//   4. Donations stuck in pending_mint for >24h → re-notify Executive Pod
//      (the mint itself must stay a frontend exec action — admin EOA cannot
//      use the CDP paymaster)

import { appUrl } from '@/config/deployment';
import { PODS } from '@/config/deployment';
import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { finalizePodActivation } from '@/lib/podFinalize';
import { requireCronAllowingDev } from '@/lib/cronAuth';

export const runtime = 'nodejs';
export const maxDuration = 300;

const POD_CREATION_MANAGER = process.env.NEXT_PUBLIC_POD_CREATION_MANAGER as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const EXEC_POD_ID = (PODS.governance ?? '');
const BASE_URL = appUrl();

// PodStatus enum in PodCreationManagerV2: 0=PendingReview, 1=Active, 2=Vetoed, 3=Inactive
const CHAIN_STATUS = { PENDING_REVIEW: 0, ACTIVE: 1, VETOED: 2, INACTIVE: 3 } as const;

const POD_MANAGER_ABI = [
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
  {
    name: 'podExists',
    type: 'function',
    inputs: [{ name: '', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'allPodIds',
    type: 'function',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
] as const;

async function notifyExecutivePod(title: string, message: string, contextUrl: string) {
  // pod_members keys members by `wallet`; revoked_by_governance defaults to false.
  const { data: members, error } = await supabaseAdmin
    .from('pod_members')
    .select('wallet')
    .eq('pod_id', EXEC_POD_ID)
    .eq('is_active', true)
    .or('revoked_by_governance.is.null,revoked_by_governance.eq.false');

  if (error || !members?.length) {
    console.warn('reconcile-pods: no EP members found for notification');
    return;
  }

  await Promise.allSettled(
    members.map(({ wallet: wallet_address }: { wallet: string }) =>
      fetch(`${BASE_URL}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': process.env.INTERNAL_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        },
        body: JSON.stringify({
          recipient_address: wallet_address,
          sender_address: '0x0000000000000000000000000000000000000000',
          notification_type: 'pod_approval_request',
          title,
          message,
          context_url: contextUrl,
          context_type: 'donation',
          priority: 'high',
          category: 'governance',
        }),
      })
    )
  );
}

async function handleReconcile(request: NextRequest) {
  const denied = requireCronAllowingDev(request);
  if (denied) return denied;

  const results = {
    activated: [] as string[],
    vetoedDeleted: [] as string[],
    hatBackfilled: [] as string[],
    chainIdBackfilled: [] as string[],
    orphansInserted: [] as string[],
    staleDonations: 0,
    errors: [] as string[],
  };

  if (!POD_CREATION_MANAGER) {
    return NextResponse.json({ error: 'POD_CREATION_MANAGER not configured' }, { status: 500 });
  }

  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

  // ── 1+2: DB pods pending review — compare against chain ──────────────────
  const { data: pendingPods } = await supabaseAdmin
    .from('pods')
    .select('id, name, blockchain_pod_id, management_hat_id, pod_leads, status')
    .in('status', ['pending_review', 'proposed']);

  for (const pod of pendingPods || []) {
    try {
      let chainId: string | null = pod.blockchain_pod_id;
      if (!chainId) {
        // Server-create path uses the DB id as the contract podId
        const exists = await publicClient.readContract({
          address: POD_CREATION_MANAGER,
          abi: POD_MANAGER_ABI,
          functionName: 'podExists',
          args: [pod.id],
        });
        if (!exists) continue; // never made it on-chain — nothing to reconcile
        chainId = String(pod.id);
        await supabaseAdmin.from('pods').update({ blockchain_pod_id: chainId }).eq('id', pod.id);
        results.chainIdBackfilled.push(pod.id);
      }

      const onChain = await publicClient.readContract({
        address: POD_CREATION_MANAGER,
        abi: POD_MANAGER_ABI,
        functionName: 'getPodData',
        args: [chainId],
      }) as any;

      const chainHatId = onChain?.managementHatId && onChain.managementHatId !== 0n
        ? onChain.managementHatId.toString()
        : null;
      const chainStatus = Number(onChain?.status ?? CHAIN_STATUS.PENDING_REVIEW);

      if (chainStatus === CHAIN_STATUS.ACTIVE) {
        await finalizePodActivation({
          podId: pod.id,
          managementHatId: pod.management_hat_id || chainHatId,
          podLeads: pod.pod_leads || [],
          actorAddress: 'reconcile-cron',
        });
        results.activated.push(pod.id);
      } else if (chainStatus === CHAIN_STATUS.VETOED) {
        // Same as the review route's veto dbUpdate — vetoed pods are hard-deleted
        await supabaseAdmin.from('pods').delete().eq('id', pod.id);
        results.vetoedDeleted.push(pod.id);
      } else if (!pod.management_hat_id && chainHatId) {
        await supabaseAdmin.from('pods').update({ management_hat_id: chainHatId }).eq('id', pod.id);
        results.hatBackfilled.push(pod.id);
      }
    } catch (e: any) {
      results.errors.push(`pod ${pod.id}: ${e.message}`);
    }
  }

  // ── 3: on-chain pods missing from DB ─────────────────────────────────────
  try {
    const chainPodIds: string[] = [];
    for (let i = 0; i < 2000; i++) {
      try {
        chainPodIds.push(await publicClient.readContract({
          address: POD_CREATION_MANAGER,
          abi: POD_MANAGER_ABI,
          functionName: 'allPodIds',
          args: [BigInt(i)],
        }) as string);
      } catch {
        break; // past the end of the array
      }
    }

    if (chainPodIds.length > 0) {
      const { data: dbPods } = await supabaseAdmin
        .from('pods')
        .select('id, blockchain_pod_id');
      const known = new Set<string>();
      for (const p of dbPods || []) {
        known.add(p.id);
        if (p.blockchain_pod_id) known.add(p.blockchain_pod_id);
      }

      for (const chainId of chainPodIds) {
        if (known.has(chainId)) continue;
        try {
          const onChain = await publicClient.readContract({
            address: POD_CREATION_MANAGER,
            abi: POD_MANAGER_ABI,
            functionName: 'getPodData',
            args: [chainId],
          }) as any;

          const chainStatus = Number(onChain?.status ?? CHAIN_STATUS.PENDING_REVIEW);
          if (chainStatus === CHAIN_STATUS.VETOED) continue; // don't resurrect vetoed pods

          const chainHatId = onChain?.managementHatId && onChain.managementHatId !== 0n
            ? onChain.managementHatId.toString()
            : null;
          const podLeads = (onChain?.podLeads || []).map((a: string) => a.toLowerCase());

          const { error: insertError } = await supabaseAdmin.from('pods').insert({
            id: chainId,
            name: onChain.name,
            description: onChain.description || '',
            pod_leads: podLeads,
            created_by_address: String(onChain.creator).toLowerCase(),
            pod_image_url: onChain.imageURI || null,
            pod_metadata: { recoveredBy: 'reconcile-cron', recoveredAt: new Date().toISOString() },
            status: 'pending_review',
            is_active: false,
            management_hat_id: chainHatId,
            blockchain_pod_id: chainId,
          });
          if (insertError) {
            results.errors.push(`orphan ${chainId}: ${insertError.message}`);
            continue;
          }

          if (chainStatus === CHAIN_STATUS.ACTIVE) {
            await finalizePodActivation({
              podId: chainId,
              managementHatId: chainHatId,
              podLeads,
              actorAddress: 'reconcile-cron',
            });
          }
          results.orphansInserted.push(chainId);
        } catch (e: any) {
          results.errors.push(`orphan ${chainId}: ${e.message}`);
        }
      }
    }
  } catch (e: any) {
    results.errors.push(`orphan scan: ${e.message}`);
  }

  // ── 4: donations stuck in pending_mint for >24h ──────────────────────────
  try {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: staleMints } = await supabaseAdmin
      .from('pending_donations')
      .select('id, system_tokens_to_mint, user_wallet')
      .eq('status', 'pending_mint')
      .lt('created_at', cutoff);

    if (staleMints?.length) {
      results.staleDonations = staleMints.length;
      const count = staleMints.length;
      const message = staleMints
        .map((d: any) => `${Number(d.system_tokens_to_mint).toFixed(2)} $SYSTEM (${String(d.user_wallet).slice(0, 8)}…)`)
        .join(', ');
      await notifyExecutivePod(
        `${count} Approved Donation${count !== 1 ? 's' : ''} Still Awaiting Mint`,
        message,
        `/pods/${EXEC_POD_ID}/manage?tab=donations`,
      );
    }
  } catch (e: any) {
    results.errors.push(`donations: ${e.message}`);
  }

  console.log('reconcile-pods:', JSON.stringify(results));
  return NextResponse.json({ success: true, ...results });
}

export async function GET(request: NextRequest) {
  return handleReconcile(request);
}

export async function POST(request: NextRequest) {
  return handleReconcile(request);
}

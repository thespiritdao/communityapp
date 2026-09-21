// src/app/api/community-agent/subscribe/route.ts
//
// POST: Record a new community agent subscription after on-chain $SYSTEM burn.
// GET: Check current subscription status for a pod.
//
// The actual payment happens client-side via PurchaseRouterDecentralized.
// This endpoint verifies the tx and records the subscription.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { EXEMPT_POD_IDS } from '@/services/communityAgent/types';
import { getSubscriptionStatus } from '@/services/communityAgent/configService';
import { requireWalletMatch } from '@/lib/apiPodGuard';

export const runtime = 'nodejs';

const SUBSCRIPTION_DURATION_DAYS = 30;
const SUBSCRIPTION_PRICE_SYSTEM = 25; // 25 $SYSTEM per month

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
});

/**
 * GET: Check subscription status for a pod
 */
export async function GET(req: NextRequest) {
  const podId = req.nextUrl.searchParams.get('podId');
  if (!podId) {
    return NextResponse.json({ error: 'podId required' }, { status: 400 });
  }

  const status = await getSubscriptionStatus(podId);
  return NextResponse.json(status);
}

/**
 * POST: Record subscription after on-chain payment
 * Body: { podId, txHash, walletAddress }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { podId, txHash, walletAddress } = body;

  // Audit sweep: the leader check compared pod_leads against a wallet taken
  // from the body. The claimed wallet must be the session's own.
  const walletOrDenied = await requireWalletMatch(req, walletAddress);
  if (walletOrDenied instanceof Response) return walletOrDenied;

  if (!podId || !txHash || !walletAddress) {
    return NextResponse.json(
      { error: 'podId, txHash, and walletAddress are required' },
      { status: 400 },
    );
  }

  // Exempt pods don't need to subscribe
  if (EXEMPT_POD_IDS.includes(podId)) {
    return NextResponse.json({ error: 'This pod is exempt from subscription' }, { status: 400 });
  }

  try {
    // Verify the caller is a pod leader
    const { data: pod } = await supabaseAdmin
      .from('pods')
      .select('pod_leads, name')
      .eq('id', podId)
      .single();

    if (!pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    const isLeader = pod.pod_leads?.some(
      (lead: string) => lead.toLowerCase() === walletAddress.toLowerCase(),
    );

    if (!isLeader) {
      return NextResponse.json({ error: 'Only pod leaders can subscribe' }, { status: 403 });
    }

    // Existence referendum gate (Congregant Phase 4): once a pod's renewals
    // are decided by vote, payment requires an approved, unconsumed
    // agent_renewal proposal. The first-ever subscription (no referendum has
    // run yet) is exempt — the referendum cycle begins with it.
    const { data: moduleRow } = await supabaseAdmin
      .from('pod_modules')
      .select('community_agent_config')
      .eq('pod_id', podId)
      .single();
    const agentCfg = moduleRow?.community_agent_config || {};
    const referendumHasRun = (agentCfg.renewal_history ?? []).length > 0
      || agentCfg.active_renewal_proposal_id
      || agentCfg.renewal_rejected_proposal_id;

    if (agentCfg.renewal_by_vote !== false && referendumHasRun) {
      if (agentCfg.renewal_rejected_proposal_id && !agentCfg.approved_renewal_proposal_id) {
        return NextResponse.json(
          {
            error:
              'The community voted not to renew this agent. A new renewal proposal must pass before payment can be made.',
          },
          { status: 403 },
        );
      }
      if (!agentCfg.approved_renewal_proposal_id) {
        return NextResponse.json(
          {
            error:
              'Renewal requires an approved existence referendum. Wait for the current referendum to close, or create a renewal proposal in governance.',
          },
          { status: 403 },
        );
      }
    }

    // Verify the transaction exists and is confirmed on-chain
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (!receipt || receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction not confirmed or failed' }, { status: 400 });
    }

    // Check if this txHash was already used (prevent replay)
    const { data: existing } = await supabaseAdmin
      .from('community_agent_subscriptions')
      .select('id')
      .eq('tx_hash', txHash)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'Transaction already used for subscription' }, { status: 409 });
    }

    // Calculate subscription dates
    const now = new Date();
    const expiresAt = new Date(now);

    // Check if there's an existing active subscription — extend it
    const { data: currentSub } = await supabaseAdmin
      .from('community_agent_subscriptions')
      .select('expires_at')
      .eq('pod_id', podId)
      .eq('status', 'active')
      .single();

    if (currentSub?.expires_at) {
      const currentExpiry = new Date(currentSub.expires_at);
      if (currentExpiry > now) {
        // Extend from current expiry
        expiresAt.setTime(currentExpiry.getTime());
      }
    }

    expiresAt.setDate(expiresAt.getDate() + SUBSCRIPTION_DURATION_DAYS);

    // Upsert subscription record (metadata-free columns stay compatible;
    // the authorizing referendum, if any, is recorded alongside)
    const { error: upsertError } = await supabaseAdmin
      .from('community_agent_subscriptions')
      .upsert(
        {
          pod_id: podId,
          status: 'active',
          subscribed_by: walletAddress,
          tx_hash: txHash,
          amount_system: SUBSCRIPTION_PRICE_SYSTEM,
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: 'pod_id' },
      );

    if (upsertError) {
      console.error('[Subscribe] Upsert failed:', upsertError);
      return NextResponse.json({ error: 'Failed to record subscription' }, { status: 500 });
    }

    // Consume the referendum authorization — one approved vote funds exactly
    // one renewal period.
    if (agentCfg.approved_renewal_proposal_id) {
      await supabaseAdmin
        .from('pod_modules')
        .update({
          community_agent_config: {
            ...agentCfg,
            approved_renewal_proposal_id: null,
            renewal_rejected_proposal_id: null,
            last_renewal_proposal_id: agentCfg.approved_renewal_proposal_id,
            last_renewal_tx: txHash,
          },
          updated_at: now.toISOString(),
        })
        .eq('pod_id', podId);
    }

    console.log(`[Subscribe] Pod ${pod.name} subscribed until ${expiresAt.toISOString()}`);

    return NextResponse.json({
      success: true,
      expiresAt: expiresAt.toISOString(),
      durationDays: SUBSCRIPTION_DURATION_DAYS,
    });
  } catch (err: any) {
    console.error('[Subscribe] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

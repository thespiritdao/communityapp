import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendServerNotificationBatch } from '@/lib/serverNotifications';
import { getWalletFromRequest } from '@/lib/serverPodAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Resolve pod_id for a named role from pod_role_permissions.
 * Single source of truth — no hardcoded UUIDs.
 */
async function getPodIdByRole(roleName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('pod_role_permissions')
    .select('pod_id')
    .ilike('role_name', roleName)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.pod_id;
}

/**
 * Resolve wallet addresses of all members of a pod.
 * Tries active_pod_members first, falls back to pods.pod_leads.
 */
async function resolvePodMembers(podId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('active_pod_members')
      .select('wallet')
      .eq('pod_id', podId);

    if (!error && data && data.length > 0) {
      return data.map((r: { wallet: string }) => r.wallet.toLowerCase());
    }
  } catch {
    // fall through
  }

  const { data: pod } = await supabase
    .from('pods')
    .select('pod_leads')
    .eq('id', podId)
    .single();

  if (pod?.pod_leads?.length) {
    return (pod.pod_leads as string[]).map((w: string) => w.toLowerCase());
  }

  return [];
}

/**
 * POST /api/claims/confirm
 *
 * Called by the frontend after the on-chain burnForClaim() transaction confirms.
 * Records the transaction hash and moves the claim to 'awaiting_executive_approval'.
 * Notifies all Executive Pod members so they can action the claim.
 *
 * Body:
 * - payoutRef: UUID from /api/claims/request
 * - burnTxHash: On-chain transaction hash
 * - walletAddress: Caller's wallet (for verification)
 */
export async function POST(request: NextRequest) {
  try {
    // Bind the caller to the wallet via verified JWT — never trust a body field.
    // Previously walletAddress came from the body and the claim was matched
    // against that same body value (circular), letting anyone confirm a burn on
    // another member's claim.
    const callerAddress = getWalletFromRequest(request);
    if (!callerAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { payoutRef, burnTxHash } = body;

    if (!payoutRef || !burnTxHash) {
      return NextResponse.json(
        { error: 'payoutRef and burnTxHash required' },
        { status: 400 },
      );
    }

    const walletAddress = callerAddress;

    // Verify the claim belongs to the authenticated caller
    const { data: claim, error: fetchError } = await supabase
      .from('token_claims')
      .select('*')
      .eq('id', payoutRef)
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (fetchError || !claim) {
      return NextResponse.json(
        { error: 'Claim not found or does not belong to this wallet' },
        { status: 404 },
      );
    }

    if (claim.status !== 'pending_burn') {
      return NextResponse.json(
        { error: `Claim is already in status: ${claim.status}` },
        { status: 400 },
      );
    }

    // Mark as burned and awaiting executive approval
    const { error: updateError } = await supabase
      .from('token_claims')
      .update({
        burn_tx_hash: burnTxHash,
        burned_at: new Date().toISOString(),
        status: 'awaiting_executive_approval',
      })
      .eq('id', payoutRef);

    if (updateError) {
      console.error('❌ Failed to confirm claim burn:', updateError);
      return NextResponse.json(
        { error: 'Failed to update claim record' },
        { status: 500 },
      );
    }

    console.log(`🔥 Token burn confirmed for claim ${payoutRef}, tx: ${burnTxHash}`);

    // ── Notify Executive Pod members ────────────────────────────────────────
    // Fire-and-forget: failure must never block the response
    notifyExecPod({
      claimId: payoutRef,
      claimerWallet: walletAddress.toLowerCase(),
      amount: claim.system_tokens_to_burn,
      burnTxHash,
    }).catch((err) => console.error('⚠️ Failed to notify exec pod:', err));

    return NextResponse.json({
      success: true,
      message: 'Burn confirmed. Your payout request is now awaiting Executive Pod approval.',
      status: 'awaiting_executive_approval',
    });

  } catch (error: any) {
    console.error('❌ Claim confirm error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}

async function notifyExecPod({
  claimId,
  claimerWallet,
  amount,
  burnTxHash,
}: {
  claimId: string;
  claimerWallet: string;
  amount: number | string;
  burnTxHash: string;
}) {
  const execPodId = await getPodIdByRole('Executive Pod Leader');
  if (!execPodId) {
    console.warn('notifyExecPod: could not resolve Executive Pod ID');
    return;
  }

  const members = await resolvePodMembers(execPodId);
  const recipients = members.filter((w) => w !== claimerWallet);

  if (recipients.length === 0) return;

  const displayAmount = amount != null ? Number(amount).toLocaleString() : '?';
  const profileUrl = `/identity/${claimerWallet}`;
  // Link directly to the Claims tab in exec pod manage page
  const manageUrl = `/pods/${execPodId}/manage?tab=claims`;

  const payloads = recipients.map((wallet) => ({
    recipient_address: wallet,
    sender_address: claimerWallet,
    notification_type: 'claim_approval_request',
    title: 'New Token Claim Request',
    message: `A member has burned ${displayAmount} $SYSTEM and submitted a fiat payout request. View their profile at ${profileUrl} and approve or reject at ${manageUrl}.`,
    context_url: manageUrl,
    context_type: 'governance',
    context_id: claimId,
    priority: 'high' as const,
  }));

  const { sent, skipped } = await sendServerNotificationBatch(payloads);
  console.log(`✅ Notified ${sent} exec pod members of claim ${claimId} (${skipped} skipped by prefs)`);
}

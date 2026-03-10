import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    const body = await request.json();
    const { payoutRef, burnTxHash, walletAddress } = body;

    if (!payoutRef || !burnTxHash || !walletAddress) {
      return NextResponse.json(
        { error: 'payoutRef, burnTxHash, and walletAddress required' },
        { status: 400 },
      );
    }

    // Verify the claim belongs to this wallet
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
  const manageUrl = '/claims/manage';

  const rows = recipients.map((wallet) => ({
    recipient_address: wallet,
    sender_address: claimerWallet,
    notification_type: 'claim_approval_request',
    title: 'New Token Claim Request',
    message: `A member has burned ${displayAmount} $SYSTEM and submitted a fiat payout request. Review their identity profile and approve or reject the claim.`,
    context_url: manageUrl,
    context_type: 'claim',
    context_id: claimId,
    metadata: {
      profile_url: profileUrl,
      burn_tx_hash: burnTxHash,
      amount: displayAmount,
    },
  }));

  const { error } = await supabase.from('general_notifications').insert(rows);
  if (error) {
    console.error('notifyExecPod: DB insert error:', error);
  } else {
    console.log(`✅ Notified ${recipients.length} exec pod members of claim ${claimId}`);
  }
}

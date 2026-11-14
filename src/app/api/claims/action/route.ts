import { emailFrom } from '@/config/deployment.server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { Resend } from 'resend';
import { sendServerNotification } from '@/lib/serverNotifications';
import { requireWallet } from '@/lib/apiPodGuard';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Verify the caller holds the Executive Pod Leader hat.
 */
async function verifyExecLeader(callerAddress: string): Promise<boolean> {
  try {
    // Resolve exec pod ID from pod_role_permissions
    const { data: roleData } = await supabase
      .from('pod_role_permissions')
      .select('token_address')
      .ilike('role_name', 'Executive Pod Leader')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!roleData?.token_address || !process.env.NEXT_PUBLIC_HATS_CONTRACT) {
      return false;
    }

    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
    });

    const balance = await publicClient.readContract({
      address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
      abi: [
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
      ],
      functionName: 'balanceOf',
      args: [callerAddress as `0x${string}`, BigInt(roleData.token_address)],
    });

    return (balance as bigint) > 0n;
  } catch (err) {
    console.error('verifyExecLeader error:', err);
    return false;
  }
}

/**
 * POST /api/claims/action
 *
 * EP member approves or rejects a token claim.
 *
 * Body:
 * - claimId: UUID of the claim
 * - action: 'approve' | 'reject'
 * - note: optional reviewer note
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { claimId, action, note } = body;

    // The reviewer is the session wallet. A body-supplied reviewerAddress was
    // trusted until 2026-10, so passing any Exec hat wearer's address worked.
    const walletOrDenied = await requireWallet(request);
    if (walletOrDenied instanceof Response) return walletOrDenied;
    const reviewerAddress = walletOrDenied;

    if (!claimId || !action) {
      return NextResponse.json(
        { error: 'claimId and action required' },
        { status: 400 },
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 },
      );
    }

    // Verify caller is an EP member
    const isAuthorized = await verifyExecLeader(reviewerAddress);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Not authorized — Executive Pod hat required' },
        { status: 403 },
      );
    }

    // Fetch the claim
    const { data: claim, error: fetchError } = await supabase
      .from('token_claims')
      .select('*')
      .eq('id', claimId)
      .single();

    if (fetchError || !claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    if (claim.status !== 'awaiting_executive_approval') {
      return NextResponse.json(
        { error: `Claim is not pending approval (status: ${claim.status})` },
        { status: 400 },
      );
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const { error: updateError } = await supabase
      .from('token_claims')
      .update({
        status: newStatus,
        reviewed_by: reviewerAddress.toLowerCase(),
        reviewed_at: new Date().toISOString(),
        reviewer_note: note || null,
      })
      .eq('id', claimId);

    if (updateError) {
      console.error('Failed to update claim:', updateError);
      return NextResponse.json({ error: 'Failed to update claim' }, { status: 500 });
    }

    // Notify the claimant
    const claimantWallet = claim.wallet_address as string | undefined;
    if (claimantWallet) {
      const notifMessage =
        action === 'approve'
          ? 'Your token claim has been approved by the Executive Pod. Payout will be processed shortly.'
          : `Your token claim has been reviewed by the Executive Pod.${note ? ` Note: ${note}` : ''}`;

      await sendServerNotification({
        recipient_address: claimantWallet,
        sender_address: reviewerAddress.toLowerCase(),
        notification_type: action === 'approve' ? 'claim_approved' : 'claim_rejected',
        title: action === 'approve' ? 'Claim Approved' : 'Claim Not Approved',
        message: notifMessage,
        context_url: '/claims',
        context_type: 'governance',
        context_id: claimId,
        priority: 'high',
      });
    }

    console.log(`✅ Claim ${claimId} ${newStatus} by ${reviewerAddress}`);

    // Send email to claimant (awaited so result is logged + returned in response)
    let emailResult: { sent: boolean; to?: string; error?: string } = { sent: false };
    if (claim.payout_email) {
      try {
        await sendClaimEmail({
          action,
          toEmail: claim.payout_email as string,
          amount: claim.system_tokens_to_burn,
          reviewerNote: note,
          claimId,
        });
        emailResult = { sent: true, to: claim.payout_email };
        console.log(`📧 Claim email sent to ${claim.payout_email}`);
      } catch (err: any) {
        emailResult = { sent: false, to: claim.payout_email, error: err.message };
        console.error('⚠️ Failed to send claim email:', err);
      }
    } else {
      emailResult = { sent: false, error: 'no payout_email on claim' };
      console.warn(`⚠️ Claim ${claimId} has no payout_email — skipping email`);
    }

    return NextResponse.json({ success: true, status: newStatus, email: emailResult });

  } catch (error: any) {
    console.error('Claim action error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}

async function sendClaimEmail({
  action,
  toEmail,
  amount,
  reviewerNote,
  claimId,
}: {
  action: 'approve' | 'reject';
  toEmail: string;
  amount: number | string;
  reviewerNote?: string;
  claimId: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const displayAmount = amount != null ? Number(amount).toLocaleString() : '?';
  const from = emailFrom();

  if (action === 'approve') {
    await resend.emails.send({
      from,
      to: toEmail,
      subject: `Your $SYSTEM token claim has been approved`,
      text: [
        `Great news — your claim to convert ${displayAmount} $SYSTEM tokens has been approved by the Executive Pod.`,
        '',
        'To complete your payout, please reply to this email with your bank details:',
        '  • Bank name',
        '  • Account holder name',
        '  • Account number',
        '  • Routing number (ACH)',
        '  • (International) SWIFT/IBAN if applicable',
        '',
        'We will process your fiat transfer once we receive this information.',
        '',
        `Claim reference: ${claimId}`,
        '',
        '— SpiritDAO Executive Pod',
      ].join('\n'),
    });
  } else {
    await resend.emails.send({
      from,
      to: toEmail,
      subject: `Your $SYSTEM token claim has been rejected`,
      text: [
        `Your claim to convert ${displayAmount} $SYSTEM tokens has been reviewed and rejected by the Executive Pod.`,
        '',
        `Reason: ${reviewerNote || 'No reason provided.'}`,
        '',
        'Please note that your tokens have already been permanently removed from circulation. If you believe this decision was made in error, please contact the Executive Pod directly through the SpiritDAO platform.',
        '',
        `Claim reference: ${claimId}`,
        '',
        '— SpiritDAO Executive Pod',
      ].join('\n'),
    });
  }

  console.log(`📧 Claim email sent to ${toEmail} (${action})`);
}

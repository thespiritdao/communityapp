import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/claims/confirm
 *
 * Called by the frontend after the on-chain burnForClaim() transaction confirms.
 * Records the transaction hash and moves the claim to 'awaiting_executive_approval'.
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

    // TODO: Notify executive pod (implement notification service)
    console.log(`🔥 Token burn confirmed for claim ${payoutRef}, tx: ${burnTxHash}`);

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

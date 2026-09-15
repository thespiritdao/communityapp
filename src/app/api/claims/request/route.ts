import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { requireWalletMatch } from '@/lib/apiPodGuard';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/claims/request
 *
 * Records a token burn / fiat payout request.
 *
 * The frontend calls this BEFORE executing the on-chain burn to obtain
 * a payoutRef UUID. That UUID is passed to TokenClaim.burnForClaim()
 * so the on-chain event is linked to this database record.
 *
 * Flow:
 * 1. Validate inputs
 * 2. Insert a pending claim record → receive UUID (payoutRef)
 * 3. Frontend uses payoutRef in the burnForClaim() transaction
 * 4. Frontend calls POST /api/claims/confirm with the tx hash
 * 5. Executive Pod is notified and issues fiat payout off-chain
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, amount, payoutEmail, payoutNote } = body;

    // Audit F5: any wallet plus any payout email could open a claim. A claim
    // may only be opened for the session's own wallet.
    const walletOrDenied = requireWalletMatch(request, walletAddress);
    if (walletOrDenied instanceof Response) return walletOrDenied;

    // ─── Validation ───────────────────────────────────────────────────────────

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: 'Valid wallet address required' },
        { status: 400 },
      );
    }

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 },
      );
    }

    if (!payoutEmail || !payoutEmail.includes('@')) {
      return NextResponse.json(
        { error: 'Valid payout email required' },
        { status: 400 },
      );
    }

    // ─── Create pending claim record ──────────────────────────────────────────

    const payoutRef = randomUUID();

    const { data: claim, error: dbError } = await supabase
      .from('token_claims')
      .insert({
        id: payoutRef,
        wallet_address: walletAddress.toLowerCase(),
        system_tokens_to_burn: parsedAmount,
        estimated_payout_usd: parsedAmount, // 1:1 peg, fees deducted at payout
        payout_email: payoutEmail,
        payout_note: payoutNote || null,
        status: 'pending_burn', // waiting for on-chain burn tx
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ Failed to create claim record:', dbError);
      return NextResponse.json(
        { error: 'Failed to create claim record', details: dbError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      payoutRef: claim.id,
      message: 'Claim request created. Use payoutRef in the burnForClaim transaction.',
      claim: {
        id: claim.id,
        amount: parsedAmount,
        status: 'pending_burn',
      },
    });

  } catch (error: any) {
    console.error('❌ Claim request error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}

/**
 * GET /api/claims/request?wallet=0x...
 *
 * Returns all claims for a given wallet address.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');

    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json(
        { error: 'Valid wallet address required' },
        { status: 400 },
      );
    }

    const { data: claims, error } = await supabase
      .from('token_claims')
      .select('id, system_tokens_to_burn, estimated_payout_usd, status, created_at, burn_tx_hash, approved_at')
      .eq('wallet_address', wallet.toLowerCase())
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch claims' },
        { status: 500 },
      );
    }

    return NextResponse.json({ claims: claims || [] });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

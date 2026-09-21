import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getWalletFromRequest, isExecutiveLeader } from '@/lib/serverPodAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/donations/reject
 *
 * An Executive Pod Leader rejects a donation — used to clear donations that
 * were never paid (payment_pending) or should not be minted. Sets status to
 * 'failed' with a reason; the row stays for audit (visible under "All").
 *
 * Auth: Authorization: Bearer <supabase JWT>. The rejecting executive is the
 * verified JWT wallet — never a request-body field (matches the approve fix).
 *
 * Body: { donationId, reason? }
 */
export async function POST(request: NextRequest) {
  try {
    const callerAddress = await getWalletFromRequest(request);
    if (!callerAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isExec = await isExecutiveLeader(callerAddress);
    if (!isExec) {
      return NextResponse.json(
        { error: 'Wallet does not have Executive Pod Leader role' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { donationId, reason } = body;
    if (!donationId) {
      return NextResponse.json({ error: 'donationId required' }, { status: 400 });
    }

    const { data: donation, error: fetchError } = await supabase
      .from('pending_donations')
      .select('id, status')
      .eq('id', donationId)
      .single();

    if (fetchError || !donation) {
      return NextResponse.json({ error: 'Donation not found' }, { status: 404 });
    }

    // Cannot reject something already minted (tokens are out) or already resolved.
    if (['minted', 'minting', 'disputed'].includes(donation.status)) {
      return NextResponse.json(
        { error: `Cannot reject a donation in status: ${donation.status}` },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabase
      .from('pending_donations')
      .update({
        status: 'failed',
        failure_reason: reason || `Rejected by executive ${callerAddress.toLowerCase()}`,
      })
      .eq('id', donationId);

    if (updateError) {
      console.error('❌ Failed to reject donation:', updateError);
      return NextResponse.json(
        { error: 'Failed to reject donation', details: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, status: 'failed' });
  } catch (error: any) {
    console.error('❌ Donation reject error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}

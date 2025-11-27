import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bountyId = searchParams.get('id');

    if (!bountyId) {
      return NextResponse.json(
        { error: 'Bounty ID is required' },
        { status: 400 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Get approved bid for this bounty (assignment data is stored in bids table)
    const { data: bid, error } = await supabase
      .from('bids')
      .select(`
        *,
        bounties!inner(
          value_amount,
          value_token,
          onchain_id
        )
      `)
      .eq('bounty_id', bountyId)
      .eq('status', 'approved')
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found
      console.error('Error fetching assignment:', error);
      return NextResponse.json(
        { error: 'Failed to fetch assignment' },
        { status: 500 },
      );
    }

    if (!bid) {
      return NextResponse.json(null);
    }

    // Transform to expected format
    const assignmentData = {
      bidder: bid.bidder_address || '',
      reviewer: bid.reviewer_address || '',
      approver: bid.final_approver_address || '',
      escrowAmount: bid.bounties.value_amount?.toString() || '0',
      paidAmount: '0', // TODO: Track this separately if needed
      onchainBountyId: bid.bounties.onchain_id,
      onchainBidIndex: bid.onchain_bid_index,
    };

    return NextResponse.json(assignmentData);
  } catch (error) {
    console.error('Error in assignment API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

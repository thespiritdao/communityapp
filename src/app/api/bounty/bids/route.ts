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

    // Fetch bids for the bounty
    const { data: bids, error } = await supabase
      .from('bids')
      .select('*')
      .eq('bounty_id', bountyId)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error fetching bids:', error);
      return NextResponse.json(
        { error: 'Failed to fetch bids' },
        { status: 500 },
      );
    }

    // Transform to expected format
    const bidsData = (bids || []).map((bid) => ({
      bidder: bid.bidder_address || '',
      proposal: bid.bid_ipfs_hash || '',
      submittedAt: bid.submitted_at
        ? Math.floor(new Date(bid.submitted_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
      status:
        bid.status === 'pending'
          ? 0
          : bid.status === 'approved'
            ? 1
            : bid.status === 'rejected'
              ? 2
              : 0,
    }));

    return NextResponse.json(bidsData);
  } catch (error) {
    console.error('Error in bids API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

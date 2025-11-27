import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/bounty/dispute?disputeId=xxx
 *
 * Get dispute details by ID
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const disputeId = searchParams.get('disputeId');
    const bountyId = searchParams.get('bountyId');

    // Get single dispute by ID
    if (disputeId) {
      const { data: dispute, error } = await supabase
        .from('bounty_disputes')
        .select('*')
        .eq('id', disputeId)
        .single();

      if (error || !dispute) {
        return NextResponse.json(
          { error: 'Dispute not found', details: error?.message },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        dispute
      });
    }

    // Get all disputes for a bounty
    if (bountyId) {
      const { data: disputes, error } = await supabase
        .from('bounty_disputes')
        .select('*')
        .eq('bounty_id', bountyId)
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json(
          { error: 'Failed to fetch disputes', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        disputes: disputes || [],
        count: disputes?.length || 0
      });
    }

    return NextResponse.json(
      { error: 'Missing disputeId or bountyId parameter' },
      { status: 400 }
    );

  } catch (error) {
    console.error('❌ Error in GET dispute API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

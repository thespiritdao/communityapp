import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/executive/donations
 *
 * Fetch all donations with their approval status
 * Used by Executive Dashboard
 *
 * Query Parameters:
 * - status: Filter by donation status (optional)
 * - limit: Number of donations to return (default: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '100');

    // =====================================================
    // 1. FETCH DONATIONS
    // =====================================================

    let query = supabase
      .from('pending_donations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply status filter if provided
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: donations, error: donationsError } = await query;

    if (donationsError) {
      console.error('❌ Failed to fetch donations:', donationsError);
      return NextResponse.json(
        { error: 'Database error', details: donationsError.message },
        { status: 500 }
      );
    }

    if (!donations || donations.length === 0) {
      return NextResponse.json({
        donations: [],
        count: 0
      });
    }

    // =====================================================
    // 2. FETCH APPROVALS FOR EACH DONATION
    // =====================================================

    const donationIds = donations.map(d => d.id);

    const { data: approvals, error: approvalsError } = await supabase
      .from('donation_approvals')
      .select('donation_id, executive_wallet, approved_at')
      .in('donation_id', donationIds);

    if (approvalsError) {
      console.error('❌ Failed to fetch approvals:', approvalsError);
      // Continue without approvals data
    }

    // =====================================================
    // 3. COMBINE DONATIONS WITH APPROVALS
    // =====================================================

    const donationsWithApprovals = donations.map(donation => {
      const donationApprovals = approvals?.filter(
        approval => approval.donation_id === donation.id
      ) || [];

      return {
        ...donation,
        approvals: donationApprovals,
        currentApprovals: donationApprovals.length,
        requiredApprovals: 2
      };
    });

    // =====================================================
    // 4. CALCULATE STATISTICS
    // =====================================================

    const stats = {
      total: donations.length,
      awaitingApproval: donations.filter(d => d.status === 'awaiting_executive_approval').length,
      pendingMint: donations.filter(d => d.status === 'pending_mint').length,
      minted: donations.filter(d => d.status === 'minted').length,
      totalAmount: donations.reduce((sum, d) => sum + Number(d.fiat_amount), 0),
      totalTokens: donations.reduce((sum, d) => sum + Number(d.system_tokens_to_mint), 0),
    };

    return NextResponse.json({
      donations: donationsWithApprovals,
      count: donationsWithApprovals.length,
      stats
    });

  } catch (error: any) {
    console.error('❌ Executive donations API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

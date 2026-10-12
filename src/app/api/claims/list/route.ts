import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireWallet } from '@/lib/apiPodGuard';
import { isExecutiveLeader } from '@/lib/serverPodAuth';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/claims/list
 *
 * Returns token_claims for EP management UI.
 * Query params:
 * - status: filter by status (default: awaiting_executive_approval)
 * - all: if 'true', return all statuses
 *
 * Requires a session. Executive Leaders see every claim (payout emails
 * included); anyone else sees only their own claims.
 */
export async function GET(request: NextRequest) {
  try {
    const walletOrDenied = await requireWallet(request);
    if (walletOrDenied instanceof Response) return walletOrDenied;
    const wallet = walletOrDenied;
    const isExec = await isExecutiveLeader(wallet);

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const showAll = searchParams.get('all') === 'true';

    let query = supabase
      .from('token_claims')
      .select('*')
      .order('created_at', { ascending: false });

    if (!isExec) {
      query = query.eq('wallet_address', wallet);
    }

    if (!showAll) {
      const status = statusFilter || 'awaiting_executive_approval';
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching claims:', error);
      return NextResponse.json({ error: 'Failed to fetch claims' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error('Claims list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

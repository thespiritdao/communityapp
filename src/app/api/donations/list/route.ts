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
 * GET /api/donations/list
 * Returns donations for the executive dashboard.
 * ?all=true returns all statuses; default returns only active ones.
 *
 * Requires a session. Executive Leaders see every donation; anyone else
 * sees only their own.
 */
export async function GET(request: NextRequest) {
  const walletOrDenied = await requireWallet(request);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallet = walletOrDenied;
  const isExec = await isExecutiveLeader(wallet);

  const { searchParams } = new URL(request.url);
  const all = searchParams.get('all') === 'true';

  let query = supabase
    .from('pending_donations')
    .select('id, user_wallet, fiat_amount, system_tokens_to_mint, community_tokens_to_mint, org_fee, stripe_fee, payment_method, status, settlement_date, created_at, minted_at, mint_transaction_hash')
    .order('created_at', { ascending: false });

  if (!isExec) {
    query = query.eq('user_wallet', wallet);
  }

  if (!all) {
    // Only donations whose payment actually completed. 'payment_pending' means a
    // Stripe intent was created but never paid — never surface those on the
    // exec dashboard (they're still queryable via ?all=true for auditing).
    query = query.in('status', ['awaiting_settlement', 'awaiting_executive_approval', 'pending_mint', 'minting']);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

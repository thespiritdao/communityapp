import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/donations/list
 * Returns donations for the executive dashboard.
 * ?all=true returns all statuses; default returns only active ones.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const all = searchParams.get('all') === 'true';

  let query = supabase
    .from('pending_donations')
    .select('id, user_wallet, fiat_amount, system_tokens_to_mint, community_tokens_to_mint, org_fee, stripe_fee, payment_method, status, settlement_date, created_at, minted_at, mint_transaction_hash')
    .order('created_at', { ascending: false });

  if (!all) {
    query = query.in('status', ['payment_pending', 'awaiting_settlement', 'awaiting_executive_approval', 'pending_mint', 'minting']);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// src/app/api/conference/participant-name/route.ts
// Returns the display name for one or more wallet addresses.
// Used by conference UI to show first/last name instead of wallet address.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json({ error: 'wallet required' }, { status: 400 });
  }

  // user_profiles.wallet_address may be mixed-case — use ilike for case-insensitive match
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('first_name, last_name, email, wallet_address')
    .ilike('wallet_address', wallet.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('participant-name lookup error:', error);
    return NextResponse.json({ name: null }, { status: 200 });
  }

  const fullName = [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim();
  const emailFallback = data?.email ? data.email.split('@')[0] : null;
  const name = fullName || emailFallback || null;

  console.log(`👤 participant-name: wallet=${wallet.slice(0, 8)} → "${name}"`);

  return NextResponse.json({ name });
}

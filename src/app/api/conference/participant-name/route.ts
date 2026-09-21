// src/app/api/conference/participant-name/route.ts
// Returns the display name for a wallet address.
// Used by conference UI to show first/last name instead of wallet address.
//
// Requires the caller's app JWT: member names are member-gated, and this
// route must not be an anonymous name (or, formerly, email) lookup oracle.

import { type NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim();
  if (!token || !JWT_SECRET) return false;
  try {
    const payload = (await verifySessionTokenOrThrow(token)) as { sub?: string };
    return Boolean(payload?.sub);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!await isAuthenticated(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet');

  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'wallet required' }, { status: 400 });
  }

  // user_profiles.wallet_address may be mixed-case — use ilike for case-insensitive match
  const { data, error } = await supabaseAdmin
    .from('public_profiles')
    .select('first_name, last_name')
    .ilike('wallet_address', wallet.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('participant-name lookup error:', error);
    return NextResponse.json({ name: null }, { status: 200 });
  }

  const fullName = [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim();
  const name = fullName || null;

  return NextResponse.json({ name });
}

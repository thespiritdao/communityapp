// src/app/api/community-agent/corpus-optout/route.ts
//
// POST: member self-serve opt-out from discourse ingestion (Congregant
// Phase 5). Setting optOut=true excludes the member's forum content from all
// agent corpora ecosystem-wide; previously derived vectors are removed on the
// next nightly sync.
//
// This is a personal consent decision — any authenticated member may set it
// for themselves; nobody may set it for anyone else.

import { type NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';

async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) return null;
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = await getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { optOut } = await req.json();
  if (typeof optOut !== 'boolean') {
    return NextResponse.json({ error: 'optOut (boolean) required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .update({ exclude_from_agent_corpus: optOut })
    .eq('wallet_address', wallet.toLowerCase());

  if (error) {
    console.error('[corpus-optout] update failed:', error);
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    optOut,
    note: optOut
      ? 'Your forum content is excluded from agent corpora. Existing derived vectors are removed on the next nightly sync.'
      : 'Your forum content may be included in agent corpora for pods that have enabled discourse ingestion.',
  });
}

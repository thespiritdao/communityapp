// src/app/api/explorer/member-introduced/route.ts
// Called once when a user sets their first_name for the first time.
// Writes a member_introduced event to explorer_events so it appears in the Pulse feed.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, displayName, profilePicture } = await req.json();

    if (!walletAddress || !displayName) {
      return NextResponse.json({ error: 'walletAddress and displayName required' }, { status: 400 });
    }

    const normalized = walletAddress.toLowerCase();

    // Idempotency guard — only one member_introduced event per wallet
    const { data: existing } = await supabaseAdmin
      .from('explorer_events')
      .select('id')
      .eq('type', 'member_introduced')
      .eq('actor', normalized)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { error } = await supabaseAdmin
      .from('explorer_events')
      .insert({
        type: 'member_introduced',
        actor: normalized,
        title: `${displayName} joined SpiritDAO`,
        metadata: { displayName, profilePicture: profilePicture ?? null },
      });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[member-introduced] error:', err);
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
  }
}

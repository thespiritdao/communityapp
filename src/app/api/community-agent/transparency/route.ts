// src/app/api/community-agent/transparency/route.ts
//
// GET: "What is the agent's mind made of?" (Congregant Phase 5)
//
// Public per-pod corpus transparency: vector counts, whether forum discourse
// is ingested, whether the agent's own posts feed back into it, and when the
// last sync ran. Extends the honest-mask principle from permissions to
// epistemics — members can see what their agent is built from.
//
// Optionally (with an auth token) includes the caller's own opt-out status.

import { type NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { getCorpusSummary } from '@/services/communityAgent/forumCorpusService';
import { TN_POD_ID } from '@/services/communityAgent/types';
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const podId = req.nextUrl.searchParams.get('podId');
  if (!podId) return NextResponse.json({ error: 'Missing podId' }, { status: 400 });

  const { data } = await supabaseAdmin
    .from('pod_modules')
    .select('community_agent_config, community_agent_enabled')
    .eq('pod_id', podId)
    .single();

  if (!data?.community_agent_enabled) {
    return NextResponse.json({ error: 'No agent enabled for this pod' }, { status: 404 });
  }

  const cfg = data.community_agent_config || {};
  const summary = await getCorpusSummary(podId, cfg, podId === TN_POD_ID);

  // Caller's own opt-out status, when authenticated
  let myOptOut: boolean | null = null;
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (token) {
    const wallet = await getWalletFromToken(token);
    if (wallet) {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('exclude_from_agent_corpus')
        .eq('wallet_address', wallet.toLowerCase())
        .maybeSingle();
      myOptOut = profile?.exclude_from_agent_corpus ?? false;
    }
  }

  return NextResponse.json({ ...summary, myOptOut });
}

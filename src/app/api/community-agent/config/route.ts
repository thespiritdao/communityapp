// src/app/api/community-agent/config/route.ts
//
// GET/PUT community agent configuration for a pod.

import { type NextRequest, NextResponse } from 'next/server';
import { isPodLeader } from '@/lib/serverPodAuth';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import { updateAgentConfig } from '@/services/communityAgent/configService';
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
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = await getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const podId = req.nextUrl.searchParams.get('podId');
  if (!podId) return NextResponse.json({ error: 'Missing podId' }, { status: 400 });

  const { data } = await supabaseAdmin
    .from('pod_modules')
    .select('community_agent_config, community_agent_enabled')
    .eq('pod_id', podId)
    .single();

  return NextResponse.json({
    config: data?.community_agent_config || {},
    enabled: data?.community_agent_enabled || false,
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = await getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const body = await req.json();
  const { podId, config } = body;

  if (!podId) return NextResponse.json({ error: 'Missing podId' }, { status: 400 });
  if (!config || typeof config !== 'object') {
    return NextResponse.json({ error: 'Missing config' }, { status: 400 });
  }

  const isLeader = await isPodLeader(podId, wallet);
  if (!isLeader) {
    return NextResponse.json({ error: 'Forbidden: not a pod leader' }, { status: 403 });
  }

  try {
    // updateAgentConfig merges config, auto-assigns per-pod wallet, and
    // ensures a user_profiles row exists for the agent's display name.
    await updateAgentConfig(podId, config);

    // Return the saved config
    const { data } = await supabaseAdmin
      .from('pod_modules')
      .select('community_agent_config')
      .eq('pod_id', podId)
      .single();

    return NextResponse.json({ config: data?.community_agent_config });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

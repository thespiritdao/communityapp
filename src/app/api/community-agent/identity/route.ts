// src/app/api/community-agent/identity/route.ts
//
// GET: Public identity view of a pod's AI agent — wallet address, wallet type,
// and live on-chain AgentRegistry status.
//
// Intentionally public: the agent's constitutional status (registered as
// artificial, holds no standing) is meant to be inspectable by anyone.

import { NextRequest, NextResponse } from 'next/server';
import { getAgentIdentity } from '@/services/communityAgent/agentWalletService';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const podId = req.nextUrl.searchParams.get('podId');
  if (!podId) {
    return NextResponse.json({ error: 'podId required' }, { status: 400 });
  }

  try {
    const identity = await getAgentIdentity(podId);
    if (!identity) {
      return NextResponse.json({ error: 'No agent enabled for this pod' }, { status: 404 });
    }
    return NextResponse.json({
      ...identity,
      registryAddress: process.env.NEXT_PUBLIC_AGENT_REGISTRY || null,
    });
  } catch (err) {
    console.error('[community-agent/identity] error:', err);
    return NextResponse.json({ error: 'Failed to resolve agent identity' }, { status: 500 });
  }
}

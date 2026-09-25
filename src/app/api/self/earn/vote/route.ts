// src/app/api/self/earn/vote/route.ts
// $SELF earn trigger — trace-level credit for casting a governance vote (D-11).
//
// Called fire-and-forget after a vote persists. Tiny accrual (VOTE_CREDIT, 2min)
// capped per epoch by the earn service. Idempotent per (proposal, voter): a
// re-vote on the same proposal does not re-credit.
//
// Auth: the authenticated voter's own wallet (Bearer JWT). A vote credit can
// only be queued for the wallet that the JWT belongs to.

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';
import {
  getCurrentEpoch,
  queueVoteCredit,
} from '@/features/self/services/selfEarnTriggers';

export const runtime = 'nodejs';

async function walletFromToken(token: string): Promise<string | null> {
  try {
    const p = (await verifySessionTokenOrThrow(token)) as any;
    return p.wallet_address || p.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const caller = await walletFromToken(token);
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { podId, proposalId } = await req.json();
    if (!podId || !proposalId) {
      return NextResponse.json(
        { error: 'Missing required fields: podId, proposalId' },
        { status: 400 },
      );
    }

    const epoch = await getCurrentEpoch();
    if (epoch === null) {
      // $SELF not live yet — silently succeed so voting is never blocked.
      return NextResponse.json({ success: true, queued: false, reason: 'SELF not configured' });
    }

    const result = await queueVoteCredit({
      wallet: caller,
      podId,
      voteRef: `${proposalId}:${caller.toLowerCase()}`,
      epoch,
    });

    return NextResponse.json({ success: true, queued: result.queued, reason: result.reason });
  } catch (error) {
    // Earn failure must NEVER surface to the voter — vote already succeeded.
    console.error('⚠️ self/earn/vote (non-blocking) error:', error);
    return NextResponse.json({ success: false, queued: false }, { status: 200 });
  }
}

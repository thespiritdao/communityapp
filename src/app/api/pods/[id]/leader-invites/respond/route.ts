/**
 * POST /api/pods/[id]/leader-invites/respond   { inviteId, accept: boolean }
 *
 * The invited member accepts or declines. Accepting makes them a leader if the
 * leaders' votes already reach the majority rule; otherwise the other leaders
 * vote on it like any leader application. Declining removes the invitation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireWallet } from '@/lib/apiPodGuard';
import { walletsForBalanceCheck } from '@/services/userWalletsService';
import { respondToLeaderInvite } from '@/lib/podLeaderInvites';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: podId } = await params;
  const walletOrDenied = await requireWallet(request);
  if (walletOrDenied instanceof Response) return walletOrDenied;

  const body = await request.json().catch(() => null);
  const inviteId = typeof body?.inviteId === 'string' ? body.inviteId : '';
  if (!inviteId || typeof body?.accept !== 'boolean') {
    return NextResponse.json({ error: 'inviteId and accept are required' }, { status: 400 });
  }

  const result = await respondToLeaderInvite(
    podId,
    inviteId,
    await walletsForBalanceCheck(walletOrDenied),
    body.accept,
  );
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

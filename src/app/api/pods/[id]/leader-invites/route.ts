/**
 * /api/pods/[id]/leader-invites
 *
 *   GET  → { myInvite, invites }   myInvite: the caller's open invitation to
 *                                   co-lead this pod (or null); invites: open
 *                                   invitations, only when the caller leads it.
 *   POST { invitees: string[] }  → invite wallets to co-lead (leaders only).
 *
 * Nobody becomes a leader until they accept; see src/lib/podLeaderInvites.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { isPodLeader } from '@/lib/serverPodAuth';
import { walletsForBalanceCheck } from '@/services/userWalletsService';
import { createLeaderInvites } from '@/lib/podLeaderInvites';

export const runtime = 'nodejs';

const MAX_INVITES_PER_REQUEST = 10;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: podId } = await params;
  const walletOrDenied = await requireWallet(request);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallets = (await walletsForBalanceCheck(walletOrDenied)).map((w) => w.toLowerCase());

  const { data: open } = await supabaseAdmin
    .from('pod_membership_applications')
    .select('id, applicant_address, submitted_at, metadata')
    .eq('pod_id', podId)
    .eq('intended_role', 'leader')
    .eq('status', 'invited');

  const rows = open ?? [];
  const mine = rows.find((r) => wallets.includes(String(r.applicant_address).toLowerCase())) ?? null;
  const leads = await isPodLeader(podId, walletOrDenied);

  return NextResponse.json({
    myInvite: mine
      ? { id: mine.id, invitedBy: (mine.metadata as any)?.invited_by ?? null, invitedAt: mine.submitted_at }
      : null,
    invites: leads
      ? rows.map((r) => ({ id: r.id, address: r.applicant_address, invitedBy: (r.metadata as any)?.invited_by ?? null, invitedAt: r.submitted_at }))
      : [],
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: podId } = await params;
  const walletOrDenied = await requireWallet(request);
  if (walletOrDenied instanceof Response) return walletOrDenied;

  if (!(await isPodLeader(podId, walletOrDenied))) {
    return NextResponse.json({ error: 'Only this pod\'s leaders can invite co-leaders' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const invitees: unknown = body?.invitees;
  if (!Array.isArray(invitees) || invitees.length === 0) {
    return NextResponse.json({ error: 'invitees must be a non-empty list of wallet addresses' }, { status: 400 });
  }
  if (invitees.length > MAX_INVITES_PER_REQUEST) {
    return NextResponse.json({ error: `At most ${MAX_INVITES_PER_REQUEST} invitations at a time` }, { status: 400 });
  }

  try {
    const result = await createLeaderInvites(podId, walletOrDenied, invitees.map(String));
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not send invitations' }, { status: 500 });
  }
}

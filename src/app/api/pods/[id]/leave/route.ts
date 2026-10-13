// src/app/api/pods/[id]/leave/route.ts
// A member leaves a pod on their own. The on-chain act is theirs: the wallet
// renounces its member hat (Hats renounceHat, sent from the member's smart
// account). This route only records it afterwards, and refuses while the hat
// is still worn so the record cannot run ahead of the chain.
//
// GET  → { canLeave, hatId, reason? } for the caller
// POST → mark the caller's membership inactive (after the renounce lands)

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { isPodLead, wearsHat, invalidatePodAuthority } from '@/lib/podAuthority';

export const runtime = 'nodejs';

function podIdFrom(req: NextRequest): string {
  const m = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/leave/);
  return m?.[1] ?? '';
}

async function ownMembership(podId: string, wallet: string) {
  const { data } = await supabaseAdmin
    .from('pod_members')
    .select('id, hat_id, role, membership_type, is_active')
    .eq('pod_id', podId)
    .eq('wallet', wallet)
    .eq('is_active', true)
    .maybeSingle();
  return data;
}

export async function GET(req: NextRequest) {
  const podId = podIdFrom(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });
  const walletOrDenied = await requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallet = walletOrDenied;

  const row = await ownMembership(podId, wallet);
  if (!row) return NextResponse.json({ canLeave: false, reason: 'not_member' });
  if (await isPodLead(wallet, podId)) {
    return NextResponse.json({ canLeave: false, reason: 'leader' });
  }
  if (!row.hat_id) return NextResponse.json({ canLeave: false, reason: 'no_hat' });
  return NextResponse.json({ canLeave: true, hatId: row.hat_id });
}

export async function POST(req: NextRequest) {
  const podId = podIdFrom(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });
  const walletOrDenied = await requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallet = walletOrDenied;

  const row = await ownMembership(podId, wallet);
  if (!row) return NextResponse.json({ error: 'You are not an active member of this pod' }, { status: 404 });
  if (await isPodLead(wallet, podId)) {
    return NextResponse.json(
      { error: 'Leaders hand off leadership before leaving' },
      { status: 409 },
    );
  }
  if (!row.hat_id) {
    return NextResponse.json({ error: 'No member hat on record for this membership' }, { status: 409 });
  }

  try {
    if (await wearsHat(wallet, row.hat_id)) {
      // The renounce has not landed yet; the client retries.
      return NextResponse.json({ error: 'still_wearing', retry: true }, { status: 409 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not confirm the hat on-chain; try again shortly', retry: true, detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('pod_members')
    .update({ is_active: false, removed_at: now, updated_at: now })
    .eq('id', row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidatePodAuthority(wallet, podId);
  return NextResponse.json({ ok: true });
}

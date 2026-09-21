// src/app/api/pods/[id]/members/route.ts
//
// Membership rows are written here and nowhere else (Phase 1 of
// APP_AUDIT_2026-09-15.md). The browser used to write pod_members directly
// under permissive RLS — which is how any member could make themselves a
// leader (F1). Now:
//
//   POST   add or approve a member       — caller must lead the pod (on-chain),
//                                          and the member must actually wear
//                                          the hat being recorded.
//   PATCH  deactivate a member           — caller must lead the pod; the hat
//                                          must already be gone on-chain.
//   DELETE purge all rows (pod deletion) — caller must lead the pod.
//
// The rule in every branch: the database records what the chain says, after
// the chain has said it. A row is never the source of authority.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { resolvePodAuthority, wearsHat, invalidatePodAuthority } from '@/lib/podAuthority';
import { sendServerNotificationBatch } from '@/lib/serverNotifications';

export const runtime = 'nodejs';

function podIdFrom(req: NextRequest): string {
  const m = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/members/);
  return m?.[1] ?? '';
}

async function requireLead(req: NextRequest, podId: string): Promise<string | NextResponse> {
  const walletOrDenied = await requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const auth = await resolvePodAuthority(walletOrDenied, podId);
  if (!auth.isLeader) {
    return NextResponse.json({ error: 'Only pod leaders can manage members' }, { status: 403 });
  }
  return walletOrDenied;
}

// ── POST: add / approve ──────────────────────────────────────────────────────
// Body: { wallet, hatId, role: 'leader'|'member', applicationId?, notify? }
export async function POST(req: NextRequest) {
  const podId = podIdFrom(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const callerOrDenied = await requireLead(req, podId);
  if (callerOrDenied instanceof Response) return callerOrDenied;
  const caller = callerOrDenied;

  const body = await req.json().catch(() => ({}));
  const wallet = String(body.wallet || '').toLowerCase();
  const hatId = String(body.hatId || '');
  const role = body.role === 'leader' ? 'leader' : 'member';
  const applicationId = body.applicationId ? String(body.applicationId) : null;

  if (!/^0x[a-f0-9]{40}$/.test(wallet) || !hatId) {
    return NextResponse.json({ error: 'wallet and hatId are required' }, { status: 400 });
  }

  // The hat must be a hat of this pod, and the member must be wearing it.
  const { data: pod } = await supabaseAdmin
    .from('pods').select('name, management_hat_id').eq('id', podId).maybeSingle();
  if (!pod) return NextResponse.json({ error: 'Pod not found' }, { status: 404 });

  const { data: roleRow } = await supabaseAdmin
    .from('pod_role_permissions').select('id, role_name').eq('pod_id', podId).eq('token_address', hatId).maybeSingle();
  const isMgmtHat = String(pod.management_hat_id || '') === hatId;
  if (!roleRow && !isMgmtHat) {
    return NextResponse.json({ error: 'That hat does not belong to this pod' }, { status: 400 });
  }

  let worn: boolean;
  try {
    worn = await wearsHat(wallet, hatId);
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not confirm the hat on-chain; try again shortly', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
  if (!worn) {
    return NextResponse.json(
      { error: 'That wallet does not wear this hat on-chain yet. Mint it first; the record follows the chain.' },
      { status: 409 },
    );
  }

  // Re-recording someone who is already a member (the "already wears the hat"
  // approval path, or a role change) must not reset when they joined.
  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from('pod_members').select('id').eq('pod_id', podId).eq('wallet', wallet).maybeSingle();

  let row: { id: string } | null = null;
  let error: { message: string } | null = null;
  if (existing) {
    const res = await supabaseAdmin
      .from('pod_members')
      .update({ hat_id: hatId, role, membership_type: role, is_active: true, removed_at: null, updated_at: now })
      .eq('id', existing.id)
      .select('id')
      .single();
    row = res.data; error = res.error;
  } else {
    const res = await supabaseAdmin
      .from('pod_members')
      .insert({ pod_id: podId, wallet, hat_id: hatId, role, membership_type: role, is_active: true, joined_at: now, updated_at: now })
      .select('id')
      .single();
    row = res.data; error = res.error;
  }
  if (error || !row) return NextResponse.json({ error: error?.message || 'Could not record member' }, { status: 500 });

  if (applicationId) {
    await supabaseAdmin
      .from('pod_membership_applications')
      .update({ status: 'approved', approved_at: now })
      .eq('id', applicationId);
  }

  if (body.notify !== false) {
    const label = roleRow?.role_name || (role === 'leader' ? 'Leader' : 'Member');
    await sendServerNotificationBatch([{
      recipient_address: wallet,
      sender_address: caller,
      notification_type: 'pod_application_status',
      title: `Welcome to ${pod.name}`,
      message: applicationId
        ? `Your application has been approved and your ${label} role has been minted.`
        : `You've been added to ${pod.name} as ${label}.`,
      context_url: `/pods/${podId}`,
      context_type: 'pod',
      context_id: podId,
      priority: 'high' as const,
      category: 'pods',
    }]).catch(() => {});
  }

  invalidatePodAuthority(wallet, podId);
  return NextResponse.json({ ok: true, id: row.id });
}

// ── PATCH: deactivate ────────────────────────────────────────────────────────
// Body: { wallet, hatId }
export async function PATCH(req: NextRequest) {
  const podId = podIdFrom(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const callerOrDenied = await requireLead(req, podId);
  if (callerOrDenied instanceof Response) return callerOrDenied;

  const body = await req.json().catch(() => ({}));
  const wallet = String(body.wallet || '').toLowerCase();
  const hatId = body.hatId ? String(body.hatId) : null;
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
  }

  // Removal is an on-chain act (transferHat / burn). Refuse to mark someone
  // removed while they still wear the hat — the record would then lie.
  if (hatId) {
    try {
      if (await wearsHat(wallet, hatId)) {
        return NextResponse.json(
          { error: 'That wallet still wears the hat on-chain. Remove it there first.' },
          { status: 409 },
        );
      }
    } catch (err) {
      return NextResponse.json(
        { error: 'Could not confirm the hat on-chain; try again shortly', detail: err instanceof Error ? err.message : String(err) },
        { status: 503 },
      );
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('pod_members')
    .update({ is_active: false, removed_at: now, updated_at: now })
    .eq('pod_id', podId)
    .eq('wallet', wallet);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A removed leader also leaves the declared-leads list.
  const { data: pod } = await supabaseAdmin.from('pods').select('pod_leads').eq('id', podId).maybeSingle();
  const leads = (pod?.pod_leads as string[] | null) ?? [];
  if (leads.some((l) => l.toLowerCase() === wallet)) {
    await supabaseAdmin
      .from('pods')
      .update({ pod_leads: leads.filter((l) => l.toLowerCase() !== wallet) })
      .eq('id', podId);
  }

  invalidatePodAuthority(wallet, podId);
  return NextResponse.json({ ok: true });
}

// ── DELETE: purge (pod deletion) ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const podId = podIdFrom(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const callerOrDenied = await requireLead(req, podId);
  if (callerOrDenied instanceof Response) return callerOrDenied;

  const { error, count } = await supabaseAdmin
    .from('pod_members')
    .delete({ count: 'exact' })
    .eq('pod_id', podId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, removed: count ?? 0 });
}

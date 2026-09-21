// Vault grant queue.
//
//   GET  /api/pods/[id]/passwords/grants
//        → list pending grants for this pod (entries × newcomers).
//          Managers see everything they can act on; newcomers see
//          their own pending entries.
//
//   POST /api/pods/[id]/passwords/grants
//        → submit a batch of newly-wrapped keys for pending newcomers.
//          body: { wraps: [{ entryId, recipientEoa, wrappedKey }, ...] }
//          Each wrap that lands here clears the corresponding
//          vault_pending_grants row.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';

async function getCallerWallet(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    const w =
      payload?.wallet_address ?? payload?.user_metadata?.wallet_address;
    return typeof w === 'string' ? w.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function callerHasPermission(
  podId: string,
  wallet: string,
  permission: 'passwordsAccess' | 'passwordsManage',
): Promise<boolean> {
  const { data: memberships, error } = await supabaseAdmin
    .from('active_pod_members')
    .select('hat_id')
    .eq('pod_id', podId)
    .eq('wallet', wallet)
    .eq('is_active', true);
  if (error || !memberships || memberships.length === 0) return false;
  const hatIds = memberships.map((m: any) => m.hat_id).filter(Boolean);
  if (hatIds.length === 0) return false;
  const { data: roles, error: rolesError } = await supabaseAdmin
    .from('pod_role_permissions')
    .select('permissions')
    .eq('pod_id', podId)
    .in('token_address', hatIds);
  if (rolesError) return false;
  return (roles ?? []).some(
    (r: any) => r?.permissions?.[permission] === true,
  );
}

// ── GET: list pending grants for this pod ───────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const podId = params.id;
  const caller = await getCallerWallet(req);
  if (!caller) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const isManager = await callerHasPermission(podId, caller, 'passwordsManage');
  const hasAccess =
    isManager || (await callerHasPermission(podId, caller, 'passwordsAccess'));

  if (!hasAccess) {
    return NextResponse.json(
      { error: 'missing passwordsAccess permission' },
      { status: 403 },
    );
  }

  let query = supabaseAdmin
    .from('vault_pending_grants')
    .select('id, entry_id, newcomer_eoa, created_at')
    .eq('pod_id', podId);

  // Non-managers see only their own pending rows.
  if (!isManager) {
    query = query.eq('newcomer_eoa', caller);
  }

  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter against allowed_role_ids on the linked entry — newcomers
  // shouldn't appear in the queue for entries whose audience excludes
  // their roles. (Pending rows for excluded entries can exist in the
  // table if a wallet's roles change after the grant was queued.)
  const grantRows = data ?? [];
  if (grantRows.length === 0) {
    return NextResponse.json({ grants: [] });
  }

  const entryIds = [...new Set(grantRows.map((r) => r.entry_id))];
  const newcomerEoas = [...new Set(grantRows.map((r) => r.newcomer_eoa))];

  // Resolve newcomer roles via active_pod_members + pod_role_permissions
  // (joined on pod_id + hat_id/token_address).
  const [
    { data: entryRows },
    { data: memberRows },
    { data: roleRows },
  ] = await Promise.all([
    supabaseAdmin
      .from('vault_entries')
      .select('id, allowed_role_ids')
      .in('id', entryIds),
    supabaseAdmin
      .from('active_pod_members')
      .select('wallet, hat_id')
      .eq('pod_id', podId)
      .eq('is_active', true)
      .in('wallet', newcomerEoas),
    supabaseAdmin
      .from('pod_role_permissions')
      .select('id, token_address')
      .eq('pod_id', podId),
  ]);

  const entryRoles = new Map<string, string[]>();
  for (const e of entryRows ?? []) {
    entryRoles.set(e.id, e.allowed_role_ids ?? []);
  }

  // Index pod_role_permissions by hat for fast wallet-role resolution.
  const roleIdByHat = new Map<string, string>();
  for (const r of roleRows ?? []) {
    if (r.token_address) roleIdByHat.set(r.token_address, r.id);
  }

  const walletRoles = new Map<string, Set<string>>();
  for (const m of memberRows ?? []) {
    const w = (m as any).wallet?.toLowerCase();
    const hat = (m as any).hat_id;
    if (!w || !hat) continue;
    const roleId = roleIdByHat.get(hat);
    if (!roleId) continue;
    if (!walletRoles.has(w)) walletRoles.set(w, new Set());
    walletRoles.get(w)!.add(roleId);
  }

  const filtered = grantRows.filter((r) => {
    const allowed = entryRoles.get(r.entry_id) ?? [];
    if (allowed.length === 0) return true; // legacy: everyone-with-access
    const userRoles = walletRoles.get(r.newcomer_eoa) ?? new Set();
    return allowed.some((id) => userRoles.has(id));
  });

  return NextResponse.json({
    grants: filtered.map((r) => ({
      id: r.id,
      entryId: r.entry_id,
      newcomerEoa: r.newcomer_eoa,
      createdAt: r.created_at,
    })),
  });
}

// ── POST: submit a batch of wraps to clear pending grants ───────────────

interface GrantSubmissionBody {
  wraps: Array<{
    entryId: string;
    recipientEoa: string;
    /** Pubkey of the granter — the wrap KEK was derived from this. */
    senderPubkey: string;
    wrappedKey: string;
  }>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const podId = params.id;
  const caller = await getCallerWallet(req);
  if (!caller) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await callerHasPermission(podId, caller, 'passwordsManage'))) {
    return NextResponse.json(
      { error: 'missing passwordsManage permission' },
      { status: 403 },
    );
  }

  let body: GrantSubmissionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.wraps) || body.wraps.length === 0) {
    return NextResponse.json({ error: 'wraps required' }, { status: 400 });
  }

  // Validate that every entry referenced belongs to this pod (defense
  // in depth; RLS also enforces).
  const entryIds = [...new Set(body.wraps.map((w) => w.entryId))];
  const { data: entries, error: entriesError } = await supabaseAdmin
    .from('vault_entries')
    .select('id, pod_id')
    .in('id', entryIds);
  if (entriesError) {
    return NextResponse.json({ error: entriesError.message }, { status: 500 });
  }
  for (const e of entries ?? []) {
    if (e.pod_id !== podId) {
      return NextResponse.json(
        { error: `entry ${e.id} does not belong to this pod` },
        { status: 400 },
      );
    }
  }

  // Upsert wraps (entry × recipient). Pending grants are then deleted
  // for the same (entry, recipient) pairs.
  const wrapRows = body.wraps.map((w) => ({
    entry_id: w.entryId,
    recipient_eoa: w.recipientEoa.toLowerCase(),
    sender_pubkey: w.senderPubkey,
    wrapped_key: w.wrappedKey,
  }));
  const { error: wrapError } = await supabaseAdmin
    .from('vault_wrapped_keys')
    .upsert(wrapRows, { onConflict: 'entry_id,recipient_eoa' });
  if (wrapError) {
    return NextResponse.json({ error: wrapError.message }, { status: 500 });
  }

  // Clear pending grants for these (entry, recipient) pairs.
  // Supabase JS doesn't support compound IN, so do a per-pair delete loop.
  for (const w of body.wraps) {
    await supabaseAdmin
      .from('vault_pending_grants')
      .delete()
      .eq('entry_id', w.entryId)
      .eq('newcomer_eoa', w.recipientEoa.toLowerCase());
  }

  // Log one grant action per wrap.
  try {
    await supabaseAdmin.from('vault_access_log').insert(
      body.wraps.map((w) => ({
        pod_id: podId,
        entry_id: w.entryId,
        accessor_eoa: caller,
        action: 'grant',
      })),
    );
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({ success: true, granted: body.wraps.length });
}

// Recipients list for the pod's vault.
//
//   GET /api/pods/[id]/passwords/recipients
//
// Returns the set of pod members entitled to read the vault (i.e. who
// hold `passwordsAccess` via their role assignment), along with whether
// each has published a vault pubkey. The client uses this to decide who
// to wrap content keys to when creating / editing an entry.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

function getCallerWallet(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret) as any;
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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const podId = params.id;
  const caller = getCallerWallet(req);
  if (!caller) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await callerHasPermission(podId, caller, 'passwordsAccess'))) {
    return NextResponse.json(
      { error: 'missing passwordsAccess permission' },
      { status: 403 },
    );
  }

  // Optional ?roleIds=uuid,uuid — restricts the returned recipients to
  // wallets holding one of these role permission IDs. When the caller is
  // creating an entry with a restricted audience, pass the checked role
  // IDs to get back exactly the wallets that should receive a wrap.
  const url = new URL(req.url);
  const roleIdsParam = url.searchParams.get('roleIds');
  const allowedRoleIds = roleIdsParam
    ? roleIdsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  // Two-step resolution:
  //   1. Pull all active wallets in this pod + their hat_id
  //      (active_pod_members).
  //   2. Pull the pod_role_permissions rows for this pod, keyed by
  //      token_address (= hat_id). For each member we look up their
  //      role(s) and check passwordsAccess / passwordsManage.
  const { data: members, error: mErr } = await supabaseAdmin
    .from('active_pod_members')
    .select('wallet, hat_id')
    .eq('pod_id', podId)
    .eq('is_active', true);

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const { data: rolesRows, error: rErr } = await supabaseAdmin
    .from('pod_role_permissions')
    // No role_type column on pod_role_permissions; derive from
    // role_name ("Leader" → leader).
    .select('id, role_name, token_address, permissions')
    .eq('pod_id', podId);

  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  // Index roles by their hat (token_address) for the join.
  const rolesByHat = new Map<
    string,
    { id: string; name: string; type: string | null; permissions: any }
  >();
  for (const r of rolesRows ?? []) {
    if (r.token_address) {
      rolesByHat.set(r.token_address, {
        id: r.id,
        name: r.role_name ?? '',
        type: /leader/i.test(r.role_name ?? '') ? 'leader' : 'member',
        permissions: r.permissions ?? {},
      });
    }
  }

  // Build per-wallet aggregate: roles held, roleIds, manager flag.
  const byWallet = new Map<
    string,
    { roles: string[]; roleIds: string[]; isManager: boolean }
  >();
  for (const m of members ?? []) {
    const w = (m as any).wallet?.toLowerCase();
    const hat = (m as any).hat_id;
    if (!w || !hat) continue;
    const role = rolesByHat.get(hat);
    if (!role) continue;
    const perms = role.permissions || {};
    if (perms.passwordsAccess !== true) continue;
    // Audience filter: skip rows whose role isn't in the requested set.
    if (allowedRoleIds && !allowedRoleIds.includes(role.id)) continue;
    const isMgr = perms.passwordsManage === true;
    const existing = byWallet.get(w);
    if (existing) {
      if (role.name && !existing.roles.includes(role.name)) {
        existing.roles.push(role.name);
      }
      if (!existing.roleIds.includes(role.id)) {
        existing.roleIds.push(role.id);
      }
      existing.isManager = existing.isManager || isMgr;
    } else {
      byWallet.set(w, {
        roles: role.name ? [role.name] : [],
        roleIds: [role.id],
        isManager: isMgr,
      });
    }
  }

  const wallets = [...byWallet.keys()];
  let pubkeys: Record<string, string> = {};
  if (wallets.length > 0) {
    const { data: keys } = await supabaseAdmin
      .from('vault_user_keys')
      .select('eoa_address, public_key')
      .in('eoa_address', wallets);
    for (const k of keys ?? []) {
      pubkeys[k.eoa_address] = k.public_key;
    }
  }

  const recipients = wallets.map((w) => ({
    eoaAddress: w,
    publicKey: pubkeys[w] ?? null,
    roles: byWallet.get(w)!.roles,
    roleIds: byWallet.get(w)!.roleIds,
    isManager: byWallet.get(w)!.isManager,
    hasPublishedKey: !!pubkeys[w],
  }));

  return NextResponse.json({ recipients });
}

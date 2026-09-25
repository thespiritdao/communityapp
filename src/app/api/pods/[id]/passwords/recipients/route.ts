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
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';

async function getCallerWallet(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const podId = params.id;
  const caller = await getCallerWallet(req);
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

  // Multi-wallet aware vault key lookup.
  //
  // active_pod_members.wallet is the user's canonical wallet, but
  // users may have bootstrapped their vault under a non-canonical
  // linked wallet (e.g. mobile's per-device CDP wallet). Walk
  // user_wallets to find ALL linked addresses for these canonical
  // wallets, then look up vault_user_keys against the full set. If
  // any linked wallet has a published pubkey, the recipient is
  // ready to receive a wrap. We return that linked wallet's address
  // + pubkey as the recipient — the wrap binds to the pubkey, not
  // the canonical address, so on decrypt the user re-derives the
  // same keypair from the same signature regardless of which
  // device they're on.
  const canonicalWallets = [...byWallet.keys()];
  let canonicalToLinked: Record<string, string[]> = {};
  let allLinkedAddresses: string[] = [];
  if (canonicalWallets.length > 0) {
    // Find every linked wallet for any user whose canonical wallet
    // is in our recipient set.
    const { data: ownerRows } = await supabaseAdmin
      .from('user_wallets')
      .select('user_id, wallet_address, is_canonical')
      .in('wallet_address', canonicalWallets)
      .eq('is_canonical', true);
    const userIdToCanonical: Record<string, string> = {};
    for (const r of ownerRows ?? []) {
      userIdToCanonical[r.user_id] = r.wallet_address;
    }
    const userIds = Object.keys(userIdToCanonical);
    if (userIds.length > 0) {
      const { data: linkedRows } = await supabaseAdmin
        .from('user_wallets')
        .select('user_id, wallet_address')
        .in('user_id', userIds);
      for (const r of linkedRows ?? []) {
        const canonical = userIdToCanonical[r.user_id];
        if (!canonical) continue;
        if (!canonicalToLinked[canonical]) canonicalToLinked[canonical] = [];
        canonicalToLinked[canonical].push(r.wallet_address);
        allLinkedAddresses.push(r.wallet_address);
      }
    }
  }

  // Lookup vault pubkeys across the full linked-wallet set.
  let pubkeyByWallet: Record<string, string> = {};
  if (allLinkedAddresses.length > 0) {
    const { data: keys } = await supabaseAdmin
      .from('vault_user_keys')
      .select('eoa_address, public_key')
      .in('eoa_address', allLinkedAddresses);
    for (const k of keys ?? []) {
      pubkeyByWallet[k.eoa_address] = k.public_key;
    }
  }

  // For each canonical recipient, pick a linked wallet that has a
  // published pubkey. Prefer the canonical wallet itself, then any
  // other linked wallet that's bootstrapped.
  const recipients = canonicalWallets.map((canonical) => {
    const linked = canonicalToLinked[canonical] ?? [canonical];
    const preferredOrder = [
      canonical,
      ...linked.filter((w) => w !== canonical),
    ];
    let chosenAddress: string | null = null;
    let chosenPubkey: string | null = null;
    for (const addr of preferredOrder) {
      if (pubkeyByWallet[addr]) {
        chosenAddress = addr;
        chosenPubkey = pubkeyByWallet[addr];
        break;
      }
    }
    return {
      // The recipient address we'll wrap to: the linked wallet that
      // actually holds a vault pubkey. Falls back to canonical if no
      // linked wallet has bootstrapped (UI shows as pending).
      eoaAddress: chosenAddress ?? canonical,
      publicKey: chosenPubkey,
      roles: byWallet.get(canonical)!.roles,
      roleIds: byWallet.get(canonical)!.roleIds,
      isManager: byWallet.get(canonical)!.isManager,
      hasPublishedKey: !!chosenPubkey,
    };
  });

  return NextResponse.json({ recipients });
}

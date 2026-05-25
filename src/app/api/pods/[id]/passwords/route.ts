// Pod password vault — list + create.
//
//   GET  /api/pods/[id]/passwords        → list entries (encrypted blobs);
//                                          caller must have passwordsAccess
//                                          via RLS. Includes the caller's
//                                          own wrapped_key per entry.
//   POST /api/pods/[id]/passwords        → create a new entry with
//                                          encrypted password + wrapped
//                                          keys for each authorized
//                                          recipient. Requires
//                                          passwordsManage.
//
// All encryption happens in the browser. The server only persists
// ciphertext + wrapped keys. The vault_access_log row is written
// server-side via the admin client for incident response.

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

/**
 * Return every wallet address linked to the user who owns the given
 * canonical wallet. Used for wrap lookups — the caller's wrap may
 * have been published under any of their linked wallets (e.g. the
 * device-specific CDP wallet they bootstrapped on).
 *
 * Always includes the canonical wallet itself so the result is safe
 * to use even when user_wallets has no extra rows for this user.
 */
async function getCallerLinkedWallets(canonical: string): Promise<string[]> {
  const target = canonical.toLowerCase();
  try {
    const { data: ownerRow } = await supabaseAdmin
      .from('user_wallets')
      .select('user_id')
      .eq('wallet_address', target)
      .eq('is_canonical', true)
      .maybeSingle();
    if (!ownerRow?.user_id) return [target];
    const { data: linked } = await supabaseAdmin
      .from('user_wallets')
      .select('wallet_address')
      .eq('user_id', ownerRow.user_id);
    const addresses = new Set<string>([target]);
    for (const r of linked ?? []) {
      if (r.wallet_address) addresses.add(r.wallet_address.toLowerCase());
    }
    return [...addresses];
  } catch {
    return [target];
  }
}

async function callerHasPermission(
  podId: string,
  wallet: string,
  permission: 'passwordsAccess' | 'passwordsManage',
): Promise<boolean> {
  // Resolve hat-based permission: caller's active pod membership →
  // hat_id → pod_role_permissions row keyed by (pod_id, token_address).
  const { data: memberships, error } = await supabaseAdmin
    .from('active_pod_members')
    .select('hat_id')
    .eq('pod_id', podId)
    .eq('wallet', wallet)
    .eq('is_active', true);
  if (error) {
    console.error('[vault] membership lookup failed', error);
    return false;
  }
  if (!memberships || memberships.length === 0) return false;

  const hatIds = memberships.map((m: any) => m.hat_id).filter(Boolean);
  if (hatIds.length === 0) return false;

  const { data: roles, error: rolesError } = await supabaseAdmin
    .from('pod_role_permissions')
    .select('permissions')
    .eq('pod_id', podId)
    .in('token_address', hatIds);
  if (rolesError) {
    console.error('[vault] role lookup failed', rolesError);
    return false;
  }
  return (roles ?? []).some(
    (r: any) => r?.permissions?.[permission] === true,
  );
}

async function logAccess(args: {
  podId: string;
  entryId?: string | null;
  accessorEoa: string;
  action: 'read' | 'create' | 'update' | 'delete' | 'grant' | 'rotate';
}) {
  try {
    await supabaseAdmin.from('vault_access_log').insert({
      pod_id: args.podId,
      entry_id: args.entryId ?? null,
      accessor_eoa: args.accessorEoa,
      action: args.action,
    });
  } catch (e) {
    console.warn('[vault] access log write failed (non-fatal)', e);
  }
}

// ── GET: list entries for this pod ───────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const podId = params.id;
  const caller = getCallerWallet(req);
  if (!caller) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Confirm passwordsAccess server-side (RLS would also filter, but
  // this lets us return a friendlier 403).
  const hasAccess = await callerHasPermission(podId, caller, 'passwordsAccess');
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'missing passwordsAccess permission' },
      { status: 403 },
    );
  }

  // Pull entries + the caller's wrapped key for each.
  // Server stores ciphertext only; client decrypts.
  const { data: entries, error: entriesError } = await supabaseAdmin
    .from('vault_entries')
    .select(
      'id, pod_id, label, tags, allowed_role_ids, login_ciphertext, login_iv, notes_ciphertext, notes_iv, password_ciphertext, password_iv, sender_pubkey, created_by, created_at, updated_at, updated_by, version',
    )
    .eq('pod_id', podId)
    .order('updated_at', { ascending: false });

  if (entriesError) {
    console.error('[vault][GET list] entries error', entriesError);
    return NextResponse.json({ error: entriesError.message }, { status: 500 });
  }

  const entryIds = (entries ?? []).map((e) => e.id);
  // wrap_sender_pubkey is per-wrap: the pubkey of whoever wrapped this
  // particular content key for the caller. May differ from the entry's
  // sender_pubkey when the wrap came from a regrant.
  //
  // Multi-wallet aware: the wrap might have been published under any
  // of the caller's linked wallets (e.g. the device-specific CDP wallet
  // they bootstrapped on, not their canonical wallet). Look up wraps
  // against the caller's entire linked-wallet set.
  let wrapsByEntry: Record<
    string,
    { wrapped_key: string; sender_pubkey: string } | null
  > = {};
  if (entryIds.length > 0) {
    const callerLinkedWallets = await getCallerLinkedWallets(caller);
    const { data: wraps, error: wrapsError } = await supabaseAdmin
      .from('vault_wrapped_keys')
      .select('entry_id, wrapped_key, sender_pubkey')
      .in('entry_id', entryIds)
      .in('recipient_eoa', callerLinkedWallets);
    if (wrapsError) {
      console.error('[vault][GET list] wraps error', wrapsError);
      return NextResponse.json({ error: wrapsError.message }, { status: 500 });
    }
    for (const w of wraps ?? []) {
      // If the caller has multiple linked wallets and somehow more than
      // one has a wrap for the same entry, the first wins (it's the
      // same content key either way; sender_pubkey may vary, but only
      // one of them will be the right counterparty for that wrap).
      if (!wrapsByEntry[w.entry_id]) {
        wrapsByEntry[w.entry_id] = {
          wrapped_key: w.wrapped_key,
          sender_pubkey: w.sender_pubkey,
        };
      }
    }
  }

  const result = (entries ?? []).map((e) => {
    const wrap = wrapsByEntry[e.id];
    return {
      id: e.id,
      podId: e.pod_id,
      label: e.label,
      tags: e.tags ?? [],
      allowedRoleIds: e.allowed_role_ids ?? [],
      loginCiphertext: e.login_ciphertext,
      loginIv: e.login_iv,
      notesCiphertext: e.notes_ciphertext,
      notesIv: e.notes_iv,
      passwordCiphertext: e.password_ciphertext,
      passwordIv: e.password_iv,
      // Prefer the per-wrap sender (which is the right counterparty for
      // ECDH) and fall back to the entry's sender for legacy rows.
      senderPubkey: wrap?.sender_pubkey ?? e.sender_pubkey,
      createdBy: e.created_by,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      updatedBy: e.updated_by,
      version: e.version,
      myWrappedKey: wrap?.wrapped_key ?? null, // null => caller needs a grant
    };
  });

  return NextResponse.json({ entries: result });
}

// ── POST: create a new entry ─────────────────────────────────────────────

interface CreateBody {
  label: string;
  tags?: string[];
  /** Pod role permission IDs allowed to read. Empty = any reader with passwordsAccess. */
  allowedRoleIds?: string[];
  passwordCiphertext: string;
  passwordIv: string;
  loginCiphertext?: string | null;
  loginIv?: string | null;
  notesCiphertext?: string | null;
  notesIv?: string | null;
  senderPubkey: string;
  wraps: Array<{ recipientEoa: string; wrappedKey: string }>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const podId = params.id;
  const caller = getCallerWallet(req);
  if (!caller) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const hasManage = await callerHasPermission(podId, caller, 'passwordsManage');
  if (!hasManage) {
    return NextResponse.json(
      { error: 'missing passwordsManage permission' },
      { status: 403 },
    );
  }

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  // Minimal validation. The server doesn't (and can't) verify the
  // ciphertext is valid — that's the whole point of E2EE. But we
  // require non-empty values and at least one wrap.
  if (
    !body.label ||
    !body.passwordCiphertext ||
    !body.passwordIv ||
    !body.senderPubkey ||
    !Array.isArray(body.wraps) ||
    body.wraps.length === 0
  ) {
    return NextResponse.json(
      { error: 'missing required fields' },
      { status: 400 },
    );
  }

  // Insert the entry.
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('vault_entries')
    .insert({
      pod_id: podId,
      label: body.label,
      tags: body.tags ?? [],
      allowed_role_ids: body.allowedRoleIds ?? [],
      login_ciphertext: body.loginCiphertext ?? null,
      login_iv: body.loginIv ?? null,
      notes_ciphertext: body.notesCiphertext ?? null,
      notes_iv: body.notesIv ?? null,
      password_ciphertext: body.passwordCiphertext,
      password_iv: body.passwordIv,
      sender_pubkey: body.senderPubkey,
      created_by: caller,
      updated_by: caller,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[vault][POST] entry insert error', insertError);
    return NextResponse.json(
      { error: insertError?.message ?? 'insert failed' },
      { status: 500 },
    );
  }

  // Insert wraps. Every wrap is tagged with the creator's sender pubkey
  // because the creator's identity is the X25519 counterpart on the
  // wrap KEK derivation.
  const wrapRows = body.wraps.map((w) => ({
    entry_id: inserted.id,
    recipient_eoa: w.recipientEoa.toLowerCase(),
    sender_pubkey: body.senderPubkey,
    wrapped_key: w.wrappedKey,
  }));
  const { error: wrapError } = await supabaseAdmin
    .from('vault_wrapped_keys')
    .insert(wrapRows);

  if (wrapError) {
    // Best-effort cleanup if wraps failed.
    await supabaseAdmin.from('vault_entries').delete().eq('id', inserted.id);
    console.error('[vault][POST] wraps insert error', wrapError);
    return NextResponse.json({ error: wrapError.message }, { status: 500 });
  }

  await logAccess({
    podId,
    entryId: inserted.id,
    accessorEoa: caller,
    action: 'create',
  });

  return NextResponse.json({ id: inserted.id });
}

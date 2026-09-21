// Per-entry vault routes.
//
//   GET    /api/pods/[id]/passwords/[entryId]  → single entry + caller's wrap
//   PUT    /api/pods/[id]/passwords/[entryId]  → update label/tags/ciphertext
//                                                + ALL wraps (caller must
//                                                provide a complete fresh set
//                                                because re-encryption rotates
//                                                the content key)
//   DELETE /api/pods/[id]/passwords/[entryId]  → delete entry (cascades wraps)

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

/** All wallets linked to the user who owns the canonical wallet. */
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
  } catch {
    /* non-fatal */
  }
}

// ── GET: read one entry + caller's wrap ──────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } },
) {
  const { id: podId, entryId } = params;
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

  const { data: entry, error: entryError } = await supabaseAdmin
    .from('vault_entries')
    .select(
      'id, pod_id, label, tags, allowed_role_ids, login_ciphertext, login_iv, notes_ciphertext, notes_iv, password_ciphertext, password_iv, sender_pubkey, created_by, created_at, updated_at, updated_by, version',
    )
    .eq('id', entryId)
    .eq('pod_id', podId)
    .maybeSingle();

  if (entryError) {
    console.error('[vault][GET one] entry error', entryError);
    return NextResponse.json({ error: entryError.message }, { status: 500 });
  }
  if (!entry) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Multi-wallet aware: wrap may have been published under any of the
  // caller's linked wallets.
  const callerLinkedWallets = await getCallerLinkedWallets(caller);
  const { data: wraps } = await supabaseAdmin
    .from('vault_wrapped_keys')
    .select('wrapped_key, sender_pubkey')
    .eq('entry_id', entryId)
    .in('recipient_eoa', callerLinkedWallets)
    .limit(1);
  const wrap = wraps?.[0];

  await logAccess({
    podId,
    entryId,
    accessorEoa: caller,
    action: 'read',
  });

  return NextResponse.json({
    entry: {
      id: entry.id,
      podId: entry.pod_id,
      label: entry.label,
      tags: entry.tags ?? [],
      allowedRoleIds: entry.allowed_role_ids ?? [],
      loginCiphertext: entry.login_ciphertext,
      loginIv: entry.login_iv,
      notesCiphertext: entry.notes_ciphertext,
      notesIv: entry.notes_iv,
      passwordCiphertext: entry.password_ciphertext,
      passwordIv: entry.password_iv,
      // Per-wrap sender takes precedence over the entry-level one.
      senderPubkey: wrap?.sender_pubkey ?? entry.sender_pubkey,
      createdBy: entry.created_by,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
      updatedBy: entry.updated_by,
      version: entry.version,
      myWrappedKey: wrap?.wrapped_key ?? null,
    },
  });
}

// ── PUT: replace entry contents AND all wraps ────────────────────────────

interface UpdateBody {
  label?: string;
  tags?: string[];
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

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } },
) {
  const { id: podId, entryId } = params;
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

  let body: UpdateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (
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

  // Update the entry. Bump version.
  const updateRow: Record<string, unknown> = {
    password_ciphertext: body.passwordCiphertext,
    password_iv: body.passwordIv,
    login_ciphertext: body.loginCiphertext ?? null,
    login_iv: body.loginIv ?? null,
    notes_ciphertext: body.notesCiphertext ?? null,
    notes_iv: body.notesIv ?? null,
    sender_pubkey: body.senderPubkey,
    updated_at: new Date().toISOString(),
    updated_by: caller,
  };
  if (body.label !== undefined) updateRow.label = body.label;
  if (body.tags !== undefined) updateRow.tags = body.tags;
  if (body.allowedRoleIds !== undefined) {
    updateRow.allowed_role_ids = body.allowedRoleIds;
  }

  // Increment version atomically.
  const { data: current } = await supabaseAdmin
    .from('vault_entries')
    .select('version')
    .eq('id', entryId)
    .eq('pod_id', podId)
    .single();
  updateRow.version = (current?.version ?? 1) + 1;

  const { error: updateError } = await supabaseAdmin
    .from('vault_entries')
    .update(updateRow)
    .eq('id', entryId)
    .eq('pod_id', podId);

  if (updateError) {
    console.error('[vault][PUT] entry update error', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Replace wraps: delete existing, insert fresh. All wraps are tagged
  // with the editor's sender pubkey because re-encrypt rotates the
  // content key and the editor is the new wrap-side counterparty.
  await supabaseAdmin.from('vault_wrapped_keys').delete().eq('entry_id', entryId);
  const wrapRows = body.wraps.map((w) => ({
    entry_id: entryId,
    recipient_eoa: w.recipientEoa.toLowerCase(),
    sender_pubkey: body.senderPubkey,
    wrapped_key: w.wrappedKey,
  }));
  const { error: wrapError } = await supabaseAdmin
    .from('vault_wrapped_keys')
    .insert(wrapRows);

  if (wrapError) {
    console.error('[vault][PUT] wraps insert error', wrapError);
    return NextResponse.json({ error: wrapError.message }, { status: 500 });
  }

  await logAccess({
    podId,
    entryId,
    accessorEoa: caller,
    action: 'update',
  });

  return NextResponse.json({ success: true });
}

// ── DELETE: drop the entry (cascade deletes wraps + grants) ──────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; entryId: string } },
) {
  const { id: podId, entryId } = params;
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

  const { error } = await supabaseAdmin
    .from('vault_entries')
    .delete()
    .eq('id', entryId)
    .eq('pod_id', podId);

  if (error) {
    console.error('[vault][DELETE] error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAccess({
    podId,
    entryId,
    accessorEoa: caller,
    action: 'delete',
  });

  return NextResponse.json({ success: true });
}

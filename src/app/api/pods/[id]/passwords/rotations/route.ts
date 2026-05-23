// Vault rotation queue.
//
//   GET  /api/pods/[id]/passwords/rotations
//        → list pending rotation jobs (pod members removed from
//          passwordsAccess). Any active reader fetches this; their
//          browser re-encrypts entries and POSTs the result.
//
//   POST /api/pods/[id]/passwords/rotations
//        → submit a completed rotation: replaces an entry's ciphertext
//          and replaces ALL wraps. Marks the rotation job complete and
//          deletes the evicted user's stale wraps.

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

// ── GET: list pending rotation jobs for this pod ────────────────────────

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

  const { data, error } = await supabaseAdmin
    .from('vault_rotation_jobs')
    .select('id, evicted_eoa, status, created_at')
    .eq('pod_id', podId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    jobs: (data ?? []).map((r) => ({
      id: r.id,
      evictedEoa: r.evicted_eoa,
      status: r.status,
      createdAt: r.created_at,
    })),
  });
}

// ── POST: submit a completed rotation ───────────────────────────────────

interface RotationSubmissionBody {
  jobId: string;
  entries: Array<{
    entryId: string;
    passwordCiphertext: string;
    passwordIv: string;
    notesCiphertext?: string | null;
    notesIv?: string | null;
    senderPubkey: string;
    wraps: Array<{ recipientEoa: string; wrappedKey: string }>;
  }>;
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
  if (!(await callerHasPermission(podId, caller, 'passwordsAccess'))) {
    return NextResponse.json(
      { error: 'missing passwordsAccess permission' },
      { status: 403 },
    );
  }

  let body: RotationSubmissionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!body.jobId || !Array.isArray(body.entries)) {
    return NextResponse.json(
      { error: 'jobId and entries required' },
      { status: 400 },
    );
  }

  // Confirm the job belongs to this pod.
  const { data: job, error: jobError } = await supabaseAdmin
    .from('vault_rotation_jobs')
    .select('id, pod_id, evicted_eoa, status')
    .eq('id', body.jobId)
    .maybeSingle();
  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 });
  }
  if (!job || job.pod_id !== podId) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 });
  }
  if (job.status === 'complete') {
    return NextResponse.json({ success: true, already_complete: true });
  }

  // Mark in_progress so concurrent rotators don't double-run.
  await supabaseAdmin
    .from('vault_rotation_jobs')
    .update({ status: 'in_progress' })
    .eq('id', body.jobId);

  // Apply each rotation. Update entry ciphertext + bump version.
  // Replace wraps (delete + insert).
  for (const e of body.entries) {
    const { data: current } = await supabaseAdmin
      .from('vault_entries')
      .select('version')
      .eq('id', e.entryId)
      .eq('pod_id', podId)
      .single();
    const nextVersion = (current?.version ?? 1) + 1;

    await supabaseAdmin
      .from('vault_entries')
      .update({
        password_ciphertext: e.passwordCiphertext,
        password_iv: e.passwordIv,
        notes_ciphertext: e.notesCiphertext ?? null,
        notes_iv: e.notesIv ?? null,
        sender_pubkey: e.senderPubkey,
        updated_at: new Date().toISOString(),
        updated_by: caller,
        version: nextVersion,
      })
      .eq('id', e.entryId)
      .eq('pod_id', podId);

    await supabaseAdmin
      .from('vault_wrapped_keys')
      .delete()
      .eq('entry_id', e.entryId);

    if (e.wraps.length > 0) {
      await supabaseAdmin.from('vault_wrapped_keys').insert(
        e.wraps.map((w) => ({
          entry_id: e.entryId,
          recipient_eoa: w.recipientEoa.toLowerCase(),
          sender_pubkey: e.senderPubkey,
          wrapped_key: w.wrappedKey,
        })),
      );
    }
  }

  // Mark job complete.
  await supabaseAdmin
    .from('vault_rotation_jobs')
    .update({ status: 'complete', completed_at: new Date().toISOString() })
    .eq('id', body.jobId);

  // Log.
  try {
    await supabaseAdmin.from('vault_access_log').insert(
      body.entries.map((e) => ({
        pod_id: podId,
        entry_id: e.entryId,
        accessor_eoa: caller,
        action: 'rotate',
      })),
    );
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    success: true,
    rotated: body.entries.length,
  });
}

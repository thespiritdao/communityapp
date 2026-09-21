// Pod invite links — create (POST), list (GET ?podId=), revoke (DELETE).
// Auth: pod leader or Executive Pod Leader (server-verified).
// Links grant MEMBER roles only — leader roles always go through explicit
// approval flows.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import {
  getWalletFromRequest,
  isPodLeader,
  isExecutiveLeader,
} from '@/lib/serverPodAuth';

export const runtime = 'nodejs';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateLinkCode(): string {
  let code = 'POD-';
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

async function authorize(
  req: NextRequest,
  podId: string,
): Promise<{ wallet: string } | NextResponse> {
  const wallet = await getWalletFromRequest(req);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const [leader, exec] = await Promise.all([
    isPodLeader(podId, wallet),
    isExecutiveLeader(wallet),
  ]);
  if (!leader && !exec) {
    return NextResponse.json(
      { error: 'Forbidden: not a pod leader or executive' },
      { status: 403 },
    );
  }
  return { wallet };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { podId, roleId, expiresInDays, maxUses } = body;
  if (!podId) {
    return NextResponse.json({ error: 'podId required' }, { status: 400 });
  }

  const auth = await authorize(req, podId);
  if (auth instanceof NextResponse) return auth;

  // Resolve the member role to grant. Leader vs member is distinguished by
  // role_name (…Leader / …Member) — there is no role_type column. Invite links
  // may only grant member (non-leader) roles.
  let role: { id: string; role_name: string; token_address: string } | null =
    null;
  if (roleId) {
    const { data } = await supabaseAdmin
      .from('pod_role_permissions')
      .select('id, role_name, token_address')
      .eq('id', roleId)
      .eq('pod_id', podId)
      .eq('is_active', true)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: 'Role not found for this pod' }, { status: 400 });
    }
    if (/leader/i.test(data.role_name || '')) {
      return NextResponse.json(
        { error: 'Invite links may only grant member roles' },
        { status: 400 },
      );
    }
    role = data;
  } else {
    const { data: roles } = await supabaseAdmin
      .from('pod_role_permissions')
      .select('id, role_name, token_address')
      .eq('pod_id', podId)
      .eq('is_active', true);
    role =
      (roles || []).find((r) => /member/i.test(r.role_name || '')) ||
      (roles || []).find((r) => !/leader/i.test(r.role_name || '')) ||
      null;
    if (!role) {
      return NextResponse.json(
        { error: 'This pod has no member role to grant' },
        { status: 400 },
      );
    }
  }

  // Unique code (retry on the vanishingly rare collision).
  let code = generateLinkCode();
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await supabaseAdmin
      .from('pod_invite_links')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (!existing) break;
    code = generateLinkCode();
  }

  const expiresAt =
    expiresInDays && Number(expiresInDays) > 0
      ? new Date(Date.now() + Number(expiresInDays) * 24 * 3600 * 1000).toISOString()
      : null;

  const { data: link, error } = await supabaseAdmin
    .from('pod_invite_links')
    .insert({
      pod_id: podId,
      code,
      role_id: role.id,
      created_by: auth.wallet.toLowerCase(),
      expires_at: expiresAt,
      max_uses: maxUses && Number(maxUses) > 0 ? Number(maxUses) : null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[pod-invites] create failed:', error);
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
  }

  return NextResponse.json({
    link,
    url: `https://app.spiritdao.org/?invite=${link.code}`,
  });
}

export async function GET(req: NextRequest) {
  const podId = req.nextUrl.searchParams.get('podId');
  if (!podId) {
    return NextResponse.json({ error: 'podId required' }, { status: 400 });
  }
  const auth = await authorize(req, podId);
  if (auth instanceof NextResponse) return auth;

  const { data: links } = await supabaseAdmin
    .from('pod_invite_links')
    .select('*')
    .eq('pod_id', podId)
    .order('created_at', { ascending: false });

  const { data: pending } = await supabaseAdmin
    .from('pod_invite_acceptances')
    .select('id, wallet, hat_id, accepted_at')
    .eq('pod_id', podId)
    .is('hat_minted_at', null)
    .order('accepted_at');

  return NextResponse.json({ links: links || [], pendingMints: pending || [] });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { linkId } = body;
  if (!linkId) {
    return NextResponse.json({ error: 'linkId required' }, { status: 400 });
  }

  const { data: link } = await supabaseAdmin
    .from('pod_invite_links')
    .select('id, pod_id')
    .eq('id', linkId)
    .maybeSingle();
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const auth = await authorize(req, link.pod_id);
  if (auth instanceof NextResponse) return auth;

  const { error } = await supabaseAdmin
    .from('pod_invite_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId);

  if (error) {
    return NextResponse.json({ error: 'Failed to revoke' }, { status: 500 });
  }
  return NextResponse.json({ revoked: true });
}

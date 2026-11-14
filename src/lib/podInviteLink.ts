// src/lib/podInviteLink.ts
// Shared server helper: resolve-or-create a reusable POD-XXXXXXXX invite link for
// a pod, granting its default member role. Used by both /api/invites/email
// (pod-enroll emails) and /api/invites/link (copyable pod link).
//
// Authorization is the CALLER's responsibility — this helper assumes the caller
// has already verified the wallet is a leader/exec of the pod.

import { appUrl } from '@/config/deployment';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateLinkCode(): string {
  let code = 'POD-';
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Return a shareable pod-enroll link URL for `podId`, reusing an existing active
 * link created by this wallet if one exists, otherwise creating a fresh one that
 * grants the pod's default member role. Returns null if the pod has no member
 * role to grant. Caller must have already authorized `wallet` as leader/exec.
 */
export async function getOrCreatePodInviteUrl(
  podId: string,
  wallet: string,
): Promise<{ code: string; url: string } | null> {
  const w = wallet.toLowerCase();

  // Reuse an existing active (non-revoked, non-expired, uses remaining) link
  // this wallet already created for this pod — keeps the copyable link stable.
  const { data: existing } = await supabaseAdmin
    .from('pod_invite_links')
    .select('code, expires_at, max_uses, use_count, revoked_at')
    .eq('pod_id', podId)
    .eq('created_by', w)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  const now = Date.now();
  const reusable = (existing || []).find(
    (l) =>
      (!l.expires_at || new Date(l.expires_at).getTime() > now) &&
      (l.max_uses == null || l.use_count < l.max_uses),
  );
  if (reusable) {
    return { code: reusable.code, url: `${appUrl()}/?invite=${reusable.code}` };
  }

  // Resolve the pod's default member role. Leader vs member is distinguished by
  // role_name (…Leader / …Member) — there is no role_type column. Invite links
  // may only grant member (non-leader) roles.
  const { data: roles } = await supabaseAdmin
    .from('pod_role_permissions')
    .select('id, role_name')
    .eq('pod_id', podId)
    .eq('is_active', true);
  const role =
    (roles || []).find((r) => /member/i.test(r.role_name || '')) ||
    (roles || []).find((r) => !/leader/i.test(r.role_name || ''));
  if (!role) return null;

  // Unique code (retry on the vanishingly rare collision).
  let code = generateLinkCode();
  for (let i = 0; i < 5; i++) {
    const { data: dup } = await supabaseAdmin
      .from('pod_invite_links')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (!dup) break;
    code = generateLinkCode();
  }

  const { data: link, error } = await supabaseAdmin
    .from('pod_invite_links')
    .insert({
      pod_id: podId,
      code,
      role_id: role.id,
      created_by: w,
      expires_at: null,
      max_uses: null,
    })
    .select('code')
    .single();

  if (error || !link) {
    console.error('[podInviteLink] create failed:', error);
    return null;
  }
  return { code: link.code, url: `${appUrl()}/?invite=${link.code}` };
}

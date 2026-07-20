// GET /api/invites/resolve?code=… — public pre-validation for ?invite= links.
// Handles both code kinds:
//   - 6-char member referral codes (user_profiles.referral_key)
//   - POD-XXXXXXXX pod invite links (pod_invite_links)
// Returns only what the landing page needs; never errors loudly (invalid
// codes just return { valid: false } and the visitor proceeds normally).

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') || '').trim();
  if (!code) return NextResponse.json({ valid: false });

  // Pod invite link
  if (/^POD-[A-Z0-9]{8}$/i.test(code)) {
    const { data: link } = await supabaseAdmin
      .from('pod_invite_links')
      .select('id, pod_id, expires_at, max_uses, use_count, revoked_at')
      .eq('code', code.toUpperCase())
      .maybeSingle();

    if (
      !link ||
      link.revoked_at ||
      (link.expires_at && new Date(link.expires_at) < new Date()) ||
      (link.max_uses != null && link.use_count >= link.max_uses)
    ) {
      return NextResponse.json({ valid: false });
    }

    const { data: pod } = await supabaseAdmin
      .from('pods')
      .select('name')
      .eq('id', link.pod_id)
      .maybeSingle();

    return NextResponse.json({
      valid: true,
      type: 'pod',
      podId: link.pod_id,
      podName: pod?.name || 'a community pod',
    });
  }

  // Member referral code
  if (/^[A-Z0-9]{6}$/i.test(code)) {
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('referral_key', code.toUpperCase())
      .maybeSingle();

    if (!profile) return NextResponse.json({ valid: false });

    return NextResponse.json({
      valid: true,
      type: 'referral',
      inviterName:
        [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
        'a SpiritDAO member',
    });
  }

  return NextResponse.json({ valid: false });
}

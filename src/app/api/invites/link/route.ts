// GET /api/invites/link — returns the copyable invite URL for the caller.
//   ?podId=<id>  → pod-enroll link (POD-XXXXXXXX) IF the caller leads/execs that
//                  pod; the invitee auto-joins that pod's member role on signup.
//   no podId     → the caller's personal referral link (app access only).
// Auth: JWT (any onboarded member for the personal link; leader/exec for a pod link).

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import {
  getWalletFromRequest,
  isPodLeader,
  isExecutiveLeader,
} from '@/lib/serverPodAuth';
import { getOrCreatePodInviteUrl } from '@/lib/podInviteLink';

export const runtime = 'nodejs';

const APP_URL = 'https://app.spiritdao.org';

export async function GET(req: NextRequest) {
  const wallet = await getWalletFromRequest(req);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const podId = req.nextUrl.searchParams.get('podId');

  // Pod-enroll link — requires leader/exec of that pod.
  if (podId) {
    const [leader, exec] = await Promise.all([
      isPodLeader(podId, wallet),
      isExecutiveLeader(wallet),
    ]);
    if (!leader && !exec) {
      return NextResponse.json(
        { error: 'Forbidden: not a leader or executive of this pod' },
        { status: 403 },
      );
    }
    const podLink = await getOrCreatePodInviteUrl(podId, wallet);
    if (!podLink) {
      return NextResponse.json(
        { error: 'This pod has no member role to grant' },
        { status: 400 },
      );
    }
    return NextResponse.json({ type: 'pod', url: podLink.url, code: podLink.code });
  }

  // Personal referral link — any onboarded member.
  const { data: sender } = await supabaseAdmin
    .from('user_profiles')
    .select('referral_key')
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle();

  if (!sender?.referral_key) {
    return NextResponse.json(
      { error: 'Your profile has no referral code yet. Complete onboarding first.' },
      { status: 403 },
    );
  }

  return NextResponse.json({
    type: 'referral',
    url: `${APP_URL}/?invite=${sender.referral_key}`,
    code: sender.referral_key,
  });
}

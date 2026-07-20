// POST /api/pod-invites/mark-minted — leader records that queued member hats
// were batch-minted on-chain. Auth: pod leader or exec of the acceptances' pod.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import {
  getWalletFromRequest,
  isPodLeader,
  isExecutiveLeader,
} from '@/lib/serverPodAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const wallet = getWalletFromRequest(req);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.acceptanceIds) ? body.acceptanceIds : [];
  const txHash: string | null = body.txHash || null;
  if (ids.length === 0) {
    return NextResponse.json({ error: 'acceptanceIds required' }, { status: 400 });
  }

  // All acceptances must belong to ONE pod the caller may manage.
  const { data: rows } = await supabaseAdmin
    .from('pod_invite_acceptances')
    .select('id, pod_id')
    .in('id', ids);
  const podIds = [...new Set((rows || []).map((r) => r.pod_id))];
  if (podIds.length !== 1) {
    return NextResponse.json(
      { error: 'Acceptances must belong to a single pod' },
      { status: 400 },
    );
  }

  const [leader, exec] = await Promise.all([
    isPodLeader(podIds[0], wallet),
    isExecutiveLeader(wallet),
  ]);
  if (!leader && !exec) {
    return NextResponse.json(
      { error: 'Forbidden: not a pod leader or executive' },
      { status: 403 },
    );
  }

  const { error } = await supabaseAdmin
    .from('pod_invite_acceptances')
    .update({ hat_minted_at: new Date().toISOString(), mint_tx_hash: txHash })
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
  return NextResponse.json({ marked: ids.length });
}

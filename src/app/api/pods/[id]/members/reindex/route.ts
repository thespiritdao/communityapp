// src/app/api/pods/[id]/members/reindex/route.ts
//
// Reconcile the pod's membership rows with the chain. For every wallet the
// pod already knows (members and declared leads), check which of the pod's
// hats it wears and set role / is_active to match. Replaces the browser-side
// MemberIndexingService upsert, which needed client write access to
// pod_members.
//
// Discovery of wearers the database has never seen is not attempted here:
// additions go through POST /members (approval) and /members/claim-hat, so
// a wearer unknown to the database is itself the anomaly to surface.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { resolvePodAuthority, wearsHat, invalidatePodAuthority } from '@/lib/podAuthority';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const podId = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/members\/reindex/)?.[1] ?? '';
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const walletOrDenied = requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const auth = await resolvePodAuthority(walletOrDenied, podId);
  if (!auth.isLeader) {
    return NextResponse.json({ error: 'Only pod leaders can reindex members' }, { status: 403 });
  }

  const { data: pod } = await supabaseAdmin
    .from('pods').select('management_hat_id, membership_hat_id, pod_leads').eq('id', podId).maybeSingle();
  if (!pod) return NextResponse.json({ error: 'Pod not found' }, { status: 404 });

  const { data: rows } = await supabaseAdmin
    .from('pod_members').select('wallet, hat_id, role, is_active').eq('pod_id', podId);

  const known = new Set<string>([
    ...((rows ?? []).map((r) => String(r.wallet).toLowerCase())),
    ...(((pod.pod_leads as string[] | null) ?? []).map((l) => l.toLowerCase())),
  ]);

  const mgmt = pod.management_hat_id as string | null;
  const member = pod.membership_hat_id as string | null;
  const now = new Date().toISOString();
  const stats = { checked: 0, activated: 0, deactivated: 0, unchanged: 0, errors: 0 };

  for (const wallet of known) {
    stats.checked++;
    try {
      const isLeader = mgmt ? await wearsHat(wallet, mgmt) : false;
      const isMember = member ? await wearsHat(wallet, member) : false;
      const existing = (rows ?? []).find((r) => String(r.wallet).toLowerCase() === wallet);

      if (isLeader || isMember) {
        const role = isLeader ? 'leader' : 'member';
        const hat = isLeader ? mgmt : member;
        const changed = !existing || !existing.is_active || existing.role !== role || existing.hat_id !== hat;
        if (changed) {
          await supabaseAdmin.from('pod_members').upsert(
            { pod_id: podId, wallet, hat_id: hat, role, membership_type: role, is_active: true, updated_at: now, ...(existing ? {} : { joined_at: now }) },
            { onConflict: 'pod_id,wallet' },
          );
          stats.activated++;
        } else stats.unchanged++;
      } else if (existing?.is_active) {
        await supabaseAdmin.from('pod_members')
          .update({ is_active: false, removed_at: now, updated_at: now })
          .eq('pod_id', podId).eq('wallet', wallet);
        stats.deactivated++;
      } else stats.unchanged++;
      invalidatePodAuthority(wallet, podId);
    } catch {
      stats.errors++;
    }
  }

  return NextResponse.json({ ok: stats.errors === 0, ...stats });
}

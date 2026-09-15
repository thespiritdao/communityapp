// src/app/api/pods/[id]/members/claim-hat/route.ts
//
// A pod's creator claims the management hat after minting it on-chain. The
// browser used to upsert its own pod_members row as role='leader' directly;
// now the server confirms the wallet actually wears the management hat and
// records that. No leadership check is needed: the chain is the proof.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import { wearsHat, invalidatePodAuthority } from '@/lib/podAuthority';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const podId = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/members\/claim-hat/)?.[1] ?? '';
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const walletOrDenied = requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallet = walletOrDenied;

  const { data: pod } = await supabaseAdmin
    .from('pods').select('management_hat_id, pod_leads').eq('id', podId).maybeSingle();
  if (!pod?.management_hat_id) {
    return NextResponse.json({ error: 'Pod has no management hat' }, { status: 404 });
  }

  let worn: boolean;
  try {
    worn = await wearsHat(wallet, pod.management_hat_id as string);
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not confirm the hat on-chain; try again shortly', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
  if (!worn) {
    return NextResponse.json({ error: 'You do not wear this pod\'s management hat on-chain' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('pod_members')
    .upsert(
      {
        pod_id: podId,
        wallet,
        hat_id: pod.management_hat_id,
        role: 'leader',
        membership_type: 'leader',
        is_active: true,
        joined_at: now,
        updated_at: now,
      },
      { onConflict: 'pod_id,wallet' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep the declared-leads list in step with the chain.
  const leads = ((pod.pod_leads as string[] | null) ?? []).map((l) => l.toLowerCase());
  if (!leads.includes(wallet)) {
    await supabaseAdmin.from('pods').update({ pod_leads: [...leads, wallet] }).eq('id', podId);
  }

  invalidatePodAuthority(wallet, podId);
  return NextResponse.json({ ok: true });
}

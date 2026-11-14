import { PODS } from '@/config/deployment';
import { type NextRequest, NextResponse } from 'next/server';
import { isPodLeader } from '@/lib/serverPodAuth';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';

const EXEC_POD_ID = (PODS.governance ?? '');

async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}


function podIdFromRequest(req: NextRequest): string {
  const match = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/surveys/);
  return match?.[1] ?? '';
}

/** Count unique members from active_pod_members + pod_leads (some pods only use pod_leads). */
async function getDeduplicatedMemberCount(
  podId: string,
  podLeads: string[] | null | undefined,
): Promise<number> {
  const wallets = new Set<string>();

  // From active_pod_members view
  const { data: members } = await supabaseAdmin
    .from('active_pod_members')
    .select('wallet')
    .eq('pod_id', podId);

  if (members) {
    for (const m of members) {
      if (m.wallet) wallets.add(m.wallet.toLowerCase());
    }
  }

  // From pod_leads array (leaders may not be in pod_members)
  if (podLeads && Array.isArray(podLeads)) {
    for (const lead of podLeads) {
      if (lead) wallets.add(lead.toLowerCase());
    }
  }

  return wallets.size;
}

// GET /api/pods/[id]/surveys/audience — Available audience options
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = await getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const podId = podIdFromRequest(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const isLeader = await isPodLeader(podId, wallet);
  if (!isLeader) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const options: any[] = [];

  // 1. The pod itself — count from active_pod_members + pod_leads (deduplicated)
  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('name, pod_leads')
    .eq('id', podId)
    .single();

  const podMemberCount = await getDeduplicatedMemberCount(podId, pod?.pod_leads);

  options.push({
    type: 'pod',
    pod_id: podId,
    pod_name: pod?.name || 'This Pod',
    member_count: podMemberCount,
  });

  // 2. Sub-pods with members
  const { data: subPods } = await supabaseAdmin
    .from('pods')
    .select('id, name, status, pod_leads')
    .eq('parent_pod_id', podId)
    .eq('status', 'active');

  if (subPods && subPods.length > 0) {
    for (const subPod of subPods) {
      const subCount = await getDeduplicatedMemberCount(subPod.id, subPod.pod_leads);

      if (subCount > 0) {
        options.push({
          type: 'pod',
          pod_id: subPod.id,
          pod_name: subPod.name,
          member_count: subCount,
        });
      }
    }
  }

  // 3. Exec pod gets "All App Users" option
  if (podId === EXEC_POD_ID) {
    const { count: totalUsers } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id', { count: 'exact', head: true });

    options.push({
      type: 'all_users',
      pod_name: 'All App Users',
      member_count: totalUsers || 0,
    });
  }

  return NextResponse.json({ options });
}

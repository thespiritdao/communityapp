import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

const EXEC_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';

function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

async function isPodLeader(podId: string, wallet: string): Promise<boolean> {
  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('pod_leads')
    .eq('id', podId)
    .single();

  if (pod?.pod_leads?.includes(wallet.toLowerCase())) return true;

  const { data: member } = await supabaseAdmin
    .from('pod_members')
    .select('id')
    .eq('pod_id', podId)
    .eq('wallet', wallet.toLowerCase())
    .eq('role', 'leader')
    .eq('is_active', true)
    .single();

  return !!member;
}

function podIdFromRequest(req: NextRequest): string {
  const match = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/surveys/);
  return match?.[1] ?? '';
}

// GET /api/pods/[id]/surveys/audience — Available audience options
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const podId = podIdFromRequest(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const isLeader = await isPodLeader(podId, wallet);
  if (!isLeader) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const options: any[] = [];

  // 1. The pod itself
  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('name')
    .eq('id', podId)
    .single();

  const { count: podMemberCount } = await supabaseAdmin
    .from('active_pod_members')
    .select('id', { count: 'exact', head: true })
    .eq('pod_id', podId);

  options.push({
    type: 'pod',
    pod_id: podId,
    pod_name: pod?.name || 'This Pod',
    member_count: podMemberCount || 0,
  });

  // 2. Sub-pods with members
  const { data: subPods } = await supabaseAdmin
    .from('pods')
    .select('id, name, status')
    .eq('parent_pod_id', podId)
    .eq('status', 'active');

  if (subPods && subPods.length > 0) {
    for (const subPod of subPods) {
      const { count: subCount } = await supabaseAdmin
        .from('active_pod_members')
        .select('id', { count: 'exact', head: true })
        .eq('pod_id', subPod.id);

      if (subCount && subCount > 0) {
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
      .select('id', { count: 'exact', head: true });

    options.push({
      type: 'all_users',
      pod_name: 'All App Users',
      member_count: totalUsers || 0,
    });
  }

  return NextResponse.json({ options });
}

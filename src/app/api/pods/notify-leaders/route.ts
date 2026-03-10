import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

// Pod UUIDs sourced from pod_role_permissions / pods table — same as hatRegistry.ts.
// Do NOT use env vars for pod identity.
const COMMUNITY_POD_ID = '86d2d359-2e38-4267-b7b7-c7f6155063e2';
const EXEC_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';

/**
 * Resolve the wallet addresses of the leaders for a given pod.
 *
 * Strategy 1: active_pod_members WHERE pod_id = X AND membership_type IN ('leader','admin')
 * Strategy 2: pods.pod_leads fallback
 */
async function resolveLeaders(podId: string): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('active_pod_members')
      .select('wallet')
      .eq('pod_id', podId)
      .in('membership_type', ['leader', 'admin']);

    if (!error && data && data.length > 0) {
      return data.map((r: { wallet: string }) => r.wallet.toLowerCase());
    }
  } catch {
    // fall through to strategy 2
  }

  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('pod_leads')
    .eq('id', podId)
    .single();

  if (pod?.pod_leads?.length) {
    return (pod.pod_leads as string[]).map((w: string) => w.toLowerCase());
  }

  return [];
}

/**
 * POST /api/pods/notify-leaders
 *
 * Notifies the appropriate pod leaders when a new pod application is submitted.
 *
 * - Top-level pod (parent is null or community pod): notify exec pod leaders
 * - Sub-pod (parent is any other pod): notify that parent pod's leaders
 *
 * Body: { podId, podName, creatorAddress, parentPodId }
 */
export async function POST(req: NextRequest) {
  try {
    const { podId, podName, creatorAddress, parentPodId } = await req.json();

    if (!podId || !podName || !creatorAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const isTopLevel =
      !parentPodId ||
      parentPodId === COMMUNITY_POD_ID;

    const notifyPodId = isTopLevel ? EXEC_POD_ID : parentPodId;

    const leaders = await resolveLeaders(notifyPodId);

    const creator = creatorAddress.toLowerCase();
    const recipients = leaders.filter((w) => w !== creator);

    if (recipients.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    const rows = recipients.map((wallet) => ({
      recipient_address: wallet,
      sender_address: creator,
      notification_type: 'pod_approval_request',
      title: 'New Pod Application',
      message: `A new pod "${podName}" has been submitted for review and requires approval.`,
      context_url: '/pods/review',
      context_type: 'pod',
      context_id: podId,
    }));

    const { error } = await supabaseAdmin
      .from('general_notifications')
      .insert(rows);

    if (error) {
      console.error('notify-leaders: DB insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`notify-leaders: notified ${recipients.length} leaders for pod "${podName}"`);
    return NextResponse.json({ success: true, notified: recipients.length });
  } catch (err: any) {
    console.error('notify-leaders error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

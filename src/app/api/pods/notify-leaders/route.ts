import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

const COMMUNITY_POD_ID = process.env.NEXT_PUBLIC_COMMUNITY_POD_ID?.replace(/^C/, '').toLowerCase();
const EXEC_POD_ID = process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID;

/**
 * Resolve the wallet addresses of pod leaders who should be notified
 * about a new pod application.
 *
 * For top-level pods (parent is community pod or null): notify exec pod leaders.
 * For sub-pods (parent is a real pod): notify that parent pod's leaders.
 *
 * Strategy 1: active_pod_members WHERE pod_id = X AND membership_type IN ('leader','admin')
 * Strategy 2: pods.pod_leads fallback
 */
async function resolveLeaders(podId: string): Promise<string[]> {
  // Strategy 1: active_pod_members
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

  // Strategy 2: pods.pod_leads
  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('pod_leads')
    .eq('id', podId)
    .single();

  if (pod?.pod_leads?.length) {
    return (pod.pod_leads as string[]).map((w) => w.toLowerCase());
  }

  return [];
}

export async function POST(req: NextRequest) {
  try {
    const { podId, podName, creatorAddress, parentPodId } = await req.json();

    if (!podId || !podName || !creatorAddress) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Determine which pod's leaders to notify
    const parentIsTopLevel =
      !parentPodId ||
      parentPodId.toLowerCase() === COMMUNITY_POD_ID ||
      parentPodId === process.env.NEXT_PUBLIC_COMMUNITY_POD_ID;

    const notifyPodId = parentIsTopLevel ? EXEC_POD_ID! : parentPodId;

    const leaders = await resolveLeaders(notifyPodId);

    const creator = creatorAddress.toLowerCase();
    const recipients = leaders.filter((w) => w !== creator);

    if (recipients.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    const contextUrl = `/pods/review`;
    const title = 'New Pod Application';
    const message = `A new pod "${podName}" has been submitted for review and requires approval.`;

    const rows = recipients.map((wallet) => ({
      recipient_address: wallet,
      sender_address: creator,
      notification_type: 'pod_approval_request',
      title,
      message,
      context_url: contextUrl,
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

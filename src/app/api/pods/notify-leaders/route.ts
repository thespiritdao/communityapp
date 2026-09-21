import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { sendServerNotificationBatch } from '@/lib/serverNotifications';
import { requireWallet } from '@/lib/apiPodGuard';
import { isPodLeader } from '@/lib/serverPodAuth';

/**
 * Resolve the pod_id for a named role by querying pod_role_permissions.
 * This is the single source of truth — no hardcoded UUIDs or env vars.
 */
async function getPodIdByRole(roleName: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('pod_role_permissions')
    .select('pod_id')
    .ilike('role_name', roleName)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.pod_id;
}

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
 * Pod identity is resolved from pod_role_permissions by role name — no hardcoded UUIDs.
 *
 * - Top-level pod (parent is null or community pod): notify exec pod leaders
 * - Sub-pod (parent is any other pod): notify that parent pod's leaders
 *
 * Body: { podId, podName, creatorAddress, parentPodId }
 */
export async function POST(req: NextRequest) {
  try {
    // Audit F5: anyone could send arbitrary text to every leader of any pod.
    // The caller must be signed in, and creatorAddress is the session wallet
    // rather than whatever the body says.
    const walletOrDenied = await requireWallet(req);
    if (walletOrDenied instanceof Response) return walletOrDenied;
    const caller = walletOrDenied;

    const { podId, podName, parentPodId } = await req.json();
    const creatorAddress = caller;

    if (!podId || !podName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: podRow } = await supabaseAdmin
      .from('pods').select('created_by_address').eq('id', podId).maybeSingle();
    const isCreator = (podRow?.created_by_address || '').toLowerCase() === caller;
    if (!isCreator && !(await isPodLeader(podId, caller))) {
      return NextResponse.json({ error: 'Only the pod creator or a lead can send this' }, { status: 403 });
    }

    // Resolve community pod UUID dynamically — stable role name, not UUID
    const communityPodId = await getPodIdByRole('Community Pod Member');

    const isTopLevel =
      !parentPodId ||
      (communityPodId && parentPodId === communityPodId);

    let notifyPodId: string | null;

    if (isTopLevel) {
      // Top-level: notify exec pod leaders
      notifyPodId = await getPodIdByRole('Executive Pod Leader');
    } else {
      // Sub-pod: notify the parent pod's leaders directly
      notifyPodId = parentPodId;
    }

    if (!notifyPodId) {
      console.error('notify-leaders: could not resolve target pod ID');
      return NextResponse.json({ error: 'Could not resolve notify target pod' }, { status: 500 });
    }

    const leaders = await resolveLeaders(notifyPodId);

    const creator = creatorAddress.toLowerCase();
    const recipients = leaders.filter((w) => w !== creator);

    if (recipients.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    const payloads = recipients.map((wallet) => ({
      recipient_address: wallet,
      sender_address: creator,
      notification_type: 'pod_approval_request',
      title: 'New Pod Application',
      message: `A new pod "${podName}" has been submitted for review and requires approval.`,
      context_url: '/pods/review',
      context_type: 'pod',
      context_id: podId,
      priority: 'high' as const,
    }));

    const { sent, skipped } = await sendServerNotificationBatch(payloads);

    console.log(`notify-leaders: notified ${sent} leaders for pod "${podName}" (${skipped} skipped by prefs)`);
    return NextResponse.json({ success: true, notified: sent, skipped });
  } catch (err: any) {
    console.error('notify-leaders error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

// src/app/api/pods/notify-exec/route.ts
// Notify exec hat wearers when a new pod is submitted for review.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { sendServerNotificationBatch } from '@/lib/serverNotifications';
import { requireWallet } from '@/lib/apiPodGuard';
import { isPodLeader } from '@/lib/serverPodAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // Audit F5: this was callable by anyone with any text, delivering it as a
    // notification to every Executive member. Only the pod's creator or a lead
    // may announce a pod.
    const walletOrDenied = requireWallet(req);
    if (walletOrDenied instanceof Response) return walletOrDenied;
    const caller = walletOrDenied;

    const { podId, podName } = await req.json();

    if (!podId || !podName) {
      return NextResponse.json({ error: 'Missing podId or podName' }, { status: 400 });
    }

    const { data: podRow } = await supabaseAdmin
      .from('pods').select('created_by_address').eq('id', podId).maybeSingle();
    const isCreator = (podRow?.created_by_address || '').toLowerCase() === caller;
    if (!isCreator && !(await isPodLeader(podId, caller))) {
      return NextResponse.json({ error: 'Only the pod creator or a lead can send this' }, { status: 403 });
    }

    // Get exec pod members from DB
    const EXEC_POD_UUID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';
    const { data: execMembers } = await supabaseAdmin
      .from('pod_members')
      .select('wallet')
      .eq('pod_id', EXEC_POD_UUID)
      .eq('is_active', true);

    const recipients: string[] = execMembers?.map((m: any) => m.wallet) ?? [];

    if (recipients.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    const payloads = recipients.map((wallet) => ({
      recipient_address: wallet.toLowerCase(),
      sender_address: '0x0000000000000000000000000000000000000000',
      notification_type: 'pod_pending_review',
      title: 'New Pod Pending Review',
      message: `Pod "${podName}" has been submitted and is awaiting exec approval.`,
      context_type: 'pod',
      context_id: podId,
      context_url: '/pods/review',
      priority: 'high' as const,
    }));

    const { sent, skipped } = await sendServerNotificationBatch(payloads);

    return NextResponse.json({ success: true, notified: sent, skipped });
  } catch (err: any) {
    console.error('notify-exec error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

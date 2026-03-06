// src/app/api/pods/notify-exec/route.ts
// Notify exec hat wearers when a new pod is submitted for review.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { podId, podName } = await req.json();

    if (!podId || !podName) {
      return NextResponse.json({ error: 'Missing podId or podName' }, { status: 400 });
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

    // Send general_notifications to each exec member
    const now = new Date().toISOString();
    const notifications = recipients.map((wallet) => ({
      recipient_address: wallet.toLowerCase(),
      sender_address: '0x0000000000000000000000000000000000000000',
      notification_type: 'pod_pending_review',
      title: 'New Pod Pending Review',
      message: `Pod "${podName}" has been submitted and is awaiting exec approval.`,
      context_type: 'pod',
      context_id: podId,
      context_url: '/pods/review',
      created_at: now,
      is_read: false,
    }));

    const { error } = await supabaseAdmin
      .from('general_notifications')
      .insert(notifications);

    if (error) {
      console.error('Failed to insert exec notifications:', error);
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({ success: true, notified: notifications.length });
  } catch (err: any) {
    console.error('notify-exec error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

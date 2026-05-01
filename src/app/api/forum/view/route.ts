// src/app/api/forum/view/route.ts
// Increment thread view count (fire-and-forget from client)

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { thread_id } = await req.json();
    if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 });

    const { error } = await supabaseAdmin.rpc('increment_thread_view_count', { tid: thread_id });

    if (error) {
      console.error('View count error:', error);
      return NextResponse.json({ error: 'Failed to increment view' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('View count error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

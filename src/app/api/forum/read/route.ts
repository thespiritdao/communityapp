// src/app/api/forum/read/route.ts
// Thread read-tracking for unread indicators

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';

async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

// GET /api/forum/read?thread_ids=id1,id2,... — batch check read status
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wallet = await getWalletFromToken(token);
    if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const threadIds = req.nextUrl.searchParams.get('thread_ids')?.split(',').filter(Boolean);
    if (!threadIds?.length) return NextResponse.json({ reads: {} });

    const { data, error } = await supabaseAdmin
      .from('forum_thread_reads')
      .select('thread_id, last_read_at')
      .eq('user_address', wallet)
      .in('thread_id', threadIds);

    if (error) {
      console.error('Read status error:', error);
      return NextResponse.json({ error: 'Failed to fetch read status' }, { status: 500 });
    }

    const reads: Record<string, string> = {};
    (data || []).forEach((r: any) => { reads[r.thread_id] = r.last_read_at; });

    return NextResponse.json({ reads });
  } catch (err) {
    console.error('Read status error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/forum/read — mark thread as read
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wallet = await getWalletFromToken(token);
    if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { thread_id } = await req.json();
    if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('forum_thread_reads')
      .upsert(
        { user_address: wallet, thread_id, last_read_at: new Date().toISOString() },
        { onConflict: 'user_address,thread_id' }
      );

    if (error) {
      console.error('Mark read error:', error);
      return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

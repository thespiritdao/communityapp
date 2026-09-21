// src/app/api/forum/bookmarks/route.ts
// Bookmark CRUD for forum threads

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';

async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

// GET /api/forum/bookmarks — list user's bookmarks
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wallet = await getWalletFromToken(token);
    if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    // Try with new columns first, fall back to base columns if they don't exist yet
    let { data, error } = await supabaseAdmin
      .from('forum_bookmarks')
      .select(`
        id, created_at,
        thread_id,
        forum_threads (
          id, title, author_address, category_id, created_at,
          is_pinned, is_locked, is_resolved, view_count, reply_count, last_reply_at
        )
      `)
      .eq('user_address', wallet)
      .order('created_at', { ascending: false });

    if (error && error.message?.includes('does not exist')) {
      // Fallback: new columns not yet available
      const fallback = await supabaseAdmin
        .from('forum_bookmarks')
        .select(`
          id, created_at,
          thread_id,
          forum_threads (
            id, title, author_address, category_id, created_at,
            is_pinned, is_locked
          )
        `)
        .eq('user_address', wallet)
        .order('created_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Bookmark list error:', error);
      return NextResponse.json({ error: 'Failed to fetch bookmarks' }, { status: 500 });
    }

    return NextResponse.json({ bookmarks: data || [] });
  } catch (err) {
    console.error('Bookmark list error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/forum/bookmarks — add bookmark
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wallet = await getWalletFromToken(token);
    if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { thread_id } = await req.json();
    if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('forum_bookmarks')
      .upsert({ user_address: wallet, thread_id }, { onConflict: 'user_address,thread_id' })
      .select()
      .single();

    if (error) {
      console.error('Bookmark add error:', error);
      return NextResponse.json({ error: 'Failed to add bookmark' }, { status: 500 });
    }

    return NextResponse.json({ bookmark: data });
  } catch (err) {
    console.error('Bookmark add error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE /api/forum/bookmarks — remove bookmark
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wallet = await getWalletFromToken(token);
    if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { thread_id } = await req.json();
    if (!thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('forum_bookmarks')
      .delete()
      .eq('user_address', wallet)
      .eq('thread_id', thread_id);

    if (error) {
      console.error('Bookmark remove error:', error);
      return NextResponse.json({ error: 'Failed to remove bookmark' }, { status: 500 });
    }

    return NextResponse.json({ removed: true });
  } catch (err) {
    console.error('Bookmark remove error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

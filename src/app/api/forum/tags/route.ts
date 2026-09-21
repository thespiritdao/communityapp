// src/app/api/forum/tags/route.ts
// Thread tags CRUD + popular tags autocomplete

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

// GET /api/forum/tags?thread_id=... or /api/forum/tags?popular=true
export async function GET(req: NextRequest) {
  try {
    const threadId = req.nextUrl.searchParams.get('thread_id');
    const popular = req.nextUrl.searchParams.get('popular');

    if (popular === 'true') {
      // Return top 20 most-used tags
      const { data, error } = await supabaseAdmin
        .from('forum_thread_tags')
        .select('tag')
        .limit(500);

      if (error) {
        return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
      }

      // Count occurrences and sort
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        counts[row.tag] = (counts[row.tag] || 0) + 1;
      });

      const popular = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([tag, count]) => ({ tag, count }));

      return NextResponse.json({ tags: popular });
    }

    if (!threadId) return NextResponse.json({ error: 'thread_id or popular=true required' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('forum_thread_tags')
      .select('id, tag, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
    }

    return NextResponse.json({ tags: data || [] });
  } catch (err) {
    console.error('Tags GET error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/forum/tags — add tag to thread (max 5)
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wallet = await getWalletFromToken(token);
    if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { thread_id, tag } = await req.json();
    if (!thread_id || !tag) return NextResponse.json({ error: 'thread_id and tag required' }, { status: 400 });

    const sanitizedTag = tag.trim().toLowerCase().slice(0, 30);
    if (!sanitizedTag) return NextResponse.json({ error: 'Invalid tag' }, { status: 400 });

    // Check thread authorship
    const { data: thread } = await supabaseAdmin
      .from('forum_threads')
      .select('author_address')
      .eq('id', thread_id)
      .single();

    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    if (thread.author_address !== wallet) {
      return NextResponse.json({ error: 'Only thread author can add tags' }, { status: 403 });
    }

    // Check max 5 tags
    const { count } = await supabaseAdmin
      .from('forum_thread_tags')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', thread_id);

    if ((count || 0) >= 5) {
      return NextResponse.json({ error: 'Maximum 5 tags per thread' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('forum_thread_tags')
      .upsert({ thread_id, tag: sanitizedTag }, { onConflict: 'thread_id,tag' })
      .select()
      .single();

    if (error) {
      console.error('Tag add error:', error);
      return NextResponse.json({ error: 'Failed to add tag' }, { status: 500 });
    }

    return NextResponse.json({ tag: data });
  } catch (err) {
    console.error('Tag add error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE /api/forum/tags — remove tag from thread
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wallet = await getWalletFromToken(token);
    if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { thread_id, tag } = await req.json();
    if (!thread_id || !tag) return NextResponse.json({ error: 'thread_id and tag required' }, { status: 400 });

    // Check thread authorship
    const { data: thread } = await supabaseAdmin
      .from('forum_threads')
      .select('author_address')
      .eq('id', thread_id)
      .single();

    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    if (thread.author_address !== wallet) {
      return NextResponse.json({ error: 'Only thread author can remove tags' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('forum_thread_tags')
      .delete()
      .eq('thread_id', thread_id)
      .eq('tag', tag.trim().toLowerCase());

    if (error) {
      console.error('Tag delete error:', error);
      return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 });
    }

    return NextResponse.json({ removed: true });
  } catch (err) {
    console.error('Tag delete error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

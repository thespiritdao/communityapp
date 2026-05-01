// src/app/api/forum/resolve/route.ts
// Mark threads as resolved/unresolved — only author or moderator

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

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

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wallet = getWalletFromToken(token);
    if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { thread_id, resolved } = await req.json();
    if (!thread_id || typeof resolved !== 'boolean') {
      return NextResponse.json({ error: 'thread_id and resolved (boolean) required' }, { status: 400 });
    }

    // Check: user must be thread author or moderator
    const { data: thread } = await supabaseAdmin
      .from('forum_threads')
      .select('author_address, category_id')
      .eq('id', thread_id)
      .single();

    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

    let canResolve = thread.author_address === wallet;

    // Check moderator permission if not author
    if (!canResolve && thread.category_id) {
      const { data: category } = await supabaseAdmin
        .from('forum_categories')
        .select('pod_id')
        .eq('id', thread.category_id)
        .single();

      if (category?.pod_id) {
        const { data: perms } = await supabaseAdmin
          .from('pod_role_permissions')
          .select('permissions')
          .eq('pod_id', category.pod_id)
          .eq('is_active', true);

        canResolve = (perms || []).some((p: any) => {
          const permissions = typeof p.permissions === 'string' ? JSON.parse(p.permissions) : p.permissions;
          return permissions?.forumModeration === true;
        });
      }
    }

    if (!canResolve) {
      return NextResponse.json({ error: 'Only thread author or moderator can resolve' }, { status: 403 });
    }

    const updateData: any = {
      is_resolved: resolved,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? wallet : null,
    };

    const { error } = await supabaseAdmin
      .from('forum_threads')
      .update(updateData)
      .eq('id', thread_id);

    if (error) {
      console.error('Resolve error:', error);
      return NextResponse.json({ error: 'Failed to update resolve status' }, { status: 500 });
    }

    return NextResponse.json({ success: true, is_resolved: resolved });
  } catch (err) {
    console.error('Resolve error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

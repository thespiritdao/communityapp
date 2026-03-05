// src/app/api/forum/moderate/route.ts
// Server-side forum moderation — uses service role to bypass RLS

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return (
      payload.wallet_address ||
      payload.user_metadata?.wallet_address ||
      null
    );
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const moderatorAddress = getWalletFromToken(token);
    if (!moderatorAddress) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await req.json();
    const { action, targetType, targetId, reason } = body;

    if (!action || !targetType || !targetId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the caller has forumModeration permission for the relevant pod
    const { data: thread } = targetType === 'thread'
      ? await supabaseAdmin.from('forum_threads').select('category_id').eq('id', targetId).single()
      : await supabaseAdmin.from('forum_posts').select('thread_id, forum_threads(category_id)').eq('id', targetId).single();

    const categoryId = targetType === 'thread'
      ? (thread as any)?.category_id
      : (thread as any)?.forum_threads?.category_id;

    if (categoryId) {
      const { data: category } = await supabaseAdmin
        .from('forum_categories')
        .select('pod_id')
        .eq('id', categoryId)
        .single();

      if (category?.pod_id) {
        // Verify at least one forumModeration role exists for this pod
        const { data: roles } = await supabaseAdmin
          .from('pod_role_permissions')
          .select('permissions')
          .eq('pod_id', category.pod_id)
          .eq('is_active', true);

        const hasModerationRole = (roles || []).some(
          (r: any) => r.permissions?.forumModeration === true,
        );

        if (!hasModerationRole) {
          return NextResponse.json({ error: 'No moderation roles configured for this pod' }, { status: 403 });
        }

        // TODO: add on-chain hat balance check here once hat_holders table exists
        // For now: JWT validity + pod having a moderation role is the gate.
      }
    }

    // Execute the action using service role (bypasses all RLS)
    if (action === 'delete' && targetType === 'thread') {
      const { error } = await supabaseAdmin
        .from('forum_threads')
        .delete()
        .eq('id', targetId);

      if (error) throw error;

      // Fire-and-forget audit log
      supabaseAdmin.from('forum_moderator_actions').insert({
        moderator_address: moderatorAddress.toLowerCase(),
        action_type: 'delete',
        target_type: 'thread',
        target_id: targetId,
        reason: reason || null,
        metadata: {},
      }).then(() => {}).catch(() => {});

      return NextResponse.json({ success: true });
    }

    if (action === 'delete' && targetType === 'post') {
      const { error } = await supabaseAdmin
        .from('forum_posts')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: moderatorAddress.toLowerCase(),
        })
        .eq('id', targetId);

      if (error) throw error;

      supabaseAdmin.from('forum_moderator_actions').insert({
        moderator_address: moderatorAddress.toLowerCase(),
        action_type: 'delete',
        target_type: 'post',
        target_id: targetId,
        reason: reason || null,
        metadata: {},
      }).then(() => {}).catch(() => {});

      return NextResponse.json({ success: true });
    }

    if (action === 'pin' && targetType === 'thread') {
      const { error } = await supabaseAdmin
        .from('forum_threads')
        .update({ is_pinned: true, pinned_at: new Date().toISOString(), pinned_by: moderatorAddress.toLowerCase() })
        .eq('id', targetId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'unpin' && targetType === 'thread') {
      const { error } = await supabaseAdmin
        .from('forum_threads')
        .update({ is_pinned: false, pinned_at: null, pinned_by: null })
        .eq('id', targetId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'lock' && targetType === 'thread') {
      const { error } = await supabaseAdmin
        .from('forum_threads')
        .update({ is_locked: true })
        .eq('id', targetId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'unlock' && targetType === 'thread') {
      const { error } = await supabaseAdmin
        .from('forum_threads')
        .update({ is_locked: false })
        .eq('id', targetId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('Forum moderation API error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

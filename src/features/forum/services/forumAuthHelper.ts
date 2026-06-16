// src/features/forum/services/forumAuthHelper.ts

import { supabase } from '@/utils/supabaseClient';

/**
 * Verify that a user has pod membership for a thread or post's pod-gated category.
 * Returns { allowed: true } if the content is not pod-gated or the user is a member.
 */
export async function verifyPodMembershipForThread(
  userAddress: string,
  threadId?: string,
  postId?: string,
): Promise<{ allowed: boolean; error?: string }> {
  try {
    let resolvedThreadId = threadId;

    // If we only have a postId, look up the thread
    if (!resolvedThreadId && postId) {
      const { data: post } = await supabase
        .from('forum_posts')
        .select('thread_id')
        .eq('id', postId)
        .single();

      resolvedThreadId = post?.thread_id;
    }

    if (!resolvedThreadId) {
      return { allowed: true }; // Can't determine thread, allow (RLS is fallback)
    }

    // Get thread's category
    const { data: thread } = await supabase
      .from('forum_threads')
      .select('category_id')
      .eq('id', resolvedThreadId)
      .single();

    if (!thread?.category_id) {
      return { allowed: true };
    }

    // Check if category is pod-gated
    const { data: category } = await supabase
      .from('forum_categories')
      .select('pod_id')
      .eq('id', thread.category_id)
      .single();

    if (!category?.pod_id) {
      return { allowed: true }; // Not pod-gated
    }

    // Verify pod membership
    const { data: membership } = await supabase
      .from('active_pod_members')
      .select('id')
      .eq('pod_id', category.pod_id)
      .eq('wallet', userAddress.toLowerCase())
      .eq('is_active', true)
      .maybeSingle();

    if (!membership) {
      return { allowed: false, error: 'Access denied: You are not a member of this pod.' };
    }

    return { allowed: true };
  } catch (error) {
    console.warn('[forumAuthHelper] Error checking pod membership:', error);
    return { allowed: true }; // Fail open — RLS is the fallback
  }
}

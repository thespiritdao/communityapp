// src/features/forum/services/ReactionService.ts

import { supabase } from '@/utils/supabaseClient';
import { verifyPodMembershipForThread } from './forumAuthHelper';

/**
 * Forum Reaction Service
 *
 * Handles emoji reactions on posts and threads
 */

export interface Reaction {
  id: string;
  post_id?: string;
  thread_id?: string;
  reaction_type: string;
  reactor_address: string;
  created_at: string;
}

export interface ReactionSummary {
  reaction_type: string;
  count: number;
  userReacted: boolean;
}

// Available emoji reactions
export const AVAILABLE_REACTIONS = [
  '👍',
  '❤️',
  '😂',
  '🎉',
  '🤔',
  '👀',
  '🔥',
  '💯',
];

// ============================================================================
// REACTION MANAGEMENT
// ============================================================================

/**
 * Add a reaction to a post or thread
 */
export async function addReaction(
  emoji: string,
  userAddress: string,
  postId?: string,
  threadId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!AVAILABLE_REACTIONS.includes(emoji)) {
      return { success: false, error: 'Invalid emoji' };
    }

    if (!postId && !threadId) {
      return {
        success: false,
        error: 'Must specify either postId or threadId',
      };
    }

    // Verify pod membership if thread/post belongs to a pod-gated category
    const membershipCheck = await verifyPodMembershipForThread(
      userAddress,
      threadId,
      postId,
    );
    if (!membershipCheck.allowed) {
      return { success: false, error: membershipCheck.error || 'Access denied' };
    }

    // Check if user already reacted with this emoji
    // ✅ FIX: Use maybeSingle() to avoid 406 errors with emoji URL encoding
    const query = supabase
      .from('forum_post_reactions')
      .select('id')
      .eq('reaction_type', emoji)
      .eq('reactor_address', userAddress.toLowerCase());

    if (postId) {
      query.eq('post_id', postId);
    } else if (threadId) {
      query.eq('thread_id', threadId);
    }

    const { data: existing, error: checkError } = await query.maybeSingle();

    // If there's an error, log it but continue (might be 406 from emoji encoding)
    if (checkError && checkError.code !== 'PGRST116') {
      console.warn('Error checking existing reaction:', checkError);
    }

    if (existing) {
      return { success: false, error: 'You already reacted with this emoji' };
    }

    // Add reaction
    const { error } = await supabase.from('forum_post_reactions').insert({
      post_id: postId,
      thread_id: threadId,
      reaction_type: emoji,
      reactor_address: userAddress.toLowerCase(),
    });

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('Error adding reaction:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a reaction
 */
export async function removeReaction(
  emoji: string,
  userAddress: string,
  postId?: string,
  threadId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const query = supabase
      .from('forum_post_reactions')
      .delete()
      .eq('reaction_type', emoji)
      .eq('reactor_address', userAddress.toLowerCase());

    if (postId) {
      query.eq('post_id', postId);
    } else if (threadId) {
      query.eq('thread_id', threadId);
    } else {
      return {
        success: false,
        error: 'Must specify either postId or threadId',
      };
    }

    const { error } = await query;

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('Error removing reaction:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Toggle a reaction (add if not exists, remove if exists)
 */
export async function toggleReaction(
  emoji: string,
  userAddress: string,
  postId?: string,
  threadId?: string,
): Promise<{ success: boolean; added?: boolean; error?: string }> {
  try {
    // Check if reaction exists
    const query = supabase
      .from('forum_post_reactions')
      .select('id')
      .eq('reaction_type', emoji)
      .eq('reactor_address', userAddress.toLowerCase());

    if (postId) {
      query.eq('post_id', postId);
    } else if (threadId) {
      query.eq('thread_id', threadId);
    }

    // Use maybeSingle() instead of single() to avoid errors when no row exists
    const { data: existing, error: queryError } = await query.maybeSingle();

    // If there's a real error (not just "no rows"), handle it
    if (queryError) {
      console.error('Error checking existing reaction:', queryError);
      return { success: false, error: queryError.message };
    }

    if (existing) {
      // Remove reaction
      const result = await removeReaction(emoji, userAddress, postId, threadId);
      return { ...result, added: false };
    } else {
      // Add reaction
      const result = await addReaction(emoji, userAddress, postId, threadId);
      return { ...result, added: true };
    }
  } catch (error: any) {
    console.error('Error toggling reaction:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// REACTION RETRIEVAL
// ============================================================================

/**
 * Get reaction summary for a post or thread
 */
export async function getReactionSummary(
  postId?: string,
  threadId?: string,
  userAddress?: string,
): Promise<{
  success: boolean;
  reactions?: ReactionSummary[];
  error?: string;
}> {
  try {
    if (!postId && !threadId) {
      return {
        success: false,
        error: 'Must specify either postId or threadId',
      };
    }

    const query = supabase
      .from('forum_post_reactions')
      .select('reaction_type, reactor_address');

    if (postId) {
      query.eq('post_id', postId);
    } else if (threadId) {
      query.eq('thread_id', threadId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group by emoji and count
    const reactionMap = new Map<string, ReactionSummary>();

    data?.forEach((reaction: any) => {
      const emoji = reaction.reaction_type;
      if (!reactionMap.has(emoji)) {
        reactionMap.set(emoji, {
          reaction_type: emoji,
          count: 0,
          userReacted: false,
        });
      }

      const summary = reactionMap.get(emoji)!;
      summary.count++;

      if (
        userAddress &&
        reaction.reactor_address === userAddress.toLowerCase()
      ) {
        summary.userReacted = true;
      }
    });

    // Convert to array and sort by count
    const reactions = Array.from(reactionMap.values()).sort(
      (a, b) => b.count - a.count,
    );

    return { success: true, reactions };
  } catch (error: any) {
    console.error('Error getting reaction summary:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all reactions for a post or thread (with user details)
 */
export async function getAllReactions(
  postId?: string,
  threadId?: string,
): Promise<{
  success: boolean;
  reactions?: Reaction[];
  error?: string;
}> {
  try {
    if (!postId && !threadId) {
      return {
        success: false,
        error: 'Must specify either postId or threadId',
      };
    }

    const query = supabase
      .from('forum_post_reactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (postId) {
      query.eq('post_id', postId);
    } else if (threadId) {
      query.eq('thread_id', threadId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, reactions: data as Reaction[] };
  } catch (error: any) {
    console.error('Error getting all reactions:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user's reactions on a specific post or thread
 */
export async function getUserReactions(
  userAddress: string,
  postId?: string,
  threadId?: string,
): Promise<{
  success: boolean;
  emojis?: string[];
  error?: string;
}> {
  try {
    const query = supabase
      .from('forum_post_reactions')
      .select('reaction_type')
      .eq('reactor_address', userAddress.toLowerCase());

    if (postId) {
      query.eq('post_id', postId);
    } else if (threadId) {
      query.eq('thread_id', threadId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const emojis = data?.map((r) => r.reaction_type) || [];

    return { success: true, emojis };
  } catch (error: any) {
    console.error('Error getting user reactions:', error);
    return { success: false, error: error.message };
  }
}

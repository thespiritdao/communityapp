// src/features/forum/services/ModerationService.ts

import { supabase } from '@/utils/supabaseClient';

/**
 * Forum Moderation Service
 *
 * Handles all moderation actions for forum threads and posts.
 * Requires forumModeration permission in pod_role_permissions.
 */

export interface ModerationAction {
  id: string;
  moderator_address: string;
  moderator_hat_id: string | null;
  action_type: 'pin' | 'unpin' | 'lock' | 'unlock' | 'delete' | 'ban' | 'mute' | 'feature' | 'unfeature';
  target_type: 'thread' | 'post' | 'user';
  target_id: string;
  reason?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface UserMute {
  id: string;
  user_address: string;
  muted_by: string;
  reason?: string;
  mute_type: 'temporary' | 'permanent' | 'shadow';
  expires_at?: string;
  created_at: string;
  is_active: boolean;
}

export interface PostReport {
  id: string;
  post_id?: string;
  thread_id?: string;
  reporter_address: string;
  report_type: 'spam' | 'abuse' | 'off-topic' | 'harassment' | 'other';
  description?: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'actioned';
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

// ============================================================================
// THREAD MODERATION
// ============================================================================

/**
 * Pin a thread to the top of its category
 */
export async function pinThread(
  threadId: string,
  moderatorAddress: string,
  moderatorHatId: string | null,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Update thread
    const { error: updateError } = await supabase
      .from('forum_threads')
      .update({
        is_pinned: true,
        pinned_at: new Date().toISOString(),
        pinned_by: moderatorAddress
      })
      .eq('id', threadId);

    if (updateError) throw updateError;

    // Log action
    await logModerationAction({
      moderator_address: moderatorAddress,
      moderator_hat_id: moderatorHatId,
      action_type: 'pin',
      target_type: 'thread',
      target_id: threadId,
      reason
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error pinning thread:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Unpin a thread
 */
export async function unpinThread(
  threadId: string,
  moderatorAddress: string,
  moderatorHatId: string | null,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: updateError } = await supabase
      .from('forum_threads')
      .update({
        is_pinned: false,
        pinned_at: null,
        pinned_by: null
      })
      .eq('id', threadId);

    if (updateError) throw updateError;

    await logModerationAction({
      moderator_address: moderatorAddress,
      moderator_hat_id: moderatorHatId,
      action_type: 'unpin',
      target_type: 'thread',
      target_id: threadId,
      reason
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error unpinning thread:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Lock a thread (prevent new replies)
 */
export async function lockThread(
  threadId: string,
  moderatorAddress: string,
  moderatorHatId: string | null,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: updateError } = await supabase
      .from('forum_threads')
      .update({
        is_locked: true
      })
      .eq('id', threadId);

    if (updateError) throw updateError;

    await logModerationAction({
      moderator_address: moderatorAddress,
      moderator_hat_id: moderatorHatId,
      action_type: 'lock',
      target_type: 'thread',
      target_id: threadId,
      reason
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error locking thread:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Unlock a thread
 */
export async function unlockThread(
  threadId: string,
  moderatorAddress: string,
  moderatorHatId: string | null,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: updateError } = await supabase
      .from('forum_threads')
      .update({
        is_locked: false
      })
      .eq('id', threadId);

    if (updateError) throw updateError;

    await logModerationAction({
      moderator_address: moderatorAddress,
      moderator_hat_id: moderatorHatId,
      action_type: 'unlock',
      target_type: 'thread',
      target_id: threadId,
      reason
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error unlocking thread:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a thread (hard delete)
 */
export async function deleteThread(
  threadId: string,
  moderatorAddress: string,
  moderatorHatId: string | null,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Log action before deleting
    await logModerationAction({
      moderator_address: moderatorAddress,
      moderator_hat_id: moderatorHatId,
      action_type: 'delete',
      target_type: 'thread',
      target_id: threadId,
      reason
    });

    // Delete thread (cascades to posts due to foreign key)
    const { error: deleteError } = await supabase
      .from('forum_threads')
      .delete()
      .eq('id', threadId);

    if (deleteError) throw deleteError;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting thread:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// POST MODERATION
// ============================================================================

/**
 * Delete a post (soft delete)
 */
export async function deletePost(
  postId: string,
  moderatorAddress: string,
  moderatorHatId: string | null,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: updateError } = await supabase
      .from('forum_posts')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: moderatorAddress
      })
      .eq('id', postId);

    if (updateError) throw updateError;

    await logModerationAction({
      moderator_address: moderatorAddress,
      moderator_hat_id: moderatorHatId,
      action_type: 'delete',
      target_type: 'post',
      target_id: postId,
      reason
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting post:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Restore a deleted post
 */
export async function restorePost(
  postId: string,
  moderatorAddress: string,
  moderatorHatId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: updateError } = await supabase
      .from('forum_posts')
      .update({
        is_deleted: false,
        deleted_at: null,
        deleted_by: null
      })
      .eq('id', postId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error: any) {
    console.error('Error restoring post:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// USER MODERATION
// ============================================================================

/**
 * Mute a user (temporary or permanent ban)
 */
export async function muteUser(
  userAddress: string,
  moderatorAddress: string,
  muteType: 'temporary' | 'permanent' | 'shadow',
  reason?: string,
  expiresAt?: Date
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: insertError } = await supabase
      .from('forum_user_mutes')
      .insert({
        user_address: userAddress.toLowerCase(),
        muted_by: moderatorAddress.toLowerCase(),
        reason,
        mute_type: muteType,
        expires_at: expiresAt?.toISOString(),
        is_active: true
      });

    if (insertError) throw insertError;

    await logModerationAction({
      moderator_address: moderatorAddress,
      moderator_hat_id: null,
      action_type: 'mute',
      target_type: 'user',
      target_id: userAddress,
      reason,
      metadata: { mute_type: muteType, expires_at: expiresAt?.toISOString() }
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error muting user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Unmute a user
 */
export async function unmuteUser(
  userAddress: string,
  moderatorAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: updateError } = await supabase
      .from('forum_user_mutes')
      .update({ is_active: false })
      .eq('user_address', userAddress.toLowerCase())
      .eq('is_active', true);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error: any) {
    console.error('Error unmuting user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if a user is currently muted
 */
export async function isUserMuted(
  userAddress: string
): Promise<{ muted: boolean; muteInfo?: UserMute }> {
  try {
    const { data, error } = await supabase
      .from('forum_user_mutes')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (not muted)
      throw error;
    }

    if (!data) {
      return { muted: false };
    }

    // Check if temporary mute has expired
    if (data.mute_type === 'temporary' && data.expires_at) {
      const expiresAt = new Date(data.expires_at);
      if (expiresAt < new Date()) {
        // Mute expired, deactivate it
        await supabase
          .from('forum_user_mutes')
          .update({ is_active: false })
          .eq('id', data.id);
        return { muted: false };
      }
    }

    return { muted: true, muteInfo: data as UserMute };
  } catch (error: any) {
    console.error('Error checking mute status:', error);
    return { muted: false };
  }
}

// ============================================================================
// REPORT MANAGEMENT
// ============================================================================

/**
 * Submit a report for a post or thread
 */
export async function submitReport(
  reporterAddress: string,
  reportType: 'spam' | 'abuse' | 'off-topic' | 'harassment' | 'other',
  description: string,
  postId?: string,
  threadId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: insertError } = await supabase
      .from('forum_post_reports')
      .insert({
        post_id: postId,
        thread_id: threadId,
        reporter_address: reporterAddress.toLowerCase(),
        report_type: reportType,
        description,
        status: 'pending'
      });

    if (insertError) throw insertError;

    return { success: true };
  } catch (error: any) {
    console.error('Error submitting report:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all pending reports
 */
export async function getPendingReports(): Promise<{
  success: boolean;
  reports?: PostReport[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('forum_post_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, reports: data as PostReport[] };
  } catch (error: any) {
    console.error('Error fetching reports:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Review a report (mark as reviewed, dismissed, or actioned)
 */
export async function reviewReport(
  reportId: string,
  moderatorAddress: string,
  status: 'reviewed' | 'dismissed' | 'actioned'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: updateError } = await supabase
      .from('forum_post_reports')
      .update({
        status,
        reviewed_by: moderatorAddress.toLowerCase(),
        reviewed_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error: any) {
    console.error('Error reviewing report:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// MODERATION LOG
// ============================================================================

/**
 * Log a moderation action
 */
async function logModerationAction(action: {
  moderator_address: string;
  moderator_hat_id: string | null;
  action_type: string;
  target_type: string;
  target_id: string;
  reason?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await supabase.from('forum_moderator_actions').insert({
      moderator_address: action.moderator_address.toLowerCase(),
      moderator_hat_id: action.moderator_hat_id,
      action_type: action.action_type,
      target_type: action.target_type,
      target_id: action.target_id,
      reason: action.reason,
      metadata: action.metadata || {}
    });
  } catch (error) {
    console.error('Error logging moderation action:', error);
    // Don't throw - logging failure shouldn't block the action
  }
}

/**
 * Get moderation history for a specific target
 */
export async function getModerationHistory(
  targetType: 'thread' | 'post' | 'user',
  targetId: string
): Promise<{ success: boolean; actions?: ModerationAction[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('forum_moderator_actions')
      .select('*')
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, actions: data as ModerationAction[] };
  } catch (error: any) {
    console.error('Error fetching moderation history:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all moderation actions by a specific moderator
 */
export async function getModeratorActions(
  moderatorAddress: string,
  limit = 50
): Promise<{ success: boolean; actions?: ModerationAction[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('forum_moderator_actions')
      .select('*')
      .eq('moderator_address', moderatorAddress.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { success: true, actions: data as ModerationAction[] };
  } catch (error: any) {
    console.error('Error fetching moderator actions:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get moderation statistics
 */
export async function getModerationStats(): Promise<{
  success: boolean;
  stats?: {
    totalActions: number;
    pendingReports: number;
    activeMutes: number;
    actionsToday: number;
  };
  error?: string;
}> {
  try {
    // Get total actions
    const { count: totalActions } = await supabase
      .from('forum_moderator_actions')
      .select('*', { count: 'exact', head: true });

    // Get pending reports
    const { count: pendingReports } = await supabase
      .from('forum_post_reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Get active mutes
    const { count: activeMutes } = await supabase
      .from('forum_user_mutes')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    // Get actions today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: actionsToday } = await supabase
      .from('forum_moderator_actions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    return {
      success: true,
      stats: {
        totalActions: totalActions || 0,
        pendingReports: pendingReports || 0,
        activeMutes: activeMutes || 0,
        actionsToday: actionsToday || 0
      }
    };
  } catch (error: any) {
    console.error('Error fetching moderation stats:', error);
    return { success: false, error: error.message };
  }
}

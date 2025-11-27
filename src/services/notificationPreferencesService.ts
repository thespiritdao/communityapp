/**
 * Notification Preferences Service
 *
 * Manages user notification preferences including:
 * - Global notification toggle
 * - Category-level controls
 * - Individual notification type preferences
 * - Quiet hours
 * - Digest settings (future)
 *
 * @see PHASE_4_COMPREHENSIVE_PLAN.md
 */

import { supabase } from '@/utils/supabaseClient';

export interface NotificationPreferences {
  // Global settings
  enabled: boolean;
  desktop_enabled: boolean;
  sound_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;

  // Category toggles
  category_pod: boolean;
  category_governance: boolean;
  category_bounty: boolean;
  category_chat: boolean;
  category_forum: boolean;
  category_event: boolean;
  category_marketplace: boolean;

  // Pod notifications
  pod_membership_invitation: boolean;
  pod_membership_application: boolean;
  pod_application_status: boolean;
  pod_member_added: boolean;
  pod_member_removed: boolean;
  pod_approval_required: boolean;
  pod_leadership_invitation: boolean;

  // Governance notifications
  governance_proposal_created: boolean;
  governance_proposal_mentioned: boolean;
  governance_voting_reminder_48h: boolean;
  governance_voting_reminder_24h: boolean;
  governance_voting_reminder_6h: boolean;
  governance_voting_reminder_1h: boolean;
  governance_proposal_executed: boolean;

  // Bounty notifications
  bounty_work_submitted: boolean;
  bounty_work_reviewed: boolean;
  bounty_dispute_filed: boolean;
  bounty_evidence_submitted: boolean;
  bounty_dispute_resolved: boolean;
  bounty_cancelled: boolean;

  // Chat & Forum notifications
  chat_direct_message: boolean;
  forum_user_mentioned: boolean;
  forum_thread_reply: boolean;
  forum_participating_reply: boolean;

  // Event notifications
  event_registration_confirmation: boolean;
  event_reminder_7d: boolean;
  event_reminder_day_of: boolean;
  event_checkin_prompt: boolean;
  event_updated: boolean;
  event_cancelled: boolean;
  event_completion_nft: boolean;

  // Marketplace notifications
  marketplace_purchase_fulfillment: boolean;
  marketplace_order_status: boolean;
  marketplace_review_mention: boolean;

  // Digest settings (future)
  digest_daily_enabled: boolean;
  digest_weekly_enabled: boolean;
  digest_daily_time: string;
}

export const notificationPreferencesService = {
  /**
   * Get user's notification preferences
   * Creates default preferences if none exist
   *
   * Note: RLS allows reading any user's preferences (needed for notification checks),
   * but only allows users to update their own preferences.
   */
  async getPreferences(userAddress: string): Promise<NotificationPreferences> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_address', userAddress.toLowerCase())
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No preferences found, create defaults
          console.log(`[NotificationPreferences] Creating default preferences for ${userAddress}`);
          return await this.createDefaultPreferences(userAddress);
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[NotificationPreferences] Error getting preferences:', error);
      throw error;
    }
  },

  /**
   * Create default preferences for new user
   *
   * Note: This is only called for the current user (creating their own preferences).
   * For system-initiated preference creation, the API route handles it with admin client.
   */
  async createDefaultPreferences(userAddress: string): Promise<NotificationPreferences> {
    const defaults: Partial<NotificationPreferences> = {
      enabled: true,
      desktop_enabled: true,
      sound_enabled: true,
      quiet_hours_enabled: false,
      quiet_hours_start: '22:00:00',
      quiet_hours_end: '08:00:00',

      // All categories enabled by default
      category_pod: true,
      category_governance: true,
      category_bounty: true,
      category_chat: true,
      category_forum: true,
      category_event: true,
      category_marketplace: true,

      // All individual types enabled by default (except optional ones)
      pod_membership_invitation: true,
      pod_membership_application: true,
      pod_application_status: true,
      pod_member_added: true,
      pod_member_removed: true,
      pod_approval_required: true,
      pod_leadership_invitation: true,

      governance_proposal_created: true,
      governance_proposal_mentioned: true,
      governance_voting_reminder_48h: true,
      governance_voting_reminder_24h: true,
      governance_voting_reminder_6h: true,
      governance_voting_reminder_1h: true,
      governance_proposal_executed: false, // Optional

      bounty_work_submitted: true,
      bounty_work_reviewed: true,
      bounty_dispute_filed: true,
      bounty_evidence_submitted: true,
      bounty_dispute_resolved: true,
      bounty_cancelled: true,

      chat_direct_message: true,
      forum_user_mentioned: true,
      forum_thread_reply: true,
      forum_participating_reply: false, // Optional (can be noisy)

      event_registration_confirmation: true,
      event_reminder_7d: true,
      event_reminder_day_of: true,
      event_checkin_prompt: true,
      event_updated: true,
      event_cancelled: true,
      event_completion_nft: true,

      marketplace_purchase_fulfillment: true,
      marketplace_order_status: true,
      marketplace_review_mention: true,

      digest_daily_enabled: false,
      digest_weekly_enabled: false,
      digest_daily_time: '09:00:00',
    };

    try {
      // Use regular client - RLS should allow users to create their own preferences
      const { data, error } = await supabase
        .from('notification_preferences')
        .insert({ user_address: userAddress.toLowerCase(), ...defaults })
        .select()
        .single();

      if (error) throw error;

      console.log(`[NotificationPreferences] Created default preferences for ${userAddress}`);
      return data;
    } catch (error) {
      console.error('[NotificationPreferences] Error creating default preferences:', error);
      throw error;
    }
  },

  /**
   * Update user preferences
   */
  async updatePreferences(
    userAddress: string,
    updates: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .update(updates)
        .eq('user_address', userAddress.toLowerCase())
        .select()
        .single();

      if (error) throw error;

      console.log(`[NotificationPreferences] Updated preferences for ${userAddress}`);
      return data;
    } catch (error) {
      console.error('[NotificationPreferences] Error updating preferences:', error);
      throw error;
    }
  },

  /**
   * Check if user should receive a notification
   *
   * @param userAddress - User to notify
   * @param notificationType - Type of notification (e.g., 'pod_membership_application')
   * @param priority - Notification priority ('low' | 'medium' | 'high' | 'urgent')
   * @returns true if notification should be sent
   */
  async shouldNotify(
    userAddress: string,
    notificationType: string,
    priority: 'low' | 'medium' | 'high' | 'urgent'
  ): Promise<boolean> {
    try {
      const prefs = await this.getPreferences(userAddress);

      // 1. Check global enabled
      if (!prefs.enabled) {
        console.log(`[NotificationPreferences] Notifications disabled for ${userAddress}`);
        return false;
      }

      // 2. Check quiet hours (allow urgent notifications)
      if (prefs.quiet_hours_enabled && priority !== 'urgent') {
        if (this.isQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end)) {
          console.log(`[NotificationPreferences] Quiet hours active for ${userAddress}, skipping ${priority} notification`);
          return false;
        }
      }

      // 3. Check category-level toggle
      const category = this.getCategoryForType(notificationType);
      const categoryKey = `category_${category}` as keyof NotificationPreferences;
      if (prefs[categoryKey] === false) {
        console.log(`[NotificationPreferences] Category ${category} disabled for ${userAddress}`);
        return false;
      }

      // 4. Check individual type preference
      const typeKey = notificationType as keyof NotificationPreferences;
      if (prefs[typeKey] === false) {
        console.log(`[NotificationPreferences] Type ${notificationType} disabled for ${userAddress}`);
        return false;
      }

      return true;
    } catch (error) {
      // If we can't get preferences, allow notification (fail open)
      console.error('[NotificationPreferences] Error checking preferences, allowing notification:', error);
      return true;
    }
  },

  /**
   * Check if current time is within quiet hours
   */
  isQuietHours(startTime: string, endTime: string): boolean {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const start = startHour * 60 + startMin;
    const end = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (start > end) {
      return currentTime >= start || currentTime < end;
    }

    return currentTime >= start && currentTime < end;
  },

  /**
   * Map notification type to category
   */
  getCategoryForType(notificationType: string): string {
    if (notificationType.startsWith('pod_')) return 'pod';
    if (notificationType.startsWith('governance_')) return 'governance';
    if (notificationType.startsWith('bounty_')) return 'bounty';
    if (notificationType.startsWith('chat_')) return 'chat';
    if (notificationType.startsWith('forum_')) return 'forum';
    if (notificationType.startsWith('event_')) return 'event';
    if (notificationType.startsWith('marketplace_')) return 'marketplace';
    return 'general';
  },

  /**
   * Reset preferences to defaults
   */
  async resetToDefaults(userAddress: string): Promise<NotificationPreferences> {
    try {
      // Delete existing preferences
      const { error: deleteError } = await supabase
        .from('notification_preferences')
        .delete()
        .eq('user_address', userAddress.toLowerCase());

      if (deleteError) throw deleteError;

      console.log(`[NotificationPreferences] Reset preferences for ${userAddress}`);

      // Create new defaults
      return await this.createDefaultPreferences(userAddress);
    } catch (error) {
      console.error('[NotificationPreferences] Error resetting preferences:', error);
      throw error;
    }
  },

  /**
   * Get notification type key from notification object
   * Helper to map from unified notification service format
   */
  getPreferenceKeyFromNotification(
    notificationType: string,
    category: string
  ): string {
    // Direct mappings
    const directMappings: Record<string, string> = {
      // Chat
      'chat_message': 'chat_direct_message',

      // Forum
      'user_mentioned': category === 'general' ? 'forum_user_mentioned' : 'governance_proposal_mentioned',
      'forum_reply': 'forum_thread_reply',

      // Marketplace
      'purchase_completed': 'marketplace_purchase_fulfillment',
      'order_status_updated': 'marketplace_order_status',

      // Events
      'event_registration': 'event_registration_confirmation',
      'event_reminder': 'event_reminder_day_of', // Default to day-of
      'event_checkin': 'event_checkin_prompt',

      // Governance
      'proposal_created': 'governance_proposal_created',
      'proposal_mentioned': 'governance_proposal_mentioned',
      'voting_reminder': 'governance_voting_reminder_24h', // Default to 24h
      'proposal_executed': 'governance_proposal_executed',

      // Bounties
      'bounty_update': 'bounty_work_submitted', // Generic bounty update
    };

    const key = `${notificationType}_${category}`;
    return directMappings[notificationType] || directMappings[key] || notificationType;
  }
};

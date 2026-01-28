// src/services/unifiedNotificationService.ts

import { supabase } from '@/utils/supabaseClient';
import { notificationPreferencesService } from './notificationPreferencesService';

// Type definitions for database records
interface GeneralNotification {
  id: string;
  recipient_address: string;
  sender_address: string;
  notification_type: string;
  title: string;
  message: string;
  context_url?: string;
  context_type?: string;
  context_id?: string;
  is_read: boolean;
  created_at: string;
}

interface GovernanceNotification {
  id: string;
  recipient_address: string;
  sender_address: string;
  notification_type: string;
  title: string;
  message: string;
  context_url?: string;
  proposal_id?: string;
  transaction_hash?: string;
  is_read: boolean;
  created_at: string;
}

export type NotificationType =
  // General notifications
  | 'user_mentioned'
  | 'forum_reply'
  | 'chat_message'
  | 'bounty_update'
  | 'purchase_completed'
  | 'order_status_updated'
  // Event notifications
  | 'event_registration'
  | 'event_checkin'
  | 'event_update'
  | 'event_cancellation'
  | 'event_checkin_prompt'
  | 'completion_certificate'
  // Pod notifications
  | 'pod_member_removed'
  | 'pod_leadership_invitation'
  | 'pod_member_joined'
  | 'pod_application_status'
  // Governance notifications
  | 'proposal_mentioned'
  | 'proposal_created'
  | 'proposal_voted'
  | 'proposal_executed'
  | 'proposal_cancelled'
  | 'token_holder_notification'
  | 'voting_reminder'
  | 'proposal_deadline_approaching';

export type NotificationCategory =
  | 'general'
  | 'governance'
  | 'events'
  | 'marketplace';

export interface UnifiedNotification {
  id: string;
  recipient_address: string;
  sender_address: string;
  notification_type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  context_url?: string;
  context_type?:
    | 'forum'
    | 'chat'
    | 'bounty'
    | 'governance'
    | 'marketplace'
    | 'events';
  context_id?: string;
  proposal_id?: string;
  transaction_hash?: string;
  is_read: boolean;
  created_at: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  metadata?: Record<string, any>;
}

export interface CreateUnifiedNotificationData {
  recipient_address: string;
  sender_address: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  context_url?: string;
  context_type?:
    | 'forum'
    | 'chat'
    | 'bounty'
    | 'governance'
    | 'marketplace'
    | 'events';
  context_id?: string;
  proposal_id?: string;
  transaction_hash?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  metadata?: Record<string, any>;
}

export interface NotificationPreferences {
  user_address: string;
  email_notifications: boolean;
  push_notifications: boolean;
  governance_notifications: boolean;
  mention_notifications: boolean;
  event_notifications: boolean;
  bounty_notifications: boolean;
  forum_notifications: boolean;
  chat_notifications: boolean;
  voting_reminders: boolean;
  proposal_deadline_alerts: boolean;
}

class UnifiedNotificationService {
  /**
   * Create a notification and route to appropriate service
   * Now checks user preferences before creating notification
   */
  async createNotification(
    data: CreateUnifiedNotificationData,
  ): Promise<UnifiedNotification | null> {
    const category = this.determineCategory(data.notification_type);
    const priority = data.priority || 'medium';

    try {
      // 🔧 FIX: Use server-side API route to create notifications
      // This ensures the admin client (with service role key) is only used server-side
      const response = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient_address: data.recipient_address,
          sender_address: data.sender_address,
          notification_type: data.notification_type,
          title: data.title,
          message: data.message,
          context_url: data.context_url,
          context_type: data.context_type,
          context_id: data.context_id,
          proposal_id: data.proposal_id,
          transaction_hash: data.transaction_hash,
          priority,
          category,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send notification');
      }

      const result = await response.json();

      // If notification was skipped due to user preferences, return null
      if (result.skipped) {
        console.log(
          `[UnifiedNotificationService] Notification skipped: ${result.reason}`,
        );
        return null;
      }

      // Transform the notification to our unified format
      if (category === 'governance') {
        return this.transformGovernanceNotification(result.notification);
      } else {
        return this.transformGeneralNotification(result.notification);
      }
    } catch (error) {
      console.error('Failed to create unified notification:', error);
      throw error;
    }
  }

  /**
   * Get all notifications for a user (unified view)
   */
  async getAllNotificationsForUser(
    userAddress: string,
    options: {
      limit?: number;
      category?: NotificationCategory;
      unreadOnly?: boolean;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
    } = {},
  ): Promise<UnifiedNotification[]> {
    const { limit = 50, category, unreadOnly = false } = options;

    try {
      const [
        generalNotifications,
        governanceNotifications,
        eventNotifications,
        marketplaceNotifications,
      ] = await Promise.all([
        !category || category === 'general'
          ? this.getGeneralNotifications(userAddress, limit, unreadOnly)
          : [],
        !category || category === 'governance'
          ? this.getGovernanceNotifications(userAddress, limit, unreadOnly)
          : [],
        !category || category === 'events'
          ? this.getEventNotifications(userAddress, limit, unreadOnly)
          : [],
        !category || category === 'marketplace'
          ? this.getMarketplaceNotifications(userAddress, limit, unreadOnly)
          : [],
      ]);

      // Transform and combine notifications
      const unified: UnifiedNotification[] = [
        ...generalNotifications.map((n) =>
          this.transformGeneralNotification(n),
        ),
        ...governanceNotifications.map((n) =>
          this.transformGovernanceNotification(n),
        ),
        ...eventNotifications.map((n) => this.transformEventNotification(n)),
        ...marketplaceNotifications.map((n) =>
          this.transformGeneralNotification(n),
        ), // Marketplace notifications are stored in general_notifications table
      ];

      // Filter by read status if requested
      const filtered = unreadOnly ? unified.filter((n) => !n.is_read) : unified;

      // Sort by created_at descending and priority
      return filtered
        .sort((a, b) => {
          // Sort by priority first
          const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
          const aPriority = priorityOrder[a.priority || 'medium'];
          const bPriority = priorityOrder[b.priority || 'medium'];

          if (aPriority !== bPriority) {
            return bPriority - aPriority;
          }

          // Then by date
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        })
        .slice(0, limit);
    } catch (error) {
      console.error('Failed to get unified notifications:', error);
      throw error;
    }
  }

  /**
   * Get unread count across all categories
   */
  async getUnreadCount(userAddress: string): Promise<{
    total: number;
    general: number;
    governance: number;
    events: number;
    marketplace: number;
  }> {
    try {
      const [generalCount, governanceCount, eventsCount, marketplaceCount] =
        await Promise.all([
          this.getGeneralUnreadCount(userAddress),
          this.getGovernanceUnreadCount(userAddress),
          this.getEventNotificationUnreadCount(userAddress),
          this.getMarketplaceUnreadCount(userAddress),
        ]);

      return {
        total: generalCount + governanceCount + eventsCount + marketplaceCount,
        general: generalCount,
        governance: governanceCount,
        events: eventsCount,
        marketplace: marketplaceCount,
      };
    } catch (error) {
      console.error('Failed to get unread counts:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read (routes to appropriate service)
   */
  async markAsRead(
    notificationId: string,
    category: NotificationCategory,
  ): Promise<void> {
    try {
      let result;

      switch (category) {
        case 'governance':
          result = await supabase
            .from('governance_notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .select();
          break;
        case 'general':
          result = await supabase
            .from('general_notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .select();
          break;
        case 'events':
          await this.markEventNotificationAsRead(notificationId);
          return;
      }

      if (result && result.error) {
        console.error(
          `Failed to mark ${category} notification as read:`,
          result.error,
        );
        throw new Error(
          `Failed to update notification: ${result.error.message}`,
        );
      }

      console.log(
        `Successfully marked ${category} notification ${notificationId} as read`,
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for user
   */
  async markAllAsRead(
    userAddress: string,
    category?: NotificationCategory,
  ): Promise<void> {
    try {
      // Track promises with their table names for proper error handling
      const promiseMap: {
        promise: Promise<any>;
        tableName: string;
        category: string;
      }[] = [];

      if (!category || category === 'general') {
        promiseMap.push({
          promise: supabase
            .from('general_notifications')
            .update({ is_read: true })
            .eq('recipient_address', userAddress.toLowerCase())
            .eq('is_read', false) // Only update unread notifications
            .select() as unknown as Promise<any>, // Return updated records
          tableName: 'general_notifications',
          category: 'general',
        });
      }

      if (!category || category === 'governance') {
        promiseMap.push({
          promise: supabase
            .from('governance_notifications')
            .update({ is_read: true })
            .eq('recipient_address', userAddress.toLowerCase())
            .eq('is_read', false) // Only update unread notifications
            .select() as unknown as Promise<any>, // Return updated records
          tableName: 'governance_notifications',
          category: 'governance',
        });
      }

      if (!category || category === 'events') {
        promiseMap.push({
          promise: this.markAllEventNotificationsAsRead(userAddress),
          tableName: 'event_notifications',
          category: 'events',
        });
      }

      // Execute all promises
      const results = await Promise.all(promiseMap.map((p) => p.promise));

      // Check for errors in the results with proper table name mapping
      let totalUpdated = 0;
      let hasError = false;

      results.forEach((result, index) => {
        const { tableName, category: cat } = promiseMap[index];

        if (result && result.error) {
          console.error(
            `❌ Error updating ${tableName} (${cat}):`,
            result.error,
          );
          console.error(`   Error code: ${result.error.code}`);
          console.error(`   Error message: ${result.error.message}`);
          console.error(`   Error details:`, result.error.details);
          hasError = true;
          throw new Error(
            `Failed to update ${tableName}: ${result.error.message} (code: ${result.error.code})`,
          );
        }

        // Count how many records were actually updated
        if (result && result.data) {
          const updateCount = result.data.length;
          totalUpdated += updateCount;
          console.log(
            `✅ Updated ${updateCount} records in ${tableName} (${cat})`,
          );

          // Warn if no records were updated (might indicate RLS issue)
          if (updateCount === 0) {
            console.warn(
              `⚠️ No records updated in ${tableName} - check if notifications exist or if RLS is blocking updates`,
            );
          }
        }
      });

      if (hasError) {
        throw new Error(
          'Failed to mark notifications as read - see errors above',
        );
      }

      console.log(
        `✅ Successfully marked ${totalUpdated} notifications as read for ${userAddress}`,
      );

      // If no records were updated at all, log a warning
      if (totalUpdated === 0) {
        console.warn(
          `⚠️ No notifications were marked as read. This could indicate:`,
        );
        console.warn(`   1. No unread notifications exist for this user`);
        console.warn(`   2. RLS policies are blocking the UPDATE`);
        console.warn(`   3. Wallet address mismatch`);
        console.warn(`   User address: ${userAddress}`);
      }
    } catch (error) {
      console.error('❌ Failed to mark all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Create user mention notification (handles both general and governance contexts)
   */
  async createUserMentionNotification(
    recipientAddress: string,
    senderAddress: string,
    contextType: 'forum' | 'chat' | 'bounty' | 'governance' | 'events',
    contextId: string,
    contextUrl?: string,
    proposalId?: string,
  ): Promise<UnifiedNotification | null> {
    if (contextType === 'governance' && proposalId) {
      // Create governance mention notification
      return this.createNotification({
        recipient_address: recipientAddress,
        sender_address: senderAddress,
        notification_type: 'proposal_mentioned',
        title: 'You were mentioned in a proposal',
        message: 'You have been mentioned in a governance proposal discussion',
        context_type: 'governance',
        context_id: contextId,
        context_url: contextUrl,
        proposal_id: proposalId,
        priority: 'medium',
      });
    } else {
      // Create general mention notification
      return this.createNotification({
        recipient_address: recipientAddress,
        sender_address: senderAddress,
        notification_type: 'user_mentioned',
        title: `You were mentioned in ${contextType}`,
        message: `You have been mentioned in a ${contextType} discussion`,
        context_type: contextType,
        context_id: contextId,
        context_url: contextUrl,
        priority: 'medium',
      });
    }
  }

  /**
   * Create voting reminder notifications for token holders
   */
  async createVotingReminders(
    proposalId: string,
    proposalTitle: string,
    tokenHolders: string[],
    deadlineHours: number,
  ): Promise<void> {
    console.log(
      `🗳️ Creating voting reminders for ${tokenHolders.length} token holders`,
    );

    const promises = tokenHolders.map((address) =>
      this.createNotification({
        recipient_address: address,
        sender_address: 'system', // System-generated
        notification_type: 'voting_reminder',
        title: `Voting reminder: ${proposalTitle}`,
        message: `You have ${deadlineHours} hours left to vote on this proposal. Your vote matters!`,
        context_type: 'governance',
        context_id: proposalId,
        context_url: `/governance/${proposalId}`,
        proposal_id: proposalId,
        priority: 'high',
      }),
    );

    try {
      await Promise.all(promises);
      console.log(
        `✅ Created ${promises.length} voting reminder notifications`,
      );
    } catch (error) {
      console.error('Failed to create voting reminders:', error);
      throw error;
    }
  }

  /**
   * Determine notification category based on type
   */
  private determineCategory(type: NotificationType): NotificationCategory {
    const governanceTypes: NotificationType[] = [
      'proposal_mentioned',
      'proposal_created',
      'proposal_voted',
      'proposal_executed',
      'proposal_cancelled',
      'token_holder_notification',
      'voting_reminder',
      'proposal_deadline_approaching',
    ];

    const eventTypes: NotificationType[] = [
      'event_registration',
      'event_checkin',
    ];

    const marketplaceTypes: NotificationType[] = [
      'purchase_completed',
      'order_status_updated',
    ];

    if (governanceTypes.includes(type)) return 'governance';
    if (eventTypes.includes(type)) return 'events';
    if (marketplaceTypes.includes(type)) return 'marketplace';
    return 'general';
  }

  /**
   * Get general notifications for a user (excluding marketplace notifications)
   */
  private async getGeneralNotifications(
    userAddress: string,
    limit?: number,
    unreadOnly?: boolean,
  ): Promise<GeneralNotification[]> {
    const query = supabase
      .from('general_notifications')
      .select('*')
      .eq('recipient_address', userAddress.toLowerCase())
      .not(
        'notification_type',
        'in',
        '(purchase_completed,order_status_updated)',
      ) // Exclude marketplace types
      .order('created_at', { ascending: false });

    if (unreadOnly) query.eq('is_read', false);
    if (limit) query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch general notifications:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get governance notifications for a user
   */
  private async getGovernanceNotifications(
    userAddress: string,
    limit?: number,
    unreadOnly?: boolean,
  ): Promise<GovernanceNotification[]> {
    const query = supabase
      .from('governance_notifications')
      .select('*')
      .eq('recipient_address', userAddress.toLowerCase())
      .order('created_at', { ascending: false });

    if (unreadOnly) query.eq('is_read', false);
    if (limit) query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch governance notifications:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get marketplace notifications for a user
   */
  private async getMarketplaceNotifications(
    userAddress: string,
    limit?: number,
    unreadOnly?: boolean,
  ): Promise<GeneralNotification[]> {
    const query = supabase
      .from('general_notifications')
      .select('*')
      .eq('recipient_address', userAddress.toLowerCase())
      .in('notification_type', ['purchase_completed', 'order_status_updated']) // Only marketplace types
      .order('created_at', { ascending: false });

    if (unreadOnly) query.eq('is_read', false);
    if (limit) query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch marketplace notifications:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get general unread count (excluding marketplace notifications to prevent double counting)
   */
  private async getGeneralUnreadCount(userAddress: string): Promise<number> {
    const { count, error } = await supabase
      .from('general_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_address', userAddress.toLowerCase())
      .eq('is_read', false)
      .not(
        'notification_type',
        'in',
        '(purchase_completed,order_status_updated)',
      ); // Exclude marketplace types

    if (error) {
      console.error('Failed to fetch general unread count:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Get governance unread count
   */
  private async getGovernanceUnreadCount(userAddress: string): Promise<number> {
    const { count, error } = await supabase
      .from('governance_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_address', userAddress.toLowerCase())
      .eq('is_read', false);

    if (error) {
      console.error('Failed to fetch governance unread count:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Get marketplace unread count
   */
  private async getMarketplaceUnreadCount(
    userAddress: string,
  ): Promise<number> {
    const { count, error } = await supabase
      .from('general_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_address', userAddress.toLowerCase())
      .eq('is_read', false)
      .in('notification_type', ['purchase_completed', 'order_status_updated']);

    if (error) {
      console.error('Failed to fetch marketplace unread count:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Transform general notification to unified format
   */
  private transformGeneralNotification(
    notification: GeneralNotification,
  ): UnifiedNotification {
    return {
      ...notification,
      notification_type: notification.notification_type as NotificationType,
      context_type: notification.context_type as
        | 'bounty'
        | 'governance'
        | 'chat'
        | 'forum'
        | 'marketplace'
        | 'events'
        | undefined,
      category: this.determineCategory(
        notification.notification_type as NotificationType,
      ),
      priority: 'medium',
    };
  }

  /**
   * Transform governance notification to unified format
   */
  private transformGovernanceNotification(
    notification: GovernanceNotification,
  ): UnifiedNotification {
    return {
      ...notification,
      notification_type: notification.notification_type as NotificationType,
      category: 'governance',
      priority:
        notification.notification_type === 'voting_reminder'
          ? 'high'
          : 'medium',
    };
  }

  /**
   * Transform event notification to unified format
   */
  private transformEventNotification(notification: any): UnifiedNotification {
    return {
      ...notification,
      category: 'events' as NotificationCategory,
      priority: 'medium' as const,
    };
  }

  /**
   * Get event notifications
   */
  private async getEventNotifications(
    userAddress: string,
    limit: number,
    unreadOnly?: boolean,
  ): Promise<any[]> {
    const query = supabase
      .from('event_notifications')
      .select('*')
      .eq('recipient_address', userAddress.toLowerCase())
      .order('created_at', { ascending: false });

    if (unreadOnly) query.eq('is_read', false);
    query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching event notifications:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get event notification unread count
   */
  private async getEventNotificationUnreadCount(
    userAddress: string,
  ): Promise<number> {
    const { count, error } = await supabase
      .from('event_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_address', userAddress.toLowerCase())
      .eq('is_read', false);

    if (error) {
      console.error('Error getting event notification unread count:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Mark event notification as read
   */
  private async markEventNotificationAsRead(
    notificationId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('event_notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('Error marking event notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all event notifications as read
   */
  private async markAllEventNotificationsAsRead(
    userAddress: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('event_notifications')
      .update({ is_read: true })
      .eq('recipient_address', userAddress.toLowerCase())
      .eq('is_read', false);

    if (error) {
      console.error('Error marking all event notifications as read:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const unifiedNotificationService = new UnifiedNotificationService();

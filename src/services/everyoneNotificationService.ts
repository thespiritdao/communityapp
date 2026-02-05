/**
 * @everyone Notification Service
 *
 * Handles bulk notification delivery when @everyone is used in chat/forums.
 * Integrates with the existing UnifiedNotificationService.
 */

import { unifiedNotificationService } from './unifiedNotificationService';
import { everyoneTagService } from './everyoneTagService';
import { supabase } from '@/utils/supabaseClient';

export interface EveryoneNotificationPayload {
  senderAddress: string;
  senderName?: string;
  messageContent: string;
  messagePreview: string; // First 100 chars
  contextType: 'chat' | 'forum';
  contextId: string; // chat_group_id or forum_thread_id
  contextUrl: string; // Deep link to message
  podId: string;
  podName?: string;
}

class EveryoneNotificationService {
  /**
   * Send @everyone notifications to all pod/chat group members
   */
  async sendEveryoneNotifications(
    payload: EveryoneNotificationPayload,
  ): Promise<{ sent: number; failed: number; skipped: number }> {
    const {
      senderAddress,
      senderName,
      messageContent,
      messagePreview,
      contextType,
      contextId,
      contextUrl,
      podId,
      podName,
    } = payload;

    try {
      // Get all recipients based on context
      let recipients: string[] = [];

      if (contextType === 'chat') {
        recipients = await everyoneTagService.getChatGroupMembers(contextId);
      } else if (contextType === 'forum') {
        recipients = await everyoneTagService.getPodMembers(podId);
      }

      // Remove sender from recipients (don't notify yourself)
      recipients = recipients.filter(
        (wallet) => wallet.toLowerCase() !== senderAddress.toLowerCase(),
      );

      console.log(`[EveryoneNotificationService] Sending @everyone to ${recipients.length} members`);

      let sent = 0;
      let failed = 0;
      let skipped = 0;

      // Send notification to each recipient
      for (const recipientAddress of recipients) {
        try {
          const title = `@everyone in ${podName || 'pod'}`;
          const message = `${senderName || 'Someone'} mentioned @everyone: ${messagePreview}`;

          const result = await unifiedNotificationService.createNotification({
            recipient_address: recipientAddress,
            sender_address: senderAddress,
            notification_type: 'chat_message', // Use existing type
            title,
            message,
            context_url: contextUrl,
            context_type: contextType,
            context_id: contextId,
            priority: 'high', // @everyone gets high priority
            metadata: {
              isEveryoneTag: true,
              podId,
              podName,
              fullMessage: messageContent,
            },
          });

          if (result === null) {
            // Notification was skipped due to user preferences
            skipped++;
          } else {
            sent++;
          }
        } catch (error) {
          console.error(
            `[EveryoneNotificationService] Failed to notify ${recipientAddress}:`,
            error,
          );
          failed++;
        }
      }

      console.log(`[EveryoneNotificationService] Results: ${sent} sent, ${failed} failed, ${skipped} skipped`);

      return { sent, failed, skipped };
    } catch (error) {
      console.error('[EveryoneNotificationService] Failed to send @everyone notifications:', error);
      return { sent: 0, failed: 0, skipped: 0 };
    }
  }

  /**
   * Get sender's display name from user profile
   */
  async getSenderName(senderAddress: string): Promise<string | undefined> {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, username, basename')
        .eq('wallet_address', senderAddress.toLowerCase())
        .maybeSingle();

      if (!profile) {
        return undefined;
      }

      return profile.full_name || profile.username || profile.basename || undefined;
    } catch (error) {
      console.error('[EveryoneNotificationService] Failed to get sender name:', error);
      return undefined;
    }
  }

  /**
   * Get pod name from pod ID
   */
  async getPodName(podId: string): Promise<string | undefined> {
    try {
      const { data: pod } = await supabase
        .from('pods')
        .select('name')
        .eq('id', podId)
        .maybeSingle();

      return pod?.name || undefined;
    } catch (error) {
      console.error('[EveryoneNotificationService] Failed to get pod name:', error);
      return undefined;
    }
  }

  /**
   * Create message preview (first 100 chars)
   */
  createMessagePreview(content: string, maxLength: number = 100): string {
    // Remove @everyone tag from preview
    const cleanedContent = content.replace(/@everyone\s*/gi, '').trim();

    if (cleanedContent.length <= maxLength) {
      return cleanedContent;
    }

    return cleanedContent.substring(0, maxLength - 3) + '...';
  }
}

export const everyoneNotificationService = new EveryoneNotificationService();

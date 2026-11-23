/**
 * @everyone Notification Service (server-only)
 *
 * Bulk notification delivery when @everyone is used in chat/forums. Writes
 * through the server notification helper (preference check, insert, push),
 * so it must be called from an API route, inside `after()` so the fan-out
 * survives the response being sent.
 */

import { sendServerNotificationBatch } from '@/lib/serverNotifications';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { everyoneTagService } from './everyoneTagService';

export interface EveryoneNotificationPayload {
  senderAddress: string;
  senderName?: string;
  messagePreview: string; // First 100 chars
  contextType: 'chat' | 'forum';
  contextId: string; // chat_group_id or forum_thread_id
  contextUrl: string; // Deep link to message
  /** Pod whose members are notified; omit for a platform-wide chat. */
  podId?: string | null;
  /** Name shown in the title: the pod's, or the chat's when there is no pod. */
  contextName?: string;
}

const BATCH_SIZE = 20;

class EveryoneNotificationService {
  /**
   * Send @everyone notifications to all pod members, or to every member of
   * the platform when the chat has no pod.
   */
  async sendEveryoneNotifications(
    payload: EveryoneNotificationPayload,
  ): Promise<{ sent: number; failed: number; skipped: number }> {
    const {
      senderAddress,
      senderName,
      messagePreview,
      contextType,
      contextId,
      contextUrl,
      podId,
      contextName,
    } = payload;

    const sender = senderAddress.toLowerCase();
    const recipients = (await everyoneTagService.getRecipients(podId)).filter(
      (wallet) => wallet !== sender,
    );

    console.log(`[EveryoneNotificationService] Sending @everyone to ${recipients.length} members`);

    const title = `@everyone in ${contextName || (podId ? 'pod' : 'chat')}`;
    const message = `${senderName || 'Someone'} mentioned @everyone: ${messagePreview}`;

    let sent = 0;
    let skipped = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const result = await sendServerNotificationBatch(
        recipients.slice(i, i + BATCH_SIZE).map((recipient_address) => ({
          recipient_address,
          sender_address: sender,
          notification_type: 'chat_message',
          title,
          message,
          context_url: contextUrl,
          context_type: contextType,
          context_id: contextId,
          priority: 'high' as const, // @everyone gets through quiet hours
        })),
      );
      sent += result.sent;
      skipped += result.skipped;
    }

    const failed = recipients.length - sent - skipped;
    console.log(`[EveryoneNotificationService] Results: ${sent} sent, ${failed} failed, ${skipped} skipped`);

    return { sent, failed, skipped };
  }

  /**
   * Get sender's display name from user profile
   */
  async getSenderName(senderAddress: string): Promise<string | undefined> {
    try {
      const { data: profile } = await supabaseAdmin
        .from('public_profiles')
        .select('*')
        .eq('wallet_address', senderAddress.toLowerCase())
        .maybeSingle();

      if (!profile) return undefined;

      const fullName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();

      return (
        fullName ||
        profile.full_name ||
        profile.username ||
        profile.basename ||
        undefined
      );
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
      const { data: pod } = await supabaseAdmin
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
   * Create message preview (first 100 chars), with mention markup flattened:
   * the @everyone tag is dropped and "@[Name](id)" becomes "@Name".
   */
  createMessagePreview(content: string, maxLength: number = 100): string {
    const cleanedContent = content
      .replace(/@\[everyone\]\(everyone\)\s*/gi, '')
      .replace(/@everyone\b\s*/gi, '')
      .replace(/@\[([^\]]+)\]\([^)]*\)/g, '@$1')
      .replace(/^[\s\-–—:,]+/, '')
      .trim();

    if (cleanedContent.length <= maxLength) {
      return cleanedContent;
    }

    return cleanedContent.substring(0, maxLength - 3) + '...';
  }
}

export const everyoneNotificationService = new EveryoneNotificationService();

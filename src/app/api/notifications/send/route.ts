/**
 * API Route: Send Notification (Server-Side)
 *
 * Handles creating notifications using admin client to bypass RLS.
 * This is necessary because notifications are system-level operations
 * where one user (sender) creates notifications FOR other users (recipients).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const {
      recipient_address,
      sender_address,
      notification_type,
      title,
      message,
      context_url,
      context_type,
      context_id,
      proposal_id,
      transaction_hash,
      priority = 'medium',
      category
    } = data;

    // Validate required fields
    if (!recipient_address || !sender_address || !notification_type || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Determine category if not provided
    const notificationCategory = category || determineCategory(notification_type);

    // Check user preferences (using admin client)
    const shouldSend = await checkUserPreferences(
      recipient_address,
      notification_type,
      notificationCategory,
      priority
    );

    if (!shouldSend) {
      console.log(`[API] Notification skipped (user preferences): ${notification_type} for ${recipient_address}`);
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'User preferences'
      });
    }

    // Create notification using admin client
    let notification;
    if (notificationCategory === 'governance') {
      const { data: govNotification, error } = await supabaseAdmin
        .from('governance_notifications')
        .insert([{
          recipient_address: recipient_address.toLowerCase(),
          sender_address: sender_address.toLowerCase(),
          notification_type,
          title,
          message,
          context_url,
          context_type,
          context_id,
          proposal_id,
          transaction_hash,
        }])
        .select()
        .single();

      if (error) throw error;
      notification = govNotification;
    } else {
      const { data: generalNotification, error } = await supabaseAdmin
        .from('general_notifications')
        .insert([{
          recipient_address: recipient_address.toLowerCase(),
          sender_address: sender_address.toLowerCase(),
          notification_type,
          title,
          message,
          context_url,
          context_type,
          context_id,
        }])
        .select()
        .single();

      if (error) throw error;
      notification = generalNotification;
    }

    console.log(`[API] Notification sent successfully to ${recipient_address}`);
    return NextResponse.json({
      success: true,
      notification
    });

  } catch (error: any) {
    console.error('[API] Failed to send notification:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send notification' },
      { status: 500 }
    );
  }
}

/**
 * Determine notification category from type
 */
function determineCategory(notificationType: string): string {
  if (notificationType.startsWith('pod_')) return 'pod';
  if (notificationType.startsWith('governance_') || notificationType === 'proposal_created') return 'governance';
  if (notificationType.startsWith('bounty_')) return 'bounty';
  if (notificationType.startsWith('chat_')) return 'chat';
  if (notificationType.startsWith('forum_')) return 'forum';
  if (notificationType.startsWith('event_')) return 'event';
  if (notificationType.startsWith('marketplace_')) return 'marketplace';
  return 'general';
}

/**
 * Check if user wants to receive this notification
 */
async function checkUserPreferences(
  userAddress: string,
  notificationType: string,
  category: string,
  priority: string
): Promise<boolean> {
  try {
    // Get user preferences
    const { data: preferences, error } = await supabaseAdmin
      .from('notification_preferences')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .single();

    // If no preferences found, create defaults and return true
    if (error && error.code === 'PGRST116') {
      await createDefaultPreferences(userAddress);
      return true; // Default is to send all notifications
    }

    if (error) throw error;
    if (!preferences) return true; // If something went wrong, allow notification

    // Check if notifications are globally disabled
    if (!preferences.enabled) {
      console.log(`[API] Notifications globally disabled for ${userAddress}`);
      return false;
    }

    // Check category preference
    const categoryKey = `category_${category}` as keyof typeof preferences;
    if (preferences[categoryKey] === false) {
      console.log(`[API] Category ${category} disabled for ${userAddress}`);
      return false;
    }

    // Check specific notification type preference
    const typeKey = notificationType as keyof typeof preferences;
    if (typeKey in preferences && preferences[typeKey] === false) {
      console.log(`[API] Notification type ${notificationType} disabled for ${userAddress}`);
      return false;
    }

    // Check quiet hours if enabled
    if (preferences.quiet_hours_enabled) {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS
      const start = preferences.quiet_hours_start || '22:00:00';
      const end = preferences.quiet_hours_end || '08:00:00';

      if (isInQuietHours(currentTime, start, end)) {
        // Only block low/medium priority during quiet hours
        if (priority === 'low' || priority === 'medium') {
          console.log(`[API] Quiet hours active for ${userAddress}, blocking ${priority} priority`);
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.error('[API] Error checking preferences, allowing notification:', error);
    return true; // Fail open - allow notification if preference check fails
  }
}

/**
 * Create default notification preferences for new user
 */
async function createDefaultPreferences(userAddress: string) {
  const defaults = {
    enabled: true,
    desktop_enabled: true,
    sound_enabled: true,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '08:00:00',
    category_pod: true,
    category_governance: true,
    category_bounty: true,
    category_chat: true,
    category_forum: true,
    category_event: true,
    category_marketplace: true,
  };

  try {
    await supabaseAdmin
      .from('notification_preferences')
      .insert({ user_address: userAddress.toLowerCase(), ...defaults });

    console.log(`[API] Created default preferences for ${userAddress}`);
  } catch (error) {
    console.error('[API] Error creating default preferences:', error);
  }
}

/**
 * Check if current time is within quiet hours
 */
function isInQuietHours(current: string, start: string, end: string): boolean {
  if (start < end) {
    return current >= start && current < end;
  } else {
    return current >= start || current < end;
  }
}

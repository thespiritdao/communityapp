import { supabase } from '@/lib/supabase';

export interface NotificationPreference {
  email: boolean;
  push: boolean;
  sms: boolean;
}

export interface EventNotification {
  id: string;
  recipient_address: string;
  event_id: string;
  registration_id?: string;
  notification_type: 'registration_confirmed' | 'event_reminder' | 'event_update' | 'event_cancelled' | 'completion_nft_ready';
  title: string;
  message: string;
  context_url?: string;
  scheduled_for?: string;
  sent_at?: string;
  is_read: boolean;
}

class EventNotificationService {
  /**
   * Send registration confirmation notification
   */
  async sendRegistrationConfirmation(
    attendeeAddress: string,
    eventId: string,
    eventTitle: string,
    eventDate: string,
    transactionHash?: string
  ): Promise<void> {
    try {
      const notification: Partial<EventNotification> = {
        recipient_address: attendeeAddress.toLowerCase(),
        event_id: eventId,
        notification_type: 'registration_confirmed',
        title: 'Event Registration Confirmed',
        message: `You have successfully registered for "${eventTitle}" scheduled for ${new Date(eventDate).toLocaleDateString()}. See you there!`,
        context_url: `/events/${eventId}`,
        is_read: false
      };

      const { error } = await supabase
        .from('event_notifications')
        .insert(notification);

      if (error) {
        console.error('Error creating registration confirmation notification:', error);
        return;
      }

      console.log('📧 Registration confirmation sent:', {
        attendee: attendeeAddress,
        event: eventTitle
      });

      // Schedule check-in prompt notifications
      await this.scheduleCheckInPrompts(attendeeAddress, eventId, eventTitle, eventDate);
    } catch (error) {
      console.error('Error sending registration confirmation:', error);
    }
  }

  /**
   * Schedule check-in prompt notifications
   */
  async scheduleCheckInPrompts(
    attendeeAddress: string,
    eventId: string,
    eventTitle: string,
    eventDate: string
  ): Promise<void> {
    try {
      const eventDateTime = new Date(eventDate);
      const now = new Date();

      // Schedule 7-day check-in prompt
      const sevenDaysBefore = new Date(eventDateTime.getTime() - (7 * 24 * 60 * 60 * 1000));
      if (sevenDaysBefore > now) {
        const notification7d: Partial<EventNotification> = {
          user_id: attendeeAddress.toLowerCase(),
          event_id: eventId,
          notification_type: 'event_checkin_prompt' as any,
          title: `Check-in opens soon: ${eventTitle}`,
          message: `Check-in for "${eventTitle}" opens in 7 days. Get ready!`,
          scheduled_for: sevenDaysBefore.toISOString(),
          delivery_method: 'in_app',
          status: 'pending',
          metadata: {
            reminder_type: 'checkin_7d',
            event_date: eventDate
          }
        };

        await supabase.from('event_notifications').insert(notification7d);
        console.log(`📅 7-day check-in prompt scheduled for ${attendeeAddress}`);
      }

      // Schedule day-of check-in prompt (1 hour before event)
      const dayOf = new Date(eventDateTime.getTime() - (1 * 60 * 60 * 1000));
      if (dayOf > now) {
        const notificationDayOf: Partial<EventNotification> = {
          user_id: attendeeAddress.toLowerCase(),
          event_id: eventId,
          notification_type: 'event_checkin_prompt' as any,
          title: `Check-in now: ${eventTitle}`,
          message: `Check-in is now open for "${eventTitle}"! Don't forget to check in to claim your completion NFT.`,
          scheduled_for: dayOf.toISOString(),
          delivery_method: 'in_app',
          status: 'pending',
          metadata: {
            reminder_type: 'checkin_day_of',
            event_date: eventDate
          }
        };

        await supabase.from('event_notifications').insert(notificationDayOf);
        console.log(`📅 Day-of check-in prompt scheduled for ${attendeeAddress}`);
      }
    } catch (error) {
      console.error('Error scheduling check-in prompts:', error);
    }
  }

  /**
   * Notify event organizer of new registration
   */
  async notifyOrganizerOfRegistration(
    organizerAddress: string,
    eventId: string,
    eventTitle: string,
    attendeeAddress: string
  ): Promise<void> {
    try {
      const notification: Partial<EventNotification> = {
        user_id: organizerAddress.toLowerCase(),
        event_id: eventId,
        notification_type: 'event_update',
        title: 'New Event Registration',
        message: `Someone has registered for your event "${eventTitle}". Check your event dashboard for details.`,
        scheduled_for: new Date().toISOString(),
        delivery_method: 'in_app',
        status: 'pending',
        metadata: {
          attendee_address: attendeeAddress,
          action: 'new_registration'
        }
      };

      const { error } = await supabase
        .from('event_notifications')
        .insert(notification);

      if (error) {
        console.error('Error creating organizer notification:', error);
        return;
      }

      console.log('📧 Organizer notification sent:', {
        organizer: organizerAddress,
        event: eventTitle,
        newAttendee: attendeeAddress
      });
    } catch (error) {
      console.error('Error notifying organizer:', error);
    }
  }

  /**
   * Schedule automatic event reminders
   */
  async scheduleEventReminders(
    eventId: string,
    eventTitle: string,
    eventDate: string
  ): Promise<void> {
    try {
      const eventDateTime = new Date(eventDate);
      
      // Get all registered attendees
      const { data: registrations, error } = await supabase
        .from('event_registrations')
        .select('user_address')
        .eq('event_id', eventId)
        .eq('registration_status', 'registered');

      if (error || !registrations?.length) {
        console.log('No registrations found for reminder scheduling');
        return;
      }

      // Schedule reminders for 7 days and 1 hour before event (day-of)
      const reminderTimes = [
        { hours: 168, label: '7 days', type: 'event_reminder_7d' },      // 7 days before
        { hours: 1, label: '1 hour', type: 'event_reminder_day_of' }    // Day of event
      ];

      for (const registration of registrations) {
        for (const reminder of reminderTimes) {
          const reminderTime = new Date(eventDateTime.getTime() - (reminder.hours * 60 * 60 * 1000));
          
          // Only schedule if reminder time is in the future
          if (reminderTime > new Date()) {
            const notification: Partial<EventNotification> = {
              user_id: registration.user_address.toLowerCase(),
              event_id: eventId,
              notification_type: reminder.type as any,
              title: `Event Reminder: ${eventTitle}`,
              message: `Don't forget! "${eventTitle}" starts in ${reminder.label} at ${eventDateTime.toLocaleString()}.`,
              scheduled_for: reminderTime.toISOString(),
              delivery_method: 'in_app',
              status: 'pending',
              metadata: {
                reminder_type: reminder.type,
                event_date: eventDate
              }
            };

            await supabase
              .from('event_notifications')
              .insert(notification);
          }
        }
      }

      console.log(`📅 Scheduled reminders for ${registrations.length} attendees`);
    } catch (error) {
      console.error('Error scheduling event reminders:', error);
    }
  }

  /**
   * Send event update notification to all attendees
   */
  async sendEventUpdate(
    eventId: string,
    eventTitle: string,
    updateMessage: string,
    organizerAddress: string
  ): Promise<void> {
    try {
      // Get all registered attendees
      const { data: registrations, error } = await supabase
        .from('event_registrations')
        .select('user_address')
        .eq('event_id', eventId)
        .eq('registration_status', 'registered');

      if (error || !registrations?.length) {
        console.log('No attendees to notify for event update');
        return;
      }

      const notifications = registrations.map(registration => ({
        user_id: registration.user_address.toLowerCase(),
        event_id: eventId,
        notification_type: 'event_update' as const,
        title: `Event Update: ${eventTitle}`,
        message: updateMessage,
        scheduled_for: new Date().toISOString(),
        delivery_method: 'in_app' as const,
        status: 'pending' as const,
        metadata: {
          organizer: organizerAddress,
          update_type: 'manual'
        }
      }));

      const { error: insertError } = await supabase
        .from('event_notifications')
        .insert(notifications);

      if (insertError) {
        console.error('Error creating event update notifications:', insertError);
        return;
      }

      console.log(`📢 Event update sent to ${registrations.length} attendees`);
    } catch (error) {
      console.error('Error sending event updates:', error);
    }
  }

  /**
   * Send event cancellation notification
   */
  async sendEventCancellation(
    eventId: string,
    eventTitle: string,
    cancellationReason: string,
    organizerAddress: string
  ): Promise<void> {
    try {
      // Get all registered attendees
      const { data: registrations, error } = await supabase
        .from('event_registrations')
        .select('user_address')
        .eq('event_id', eventId)
        .eq('registration_status', 'registered');

      if (error || !registrations?.length) {
        console.log('No attendees to notify for event cancellation');
        return;
      }

      const notifications = registrations.map(registration => ({
        user_id: registration.user_address.toLowerCase(),
        event_id: eventId,
        notification_type: 'event_cancellation' as const,
        title: `Event Cancelled: ${eventTitle}`,
        message: `Unfortunately, "${eventTitle}" has been cancelled. ${cancellationReason}. Any payments made will be refunded automatically.`,
        scheduled_for: new Date().toISOString(),
        delivery_method: 'in_app' as const,
        status: 'pending' as const,
        metadata: {
          organizer: organizerAddress,
          reason: cancellationReason
        }
      }));

      const { error: insertError } = await supabase
        .from('event_notifications')
        .insert(notifications);

      if (insertError) {
        console.error('Error creating cancellation notifications:', insertError);
        return;
      }

      console.log(`📢 Cancellation notice sent to ${registrations.length} attendees`);
    } catch (error) {
      console.error('Error sending cancellation notifications:', error);
    }
  }

  /**
   * Notify attendees when completion certificates are available
   */
  async notifyCompletionCertificateAvailable(
    eventId: string,
    eventTitle: string,
    recipientAddresses: string[],
    organizerAddress: string
  ): Promise<void> {
    try {
      const notifications = recipientAddresses.map(address => ({
        user_id: address.toLowerCase(),
        event_id: eventId,
        notification_type: 'completion_certificate' as const,
        title: `Certificate Available: ${eventTitle}`,
        message: `Congratulations! Your completion certificate for "${eventTitle}" is now available in your wallet. Thank you for attending!`,
        scheduled_for: new Date().toISOString(),
        delivery_method: 'in_app' as const,
        status: 'pending' as const,
        metadata: {
          organizer: organizerAddress,
          certificate_type: 'completion'
        }
      }));

      const { error } = await supabase
        .from('event_notifications')
        .insert(notifications);

      if (error) {
        console.error('Error creating certificate notifications:', error);
        return;
      }

      console.log(`🏆 Certificate notifications sent to ${recipientAddresses.length} attendees`);
    } catch (error) {
      console.error('Error sending certificate notifications:', error);
    }
  }

  /**
   * Get user's notifications
   */
  async getUserNotifications(
    userAddress: string,
    limit = 20,
    offset = 0
  ): Promise<EventNotification[]> {
    try {
      const { data, error } = await supabase
        .from('event_notifications')
        .select('*')
        .eq('user_id', userAddress.toLowerCase())
        .order('scheduled_for', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error fetching user notifications:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('event_notifications')
        .update({ 
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (error) {
        console.error('Error marking notification as read:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  }

  /**
   * Get unread notification count for user
   */
  async getUnreadNotificationCount(userAddress: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('event_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userAddress.toLowerCase())
        .eq('status', 'pending');

      if (error) {
        console.error('Error getting unread count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error getting unread notification count:', error);
      return 0;
    }
  }

  /**
   * Process pending notifications (for cron job)
   */
  async processPendingNotifications(): Promise<void> {
    try {
      const { data: pendingNotifications, error } = await supabase
        .from('event_notifications')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_for', new Date().toISOString())
        .limit(50);

      if (error) {
        console.error('Error fetching pending notifications:', error);
        return;
      }

      console.log(`Processing ${pendingNotifications?.length || 0} pending notifications`);

      for (const notification of pendingNotifications || []) {
        // For in-app notifications, just mark as sent
        // For email/SMS, you would integrate with external services here
        await supabase
          .from('event_notifications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', notification.id);
      }
    } catch (error) {
      console.error('Error processing pending notifications:', error);
    }
  }
}

export const eventNotificationService = new EventNotificationService();
import { supabase } from '@/lib/supabase';

/**
 * Event Notification Service (Legacy - Minimal)
 *
 * ⚠️ MAINTENANCE NOTICE:
 * This service has been cleaned up as part of Phase 2 notification consolidation.
 * Removed 368 lines of broken static methods that referenced undefined EventService.
 *
 * CURRENT STATE:
 * - ✅ sendRegistrationConfirmation() - Working instance method for event registration
 * - ❌ All static methods removed (were broken, referencing undefined EventService)
 *
 * EVENT REMINDER SYSTEM:
 * Event reminders (1-week, day-of, check-in, completion NFT) are handled by the
 * comprehensive event notification system verified in COMPREHENSIVE_NOTIFICATION_AUDIT_STATUS.md.
 * See: Phase 1 audit confirmed 7 event notification types working correctly.
 *
 * FUTURE MIGRATION:
 * Consider migrating sendRegistrationConfirmation() to use unifiedNotificationService
 * for consistency with the rest of the notification system. For now, this instance
 * method is maintained as-is because it works and is actively used.
 *
 * FOR NEW EVENT NOTIFICATIONS:
 * Use unifiedNotificationService directly instead of this legacy service.
 *
 * @see src/services/unifiedNotificationService.ts
 * @see COMPREHENSIVE_NOTIFICATION_AUDIT_STATUS.md
 * @see PHASE_2_NOTIFICATION_CONSOLIDATION_PLAN.md
 *
 * @deprecated Partial - Instance method maintained for compatibility
 */

export interface NotificationPreference {
  email: boolean;
  push: boolean;
  sms: boolean;
}

export interface EventNotification {
  id: string;
  user_id: string;
  event_id: string;
  notification_type:
    | 'registration_confirmation'
    | 'event_reminder'
    | 'event_update'
    | 'event_cancellation'
    | 'completion_certificate';
  title: string;
  message: string;
  scheduled_for: string;
  sent_at?: string;
  delivery_method: 'email' | 'push' | 'sms' | 'in_app';
  status: 'pending' | 'sent' | 'failed';
  metadata?: Record<string, any>;
}

class EventNotificationService {
  /**
   * Send registration confirmation notification
   *
   * NOTE: This is the only remaining method in this service. All static methods
   * were removed because they referenced undefined EventService methods.
   *
   * This method inserts directly into event_notifications table. Consider migrating
   * to unifiedNotificationService for consistency in future refactor.
   */
  async sendRegistrationConfirmation(
    attendeeAddress: string,
    eventId: string,
    eventTitle: string,
    eventDate: string,
    transactionHash?: string,
  ): Promise<void> {
    try {
      const notification: Partial<EventNotification> = {
        user_id: attendeeAddress.toLowerCase(),
        event_id: eventId,
        notification_type: 'registration_confirmation',
        title: 'Event Registration Confirmed',
        message: `You have successfully registered for "${eventTitle}" scheduled for ${new Date(eventDate).toLocaleDateString()}. See you there!`,
        scheduled_for: new Date().toISOString(),
        delivery_method: 'in_app',
        status: 'pending',
        metadata: {
          transaction_hash: transactionHash,
          event_date: eventDate,
        },
      };

      const { error } = await supabase
        .from('event_notifications')
        .insert(notification);

      if (error) {
        console.error(
          'Error creating registration confirmation notification:',
          error,
        );
        return;
      }

      console.log('📧 Registration confirmation sent:', {
        attendee: attendeeAddress,
        event: eventTitle,
      });
    } catch (error) {
      console.error('Error sending registration confirmation:', error);
    }
  }
}

export const eventNotificationService = new EventNotificationService();

/**
 * REMOVED METHODS (Phase 2 Consolidation):
 *
 * The following static methods have been removed because they all referenced
 * undefined EventService.createNotification() and EventService.getEventRegistrations():
 *
 * - notifyEventUpdated(event, changes) - Line 69-89
 * - notifyEventCancelled(event) - Line 92-111
 * - notifyRegistrationConfirmed(event, registration) - Line 114-132
 * - notifyRegistrationCancelled(event, registration) - Line 135-153
 * - scheduleOneWeekReminders() - Line 156-179
 * - sendOneWeekReminder(event) - Line 182-204
 * - scheduleDayOfReminders() - Line 207-233
 * - sendDayOfReminder(event) - Line 236-263
 * - notifyEventCompleted(event) - Line 266-288
 * - notifyCheckInRequired() - Line 291-329
 * - processScheduledNotifications() - Line 350-359
 * - sendEmailNotification(notification, email) - Line 362-396 (stub)
 * - sendPushNotification(notification, token) - Line 399-437 (stub)
 *
 * Total: 368 lines of broken/unused code removed
 *
 * Event notification functionality is handled by the comprehensive event notification
 * system confirmed working in the Phase 1 audit.
 */

import { EventService } from '../lib/supabase';
import { Event, EventRegistration, EventNotification } from '../types/event';

export class EventNotificationService {
  // Create notification for event creation
  static async notifyEventCreated(event: Event, creatorAddress: string): Promise<void> {
    try {
      // Get users who might be interested (based on token holdings)
      // This would integrate with your token gating logic
      const interestedUsers = await this.getInterestedUsers(event.required_tokens || []);
      
      for (const userAddress of interestedUsers) {
        if (userAddress === creatorAddress) continue; // Don't notify creator
        
        await EventService.createNotification({
          recipient_address: userAddress,
          event_id: event.id,
          notification_type: 'event_created',
          title: 'New Event Available',
          message: `A new event "${event.title}" has been created and you may be eligible to register.`,
          context_url: `/events/${event.id}`,
          is_read: false
        });
      }
    } catch (error) {
      console.error('Error notifying event created:', error);
    }
  }

  // Create notification for event updates
  static async notifyEventUpdated(event: Event, changes: string[]): Promise<void> {
    try {
      // Get all registered users for this event
      const registrations = await EventService.getEventRegistrations(event.id);
      
      for (const registration of registrations) {
        await EventService.createNotification({
          recipient_address: registration.user_address,
          event_id: event.id,
          registration_id: registration.id,
          notification_type: 'event_updated',
          title: 'Event Updated',
          message: `The event "${event.title}" has been updated. Changes: ${changes.join(', ')}`,
          context_url: `/events/${event.id}`,
          is_read: false
        });
      }
    } catch (error) {
      console.error('Error notifying event updated:', error);
    }
  }

  // Create notification for event cancellation
  static async notifyEventCancelled(event: Event): Promise<void> {
    try {
      const registrations = await EventService.getEventRegistrations(event.id);
      
      for (const registration of registrations) {
        await EventService.createNotification({
          recipient_address: registration.user_address,
          event_id: event.id,
          registration_id: registration.id,
          notification_type: 'event_cancelled',
          title: 'Event Cancelled',
          message: `Unfortunately, the event "${event.title}" has been cancelled. We apologize for any inconvenience.`,
          context_url: `/events/${event.id}`,
          is_read: false
        });
      }
    } catch (error) {
      console.error('Error notifying event cancelled:', error);
    }
  }

  // Create notification for registration confirmation
  static async notifyRegistrationConfirmed(
    event: Event, 
    registration: EventRegistration
  ): Promise<void> {
    try {
      await EventService.createNotification({
        recipient_address: registration.user_address,
        event_id: event.id,
        registration_id: registration.id,
        notification_type: 'registration_confirmed',
        title: 'Registration Confirmed',
        message: `Your registration for "${event.title}" has been confirmed. Event date: ${new Date(event.event_date).toLocaleDateString()}`,
        context_url: `/events/${event.id}/checkin`,
        is_read: false
      });
    } catch (error) {
      console.error('Error notifying registration confirmed:', error);
    }
  }

  // Create notification for registration cancellation
  static async notifyRegistrationCancelled(
    event: Event, 
    registration: EventRegistration
  ): Promise<void> {
    try {
      await EventService.createNotification({
        recipient_address: registration.user_address,
        event_id: event.id,
        registration_id: registration.id,
        notification_type: 'registration_cancelled',
        title: 'Registration Cancelled',
        message: `Your registration for "${event.title}" has been cancelled.`,
        context_url: `/events/${event.id}`,
        is_read: false
      });
    } catch (error) {
      console.error('Error notifying registration cancelled:', error);
    }
  }

  // Schedule one-week reminder notifications
  static async scheduleOneWeekReminders(): Promise<void> {
    try {
      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
      
      // Get events happening in one week
      const upcomingEvents = await EventService.getEvents({
        status: 'published',
        upcoming_only: true
      });
      
      const eventsInOneWeek = upcomingEvents.filter(event => {
        const eventDate = new Date(event.event_date);
        const dayDiff = Math.abs(eventDate.getTime() - oneWeekFromNow.getTime()) / (1000 * 60 * 60 * 24);
        return dayDiff <= 0.5; // Within 12 hours of one week
      });

      for (const event of eventsInOneWeek) {
        await this.sendOneWeekReminder(event);
      }
    } catch (error) {
      console.error('Error scheduling one week reminders:', error);
    }
  }

  // Send one-week reminder to registered users
  static async sendOneWeekReminder(event: Event): Promise<void> {
    try {
      const registrations = await EventService.getEventRegistrations(event.id);
      
      for (const registration of registrations) {
        if (registration.registration_status === 'registered' || registration.registration_status === 'checked_in') {
          await EventService.createNotification({
            recipient_address: registration.user_address,
            event_id: event.id,
            registration_id: registration.id,
            notification_type: 'event_one_week_reminder',
            title: 'Event Reminder - One Week',
            message: `Reminder: "${event.title}" is coming up in one week on ${new Date(event.event_date).toLocaleDateString()}. Don't forget to attend!`,
            context_url: `/events/${event.id}/checkin`,
            scheduled_for: new Date().toISOString(),
            is_read: false
          });
        }
      }
    } catch (error) {
      console.error('Error sending one week reminder:', error);
    }
  }

  // Schedule day-of-event reminders
  static async scheduleDayOfReminders(): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Get events happening today
      const upcomingEvents = await EventService.getEvents({
        status: 'published',
        upcoming_only: true
      });
      
      const eventsToday = upcomingEvents.filter(event => {
        const eventDate = new Date(event.event_date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate.getTime() === today.getTime();
      });

      for (const event of eventsToday) {
        await this.sendDayOfReminder(event);
      }
    } catch (error) {
      console.error('Error scheduling day of reminders:', error);
    }
  }

  // Send day-of-event reminder to registered users
  static async sendDayOfReminder(event: Event): Promise<void> {
    try {
      const registrations = await EventService.getEventRegistrations(event.id);
      
      for (const registration of registrations) {
        if (registration.registration_status === 'registered') {
          const eventTime = new Date(event.event_date).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          });
          
          await EventService.createNotification({
            recipient_address: registration.user_address,
            event_id: event.id,
            registration_id: registration.id,
            notification_type: 'event_day_reminder',
            title: 'Event Today!',
            message: `Today is the day! "${event.title}" starts at ${eventTime}. ${event.location ? `Location: ${event.location}` : ''} Don't forget to check in when you arrive.`,
            context_url: `/events/${event.id}/checkin`,
            scheduled_for: new Date().toISOString(),
            is_read: false
          });
        }
      }
    } catch (error) {
      console.error('Error sending day of reminder:', error);
    }
  }

  // Notify about event completion and NFT availability
  static async notifyEventCompleted(event: Event): Promise<void> {
    try {
      const registrations = await EventService.getEventRegistrations(event.id);
      const completedRegistrations = registrations.filter(
        reg => reg.registration_status === 'completed'
      );
      
      for (const registration of completedRegistrations) {
        await EventService.createNotification({
          recipient_address: registration.user_address,
          event_id: event.id,
          registration_id: registration.id,
          notification_type: 'completion_nft_ready',
          title: 'Completion NFT Ready!',
          message: `Congratulations! Your completion certificate NFT for "${event.title}" is now available in your wallet.`,
          context_url: `/identity`,
          is_read: false
        });
      }
    } catch (error) {
      console.error('Error notifying event completed:', error);
    }
  }

  // Notify users who need to check in (event starting soon)
  static async notifyCheckInRequired(): Promise<void> {
    try {
      const now = new Date();
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      
      // Get events starting within the next 2 hours
      const upcomingEvents = await EventService.getEvents({
        status: 'published',
        upcoming_only: true
      });
      
      const eventsStartingSoon = upcomingEvents.filter(event => {
        const eventDate = new Date(event.event_date);
        return eventDate >= now && eventDate <= twoHoursFromNow;
      });

      for (const event of eventsStartingSoon) {
        const registrations = await EventService.getEventRegistrations(event.id);
        const needCheckIn = registrations.filter(
          reg => reg.registration_status === 'registered'
        );
        
        for (const registration of needCheckIn) {
          await EventService.createNotification({
            recipient_address: registration.user_address,
            event_id: event.id,
            registration_id: registration.id,
            notification_type: 'check_in_required',
            title: 'Check-In Required',
            message: `"${event.title}" is starting soon! Please check in when you arrive at the event.`,
            context_url: `/events/${event.id}/checkin`,
            is_read: false
          });
        }
      }
    } catch (error) {
      console.error('Error notifying check in required:', error);
    }
  }

  // Get users who might be interested in an event based on token holdings
  private static async getInterestedUsers(requiredTokens: string[]): Promise<string[]> {
    try {
      // This would integrate with your token balance checking system
      // For now, return an empty array as this requires token balance APIs
      
      // In a real implementation, you would:
      // 1. Query token holders for the required tokens
      // 2. Filter users who have sufficient balances
      // 3. Return their wallet addresses
      
      return [];
    } catch (error) {
      console.error('Error getting interested users:', error);
      return [];
    }
  }

  // Batch process scheduled notifications
  static async processScheduledNotifications(): Promise<void> {
    try {
      // This would be called by a scheduled job (e.g., cron job)
      await this.scheduleOneWeekReminders();
      await this.scheduleDayOfReminders();
      await this.notifyCheckInRequired();
    } catch (error) {
      console.error('Error processing scheduled notifications:', error);
    }
  }

  // Send email notifications (integration with email service)
  static async sendEmailNotification(
    notification: EventNotification,
    userEmail?: string
  ): Promise<void> {
    try {
      if (!userEmail) {
        // You would need to get user email from your user profile system
        console.log('No email provided for notification:', notification.id);
        return;
      }

      // This would integrate with your email service (SendGrid, Mailgun, etc.)
      console.log('Sending email notification:', {
        to: userEmail,
        subject: notification.title,
        message: notification.message,
        contextUrl: notification.context_url
      });

      // Example integration:
      /*
      await emailService.sendEmail({
        to: userEmail,
        subject: notification.title,
        html: `
          <h2>${notification.title}</h2>
          <p>${notification.message}</p>
          ${notification.context_url ? `<a href="${notification.context_url}">View Event</a>` : ''}
        `
      });
      */
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  }

  // Send push notifications (integration with push service)
  static async sendPushNotification(
    notification: EventNotification,
    pushToken?: string
  ): Promise<void> {
    try {
      if (!pushToken) {
        console.log('No push token provided for notification:', notification.id);
        return;
      }

      // This would integrate with your push notification service (FCM, APNs, etc.)
      console.log('Sending push notification:', {
        token: pushToken,
        title: notification.title,
        body: notification.message,
        data: {
          eventId: notification.event_id,
          contextUrl: notification.context_url
        }
      });

      // Example integration:
      /*
      await pushService.sendNotification({
        token: pushToken,
        notification: {
          title: notification.title,
          body: notification.message
        },
        data: {
          eventId: notification.event_id || '',
          contextUrl: notification.context_url || ''
        }
      });
      */
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }
}
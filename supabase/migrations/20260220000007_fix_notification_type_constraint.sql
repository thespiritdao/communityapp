-- Fix check_notification_type constraint on general_notifications.
--
-- The previous migration (000006) assumed incorrect existing types.
-- This drops and recreates with the ACTUAL current list + video call types.

ALTER TABLE general_notifications
  DROP CONSTRAINT IF EXISTS check_notification_type;

ALTER TABLE general_notifications
  ADD CONSTRAINT check_notification_type CHECK (
    notification_type = ANY (ARRAY[
      -- Existing types (from live DB)
      'user_mentioned',
      'forum_reply',
      'chat_message',
      'bounty_update',
      'proposal_executed',
      'purchase_completed',
      'order_status_updated',
      'pod_leadership_invitation',
      'pod_membership_invitation',
      'event_cancellation',
      'event_update',
      'event_reminder',
      -- Pod types used in codebase
      'pod_member_removed',
      'pod_member_joined',
      'pod_application_status',
      'new_account_created',
      -- Event types used in codebase
      'event_registration',
      'event_checkin',
      'event_checkin_prompt',
      'completion_certificate',
      -- Video call types (new)
      'video_call_requested',
      'video_call_missed',
      'video_call_declined'
    ])
  );

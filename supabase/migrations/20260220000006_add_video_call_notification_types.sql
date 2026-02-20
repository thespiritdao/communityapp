-- Add video call notification types to general_notifications check constraint.
--
-- The check_notification_type constraint is an allowlist. We need to add:
--   video_call_requested, video_call_missed, video_call_declined

-- Drop the existing constraint and recreate it with the new types added.
-- Find the current constraint definition first so we preserve all existing types.

ALTER TABLE general_notifications
  DROP CONSTRAINT IF EXISTS check_notification_type;

ALTER TABLE general_notifications
  ADD CONSTRAINT check_notification_type CHECK (
    notification_type IN (
      -- General
      'user_mentioned',
      'forum_reply',
      'chat_message',
      'bounty_update',
      'purchase_completed',
      'order_status_updated',
      -- Events
      'event_registration',
      'event_checkin',
      'event_update',
      'event_cancellation',
      'event_checkin_prompt',
      'completion_certificate',
      -- Pods
      'pod_member_removed',
      'pod_leadership_invitation',
      'pod_member_joined',
      'pod_application_status',
      'new_account_created',
      -- Video calls
      'video_call_requested',
      'video_call_missed',
      'video_call_declined'
    )
  );

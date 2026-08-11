-- Add 'pod_face_published' to the general_notifications check_notification_type
-- constraint. Used when a pod publishes its first custom face and members are
-- notified they can wear it (docs/spec-pod-faces.md §7). List copied from
-- 20260514000002 (the previous constraint rewrite) plus the new type.

ALTER TABLE general_notifications
  DROP CONSTRAINT IF EXISTS check_notification_type;

ALTER TABLE general_notifications
  ADD CONSTRAINT check_notification_type CHECK (
    notification_type = ANY (ARRAY[
      -- Existing types
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
      'pod_member_removed',
      'pod_member_joined',
      'pod_application_status',
      'new_account_created',
      'event_registration',
      'event_checkin',
      'event_checkin_prompt',
      'completion_certificate',
      'video_call_requested',
      'video_call_missed',
      'video_call_declined',
      'system_alert',
      'survey_published',
      -- Pod Faces
      'pod_face_published'
    ])
  );

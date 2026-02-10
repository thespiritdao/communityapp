-- Migration to add event notification types to general_notifications constraint
-- Run this in your Supabase SQL editor

-- Drop the existing constraint
ALTER TABLE general_notifications
DROP CONSTRAINT IF EXISTS general_notifications_notification_type_check;

-- Add the new constraint with event notification types
ALTER TABLE general_notifications
ADD CONSTRAINT general_notifications_notification_type_check
CHECK (notification_type IN (
    'user_mentioned',
    'forum_reply',
    'chat_message',
    'bounty_update',
    'proposal_executed',
    'purchase_completed',
    'event_cancellation',  -- ✅ NEW: When an event is cancelled
    'event_update',        -- ✅ NEW: When event details change
    'event_reminder'       -- ✅ NEW: Reminders for upcoming events
));

-- Verify the constraint was updated
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'general_notifications'::regclass
AND conname = 'general_notifications_notification_type_check';

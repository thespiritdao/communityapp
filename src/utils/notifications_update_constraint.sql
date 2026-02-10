-- Migration to add event notification types to general_notifications constraint
-- Run this in your Supabase SQL editor

-- Step 1: Drop the existing constraint first (so we can query the data)
ALTER TABLE general_notifications
DROP CONSTRAINT IF EXISTS general_notifications_notification_type_check;

-- Step 2: Check what notification types currently exist in the data
SELECT DISTINCT notification_type, COUNT(*) as count
FROM general_notifications
GROUP BY notification_type
ORDER BY notification_type;

-- Step 3: Clean up invalid data
-- Based on Step 2 results, uncomment ONE of the following:

-- Option A: Delete invalid notifications (recommended for test data)
-- DELETE FROM general_notifications
-- WHERE notification_type NOT IN (
--     'user_mentioned', 'forum_reply', 'chat_message', 'bounty_update',
--     'proposal_executed', 'purchase_completed', 'event_cancellation',
--     'event_update', 'event_reminder'
-- );

-- Option B: Update invalid types to a valid type (preserves notifications)
-- UPDATE general_notifications
-- SET notification_type = 'chat_message'
-- WHERE notification_type NOT IN (
--     'user_mentioned', 'forum_reply', 'chat_message', 'bounty_update',
--     'proposal_executed', 'purchase_completed', 'event_cancellation',
--     'event_update', 'event_reminder'
-- );

-- Step 4: Add the new constraint with event notification types
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

-- Step 5: Verify the constraint was updated
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'general_notifications'::regclass
AND conname = 'general_notifications_notification_type_check';

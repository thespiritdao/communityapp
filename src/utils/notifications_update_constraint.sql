-- Migration to add event notification types to general_notifications constraint
-- Run this in your Supabase SQL editor

-- Step 1: Check for any invalid notification types in existing data
SELECT DISTINCT notification_type
FROM general_notifications
WHERE notification_type NOT IN (
    'user_mentioned',
    'forum_reply',
    'chat_message',
    'bounty_update',
    'proposal_executed',
    'purchase_completed',
    'event_cancellation',
    'event_update',
    'event_reminder'
);

-- Step 2: (Optional) Delete invalid rows OR update them to a valid type
-- Uncomment ONE of the following based on your preference:

-- Option A: Delete invalid notifications
-- DELETE FROM general_notifications
-- WHERE notification_type NOT IN (
--     'user_mentioned', 'forum_reply', 'chat_message', 'bounty_update',
--     'proposal_executed', 'purchase_completed', 'event_cancellation',
--     'event_update', 'event_reminder'
-- );

-- Option B: Update invalid types to 'chat_message' (or another valid type)
-- UPDATE general_notifications
-- SET notification_type = 'chat_message'
-- WHERE notification_type NOT IN (
--     'user_mentioned', 'forum_reply', 'chat_message', 'bounty_update',
--     'proposal_executed', 'purchase_completed', 'event_cancellation',
--     'event_update', 'event_reminder'
-- );

-- Step 3: Drop the existing constraint
ALTER TABLE general_notifications
DROP CONSTRAINT IF EXISTS general_notifications_notification_type_check;

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

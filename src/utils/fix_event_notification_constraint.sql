-- Fix for event cancellation notifications constraint
-- This handles BOTH possible constraint names

-- Step 1: Drop BOTH possible constraint names (one will fail silently, that's OK)
ALTER TABLE general_notifications DROP CONSTRAINT IF EXISTS check_notification_type;
ALTER TABLE general_notifications DROP CONSTRAINT IF EXISTS general_notifications_notification_type_check;

-- Step 2: Check what types currently exist (OPTIONAL - for verification)
-- SELECT DISTINCT notification_type, COUNT(*) as count
-- FROM general_notifications
-- GROUP BY notification_type
-- ORDER BY notification_type;

-- Step 3: Add the constraint with the STANDARD name used in production
ALTER TABLE general_notifications
ADD CONSTRAINT check_notification_type
CHECK (notification_type IN (
    -- Original types
    'user_mentioned',
    'forum_reply',
    'chat_message',
    'bounty_update',
    'proposal_executed',
    'purchase_completed',
    'order_status_updated',
    -- Pod invitation types (found in production)
    'pod_leadership_invitation',
    'pod_membership_invitation',
    -- Event notification types (NEW - needed for cancellation)
    'event_cancellation',
    'event_update',
    'event_reminder'
));

-- Step 4: Verify the constraint was created
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'general_notifications'::regclass
AND conname = 'check_notification_type';

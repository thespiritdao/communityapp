-- Fix organizing_pod_id and fund_recipient_pod_id data types
-- Must drop and recreate events_with_stats view that depends on these columns
-- Run this in your Supabase SQL editor

-- Step 1: Save the view definition first (for reference)
-- You can see it by running: SELECT pg_get_viewdef('events_with_stats', true);

-- Step 2: Drop the view temporarily
DROP VIEW IF EXISTS events_with_stats CASCADE;

-- Step 3: Drop the incorrect foreign key constraint (if it exists)
ALTER TABLE events
DROP CONSTRAINT IF EXISTS events_organizing_pod_id_fkey;

ALTER TABLE events
DROP CONSTRAINT IF EXISTS events_fund_recipient_pod_id_fkey;

-- Step 4: Convert columns from text to uuid
ALTER TABLE events
ALTER COLUMN organizing_pod_id TYPE uuid
USING organizing_pod_id::uuid;

ALTER TABLE events
ALTER COLUMN fund_recipient_pod_id TYPE uuid
USING fund_recipient_pod_id::uuid;

-- Step 5: Add correct foreign key constraints
ALTER TABLE events
ADD CONSTRAINT events_organizing_pod_id_fkey
FOREIGN KEY (organizing_pod_id)
REFERENCES pods(id)
ON DELETE SET NULL;

ALTER TABLE events
ADD CONSTRAINT events_fund_recipient_pod_id_fkey
FOREIGN KEY (fund_recipient_pod_id)
REFERENCES pods(id)
ON DELETE SET NULL;

-- Step 6: Recreate the events_with_stats view with the exact original definition
CREATE OR REPLACE VIEW events_with_stats AS
SELECT e.id,
    e.title,
    e.description,
    e.event_date,
    e.event_end_date,
    e.location,
    e.max_attendees,
    e.price_amount,
    e.price_token,
    e.required_tokens,
    e.organizing_pod_id,
    e.fund_recipient_pod_id,
    e.fund_recipient_type,
    e.creator_address,
    e.registration_contract_address,
    e.completion_contract_address,
    e.status,
    e.qr_code_data,
    e.event_image_url,
    e.event_metadata,
    e.created_at,
    e.updated_at,
    COALESCE(reg_stats.registration_count, 0::bigint) AS registration_count,
    COALESCE(reg_stats.checked_in_count, 0::bigint) AS checked_in_count,
    COALESCE(reg_stats.completed_count, 0::bigint) AS completed_count
FROM events e
LEFT JOIN ( SELECT event_registrations.event_id,
        count(*) AS registration_count,
        count(
            CASE
                WHEN event_registrations.registration_status = 'checked_in'::text THEN 1
                ELSE NULL::integer
            END) AS checked_in_count,
        count(
            CASE
                WHEN event_registrations.registration_status = 'completed'::text THEN 1
                ELSE NULL::integer
            END) AS completed_count
        FROM event_registrations
        WHERE event_registrations.registration_status <> 'cancelled'::text
        GROUP BY event_registrations.event_id) reg_stats ON e.id = reg_stats.event_id;

-- Step 7: Verify the changes
SELECT
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_name = 'events'
  AND column_name IN ('organizing_pod_id', 'fund_recipient_pod_id');

-- Step 8: Verify foreign keys were created
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS referenced_table
FROM pg_constraint
WHERE conname LIKE 'events_%pod_id%';

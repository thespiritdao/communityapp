-- Fix organizing_pod_id data type mismatch in events table
-- Currently: text, should be: uuid to match pods.id
-- Run this in your Supabase SQL editor

-- Step 1: Drop the incorrect foreign key constraint (if it exists)
ALTER TABLE events
DROP CONSTRAINT IF EXISTS events_organizing_pod_id_fkey;

-- Step 2: Check if there are any events with invalid organizing_pod_id values
-- This will show you if there's any data that would fail the conversion
SELECT organizing_pod_id, COUNT(*)
FROM events
WHERE organizing_pod_id IS NOT NULL
  AND organizing_pod_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
GROUP BY organizing_pod_id;

-- Step 3: Convert the column from text to uuid
-- Using USING clause to cast existing values
ALTER TABLE events
ALTER COLUMN organizing_pod_id TYPE uuid
USING organizing_pod_id::uuid;

-- Step 4: Also fix fund_recipient_pod_id if it has the same issue
ALTER TABLE events
ALTER COLUMN fund_recipient_pod_id TYPE uuid
USING fund_recipient_pod_id::uuid;

-- Step 5: Add the correct foreign key constraint
ALTER TABLE events
ADD CONSTRAINT events_organizing_pod_id_fkey
FOREIGN KEY (organizing_pod_id)
REFERENCES pods(id)
ON DELETE SET NULL;

-- Step 6: Add foreign key for fund_recipient_pod_id as well
ALTER TABLE events
ADD CONSTRAINT events_fund_recipient_pod_id_fkey
FOREIGN KEY (fund_recipient_pod_id)
REFERENCES pods(id)
ON DELETE SET NULL;

-- Step 7: Verify the changes
SELECT
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_name = 'events'
  AND column_name IN ('organizing_pod_id', 'fund_recipient_pod_id');

-- Step 8: Verify foreign keys
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS referenced_table,
  a.attname AS column_name,
  af.attname AS referenced_column
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
JOIN pg_attribute af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
WHERE c.conname LIKE 'events_%pod_id%';

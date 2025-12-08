-- Fix foreign key constraint on events.organizing_pod_id
-- Currently points to tokens table, should point to pods table
-- Run this in your Supabase SQL editor

-- Drop the incorrect foreign key constraint
ALTER TABLE events
DROP CONSTRAINT IF EXISTS events_organizing_pod_id_fkey;

-- Add the correct foreign key constraint pointing to pods table
ALTER TABLE events
ADD CONSTRAINT events_organizing_pod_id_fkey
FOREIGN KEY (organizing_pod_id)
REFERENCES pods(id)
ON DELETE SET NULL;

-- Verify the constraint was created correctly
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS referenced_table,
  a.attname AS column_name,
  af.attname AS referenced_column
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
JOIN pg_attribute af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
WHERE c.conname = 'events_organizing_pod_id_fkey';

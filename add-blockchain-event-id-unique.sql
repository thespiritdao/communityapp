-- Add unique constraint on blockchain_event_id to prevent duplicate events
-- Run this in your Supabase SQL editor

-- Check if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_blockchain_event_id_key'
  ) THEN
    -- Add unique constraint
    ALTER TABLE events
    ADD CONSTRAINT events_blockchain_event_id_key
    UNIQUE (blockchain_event_id);

    RAISE NOTICE 'Added unique constraint on blockchain_event_id';
  ELSE
    RAISE NOTICE 'Unique constraint on blockchain_event_id already exists';
  END IF;
END $$;

-- Create index for faster lookups (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_events_blockchain_event_id
ON events(blockchain_event_id);

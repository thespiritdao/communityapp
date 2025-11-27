-- Add blockchain_event_id field to events table
-- This stores the unique eventId used on the blockchain contract

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS blockchain_event_id TEXT UNIQUE;

-- Add index for faster lookups by blockchain_event_id
CREATE INDEX IF NOT EXISTS idx_events_blockchain_event_id ON events(blockchain_event_id);

-- Add comment for documentation
COMMENT ON COLUMN events.blockchain_event_id IS 'Unique identifier used on the blockchain smart contract for this event';
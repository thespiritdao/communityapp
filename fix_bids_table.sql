-- Fix missing columns in bids table
-- Run this in your Supabase SQL editor

-- Add missing columns to bids table
ALTER TABLE bids 
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

-- Update any null status values to 'pending'
UPDATE bids 
SET status = 'pending' 
WHERE status IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN bids.reviewed_at IS 'Timestamp when the bid was reviewed';
COMMENT ON COLUMN bids.reviewed_by IS 'Address of the user who reviewed the bid';

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'bids' 
AND column_name IN ('reviewed_at', 'reviewed_by', 'status')
ORDER BY column_name; 
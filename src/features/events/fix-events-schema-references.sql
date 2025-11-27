-- Fix events table schema to properly reference pods instead of tokens
-- Run this in Supabase SQL Editor

-- First, let's see what we're working with
SELECT 
  'events_organizing_refs' as check_type,
  organizing_pod_id,
  COUNT(*) as count
FROM events 
WHERE organizing_pod_id IS NOT NULL
GROUP BY organizing_pod_id;

SELECT 
  'events_fund_recipient_refs' as check_type,
  fund_recipient_pod_id,
  COUNT(*) as count  
FROM events
WHERE fund_recipient_pod_id IS NOT NULL
GROUP BY fund_recipient_pod_id;

-- Check what's in tokens that might be pod references
SELECT 'tokens_table' as source, id, name, token_type FROM tokens ORDER BY name;

-- Check what's in pods table
SELECT 'pods_table' as source, id, name, status FROM pods ORDER BY name;

-- Drop the foreign key constraints that reference tokens table
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_organizing_pod_id_fkey;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_fund_recipient_pod_id_fkey;

-- Change the columns to reference pods table instead
-- Note: We'll need to migrate existing data first if there are references to tokens

-- Add new foreign key constraints to pods table
ALTER TABLE events 
ADD CONSTRAINT events_organizing_pod_id_fkey 
FOREIGN KEY (organizing_pod_id) REFERENCES pods(id) ON DELETE SET NULL;

ALTER TABLE events 
ADD CONSTRAINT events_fund_recipient_pod_id_fkey 
FOREIGN KEY (fund_recipient_pod_id) REFERENCES pods(id) ON DELETE SET NULL;

-- Update the schema comment for clarity
COMMENT ON COLUMN events.organizing_pod_id IS 'References pods.id - which pod is organizing this event';
COMMENT ON COLUMN events.fund_recipient_pod_id IS 'References pods.id - which pod receives the event proceeds';
COMMENT ON COLUMN events.required_tokens IS 'Array of token contract addresses or token IDs from tokens table for access gating';
-- Migration: Add @everyone tag support to chat messages
-- Date: 2025-02-05
-- Description: Adds is_everyone_tag column to messages table to track @everyone mentions

-- Add is_everyone_tag column to messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS is_everyone_tag BOOLEAN DEFAULT FALSE;

-- Create index for faster queries on @everyone messages
CREATE INDEX IF NOT EXISTS idx_messages_everyone_tag
ON messages(is_everyone_tag)
WHERE is_everyone_tag = TRUE;

-- Add comment to document the column
COMMENT ON COLUMN messages.is_everyone_tag IS 'Indicates whether this message contains an @everyone mention that triggered notifications to all pod members';

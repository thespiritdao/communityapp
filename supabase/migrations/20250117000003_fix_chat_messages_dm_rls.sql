-- Migration: Add RLS policies for direct messages in chat_messages table
-- Date: 2025-01-17
-- Issue: Direct messages failing with RLS policy violation

-- Enable RLS on chat_messages (if not already enabled)
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own direct messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can send direct messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can delete their own direct messages" ON chat_messages;

-- Policy 1: Users can view direct messages where they are sender or receiver
CREATE POLICY "Users can view their own direct messages"
    ON chat_messages FOR SELECT
    USING (
        is_direct_message = true
        AND (
            sender_wallet_id = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
            OR receiver_wallet_id = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
        )
    );

-- Policy 2: Users can insert direct messages where they are the sender
CREATE POLICY "Users can send direct messages"
    ON chat_messages FOR INSERT
    WITH CHECK (
        is_direct_message = true
        AND sender_wallet_id = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
    );

-- Policy 3: Users can delete direct messages where they are the receiver
-- (Allows recipients to delete unwanted messages)
CREATE POLICY "Users can delete their own direct messages"
    ON chat_messages FOR DELETE
    USING (
        is_direct_message = true
        AND receiver_wallet_id = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
    );

-- Policy 4: Users can view pod chat messages (existing functionality)
-- This ensures pod chat still works alongside DMs
CREATE POLICY "Users can view pod chat messages" ON chat_messages
    FOR SELECT
    USING (
        is_direct_message = false
        AND chat_group_id IS NOT NULL
    );

-- Policy 5: Users can send pod chat messages (existing functionality)
CREATE POLICY "Users can send pod chat messages" ON chat_messages
    FOR INSERT
    WITH CHECK (
        is_direct_message = false
        AND chat_group_id IS NOT NULL
        AND sender_wallet_id = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
    );

-- Normalize existing addresses to lowercase for consistency
UPDATE chat_messages
SET
    sender_wallet_id = LOWER(sender_wallet_id),
    receiver_wallet_id = LOWER(receiver_wallet_id)
WHERE
    sender_wallet_id != LOWER(sender_wallet_id)
    OR receiver_wallet_id != LOWER(receiver_wallet_id);

-- Normalize dm_blocks addresses to lowercase
UPDATE dm_blocks
SET
    blocker_id = LOWER(blocker_id),
    blocked_id = LOWER(blocked_id)
WHERE
    blocker_id != LOWER(blocker_id)
    OR blocked_id != LOWER(blocked_id);

-- Create function to normalize addresses on insert/update (prevents future case issues)
CREATE OR REPLACE FUNCTION normalize_chat_addresses()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sender_wallet_id IS NOT NULL THEN
        NEW.sender_wallet_id := LOWER(NEW.sender_wallet_id);
    END IF;
    IF NEW.receiver_wallet_id IS NOT NULL THEN
        NEW.receiver_wallet_id := LOWER(NEW.receiver_wallet_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-normalize addresses on chat_messages
DROP TRIGGER IF EXISTS normalize_chat_addresses_trigger ON chat_messages;
CREATE TRIGGER normalize_chat_addresses_trigger
    BEFORE INSERT OR UPDATE ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION normalize_chat_addresses();

-- Create function to normalize dm_blocks addresses
CREATE OR REPLACE FUNCTION normalize_dm_block_addresses()
RETURNS TRIGGER AS $$
BEGIN
    NEW.blocker_id := LOWER(NEW.blocker_id);
    NEW.blocked_id := LOWER(NEW.blocked_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-normalize addresses on dm_blocks
DROP TRIGGER IF EXISTS normalize_dm_block_addresses_trigger ON dm_blocks;
CREATE TRIGGER normalize_dm_block_addresses_trigger
    BEFORE INSERT OR UPDATE ON dm_blocks
    FOR EACH ROW
    EXECUTE FUNCTION normalize_dm_block_addresses();

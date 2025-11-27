-- Migration: Fix DirectMessage schema and Gift RLS policy
-- Date: 2025-01-17

-- 1. Add is_direct_message column to chat_messages if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='chat_messages' AND column_name='is_direct_message'
    ) THEN
        ALTER TABLE chat_messages
        ADD COLUMN is_direct_message BOOLEAN DEFAULT false;

        -- Update existing direct messages (those without a chat_group_id)
        UPDATE chat_messages
        SET is_direct_message = true
        WHERE chat_group_id IS NULL AND receiver_wallet_id IS NOT NULL;
    END IF;
END $$;

-- 2. Fix Gift RLS policy - The current policy rejects inserts
-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can send gifts" ON gifts;

-- Create new INSERT policy that uses JWT claims correctly
CREATE POLICY "Users can send gifts"
    ON gifts FOR INSERT
    WITH CHECK (
        sender_id = current_setting('request.jwt.claims', true)::json->>'wallet_address'
    );

-- 3. Create dm_blocks table if it doesn't exist (referenced in DirectMessage code)
CREATE TABLE IF NOT EXISTS dm_blocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    blocker_id TEXT NOT NULL,  -- wallet address of user doing the blocking
    blocked_id TEXT NOT NULL,  -- wallet address of user being blocked
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

-- RLS for dm_blocks
ALTER TABLE dm_blocks ENABLE ROW LEVEL SECURITY;

-- Users can view blocks where they are the blocker
CREATE POLICY "Users can view their own blocks"
    ON dm_blocks FOR SELECT
    USING (
        blocker_id = current_setting('request.jwt.claims', true)::json->>'wallet_address'
    );

-- Users can create blocks
CREATE POLICY "Users can create blocks"
    ON dm_blocks FOR INSERT
    WITH CHECK (
        blocker_id = current_setting('request.jwt.claims', true)::json->>'wallet_address'
    );

-- Users can delete their own blocks
CREATE POLICY "Users can delete their own blocks"
    ON dm_blocks FOR DELETE
    USING (
        blocker_id = current_setting('request.jwt.claims', true)::json->>'wallet_address'
    );

-- 4. Create index for direct message queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_direct
    ON chat_messages(sender_wallet_id, receiver_wallet_id, is_direct_message)
    WHERE is_direct_message = true;

-- 5. Create index for dm_blocks lookups
CREATE INDEX IF NOT EXISTS idx_dm_blocks_blocker
    ON dm_blocks(blocker_id, blocked_id);

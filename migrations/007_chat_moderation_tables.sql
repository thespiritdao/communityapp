-- ============================================================================
-- CHAT MODERATION TABLES - Migration 007
-- ============================================================================
-- Date: 2025-11-14
-- Purpose: Add chat moderation features (mute, pin, delete tracking)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Add is_pinned column to chat_messages
-- ============================================================================

-- Check if column already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_messages' AND column_name = 'is_pinned'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE;
    COMMENT ON COLUMN chat_messages.is_pinned IS 'Whether this message is pinned to the top of the chat';
  END IF;
END $$;

-- ============================================================================
-- 2. Create chat_muted_users table
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_muted_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_group_id UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_wallet TEXT NOT NULL,
  muted_by UUID REFERENCES auth.users(id),
  muted_at TIMESTAMPTZ DEFAULT NOW(),
  muted_until TIMESTAMPTZ,  -- NULL = permanent mute
  reason TEXT,

  -- Prevent duplicate mutes
  UNIQUE(chat_group_id, user_wallet)
);

COMMENT ON TABLE chat_muted_users IS 'Tracks users muted from specific chat groups';
COMMENT ON COLUMN chat_muted_users.muted_until IS 'NULL means permanent mute, otherwise temporary until this timestamp';

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_chat_muted_users_group_wallet
  ON chat_muted_users(chat_group_id, user_wallet);

-- ============================================================================
-- 3. Create chat_moderation_log table (for audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_group_id UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('delete', 'mute', 'unmute', 'pin', 'unpin')),
  message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  target_user_wallet TEXT,
  moderator_id UUID REFERENCES auth.users(id),
  moderator_wallet TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE chat_moderation_log IS 'Audit trail for all chat moderation actions';

-- Index for moderator activity queries
CREATE INDEX IF NOT EXISTS idx_chat_moderation_log_moderator
  ON chat_moderation_log(moderator_id);

-- Index for user moderation history
CREATE INDEX IF NOT EXISTS idx_chat_moderation_log_target
  ON chat_moderation_log(target_user_wallet);

-- ============================================================================
-- 4. Create helper function to check if user is muted
-- ============================================================================

CREATE OR REPLACE FUNCTION is_user_muted_in_chat(
  p_chat_group_id UUID,
  p_user_wallet TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_muted_users
    WHERE chat_group_id = p_chat_group_id
      AND user_wallet = p_user_wallet
      AND (muted_until IS NULL OR muted_until > NOW())
  );
$$;

COMMENT ON FUNCTION is_user_muted_in_chat IS 'Check if a user is currently muted in a specific chat';

GRANT EXECUTE ON FUNCTION is_user_muted_in_chat(UUID, TEXT) TO anon, authenticated;

-- ============================================================================
-- 5. Add RLS policies for moderation tables
-- ============================================================================

-- Enable RLS
ALTER TABLE chat_muted_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_moderation_log ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view muted users (to prevent muted users from posting)
CREATE POLICY "Anyone can view muted users"
  ON chat_muted_users FOR SELECT
  USING (true);

-- Policy: Only authenticated users can mute
CREATE POLICY "Authenticated users can mute"
  ON chat_muted_users FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Only the moderator who muted can unmute
CREATE POLICY "Moderators can unmute their own mutes"
  ON chat_muted_users FOR DELETE
  USING (muted_by = auth.uid());

-- Policy: Anyone can view moderation log
CREATE POLICY "Anyone can view moderation log"
  ON chat_moderation_log FOR SELECT
  USING (true);

-- Policy: Authenticated users can add to log
CREATE POLICY "Authenticated users can log actions"
  ON chat_moderation_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- 6. Create function to log moderation actions
-- ============================================================================

CREATE OR REPLACE FUNCTION log_moderation_action(
  p_chat_group_id UUID,
  p_action TEXT,
  p_message_id UUID DEFAULT NULL,
  p_target_user_wallet TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
DECLARE
  v_log_id UUID;
  v_moderator_wallet TEXT;
BEGIN
  -- Get moderator wallet from user_profiles
  SELECT wallet_address INTO v_moderator_wallet
  FROM user_profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  -- Insert log entry
  INSERT INTO chat_moderation_log (
    chat_group_id,
    action,
    message_id,
    target_user_wallet,
    moderator_id,
    moderator_wallet,
    reason
  ) VALUES (
    p_chat_group_id,
    p_action,
    p_message_id,
    p_target_user_wallet,
    auth.uid(),
    v_moderator_wallet,
    p_reason
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION log_moderation_action IS 'Log a moderation action to the audit trail';

GRANT EXECUTE ON FUNCTION log_moderation_action TO authenticated;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check if columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'chat_messages' AND column_name = 'is_pinned';

-- Check if tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('chat_muted_users', 'chat_moderation_log')
ORDER BY table_name;

-- Check if functions were created
SELECT routine_name
FROM information_schema.routines
WHERE routine_name IN ('is_user_muted_in_chat', 'log_moderation_action')
ORDER BY routine_name;

SELECT 'Chat moderation tables created successfully!' AS status;

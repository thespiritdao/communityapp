-- ============================================================================
-- FORUM SYSTEM COMPLETE DATABASE SCHEMA
-- ============================================================================
-- Version: 2.0
-- Date: 2025-10-20
-- Description: Complete forum schema with token-gating, moderation, polls,
--              reactions, media, summaries, and drafts
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CORE FORUM TABLES (Enhanced)
-- ============================================================================

-- Add missing columns to forum_threads if they don't exist
ALTER TABLE forum_threads
ADD COLUMN IF NOT EXISTS content_markdown TEXT,
ADD COLUMN IF NOT EXISTS content_html TEXT,
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'plain',
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pinned_by TEXT,
ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS edited_by TEXT,
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

-- Add missing columns to forum_posts if they don't exist
ALTER TABLE forum_posts
ADD COLUMN IF NOT EXISTS content_markdown TEXT,
ADD COLUMN IF NOT EXISTS content_html TEXT,
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'plain',
ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS edited_by TEXT,
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_threads_category_pinned ON forum_threads(category_id, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_author ON forum_threads(author_address);
CREATE INDEX IF NOT EXISTS idx_posts_thread ON forum_posts(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_author ON forum_posts(author_address);

-- ============================================================================
-- 2. TOKEN-GATING TABLES
-- ============================================================================

-- Multi-token forum category access (from migration 001)
CREATE TABLE IF NOT EXISTS forum_category_required_tokens (
  forum_category_id UUID NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
  token_or_hat TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (forum_category_id, token_or_hat)
);

CREATE INDEX IF NOT EXISTS forum_cat_required_tokens_idx
  ON forum_category_required_tokens(token_or_hat);

-- View for pod role forum access
CREATE OR REPLACE VIEW pod_role_forum_access AS
SELECT
  p.id AS pod_id,
  p.name AS pod_name,
  prp.hat_id::TEXT AS hat_id,
  prp.role_name,
  ( (prp.permissions::JSONB->>'chatAccess')::BOOLEAN ) AS chat_access,
  ( (prp.permissions::JSONB->>'governanceParticipation')::BOOLEAN ) AS governance_participation,
  ( (prp.permissions::JSONB->>'forumModeration')::BOOLEAN ) AS forum_moderation
FROM pod_role_permissions prp
JOIN pods p ON p.id = prp.pod_id
WHERE prp.is_active = TRUE;

-- RPC function to get accessible forums
CREATE OR REPLACE FUNCTION forums_accessible_by_identity(
  user_tokens TEXT[],
  user_hats TEXT[]
)
RETURNS SETOF forum_categories
SECURITY DEFINER
LANGUAGE SQL STABLE AS $$
  WITH f_tokens AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    WHERE fcrt.token_or_hat = ANY (user_tokens)
  ),
  f_hats AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    WHERE fcrt.token_or_hat = ANY (user_hats)
  ),
  f_roles AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    JOIN pod_role_forum_access prfa
      ON prfa.hat_id = fcrt.token_or_hat
     AND (prfa.chat_access = TRUE OR prfa.governance_participation = TRUE OR prfa.forum_moderation = TRUE)
    WHERE fcrt.token_or_hat = ANY (user_hats)
  ),
  f_no_requirements AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    WHERE NOT EXISTS (
      SELECT 1 FROM forum_category_required_tokens fcrt
      WHERE fcrt.forum_category_id = fc.id
    )
    AND (fc.required_token IS NULL OR fc.required_token = '')
  )

  SELECT * FROM f_tokens
  UNION
  SELECT * FROM f_hats
  UNION
  SELECT * FROM f_roles
  UNION
  SELECT * FROM f_no_requirements
  ORDER BY created_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION forums_accessible_by_identity(TEXT[], TEXT[]) TO anon, authenticated;

-- ============================================================================
-- 3. MODERATION SYSTEM
-- ============================================================================

-- Moderator actions log
CREATE TABLE IF NOT EXISTS forum_moderator_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moderator_address TEXT NOT NULL,
  action_type TEXT NOT NULL, -- 'pin', 'unpin', 'lock', 'unlock', 'delete', 'mute', 'unmute', 'warn', 'ban', 'unban', 'shadow_ban'
  target_type TEXT NOT NULL, -- 'thread', 'post', 'user'
  target_id TEXT NOT NULL,
  reason TEXT,
  duration_hours INTEGER,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_moderator_actions_target ON forum_moderator_actions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_moderator_actions_expires ON forum_moderator_actions(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderator_actions_moderator ON forum_moderator_actions(moderator_address);

-- User mutes/bans (denormalized for performance)
CREATE TABLE IF NOT EXISTS forum_user_mutes (
  user_address TEXT PRIMARY KEY,
  muted_until TIMESTAMPTZ,
  is_shadow_banned BOOLEAN DEFAULT FALSE,
  is_permanently_banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  muted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_mutes_expires ON forum_user_mutes(muted_until) WHERE muted_until IS NOT NULL;

-- Post/Thread reports
CREATE TABLE IF NOT EXISTS forum_post_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_address TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'thread', 'post'
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  category TEXT, -- 'spam', 'harassment', 'inappropriate', 'off_topic', 'other'
  status TEXT DEFAULT 'pending', -- 'pending', 'reviewed', 'actioned', 'dismissed'
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  action_taken TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_reports_status ON forum_post_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_reports_target ON forum_post_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_post_reports_reporter ON forum_post_reports(reporter_address);

-- ============================================================================
-- 4. POLLS & SURVEYS
-- ============================================================================

-- Polls
CREATE TABLE IF NOT EXISTS forum_polls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE UNIQUE,
  question TEXT NOT NULL,
  poll_type TEXT DEFAULT 'single_choice', -- 'single_choice', 'multiple_choice', 'ranked_choice'
  allow_multiple BOOLEAN DEFAULT FALSE,
  max_choices INTEGER DEFAULT 1,
  is_anonymous BOOLEAN DEFAULT FALSE,
  closes_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polls_thread ON forum_polls(thread_id);
CREATE INDEX IF NOT EXISTS idx_polls_closes ON forum_polls(closes_at) WHERE closes_at IS NOT NULL;

-- Poll options
CREATE TABLE IF NOT EXISTS forum_poll_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID REFERENCES forum_polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  option_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, option_order)
);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON forum_poll_options(poll_id, option_order);

-- Poll votes
CREATE TABLE IF NOT EXISTS forum_poll_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID REFERENCES forum_polls(id) ON DELETE CASCADE,
  option_id UUID REFERENCES forum_poll_options(id) ON DELETE CASCADE,
  voter_address TEXT NOT NULL,
  rank INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, voter_address, option_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON forum_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON forum_poll_votes(option_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_voter ON forum_poll_votes(voter_address);

-- Poll results view
CREATE OR REPLACE VIEW forum_poll_results AS
SELECT
  p.id AS poll_id,
  p.question,
  po.id AS option_id,
  po.option_text,
  po.option_order,
  COUNT(pv.id) AS vote_count,
  ROUND(
    COALESCE(
      (COUNT(pv.id)::NUMERIC / NULLIF(SUM(COUNT(pv.id)) OVER (PARTITION BY p.id), 0)) * 100,
      0
    ),
    2
  ) AS vote_percentage
FROM forum_polls p
JOIN forum_poll_options po ON po.poll_id = p.id
LEFT JOIN forum_poll_votes pv ON pv.option_id = po.id
GROUP BY p.id, p.question, po.id, po.option_text, po.option_order
ORDER BY p.id, po.option_order;

-- ============================================================================
-- 5. REACTIONS & EMOJIS
-- ============================================================================

-- Post/Thread reactions
CREATE TABLE IF NOT EXISTS forum_post_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_type TEXT NOT NULL, -- 'thread', 'post'
  target_id UUID NOT NULL,
  reactor_address TEXT NOT NULL,
  reaction_emoji TEXT NOT NULL, -- '👍', '❤️', '😂', '🎉', '😢', '👀'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(target_type, target_id, reactor_address, reaction_emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_target ON forum_post_reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON forum_post_reactions(reactor_address);

-- Reaction counts view
CREATE OR REPLACE VIEW forum_reaction_counts AS
SELECT
  target_type,
  target_id,
  reaction_emoji,
  COUNT(*) AS reaction_count,
  ARRAY_AGG(reactor_address ORDER BY created_at) AS reactors
FROM forum_post_reactions
GROUP BY target_type, target_id, reaction_emoji;

-- ============================================================================
-- 6. MEDIA ATTACHMENTS
-- ============================================================================

-- Media attachments
CREATE TABLE IF NOT EXISTS forum_media_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_type TEXT NOT NULL, -- 'thread', 'post'
  target_id UUID NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'image', 'video', 'audio', 'document'
  file_size INTEGER,
  mime_type TEXT,
  metadata JSONB DEFAULT '{}'::JSONB, -- width, height, duration, etc.
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_target ON forum_media_attachments(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_media_uploader ON forum_media_attachments(uploaded_by);

-- ============================================================================
-- 7. AI THREAD SUMMARIES
-- ============================================================================

-- Thread summaries
CREATE TABLE IF NOT EXISTS forum_thread_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE UNIQUE,
  summary TEXT NOT NULL,
  key_points TEXT[],
  post_count_at_generation INTEGER,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by_model TEXT DEFAULT 'gpt-4o-mini',
  needs_regeneration BOOLEAN DEFAULT FALSE,
  generation_requested_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_summaries_thread ON forum_thread_summaries(thread_id);
CREATE INDEX IF NOT EXISTS idx_summaries_regeneration ON forum_thread_summaries(needs_regeneration) WHERE needs_regeneration = TRUE;

-- Trigger to mark summaries stale when thread grows
CREATE OR REPLACE FUNCTION mark_summary_stale()
RETURNS TRIGGER AS $$
DECLARE
  post_count INTEGER;
  summary_post_count INTEGER;
BEGIN
  -- Get current post count
  SELECT COUNT(*) INTO post_count
  FROM forum_posts
  WHERE thread_id = NEW.thread_id AND is_deleted = FALSE;

  -- Get post count at summary generation
  SELECT post_count_at_generation INTO summary_post_count
  FROM forum_thread_summaries
  WHERE thread_id = NEW.thread_id;

  -- Mark stale if 10+ new posts
  IF summary_post_count IS NOT NULL AND (post_count - summary_post_count) >= 10 THEN
    UPDATE forum_thread_summaries
    SET needs_regeneration = TRUE
    WHERE thread_id = NEW.thread_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS forum_post_summary_check ON forum_posts;
CREATE TRIGGER forum_post_summary_check
AFTER INSERT ON forum_posts
FOR EACH ROW
EXECUTE FUNCTION mark_summary_stale();

-- ============================================================================
-- 8. THREAD DRAFTS & AUTOSAVE
-- ============================================================================

-- Thread drafts
CREATE TABLE IF NOT EXISTS forum_thread_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_address TEXT NOT NULL,
  category_id UUID REFERENCES forum_categories(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,
  content_markdown TEXT,
  content_html TEXT,
  tags TEXT[],
  poll_data JSONB,
  autosave_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(author_address, category_id)
);

CREATE INDEX IF NOT EXISTS idx_drafts_author ON forum_thread_drafts(author_address);
CREATE INDEX IF NOT EXISTS idx_drafts_updated ON forum_thread_drafts(updated_at);

-- Auto-cleanup old drafts (function to run nightly via cron)
CREATE OR REPLACE FUNCTION cleanup_old_drafts()
RETURNS void AS $$
BEGIN
  DELETE FROM forum_thread_drafts
  WHERE updated_at < NOW() - INTERVAL '30 days';

  RAISE NOTICE 'Deleted drafts older than 30 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. FEATURED/PINNED CONTENT
-- ============================================================================

-- Featured content (alternative to column approach)
CREATE TABLE IF NOT EXISTS forum_featured_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_type TEXT NOT NULL, -- 'thread', 'post', 'category'
  content_id UUID NOT NULL,
  featured_by TEXT NOT NULL,
  feature_type TEXT DEFAULT 'featured', -- 'pinned', 'featured', 'announcement'
  display_order INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_type, content_id, feature_type)
);

CREATE INDEX IF NOT EXISTS idx_featured_type ON forum_featured_content(feature_type, display_order);
CREATE INDEX IF NOT EXISTS idx_featured_expires ON forum_featured_content(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_featured_content ON forum_featured_content(content_type, content_id);

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on sensitive tables
ALTER TABLE forum_moderator_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_user_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_post_reports ENABLE ROW LEVEL SECURITY;

-- Moderator actions: Only moderators can view
CREATE POLICY "Moderators can view all actions" ON forum_moderator_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
    )
  );

CREATE POLICY "Moderators can insert actions" ON forum_moderator_actions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
    )
  );

-- User mutes: Public read, moderator write
CREATE POLICY "Anyone can view mutes" ON forum_user_mutes FOR SELECT USING (true);

CREATE POLICY "Moderators can manage mutes" ON forum_user_mutes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
    )
  );

-- Reports: Users can create, moderators can view all
CREATE POLICY "Users can create reports" ON forum_post_reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view own reports" ON forum_post_reports
  FOR SELECT USING (reporter_address = current_setting('request.jwt.claims', true)::json->>'address');

CREATE POLICY "Moderators can view all reports" ON forum_post_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
    )
  );

CREATE POLICY "Moderators can update reports" ON forum_post_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
    )
  );

-- ============================================================================
-- 11. HELPER FUNCTIONS
-- ============================================================================

-- Check if user is moderator
CREATE OR REPLACE FUNCTION is_forum_moderator(user_hats TEXT[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_role_permissions prp
    WHERE prp.hat_id = ANY(user_hats)
      AND (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
      AND prp.is_active = TRUE
  );
$$ LANGUAGE SQL STABLE;

-- Check if user can post in category
CREATE OR REPLACE FUNCTION can_post_in_category(
  category_id UUID,
  user_hats TEXT[]
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_role_permissions prp
    WHERE prp.hat_id = ANY(user_hats)
      AND (prp.permissions->>'chatAccess')::BOOLEAN = TRUE
      AND prp.is_active = TRUE
  );
$$ LANGUAGE SQL STABLE;

-- Get user's moderation permissions
CREATE OR REPLACE FUNCTION get_user_forum_permissions(user_hats TEXT[])
RETURNS TABLE(
  can_moderate BOOLEAN,
  can_post BOOLEAN,
  can_participate_governance BOOLEAN
) AS $$
  SELECT
    BOOL_OR((prp.permissions->>'forumModeration')::BOOLEAN) AS can_moderate,
    BOOL_OR((prp.permissions->>'chatAccess')::BOOLEAN) AS can_post,
    BOOL_OR((prp.permissions->>'governanceParticipation')::BOOLEAN) AS can_participate_governance
  FROM pod_role_permissions prp
  WHERE prp.hat_id = ANY(user_hats)
    AND prp.is_active = TRUE;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- 12. STORAGE BUCKET SETUP REMINDER
-- ============================================================================

-- MANUAL STEPS REQUIRED IN SUPABASE DASHBOARD:
--
-- 1. Create storage buckets:
--    - Name: forum-media
--    - Public: false
--    - File size limit: 5MB
--    - Allowed MIME types: image/jpeg, image/png, image/webp, image/gif,
--                          video/mp4, video/webm, audio/mpeg, audio/wav,
--                          application/pdf, text/plain, text/markdown
--
--    - Name: forum-attachments
--    - Public: false
--    - File size limit: 5MB
--    - Allowed MIME types: (same as above)
--
-- 2. RLS policies will be created in next migration file

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Run this migration
-- 2. Create storage RLS policies (003_forum_storage_policies.sql)
-- 3. Implement useUnifiedForumAccess hook
-- 4. Update ForumAccessGate component
-- ============================================================================

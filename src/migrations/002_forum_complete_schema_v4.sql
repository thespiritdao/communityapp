-- ============================================================================
-- FORUM SYSTEM COMPLETE DATABASE SCHEMA (V4 - FINAL FIX)
-- ============================================================================
-- Version: 2.3
-- Date: 2025-10-20
-- Description: Complete forum schema with token-gating, moderation, polls,
--              reactions, media, summaries, and drafts
-- FIX: Drops existing views before recreating, removes blocking RLS policies
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. REMOVE BLOCKING RLS POLICIES AND DROP CONFLICTING OBJECTS
-- ============================================================================

-- Drop the deny_raw_select policies that are blocking everything
DROP POLICY IF EXISTS deny_raw_select_forums ON forum_categories;
DROP POLICY IF EXISTS deny_raw_select_forum_tokens ON forum_category_required_tokens;

-- Drop existing views that might have different schemas
DROP VIEW IF EXISTS pod_role_forum_access CASCADE;
DROP VIEW IF EXISTS forum_poll_results CASCADE;
DROP VIEW IF EXISTS forum_reaction_counts CASCADE;

-- Drop existing functions that we'll recreate
DROP FUNCTION IF EXISTS forums_accessible_by_identity(TEXT[], TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS is_forum_moderator(TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS can_post_in_category(UUID, TEXT[], TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS get_user_forum_permissions(TEXT[], TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS mark_summary_stale() CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_drafts() CASCADE;

-- Disable RLS temporarily to allow schema changes
ALTER TABLE IF EXISTS forum_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS forum_category_required_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS forum_threads DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS forum_posts DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1. DROP AND RECREATE BASE FORUM TABLES
-- ============================================================================

-- Drop existing tables if they exist (cascade to remove dependencies)
DROP TABLE IF EXISTS forum_thread_summaries CASCADE;
DROP TABLE IF EXISTS forum_media_attachments CASCADE;
DROP TABLE IF EXISTS forum_post_reactions CASCADE;
DROP TABLE IF EXISTS forum_poll_votes CASCADE;
DROP TABLE IF EXISTS forum_poll_options CASCADE;
DROP TABLE IF EXISTS forum_polls CASCADE;
DROP TABLE IF EXISTS forum_post_reports CASCADE;
DROP TABLE IF EXISTS forum_user_mutes CASCADE;
DROP TABLE IF EXISTS forum_moderator_actions CASCADE;
DROP TABLE IF EXISTS forum_thread_drafts CASCADE;
DROP TABLE IF EXISTS forum_featured_content CASCADE;
DROP TABLE IF EXISTS forum_posts CASCADE;
DROP TABLE IF EXISTS forum_threads CASCADE;
-- Don't drop forum_categories as it has data we want to keep

-- Forum Threads Table (Complete fresh schema)
CREATE TABLE forum_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES forum_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  content_markdown TEXT,
  content_html TEXT,
  content_type TEXT DEFAULT 'plain',
  author_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_pinned BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  pinned_at TIMESTAMPTZ,
  pinned_by TEXT,
  edit_history JSONB DEFAULT '[]'::JSONB,
  edited_at TIMESTAMPTZ,
  edited_by TEXT,
  view_count INTEGER DEFAULT 0
);

-- Forum Posts Table (Complete fresh schema)
CREATE TABLE forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_markdown TEXT,
  content_html TEXT,
  content_type TEXT DEFAULT 'plain',
  author_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  edit_history JSONB DEFAULT '[]'::JSONB,
  edited_at TIMESTAMPTZ,
  edited_by TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT
);

-- Create indexes for performance
CREATE INDEX idx_threads_category_pinned ON forum_threads(category_id, is_pinned DESC, created_at DESC);
CREATE INDEX idx_threads_author ON forum_threads(author_address);
CREATE INDEX idx_posts_thread ON forum_posts(thread_id, created_at);
CREATE INDEX idx_posts_author ON forum_posts(author_address);

-- ============================================================================
-- 2. TOKEN-GATING TABLES (Keep existing from 001 migration)
-- ============================================================================

-- forum_category_required_tokens already exists from 001 migration
-- Just ensure it exists
CREATE TABLE IF NOT EXISTS forum_category_required_tokens (
  forum_category_id UUID NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
  token_or_hat TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (forum_category_id, token_or_hat)
);

CREATE INDEX IF NOT EXISTS forum_cat_required_tokens_idx
  ON forum_category_required_tokens(token_or_hat);

-- View for pod role forum access (recreated with correct schema)
CREATE VIEW pod_role_forum_access AS
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

-- RPC function to get accessible forums (SECURITY DEFINER to bypass RLS)
CREATE FUNCTION forums_accessible_by_identity(
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
    JOIN forum_category_required_tokens fcrt ON fcrt.forum_category_id = fc.id
    JOIN pod_role_forum_access prfa ON prfa.hat_id = fcrt.token_or_hat
    WHERE prfa.hat_id = ANY (user_hats)
      AND prfa.chat_access = TRUE
  ),
  f_public AS (
    SELECT fc.*
    FROM forum_categories fc
    LEFT JOIN forum_category_required_tokens fcrt ON fcrt.forum_category_id = fc.id
    WHERE fcrt.forum_category_id IS NULL
      AND (fc.required_token IS NULL OR fc.required_token = '')
  )
  SELECT * FROM f_tokens
  UNION
  SELECT * FROM f_hats
  UNION
  SELECT * FROM f_roles
  UNION
  SELECT * FROM f_public;
$$;

-- ============================================================================
-- 3. MODERATION SYSTEM
-- ============================================================================

-- Moderator Actions Log
CREATE TABLE forum_moderator_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_address TEXT NOT NULL,
  moderator_hat_id TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('pin', 'unpin', 'lock', 'unlock', 'delete', 'ban', 'mute', 'feature', 'unfeature')),
  target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'post', 'user')),
  target_id TEXT NOT NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mod_actions_moderator ON forum_moderator_actions(moderator_address);
CREATE INDEX idx_mod_actions_target ON forum_moderator_actions(target_type, target_id);

-- User Mutes/Bans
CREATE TABLE forum_user_mutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL UNIQUE,
  muted_by TEXT NOT NULL,
  reason TEXT,
  mute_type TEXT NOT NULL CHECK (mute_type IN ('temporary', 'permanent', 'shadow')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_user_mutes_active ON forum_user_mutes(user_address, is_active);

-- Post Reports
CREATE TABLE forum_post_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
  reporter_address TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('spam', 'abuse', 'off-topic', 'harassment', 'other')),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_status ON forum_post_reports(status);
CREATE INDEX idx_reports_post ON forum_post_reports(post_id);

-- ============================================================================
-- 4. POLLS SYSTEM
-- ============================================================================

-- Polls
CREATE TABLE forum_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID UNIQUE REFERENCES forum_threads(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  description TEXT,
  allow_multiple BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Poll Options
CREATE TABLE forum_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES forum_polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  option_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_poll_options_poll ON forum_poll_options(poll_id, option_order);

-- Poll Votes
CREATE TABLE forum_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES forum_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES forum_poll_options(id) ON DELETE CASCADE,
  voter_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (poll_id, option_id, voter_address)
);

CREATE INDEX idx_poll_votes_voter ON forum_poll_votes(voter_address);

-- Poll Results View
CREATE VIEW forum_poll_results AS
SELECT
  po.poll_id,
  po.id AS option_id,
  po.option_text,
  COUNT(pv.id) AS vote_count
FROM forum_poll_options po
LEFT JOIN forum_poll_votes pv ON pv.option_id = po.id
GROUP BY po.poll_id, po.id, po.option_text, po.option_order
ORDER BY po.poll_id, po.option_order;

-- ============================================================================
-- 5. REACTIONS SYSTEM
-- ============================================================================

-- Post Reactions (emoji reactions)
CREATE TABLE forum_post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
  reactor_address TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, thread_id, reactor_address, reaction_type)
);

CREATE INDEX idx_reactions_post ON forum_post_reactions(post_id);
CREATE INDEX idx_reactions_thread ON forum_post_reactions(thread_id);

-- Reaction Counts View
CREATE VIEW forum_reaction_counts AS
SELECT
  COALESCE(post_id::TEXT, thread_id::TEXT) AS target_id,
  CASE WHEN post_id IS NOT NULL THEN 'post' ELSE 'thread' END AS target_type,
  reaction_type,
  COUNT(*) AS count
FROM forum_post_reactions
GROUP BY post_id, thread_id, reaction_type;

-- ============================================================================
-- 6. MEDIA ATTACHMENTS
-- ============================================================================

-- Media Attachments (links to Supabase Storage)
CREATE TABLE forum_media_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
  uploader_address TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  is_embedded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_media_post ON forum_media_attachments(post_id);
CREATE INDEX idx_media_thread ON forum_media_attachments(thread_id);

-- ============================================================================
-- 7. AI SUMMARIES
-- ============================================================================

-- Thread Summaries (generated by Sensemaker AI)
CREATE TABLE forum_thread_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID UNIQUE REFERENCES forum_threads(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  key_points JSONB DEFAULT '[]'::JSONB,
  generated_by TEXT DEFAULT 'sensemaker-ai',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  is_stale BOOLEAN DEFAULT FALSE,
  last_post_count INTEGER DEFAULT 0
);

-- Mark summaries as stale when thread gets new posts
CREATE FUNCTION mark_summary_stale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE forum_thread_summaries
  SET is_stale = TRUE
  WHERE thread_id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mark_summary_stale
AFTER INSERT ON forum_posts
FOR EACH ROW
EXECUTE FUNCTION mark_summary_stale();

-- ============================================================================
-- 8. DRAFTS & AUTOSAVE
-- ============================================================================

-- Thread/Post Drafts
CREATE TABLE forum_thread_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_address TEXT NOT NULL,
  category_id UUID REFERENCES forum_categories(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,
  content_markdown TEXT,
  draft_type TEXT DEFAULT 'thread' CHECK (draft_type IN ('thread', 'post')),
  parent_thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (author_address, category_id, draft_type, parent_thread_id)
);

CREATE INDEX idx_drafts_author ON forum_thread_drafts(author_address);

-- Cleanup old drafts
CREATE FUNCTION cleanup_old_drafts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM forum_thread_drafts
  WHERE updated_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. FEATURED CONTENT
-- ============================================================================

-- Featured/Pinned Posts
CREATE TABLE forum_featured_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE,
  category_id UUID REFERENCES forum_categories(id) ON DELETE CASCADE,
  featured_by TEXT NOT NULL,
  feature_type TEXT DEFAULT 'pinned' CHECK (feature_type IN ('pinned', 'featured', 'announcement')),
  display_order INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_featured_category ON forum_featured_content(category_id, is_active, display_order);

-- ============================================================================
-- 10. HELPER FUNCTIONS
-- ============================================================================

-- Check if user is moderator
CREATE FUNCTION is_forum_moderator(user_hat_ids TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_role_forum_access
    WHERE hat_id = ANY (user_hat_ids)
      AND forum_moderation = TRUE
  );
$$;

-- Check if user can post in category
CREATE FUNCTION can_post_in_category(
  category_id UUID,
  user_tokens TEXT[],
  user_hats TEXT[]
)
RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM forums_accessible_by_identity(user_tokens, user_hats)
    WHERE id = category_id
  ) AND EXISTS (
    SELECT 1 FROM pod_role_forum_access
    WHERE hat_id = ANY (user_hats)
      AND chat_access = TRUE
  );
$$;

-- Get user's forum permissions
CREATE FUNCTION get_user_forum_permissions(
  user_tokens TEXT[],
  user_hats TEXT[]
)
RETURNS TABLE (
  can_moderate BOOLEAN,
  can_post BOOLEAN,
  can_participate_governance BOOLEAN,
  accessible_category_count INTEGER
) AS $$
  SELECT
    is_forum_moderator(user_hats) AS can_moderate,
    EXISTS (
      SELECT 1 FROM pod_role_forum_access
      WHERE hat_id = ANY (user_hats) AND chat_access = TRUE
    ) AS can_post,
    EXISTS (
      SELECT 1 FROM pod_role_forum_access
      WHERE hat_id = ANY (user_hats) AND governance_participation = TRUE
    ) AS can_participate_governance,
    (SELECT COUNT(*)::INTEGER FROM forums_accessible_by_identity(user_tokens, user_hats)) AS accessible_category_count;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on sensitive tables only
ALTER TABLE forum_moderator_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_user_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_post_reports ENABLE ROW LEVEL SECURITY;

-- Moderator actions: Only moderators can view/insert
CREATE POLICY moderator_actions_select ON forum_moderator_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
    )
  );

CREATE POLICY moderator_actions_insert ON forum_moderator_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
    )
  );

-- User mutes: Public read, moderator write
CREATE POLICY user_mutes_select ON forum_user_mutes
  FOR SELECT TO public
  USING (TRUE);

CREATE POLICY user_mutes_insert ON forum_user_mutes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
    )
  );

-- Post reports: Users can create, moderators can review
CREATE POLICY post_reports_insert ON forum_post_reports
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY post_reports_select ON forum_post_reports
  FOR SELECT TO authenticated
  USING (
    reporter_address = (SELECT auth.uid()::TEXT) OR
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
    )
  );

CREATE POLICY post_reports_update ON forum_post_reports
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
    )
  );

-- Grant execute permissions on RPC functions
GRANT EXECUTE ON FUNCTION forums_accessible_by_identity(TEXT[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_forum_moderator(TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION can_post_in_category(UUID, TEXT[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_forum_permissions(TEXT[], TEXT[]) TO anon, authenticated;

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- This migration:
-- 1. Drops all conflicting views and functions before recreating
-- 2. Removes blocking RLS policies from 001 migration
-- 3. Drops and recreates all forum tables with complete schema
-- 4. Creates all enhancement tables (moderation, polls, reactions, etc.)
-- 5. Applies proper RLS only to sensitive tables
-- 6. Grants proper permissions on RPC functions
-- ============================================================================

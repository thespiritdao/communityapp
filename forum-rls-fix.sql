-- ============================================================================
-- FORUM RLS DIAGNOSTIC AND FIX
-- ============================================================================
-- Purpose: Check and fix RLS policies blocking forum_threads inserts
-- Error: "new row violates row-level security policy for table \"forum_threads\""
-- ============================================================================

-- ============================================================================
-- STEP 1: DIAGNOSTIC - Check current RLS status
-- ============================================================================

-- Check if RLS is enabled on forum_threads
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename IN ('forum_threads', 'forum_posts');

-- Check existing policies on forum_threads
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('forum_threads', 'forum_posts')
ORDER BY tablename, policyname;

-- ============================================================================
-- STEP 2: FIX - Disable RLS on forum_threads and forum_posts
-- ============================================================================

-- Disable RLS entirely (matching the intended design from migration 002_v4)
ALTER TABLE forum_threads DISABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts DISABLE ROW LEVEL SECURITY;

-- Drop any existing policies (they're not supposed to exist per the schema)
DROP POLICY IF EXISTS forum_threads_select ON forum_threads;
DROP POLICY IF EXISTS forum_threads_insert ON forum_threads;
DROP POLICY IF EXISTS forum_threads_update ON forum_threads;
DROP POLICY IF EXISTS forum_threads_delete ON forum_threads;

DROP POLICY IF EXISTS forum_posts_select ON forum_posts;
DROP POLICY IF EXISTS forum_posts_insert ON forum_posts;
DROP POLICY IF EXISTS forum_posts_update ON forum_posts;
DROP POLICY IF EXISTS forum_posts_delete ON forum_posts;

-- Grant public access (as intended by the original schema)
GRANT SELECT, INSERT, UPDATE ON forum_threads TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON forum_posts TO authenticated, anon;

-- ============================================================================
-- STEP 3: VERIFICATION
-- ============================================================================

-- Verify RLS is disabled
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename IN ('forum_threads', 'forum_posts');

-- Expected output: rls_enabled = false for both tables

-- Verify no policies exist
SELECT COUNT(*) AS policy_count
FROM pg_policies
WHERE tablename IN ('forum_threads', 'forum_posts');

-- Expected output: policy_count = 0

-- ============================================================================
-- EXPLANATION
-- ============================================================================
--
-- The forum system was designed with RLS DISABLED on forum_threads and forum_posts
-- (see src/migrations/002_forum_complete_schema_v4.sql lines 34-38, 479-486)
--
-- RLS was only intended for:
-- - forum_moderator_actions
-- - forum_user_mutes
-- - forum_post_reports
--
-- The access control is handled via:
-- 1. Application-level checks (useForum hook)
-- 2. RPC functions (forums_accessible_by_identity, can_post_in_category)
-- 3. Token gating (forum_category_required_tokens)
--
-- If RLS was re-enabled, it was likely done accidentally or by a later
-- migration that wasn't aware of the original design.
-- ============================================================================

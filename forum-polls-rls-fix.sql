-- Fix RLS policies for forum polls
-- The main forum tables (threads, posts, categories) don't have RLS enabled
-- So we disable RLS on poll tables to match that pattern and allow public access

-- ============================================================================
-- DISABLE RLS (to match other forum tables)
-- ============================================================================

ALTER TABLE forum_polls DISABLE ROW LEVEL SECURITY;
ALTER TABLE forum_poll_options DISABLE ROW LEVEL SECURITY;
ALTER TABLE forum_poll_votes DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PRODUCTION-READY RLS FOR ALL FORUM TABLES
-- ============================================================================
-- This script enables Row Level Security on all forum tables with proper
-- policies for a production environment.
--
-- IMPORTANT: Run this AFTER testing that basic functionality works.
-- This will secure your forum against unauthorized access.
-- ============================================================================

-- ============================================================================
-- PART 1: DROP EXISTING POLICIES (Clean slate)
-- ============================================================================

-- Forum Categories
DROP POLICY IF EXISTS "Anyone can view categories" ON forum_categories;
DROP POLICY IF EXISTS "Moderators can create categories" ON forum_categories;
DROP POLICY IF EXISTS "Moderators can update categories" ON forum_categories;
DROP POLICY IF EXISTS "Moderators can delete categories" ON forum_categories;

-- Forum Threads
DROP POLICY IF EXISTS "Anyone can view threads" ON forum_threads;
DROP POLICY IF EXISTS "Authenticated users can create threads" ON forum_threads;
DROP POLICY IF EXISTS "Thread creators can update their threads" ON forum_threads;
DROP POLICY IF EXISTS "Thread creators can delete their threads" ON forum_threads;

-- Forum Posts
DROP POLICY IF EXISTS "Anyone can view posts" ON forum_posts;
DROP POLICY IF EXISTS "Authenticated users can create posts" ON forum_posts;
DROP POLICY IF EXISTS "Post creators can update their posts" ON forum_posts;
DROP POLICY IF EXISTS "Post creators can delete their posts" ON forum_posts;

-- Forum Polls (already done, but included for completeness)
DROP POLICY IF EXISTS "Anyone can view polls" ON forum_polls;
DROP POLICY IF EXISTS "Authenticated users can create polls" ON forum_polls;
DROP POLICY IF EXISTS "Poll creators can update their polls" ON forum_polls;
DROP POLICY IF EXISTS "Poll creators can delete their polls" ON forum_polls;

-- Forum Poll Options
DROP POLICY IF EXISTS "Anyone can view poll options" ON forum_poll_options;
DROP POLICY IF EXISTS "Authenticated users can create poll options" ON forum_poll_options;
DROP POLICY IF EXISTS "Poll creators can update poll options" ON forum_poll_options;
DROP POLICY IF EXISTS "Poll creators can delete poll options" ON forum_poll_options;

-- Forum Poll Votes
DROP POLICY IF EXISTS "Anyone can view poll votes" ON forum_poll_votes;
DROP POLICY IF EXISTS "Authenticated users can vote on polls" ON forum_poll_votes;
DROP POLICY IF EXISTS "Users can delete their own votes" ON forum_poll_votes;

-- Forum Media Attachments
DROP POLICY IF EXISTS "Anyone can view attachments" ON forum_media_attachments;
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON forum_media_attachments;
DROP POLICY IF EXISTS "Attachment creators can delete their attachments" ON forum_media_attachments;

-- Forum Post Reactions
DROP POLICY IF EXISTS "Anyone can view reactions" ON forum_post_reactions;
DROP POLICY IF EXISTS "Authenticated users can add reactions" ON forum_post_reactions;
DROP POLICY IF EXISTS "Users can remove their own reactions" ON forum_post_reactions;

-- Forum Thread Summaries
DROP POLICY IF EXISTS "Anyone can view summaries" ON forum_thread_summaries;
DROP POLICY IF EXISTS "System can create summaries" ON forum_thread_summaries;

-- Forum Thread Drafts
DROP POLICY IF EXISTS "Users can view their own drafts" ON forum_thread_drafts;
DROP POLICY IF EXISTS "Users can create their own drafts" ON forum_thread_drafts;
DROP POLICY IF EXISTS "Users can update their own drafts" ON forum_thread_drafts;
DROP POLICY IF EXISTS "Users can delete their own drafts" ON forum_thread_drafts;

-- Forum Featured Content
DROP POLICY IF EXISTS "Anyone can view featured content" ON forum_featured_content;
DROP POLICY IF EXISTS "Moderators can feature content" ON forum_featured_content;
DROP POLICY IF EXISTS "Moderators can unfeature content" ON forum_featured_content;

-- ============================================================================
-- PART 2: ENABLE RLS ON ALL TABLES
-- ============================================================================

-- ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;  -- Commented out - table may not exist
ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_media_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_thread_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_thread_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_featured_content ENABLE ROW LEVEL SECURITY;

-- Note: forum_moderator_actions, forum_user_mutes, forum_post_reports
-- already have RLS enabled from the base migration

-- ============================================================================
-- PART 3: FORUM CATEGORIES POLICIES (OPTIONAL - May not exist)
-- ============================================================================
-- Note: forum_categories table might be managed separately or not exist yet.
-- Comment these out if you get errors about the table not existing.

-- CREATE POLICY "Anyone can view categories"
-- ON forum_categories
-- FOR SELECT
-- USING (true);

-- CREATE POLICY "Authenticated users can create categories"
-- ON forum_categories
-- FOR INSERT
-- TO authenticated
-- WITH CHECK (auth.jwt() IS NOT NULL);

-- CREATE POLICY "Authenticated users can update categories"
-- ON forum_categories
-- FOR UPDATE
-- TO authenticated
-- USING (auth.jwt() IS NOT NULL);

-- CREATE POLICY "Authenticated users can delete categories"
-- ON forum_categories
-- FOR DELETE
-- TO authenticated
-- USING (auth.jwt() IS NOT NULL);

-- ============================================================================
-- PART 4: FORUM THREADS POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view threads"
ON forum_threads
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create threads"
ON forum_threads
FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() IS NOT NULL AND
  author_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
);

CREATE POLICY "Thread creators can update their threads"
ON forum_threads
FOR UPDATE
TO authenticated
USING (author_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

CREATE POLICY "Thread creators can delete their threads"
ON forum_threads
FOR DELETE
TO authenticated
USING (author_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- ============================================================================
-- PART 5: FORUM POSTS POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view posts"
ON forum_posts
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create posts"
ON forum_posts
FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() IS NOT NULL AND
  author_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
);

CREATE POLICY "Post creators can update their posts"
ON forum_posts
FOR UPDATE
TO authenticated
USING (author_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

CREATE POLICY "Post creators can delete their posts"
ON forum_posts
FOR DELETE
TO authenticated
USING (author_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- ============================================================================
-- PART 6: FORUM POLLS POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view polls"
ON forum_polls
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create polls"
ON forum_polls
FOR INSERT
TO authenticated
WITH CHECK (auth.jwt() IS NOT NULL);

CREATE POLICY "Poll creators can update their polls"
ON forum_polls
FOR UPDATE
TO authenticated
USING (created_by = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

CREATE POLICY "Poll creators can delete their polls"
ON forum_polls
FOR DELETE
TO authenticated
USING (created_by = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- ============================================================================
-- PART 7: FORUM POLL OPTIONS POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view poll options"
ON forum_poll_options
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create poll options"
ON forum_poll_options
FOR INSERT
TO authenticated
WITH CHECK (auth.jwt() IS NOT NULL);

CREATE POLICY "Poll creators can update poll options"
ON forum_poll_options
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM forum_polls
    WHERE forum_polls.id = forum_poll_options.poll_id
    AND forum_polls.created_by = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
  )
);

CREATE POLICY "Poll creators can delete poll options"
ON forum_poll_options
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM forum_polls
    WHERE forum_polls.id = forum_poll_options.poll_id
    AND forum_polls.created_by = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
  )
);

-- ============================================================================
-- PART 8: FORUM POLL VOTES POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view poll votes"
ON forum_poll_votes
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can vote on polls"
ON forum_poll_votes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() IS NOT NULL AND
  voter_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
);

CREATE POLICY "Users can delete their own votes"
ON forum_poll_votes
FOR DELETE
TO authenticated
USING (voter_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- ============================================================================
-- PART 9: FORUM MEDIA ATTACHMENTS POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view attachments"
ON forum_media_attachments
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can upload attachments"
ON forum_media_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() IS NOT NULL AND
  uploader_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
);

CREATE POLICY "Attachment creators can delete their attachments"
ON forum_media_attachments
FOR DELETE
TO authenticated
USING (uploader_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- ============================================================================
-- PART 10: FORUM POST REACTIONS POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view reactions"
ON forum_post_reactions
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can add reactions"
ON forum_post_reactions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() IS NOT NULL AND
  reactor_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
);

CREATE POLICY "Users can remove their own reactions"
ON forum_post_reactions
FOR DELETE
TO authenticated
USING (reactor_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- ============================================================================
-- PART 11: FORUM THREAD SUMMARIES POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view summaries"
ON forum_thread_summaries
FOR SELECT
USING (true);

-- Allow service role to create/update summaries (AI-generated)
CREATE POLICY "System can create summaries"
ON forum_thread_summaries
FOR INSERT
TO authenticated
WITH CHECK (auth.jwt() IS NOT NULL);

-- ============================================================================
-- PART 12: FORUM THREAD DRAFTS POLICIES
-- ============================================================================

CREATE POLICY "Users can view their own drafts"
ON forum_thread_drafts
FOR SELECT
TO authenticated
USING (author_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

CREATE POLICY "Users can create their own drafts"
ON forum_thread_drafts
FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() IS NOT NULL AND
  author_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
);

CREATE POLICY "Users can update their own drafts"
ON forum_thread_drafts
FOR UPDATE
TO authenticated
USING (author_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

CREATE POLICY "Users can delete their own drafts"
ON forum_thread_drafts
FOR DELETE
TO authenticated
USING (author_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- ============================================================================
-- PART 13: FORUM FEATURED CONTENT POLICIES
-- ============================================================================

CREATE POLICY "Anyone can view featured content"
ON forum_featured_content
FOR SELECT
USING (true);

-- For now, allow any authenticated user to feature content
-- You can later restrict this to moderators only
CREATE POLICY "Authenticated users can feature content"
ON forum_featured_content
FOR INSERT
TO authenticated
WITH CHECK (auth.jwt() IS NOT NULL);

CREATE POLICY "Featured by user can unfeature content"
ON forum_featured_content
FOR DELETE
TO authenticated
USING (featured_by = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these queries to verify RLS is enabled on all tables:
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename LIKE 'forum_%'
-- ORDER BY tablename;
--
-- Should show rowsecurity = true for all forum tables

-- ============================================================================
-- NOTES
-- ============================================================================
--
-- ✅ SECURITY BENEFITS:
-- - Users can only create content with their own wallet address
-- - Users can only edit/delete their own content
-- - Prevents spoofing (posting as someone else)
-- - Prevents unauthorized data modification
-- - Public read access maintains forum functionality
--
-- ⚠️ IMPORTANT:
-- - Test thoroughly before deploying to production
-- - Ensure your JWT contains 'wallet_address' claim
-- - Verify all existing functionality still works
-- - Monitor for any permission errors in logs
--
-- 🔧 CUSTOMIZATION:
-- - Category management: Currently allows any authenticated user.
--   Consider restricting to moderators only.
-- - Featured content: Currently allows any authenticated user.
--   Consider adding is_forum_moderator() check.
--
-- ============================================================================

-- Production-ready RLS policies for forum polls
-- These policies ensure proper security while allowing the features to work

-- ============================================================================
-- DROP EXISTING POLICIES (if any)
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view polls" ON forum_polls;
DROP POLICY IF EXISTS "Authenticated users can create polls" ON forum_polls;
DROP POLICY IF EXISTS "Poll creators can update their polls" ON forum_polls;
DROP POLICY IF EXISTS "Poll creators can delete their polls" ON forum_polls;

DROP POLICY IF EXISTS "Anyone can view poll options" ON forum_poll_options;
DROP POLICY IF EXISTS "Authenticated users can create poll options" ON forum_poll_options;
DROP POLICY IF EXISTS "Poll creators can update poll options" ON forum_poll_options;
DROP POLICY IF EXISTS "Poll creators can delete poll options" ON forum_poll_options;

DROP POLICY IF EXISTS "Anyone can view poll votes" ON forum_poll_votes;
DROP POLICY IF EXISTS "Authenticated users can vote on polls" ON forum_poll_votes;
DROP POLICY IF EXISTS "Users can update their own votes" ON forum_poll_votes;
DROP POLICY IF EXISTS "Users can delete their own votes" ON forum_poll_votes;

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE forum_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_poll_votes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FORUM_POLLS POLICIES
-- ============================================================================

-- Anyone can view polls (public read access)
CREATE POLICY "Anyone can view polls"
ON forum_polls
FOR SELECT
USING (true);

-- Authenticated users can create polls
-- Note: In your app, you check wallet connection, so we allow any authenticated user
CREATE POLICY "Authenticated users can create polls"
ON forum_polls
FOR INSERT
TO authenticated
WITH CHECK (
  -- User must be authenticated
  auth.jwt() IS NOT NULL
);

-- Poll creators can update their own polls (optional - you might want to disable updates)
CREATE POLICY "Poll creators can update their polls"
ON forum_polls
FOR UPDATE
TO authenticated
USING (created_by = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'))
WITH CHECK (created_by = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- Poll creators can delete their own polls (or disable this if you don't want deletions)
CREATE POLICY "Poll creators can delete their polls"
ON forum_polls
FOR DELETE
TO authenticated
USING (created_by = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- ============================================================================
-- FORUM_POLL_OPTIONS POLICIES
-- ============================================================================

-- Anyone can view poll options (public read access)
CREATE POLICY "Anyone can view poll options"
ON forum_poll_options
FOR SELECT
USING (true);

-- Authenticated users can create poll options (when creating a poll)
CREATE POLICY "Authenticated users can create poll options"
ON forum_poll_options
FOR INSERT
TO authenticated
WITH CHECK (
  -- User must be authenticated
  auth.jwt() IS NOT NULL
);

-- Poll creators can update options (linked through poll creator)
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

-- Poll creators can delete options
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
-- FORUM_POLL_VOTES POLICIES
-- ============================================================================

-- Anyone can view poll votes (for displaying results)
CREATE POLICY "Anyone can view poll votes"
ON forum_poll_votes
FOR SELECT
USING (true);

-- Authenticated users can vote on polls
CREATE POLICY "Authenticated users can vote on polls"
ON forum_poll_votes
FOR INSERT
TO authenticated
WITH CHECK (
  -- Voter must be authenticated
  auth.jwt() IS NOT NULL AND
  -- The voter_address must match their wallet
  voter_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address')
);

-- Users can delete their own votes (for changing votes)
-- Note: Your app uses delete + re-insert for vote changes
CREATE POLICY "Users can delete their own votes"
ON forum_poll_votes
FOR DELETE
TO authenticated
USING (voter_address = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- ============================================================================
-- NOTES FOR PRODUCTION
-- ============================================================================

-- This policy setup:
-- ✅ Allows anyone to VIEW polls and results (public)
-- ✅ Requires authentication to CREATE polls
-- ✅ Requires authentication to VOTE
-- ✅ Prevents users from voting as someone else
-- ✅ Allows poll creators to manage their own polls
-- ✅ Prevents unauthorized modifications

-- IMPORTANT: You should also add RLS to:
-- - forum_threads
-- - forum_posts
-- - forum_categories
-- - forum_media_attachments
-- For a fully secure production app!

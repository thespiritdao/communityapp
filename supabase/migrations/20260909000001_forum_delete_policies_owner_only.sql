-- 20260909000001_forum_delete_policies_owner_only.sql
--
-- Forum DELETE policies were "any authenticated user may delete any thread /
-- post" (scripts/db-migrations/002_forum_posts_rls_policies.sql, policies
-- "Authenticated users can delete threads" / "Authenticated users can delete
-- posts"). They were added so moderators could hard-delete via the client,
-- but moderation has since moved to POST /api/forum/moderate, which verifies
-- the forumModeration hat on-chain and deletes with the service role.
--
-- This migration restricts client-side DELETE to the author. Moderators keep
-- their path through the API route (service role bypasses RLS).
--
-- Apply by hand per supabase/migrations/README.md.

-- ── forum_threads ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can delete threads" ON forum_threads;
DROP POLICY IF EXISTS "Thread authors can delete their threads" ON forum_threads;

CREATE POLICY "Thread authors can delete their threads"
  ON forum_threads FOR DELETE
  TO authenticated
  USING (
    lower(author_address) = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
    OR
    lower(author_address) = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
  );

-- ── forum_posts ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can delete posts" ON forum_posts;
DROP POLICY IF EXISTS "Post creators can delete their posts" ON forum_posts;

CREATE POLICY "Post creators can delete their posts"
  ON forum_posts FOR DELETE
  TO authenticated
  USING (
    lower(author_address) = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
    OR
    lower(author_address) = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
  );

-- Verify:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename IN ('forum_threads','forum_posts') AND cmd = 'DELETE';

-- 20260909000003_forum_threads_update_author_only.sql
--
-- pg_policies on the live database (2026-09-09) showed an UPDATE policy
-- "Moderators can update threads" on forum_threads with USING (true) for
-- every authenticated user. Despite the name, any signed-in member could
-- edit, lock, or pin any thread through the database client.
--
-- Moderation (pin / unpin / lock / unlock) runs through
-- POST /api/forum/moderate, which verifies the forumModeration hat on-chain
-- and writes with the service role (bypasses RLS). The author-only policy
-- "Thread creators can update their threads" stays. So the permissive policy
-- can simply go.
--
-- Apply by hand per supabase/migrations/README.md.

DROP POLICY IF EXISTS "Moderators can update threads" ON public.forum_threads;

-- Verify: only the author policy should remain for UPDATE.
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'forum_threads'
  AND cmd = 'UPDATE';

-- 20260909000002_forum_delete_policies_dynamic.sql
--
-- Follow-up to 20260909000001. A functional test after that migration showed
-- a non-author could still DELETE a forum_threads row, so a permissive DELETE
-- policy exists on the live database under a name the repo never recorded
-- (policies are OR'ed: one leftover is enough).
--
-- This migration drops EVERY DELETE policy on forum_threads and forum_posts,
-- whatever its name, then recreates the author-only rule. It leaves SELECT /
-- INSERT / UPDATE and FOR ALL policies untouched (a FOR ALL policy may be what
-- grants read access) but RAISEs a NOTICE listing any FOR ALL policies so they
-- can be reviewed separately. Moderators keep POST /api/forum/moderate
-- (service role, bypasses RLS).
--
-- Apply by hand in the Supabase SQL editor; read the NOTICE output.

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, roles, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('forum_threads', 'forum_posts')
      AND cmd = 'DELETE'
  LOOP
    RAISE NOTICE 'dropping DELETE policy % on % (roles=%, using=%)',
      pol.policyname, pol.tablename, pol.roles, pol.qual;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;

  FOR pol IN
    SELECT tablename, policyname, roles, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('forum_threads', 'forum_posts')
      AND cmd = 'ALL'
  LOOP
    RAISE NOTICE 'REVIEW: FOR ALL policy % on % (roles=%, using=%) also permits DELETE if it is permissive for authenticated users',
      pol.policyname, pol.tablename, pol.roles, pol.qual;
  END LOOP;
END $$;

CREATE POLICY "Thread authors can delete their threads"
  ON public.forum_threads FOR DELETE
  TO authenticated
  USING (
    lower(author_address) = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
    OR
    lower(author_address) = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
  );

CREATE POLICY "Post creators can delete their posts"
  ON public.forum_posts FOR DELETE
  TO authenticated
  USING (
    lower(author_address) = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
    OR
    lower(author_address) = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
  );

-- Verify (paste the output back if anything looks off):
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('forum_threads', 'forum_posts')
ORDER BY tablename, cmd, policyname;

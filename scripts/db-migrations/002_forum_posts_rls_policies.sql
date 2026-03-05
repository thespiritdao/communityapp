-- Fix: Restore RLS policies for forum_posts and forum_threads
-- These were wiped when 002_forum_complete_schema_v4.sql dropped and recreated
-- the tables without re-creating their policies.

-- ============================================================================
-- forum_posts
-- ============================================================================

ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read posts
DROP POLICY IF EXISTS "Anyone can view posts" ON forum_posts;
CREATE POLICY "Anyone can view posts"
  ON forum_posts FOR SELECT
  TO public
  USING (true);

-- Authenticated users can insert — author_address must match their JWT wallet
DROP POLICY IF EXISTS "Authenticated users can create posts" ON forum_posts;
CREATE POLICY "Authenticated users can create posts"
  ON forum_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (
      -- Top-level claim (new JWTs)
      author_address = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
      OR
      -- Nested under user_metadata (legacy JWTs)
      author_address = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
    )
  );

-- Authors can update their own posts
DROP POLICY IF EXISTS "Post creators can update their posts" ON forum_posts;
CREATE POLICY "Post creators can update their posts"
  ON forum_posts FOR UPDATE
  TO authenticated
  USING (
    author_address = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
    OR
    author_address = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
  );

-- Authors can delete their own posts
DROP POLICY IF EXISTS "Post creators can delete their posts" ON forum_posts;
CREATE POLICY "Post creators can delete their posts"
  ON forum_posts FOR DELETE
  TO authenticated
  USING (
    author_address = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
    OR
    author_address = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
  );

-- ============================================================================
-- forum_threads
-- ============================================================================

ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;

-- Anyone can read threads
DROP POLICY IF EXISTS "Anyone can view threads" ON forum_threads;
CREATE POLICY "Anyone can view threads"
  ON forum_threads FOR SELECT
  TO public
  USING (true);

-- Authenticated users can create threads
DROP POLICY IF EXISTS "Authenticated users can create threads" ON forum_threads;
CREATE POLICY "Authenticated users can create threads"
  ON forum_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (
      author_address = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
      OR
      author_address = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
    )
  );

-- Authors can update their own threads
DROP POLICY IF EXISTS "Thread creators can update their threads" ON forum_threads;
CREATE POLICY "Thread creators can update their threads"
  ON forum_threads FOR UPDATE
  TO authenticated
  USING (
    author_address = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
    OR
    author_address = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
  );

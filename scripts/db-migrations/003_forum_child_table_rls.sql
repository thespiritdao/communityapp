-- Re-enable RLS on forum child tables that were disabled during moderation debugging.
-- The moderation API now uses supabaseAdmin (service role) which bypasses RLS entirely,
-- so these tables are safe to protect with RLS again.

-- forum_thread_summaries
ALTER TABLE forum_thread_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view thread summaries" ON forum_thread_summaries;
CREATE POLICY "Anyone can view thread summaries"
  ON forum_thread_summaries FOR SELECT
  TO public
  USING (true);

-- forum_proposal_links
ALTER TABLE forum_proposal_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view proposal links" ON forum_proposal_links;
CREATE POLICY "Anyone can view proposal links"
  ON forum_proposal_links FOR SELECT
  TO public
  USING (true);

-- forum_post_reports (only visible to authenticated users)
ALTER TABLE forum_post_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view reports" ON forum_post_reports;
CREATE POLICY "Authenticated users can view reports"
  ON forum_post_reports FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create reports" ON forum_post_reports;
CREATE POLICY "Authenticated users can create reports"
  ON forum_post_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt() IS NOT NULL);

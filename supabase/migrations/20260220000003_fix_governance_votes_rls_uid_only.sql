-- Definitive governance_votes RLS fix
-- PROBLEM: JWT user_metadata.wallet_address is unreliable across session types.
--          Custom JWTs are replaced by Supabase-issued tokens after setSession().
--          Supabase-issued tokens only carry what is in auth.users.raw_user_meta_data.
--
-- SOLUTION: Drop JWT claim dependency entirely.
--           Use auth.uid() → user_profiles.wallet_address join instead.
--           auth.uid() is always reliable (it is the 'sub' claim, always present).
--           user_profiles has wallet_address indexed on user_id.

DROP POLICY IF EXISTS "governance_votes_select_all" ON governance_votes;
DROP POLICY IF EXISTS "governance_votes_insert_own" ON governance_votes;
DROP POLICY IF EXISTS "governance_votes_update_own" ON governance_votes;
DROP POLICY IF EXISTS "Anyone can view governance votes" ON governance_votes;
DROP POLICY IF EXISTS "Users can insert their own votes" ON governance_votes;
DROP POLICY IF EXISTS "Users can update their own votes" ON governance_votes;

ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;

-- SELECT: public read (transparency)
CREATE POLICY "governance_votes_select_all" ON governance_votes
  FOR SELECT
  USING (true);

-- INSERT: voter_address must match the wallet on file for the authenticated user
CREATE POLICY "governance_votes_insert_own" ON governance_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    LOWER(voter_address) = (
      SELECT LOWER(wallet_address)
      FROM user_profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- UPDATE: same check (handles upsert on-conflict path)
CREATE POLICY "governance_votes_update_own" ON governance_votes
  FOR UPDATE
  TO authenticated
  USING (
    LOWER(voter_address) = (
      SELECT LOWER(wallet_address)
      FROM user_profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    LOWER(voter_address) = (
      SELECT LOWER(wallet_address)
      FROM user_profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

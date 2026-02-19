-- Fix governance_votes RLS: add user_profiles fallback for existing users
-- ROOT CAUSE: Existing Supabase auth users had no wallet_address in
-- raw_user_meta_data, so their JWTs lacked it. Auth route now patches this,
-- but existing browser sessions still have old JWTs without wallet_address.
-- This policy accepts votes where the voter_address matches EITHER:
--   (a) auth.jwt() -> 'user_metadata' ->> 'wallet_address'  (new sessions)
--   (b) user_profiles.wallet_address where user_id = auth.uid() (old sessions)

DROP POLICY IF EXISTS "governance_votes_select_all" ON governance_votes;
DROP POLICY IF EXISTS "governance_votes_insert_own" ON governance_votes;
DROP POLICY IF EXISTS "governance_votes_update_own" ON governance_votes;
DROP POLICY IF EXISTS "Anyone can view governance votes" ON governance_votes;
DROP POLICY IF EXISTS "Users can insert their own votes" ON governance_votes;
DROP POLICY IF EXISTS "Users can update their own votes" ON governance_votes;

ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone can read
CREATE POLICY "governance_votes_select_all" ON governance_votes
  FOR SELECT
  USING (true);

-- INSERT: wallet must match JWT user_metadata OR user_profiles lookup
CREATE POLICY "governance_votes_insert_own" ON governance_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    OR
    LOWER(voter_address) = (
      SELECT LOWER(wallet_address)
      FROM user_profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- UPDATE: same dual-path check (covers upsert on-conflict path)
CREATE POLICY "governance_votes_update_own" ON governance_votes
  FOR UPDATE
  TO authenticated
  USING (
    LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    OR
    LOWER(voter_address) = (
      SELECT LOWER(wallet_address)
      FROM user_profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    OR
    LOWER(voter_address) = (
      SELECT LOWER(wallet_address)
      FROM user_profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

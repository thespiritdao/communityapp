-- Definitive fix for governance_votes RLS policies
-- Drops ALL existing policies and recreates them with the correct JWT path
-- JWT structure: user_metadata.wallet_address (NOT top-level wallet_address)

-- Drop every known policy name variant to ensure clean slate
DROP POLICY IF EXISTS "Anyone can view governance votes" ON governance_votes;
DROP POLICY IF EXISTS "Users can insert their own votes" ON governance_votes;
DROP POLICY IF EXISTS "Users can update their own votes" ON governance_votes;
DROP POLICY IF EXISTS "governance_votes_select_all" ON governance_votes;
DROP POLICY IF EXISTS "governance_votes_insert_own" ON governance_votes;
DROP POLICY IF EXISTS "governance_votes_update_own" ON governance_votes;

ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone can read (transparency)
CREATE POLICY "governance_votes_select_all" ON governance_votes
  FOR SELECT
  USING (true);

-- INSERT: voter_address must match the authenticated wallet
CREATE POLICY "governance_votes_insert_own" ON governance_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
  );

-- UPDATE: same wallet check (handles upsert on-conflict path)
CREATE POLICY "governance_votes_update_own" ON governance_votes
  FOR UPDATE
  TO authenticated
  USING (
    LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
  )
  WITH CHECK (
    LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
  );

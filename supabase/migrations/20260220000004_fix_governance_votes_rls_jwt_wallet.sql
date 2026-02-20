-- Revert governance_votes RLS to JWT user_metadata.wallet_address check.
--
-- WHY: The auth.uid() → user_profiles lookup (previous approach) fails because
-- the session JWT is signed by us with a specific sub (userId from user_profiles),
-- but email-based session flows (generateLink/verify) can resolve to a different
-- auth.users row for the same email — leaving auth.uid() with no matching
-- user_profiles row.
--
-- The wallet-based JWT approach embeds wallet_address directly in user_metadata.
-- That claim is always correct regardless of which auth.users row is active,
-- because we sign it ourselves with the wallet address we resolved from
-- user_profiles via the wallet_address lookup in the auth route.
--
-- This is safe: the JWT is signed with SUPABASE_JWT_SECRET (server-only).
-- A client cannot forge wallet_address in user_metadata without that secret.

-- Drop all current governance_votes policies
DROP POLICY IF EXISTS "governance_votes_insert_own" ON governance_votes;
DROP POLICY IF EXISTS "governance_votes_update_own" ON governance_votes;
DROP POLICY IF EXISTS "governance_votes_select_all" ON governance_votes;

-- Recreate with JWT user_metadata path
CREATE POLICY "governance_votes_insert_own" ON governance_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
  );

CREATE POLICY "governance_votes_update_own" ON governance_votes
  FOR UPDATE TO authenticated
  USING (
    LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
  )
  WITH CHECK (
    LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
  );

CREATE POLICY "governance_votes_select_all" ON governance_votes
  FOR SELECT TO public
  USING (true);

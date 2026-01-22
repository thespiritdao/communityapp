-- Fix governance_votes RLS to use wallet_address from user_metadata in JWT
-- ROOT CAUSE: wallet_address is in auth.jwt() -> 'user_metadata' ->> 'wallet_address'
--             NOT in auth.jwt() ->> 'wallet_address' (top-level claim)
-- SECONDARY FIX: Case-insensitive comparison (0xABC vs 0xabc)

-- Drop existing policies
DROP POLICY IF EXISTS "governance_votes_select_all" ON governance_votes;
DROP POLICY IF EXISTS "governance_votes_insert_own" ON governance_votes;
DROP POLICY IF EXISTS "governance_votes_update_own" ON governance_votes;

-- Ensure RLS is enabled
ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone can view all votes (transparency)
CREATE POLICY "governance_votes_select_all" ON governance_votes
    FOR SELECT
    USING (true);

-- Policy 2: Authenticated users can insert votes with their own wallet address
-- CRITICAL: wallet_address is nested in user_metadata, not a top-level claim
CREATE POLICY "governance_votes_insert_own" ON governance_votes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Vote must be from the authenticated user's wallet address
        -- Use LOWER() for case-insensitive comparison (0xABC vs 0xabc)
        LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    );

-- Policy 3: Users can update only their own votes
CREATE POLICY "governance_votes_update_own" ON governance_votes
    FOR UPDATE
    TO authenticated
    USING (
        -- Can only update their own votes
        LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    )
    WITH CHECK (
        -- Cannot change the voter address
        LOWER(voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    );

-- No DELETE policy (votes cannot be deleted - maintains audit trail)

-- Verify the fix
DO $$
DECLARE
    sample_jwt jsonb;
BEGIN
    -- Example JWT structure for documentation
    sample_jwt := '{
        "sub": "uuid-user-id",
        "user_metadata": {
            "wallet_address": "0x1234...5678"
        },
        "role": "authenticated"
    }'::jsonb;

    RAISE NOTICE '✅ governance_votes RLS policies updated to use user_metadata.wallet_address';
    RAISE NOTICE '';
    RAISE NOTICE 'JWT structure found in your app:';
    RAISE NOTICE '  - sub: % (user UUID)', sample_jwt->>'sub';
    RAISE NOTICE '  - user_metadata.wallet_address: % (wallet address)', sample_jwt->'user_metadata'->>'wallet_address';
    RAISE NOTICE '  - role: % (user role)', sample_jwt->>'role';
    RAISE NOTICE '';
    RAISE NOTICE 'RLS checks: LOWER(voter_address) = LOWER(auth.jwt() -> ''user_metadata'' ->> ''wallet_address'')';
    RAISE NOTICE '(Case-insensitive comparison to handle 0xABC vs 0xabc)';
END $$;

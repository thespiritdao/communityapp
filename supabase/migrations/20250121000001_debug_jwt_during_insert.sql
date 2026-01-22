-- Debug: Check what JWT Postgres actually sees during governance_votes INSERT
-- This will help diagnose if the session is being sent with the request

-- Create a logging table for JWT debugging
CREATE TABLE IF NOT EXISTS governance_votes_jwt_debug (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    jwt_sub TEXT,
    jwt_role TEXT,
    jwt_wallet_address TEXT,
    jwt_user_metadata JSONB,
    jwt_full JSONB,
    voter_address_attempted TEXT,
    rls_check_result BOOLEAN
);

-- Create a function that logs JWT state during INSERT attempts
CREATE OR REPLACE FUNCTION log_governance_vote_jwt()
RETURNS TRIGGER AS $$
BEGIN
    -- Log what the JWT looks like at insert time
    INSERT INTO governance_votes_jwt_debug (
        jwt_sub,
        jwt_role,
        jwt_wallet_address,
        jwt_user_metadata,
        jwt_full,
        voter_address_attempted,
        rls_check_result
    ) VALUES (
        auth.jwt() ->> 'sub',
        auth.jwt() ->> 'role',
        auth.jwt() ->> 'wallet_address',  -- Top-level (will be NULL)
        auth.jwt() -> 'user_metadata',     -- Nested object
        auth.jwt(),                        -- Full JWT
        NEW.voter_address,
        -- Check if the RLS condition would pass
        LOWER(NEW.voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS governance_votes_jwt_logger ON governance_votes;

-- Create trigger that fires BEFORE INSERT (before RLS checks)
CREATE TRIGGER governance_votes_jwt_logger
    BEFORE INSERT ON governance_votes
    FOR EACH ROW
    EXECUTE FUNCTION log_governance_vote_jwt();

-- Grant access to the debug table
GRANT SELECT ON governance_votes_jwt_debug TO authenticated, anon;

-- Show instructions
DO $$
BEGIN
    RAISE NOTICE '🔍 JWT Debug logging enabled for governance_votes';
    RAISE NOTICE '';
    RAISE NOTICE 'After attempting to vote, run this query to see what JWT Postgres received:';
    RAISE NOTICE '';
    RAISE NOTICE 'SELECT * FROM governance_votes_jwt_debug ORDER BY created_at DESC LIMIT 5;';
    RAISE NOTICE '';
    RAISE NOTICE 'Key fields to check:';
    RAISE NOTICE '  - jwt_role: Should be "authenticated", not "anon"';
    RAISE NOTICE '  - jwt_wallet_address: Should be NULL (its in user_metadata)';
    RAISE NOTICE '  - jwt_user_metadata: Should contain {"wallet_address": "0x..."}';
    RAISE NOTICE '  - rls_check_result: Should be TRUE if the check would pass';
END $$;

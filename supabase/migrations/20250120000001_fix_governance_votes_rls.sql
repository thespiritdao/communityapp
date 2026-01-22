-- Fix governance_votes RLS policies
-- Problem: Multiple conflicting policies causing RLS violations
-- Solution: Drop all existing policies and create a clean minimal set

-- Drop all existing policies on governance_votes
DROP POLICY IF EXISTS "Anyone can view governance votes" ON governance_votes;
DROP POLICY IF EXISTS "Authenticated users can vote" ON governance_votes;
DROP POLICY IF EXISTS "Users can insert their own votes" ON governance_votes;
DROP POLICY IF EXISTS "Users can update their own votes" ON governance_votes;
DROP POLICY IF EXISTS "Users cannot update votes" ON governance_votes;
DROP POLICY IF EXISTS "Votes are viewable by everyone" ON governance_votes;

-- Ensure RLS is enabled
ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone can view all votes (transparency)
CREATE POLICY "governance_votes_select_all" ON governance_votes
    FOR SELECT
    USING (true);

-- Policy 2: Authenticated users can insert votes with their own address
CREATE POLICY "governance_votes_insert_own" ON governance_votes
    FOR INSERT
    WITH CHECK (
        -- User must be authenticated
        auth.jwt() IS NOT NULL
        -- Vote must be from the authenticated user's wallet address
        AND voter_address = (auth.jwt() ->> 'sub')
    );

-- Policy 3: Users can update only their own votes
CREATE POLICY "governance_votes_update_own" ON governance_votes
    FOR UPDATE
    USING (
        -- User must be authenticated
        auth.jwt() IS NOT NULL
        -- Can only update their own votes
        AND voter_address = (auth.jwt() ->> 'sub')
    )
    WITH CHECK (
        -- Cannot change the voter address
        voter_address = (auth.jwt() ->> 'sub')
    );

-- No DELETE policy (votes cannot be deleted - maintains audit trail)

-- Verify policies
DO $$
BEGIN
    RAISE NOTICE 'governance_votes RLS policies updated successfully';
    RAISE NOTICE 'Active policies:';
    RAISE NOTICE '  - governance_votes_select_all (SELECT)';
    RAISE NOTICE '  - governance_votes_insert_own (INSERT)';
    RAISE NOTICE '  - governance_votes_update_own (UPDATE)';
END $$;

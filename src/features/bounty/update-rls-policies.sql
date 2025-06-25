-- Update RLS Policies for Bounty System
-- Run this in your Supabase SQL editor to fix the 401 Unauthorized errors

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can create bounties" ON bounties;
DROP POLICY IF EXISTS "Bounty creators can update their bounties" ON bounties;
DROP POLICY IF EXISTS "Authenticated users can create bids" ON bids;
DROP POLICY IF EXISTS "Bid creators can update their bids" ON bids;

-- Create new permissive policies
CREATE POLICY "Anyone can create bounties" ON bounties
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update bounties" ON bounties
    FOR UPDATE USING (true);

CREATE POLICY "Anyone can create bids" ON bids
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update bids" ON bids
    FOR UPDATE USING (true);

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename IN ('bounties', 'bids')
ORDER BY tablename, policyname; 
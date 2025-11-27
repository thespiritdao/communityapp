-- FINAL FIX: Hat Metadata Cache RLS Policy
-- Issue: Users without authentication cannot insert metadata when creating pods
-- Solution: Allow public inserts for metadata (it's public data anyway)

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow read access to hat metadata" ON hat_metadata_cache;
DROP POLICY IF EXISTS "Allow insert of hat metadata for authenticated users" ON hat_metadata_cache;
DROP POLICY IF EXISTS "Allow update of hat metadata for authenticated users" ON hat_metadata_cache;
DROP POLICY IF EXISTS "Enable read access for authenticated users and service role" ON hat_metadata_cache;
DROP POLICY IF EXISTS "Enable insert for authenticated users and service role" ON hat_metadata_cache;
DROP POLICY IF EXISTS "Enable update for authenticated users and service role" ON hat_metadata_cache;

-- Create permissive policies
-- HAT metadata is public information, so we allow broad access

-- Policy 1: Anyone can read metadata (it's public blockchain data)
CREATE POLICY "Public read access for hat metadata" ON hat_metadata_cache
    FOR SELECT
    USING (true);

-- Policy 2: Anyone can insert metadata (pod creators need this)
-- We allow anon, authenticated, and service_role
CREATE POLICY "Public insert access for hat metadata" ON hat_metadata_cache
    FOR INSERT
    WITH CHECK (true);

-- Policy 3: Only authenticated users and service role can update
-- This provides some protection against malicious updates
CREATE POLICY "Authenticated update access for hat metadata" ON hat_metadata_cache
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' OR
        auth.role() = 'service_role'
    );

-- Policy 4: Only authenticated users and service role can delete
-- This provides protection against malicious deletions
CREATE POLICY "Authenticated delete access for hat metadata" ON hat_metadata_cache
    FOR DELETE
    USING (
        auth.role() = 'authenticated' OR
        auth.role() = 'service_role'
    );

-- Ensure proper grants are in place
GRANT SELECT, INSERT ON hat_metadata_cache TO anon;
GRANT ALL ON hat_metadata_cache TO authenticated;
GRANT ALL ON hat_metadata_cache TO service_role;

-- Grant sequence access if needed
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Verify RLS is enabled
ALTER TABLE hat_metadata_cache ENABLE ROW LEVEL SECURITY;

-- Add comment explaining the permissive policy
COMMENT ON TABLE hat_metadata_cache IS
'Cache/storage for HAT metadata. Permissive RLS policies allow public read/insert because HAT metadata is public blockchain data. Only updates/deletes require authentication.';

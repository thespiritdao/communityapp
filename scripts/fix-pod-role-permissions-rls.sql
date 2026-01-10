-- Fix RLS Policy for pod_role_permissions table
--
-- Problem: Current RLS policy is blocking queries that filter by token_address column
-- This causes 406 (Not Acceptable) errors across the entire application
--
-- Solution: Allow SELECT queries with token_address in WHERE clause

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Allow read access to pod_role_permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON pod_role_permissions;
DROP POLICY IF EXISTS "Enable read access for all users" ON pod_role_permissions;

-- Create permissive SELECT policy
-- This allows filtering by ANY column including token_address
CREATE POLICY "Allow all SELECT queries on pod_role_permissions"
ON pod_role_permissions
FOR SELECT
USING (true);

-- Keep existing write policies (if any) intact
-- Only service role should be able to INSERT/UPDATE/DELETE

-- Verify the policy is active
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'pod_role_permissions'
ORDER BY policyname;

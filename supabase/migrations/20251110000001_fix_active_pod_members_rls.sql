-- Fix RLS policy for pod_members table (underlying table for active_pod_members view)
-- Date: 2025-11-10
-- Issue: 406 error when accessing active_pod_members view - RLS blocking access on underlying table

-- active_pod_members is a VIEW, so we need to apply RLS to the underlying table: pod_members

-- Drop existing restrictive policies if any
DROP POLICY IF EXISTS "Users can view active pod members" ON pod_members;
DROP POLICY IF EXISTS "Pod members can view active members" ON pod_members;
DROP POLICY IF EXISTS "Restrict pod_members access" ON pod_members;

-- Create comprehensive RLS policy for pod_members table
-- Allow authenticated users to read pod members
CREATE POLICY "Authenticated users can view pod members"
  ON pod_members
  FOR SELECT
  USING (
    -- Allow if user is authenticated
    auth.role() = 'authenticated'
  );

-- Add comment
COMMENT ON POLICY "Authenticated users can view pod members" ON pod_members IS
  'Allows authenticated users to view pod members (fixes 406 errors on active_pod_members view). Updated 2025-11-10.';

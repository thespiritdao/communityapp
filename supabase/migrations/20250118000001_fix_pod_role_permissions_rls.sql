-- Fix RLS policies for pod_role_permissions table
-- Date: 2025-01-18
-- Issue: 406 Not Acceptable errors when querying pod_role_permissions
-- Root cause: Missing or overly restrictive RLS policies

-- Enable RLS if not already enabled
ALTER TABLE pod_role_permissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow authenticated users to read pod_role_permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Allow pod leaders to manage role permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Allow public read access to pod_role_permissions" ON pod_role_permissions;

-- Create a permissive read policy for authenticated users
-- This allows any authenticated user to read role permissions for any pod
-- (Role permissions define what a role CAN do, not who HAS that role)
CREATE POLICY "Allow authenticated users to read pod_role_permissions"
ON pod_role_permissions
FOR SELECT
TO authenticated
USING (true);

-- Create a permissive read policy for anonymous users
-- This allows public visibility of pod role structures
CREATE POLICY "Allow public read access to pod_role_permissions"
ON pod_role_permissions
FOR SELECT
TO anon
USING (true);

-- Allow pod leaders to manage role permissions
-- This policy allows INSERT, UPDATE, DELETE for users who are pod leaders
CREATE POLICY "Allow pod leaders to manage role permissions"
ON pod_role_permissions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    WHERE apm.pod_id = pod_role_permissions.pod_id
    AND apm.wallet = auth.jwt() ->> 'wallet_address'
    AND apm.membership_type = 'leader'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    WHERE apm.pod_id = pod_role_permissions.pod_id
    AND apm.wallet = auth.jwt() ->> 'wallet_address'
    AND apm.membership_type = 'leader'
  )
);

-- Add helpful comment
COMMENT ON TABLE pod_role_permissions IS
  'Stores role-specific permissions and eligibility criteria for pods. RLS policies allow public reads and leader writes.';

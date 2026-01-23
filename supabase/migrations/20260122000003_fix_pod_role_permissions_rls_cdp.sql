-- Fix RLS policies for pod_role_permissions table (CDP Wallet Compatible)
-- Date: 2026-01-22
-- Issue: RLS blocking role permission updates with CDP embedded wallets
-- Root cause: Policy requires wallet_address in JWT, but CDP uses different auth flow

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to read pod_role_permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Allow public read access to pod_role_permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Allow pod leaders to manage role permissions" ON pod_role_permissions;

-- Create permissive read policy for authenticated users
-- Role permissions define what a role CAN do, not who HAS that role
CREATE POLICY "Allow authenticated users to read pod_role_permissions"
ON pod_role_permissions
FOR SELECT
TO authenticated
USING (true);

-- Create permissive read policy for anonymous users
CREATE POLICY "Allow public read access to pod_role_permissions"
ON pod_role_permissions
FOR SELECT
TO anon
USING (true);

-- Allow pod leaders and authorized members to manage role permissions
-- Checks multiple sources with case-insensitive comparison
CREATE POLICY "Allow pod leaders to manage role permissions"
ON pod_role_permissions
FOR ALL
TO authenticated
USING (
  -- Check 1: User is in active_pod_members as leader
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    WHERE apm.pod_id = pod_role_permissions.pod_id
    AND LOWER(apm.wallet) = LOWER(COALESCE(
      auth.jwt() ->> 'wallet_address',
      auth.jwt() ->> 'sub',
      (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    ))
    AND apm.membership_type = 'leader'
  )
  OR
  -- Check 2: User is in pod_leads array (for newly created pods)
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_role_permissions.pod_id
    AND LOWER(COALESCE(
      auth.jwt() ->> 'wallet_address',
      auth.jwt() ->> 'sub',
      (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    )) = ANY(
      SELECT LOWER(unnest(p.pod_leads))
    )
  )
  OR
  -- Check 3: User is the pod creator
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_role_permissions.pod_id
    AND LOWER(p.created_by_address) = LOWER(COALESCE(
      auth.jwt() ->> 'wallet_address',
      auth.jwt() ->> 'sub',
      (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    ))
  )
  OR
  -- Check 4: User has member_management or role_assignment permission in this pod
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp ON prp.id = apm.role_id
    WHERE apm.pod_id = pod_role_permissions.pod_id
    AND LOWER(apm.wallet) = LOWER(COALESCE(
      auth.jwt() ->> 'wallet_address',
      auth.jwt() ->> 'sub',
      (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    ))
    AND (
      (prp.permissions->>'member_management')::boolean = true
      OR (prp.permissions->>'role_assignment')::boolean = true
    )
  )
)
WITH CHECK (
  -- Same checks for INSERT/UPDATE/DELETE
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    WHERE apm.pod_id = pod_role_permissions.pod_id
    AND LOWER(apm.wallet) = LOWER(COALESCE(
      auth.jwt() ->> 'wallet_address',
      auth.jwt() ->> 'sub',
      (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    ))
    AND apm.membership_type = 'leader'
  )
  OR
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_role_permissions.pod_id
    AND LOWER(COALESCE(
      auth.jwt() ->> 'wallet_address',
      auth.jwt() ->> 'sub',
      (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    )) = ANY(
      SELECT LOWER(unnest(p.pod_leads))
    )
  )
  OR
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_role_permissions.pod_id
    AND LOWER(p.created_by_address) = LOWER(COALESCE(
      auth.jwt() ->> 'wallet_address',
      auth.jwt() ->> 'sub',
      (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    ))
  )
  OR
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp ON prp.id = apm.role_id
    WHERE apm.pod_id = pod_role_permissions.pod_id
    AND LOWER(apm.wallet) = LOWER(COALESCE(
      auth.jwt() ->> 'wallet_address',
      auth.jwt() ->> 'sub',
      (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    ))
    AND (
      (prp.permissions->>'member_management')::boolean = true
      OR (prp.permissions->>'role_assignment')::boolean = true
    )
  )
);

-- Add helpful comment
COMMENT ON POLICY "Allow pod leaders to manage role permissions" ON pod_role_permissions IS
  'Allows pod leaders and authorized members to manage role permissions. CDP wallet compatible. Checks active_pod_members, pod_leads array, pod creator, and member_management/role_assignment permissions. Uses case-insensitive address comparison and multiple JWT field fallbacks.';

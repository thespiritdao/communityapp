-- Fix RLS policies for pod_role_permissions table (CDP Wallet Compatible) - V2
-- Date: 2026-01-22
-- Issue: RLS blocking role permission updates with CDP embedded wallets
-- Fix: Removed problematic join, simplified to essential checks only

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to read pod_role_permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Allow public read access to pod_role_permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Allow pod leaders to manage role permissions" ON pod_role_permissions;

-- Create permissive read policy for authenticated users
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
-- Simplified version without problematic joins
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
      (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    ))
    AND apm.membership_type = 'leader'
  )
  OR
  -- Check 2: User is in pod_leads array
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_role_permissions.pod_id
    AND LOWER(COALESCE(
      auth.jwt() ->> 'wallet_address',
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
      (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    ))
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
      (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    ))
  )
);

-- Add helpful comment
COMMENT ON POLICY "Allow pod leaders to manage role permissions" ON pod_role_permissions IS
  'CDP wallet compatible. Checks active_pod_members (leaders), pod_leads array, and pod creator. Uses case-insensitive address comparison with user_metadata fallback.';

-- Fix RLS policies for pod_role_permissions table (V2)
-- Date: 2026-01-16
-- Issue: RLS blocking role permission updates for pod leaders
-- Root cause: Policy only checks active_pod_members, misses pod_leads array

-- Drop existing leader policy
DROP POLICY IF EXISTS "Allow pod leaders to manage role permissions" ON pod_role_permissions;

-- Create enhanced policy that checks multiple sources
CREATE POLICY "Allow pod leaders to manage role permissions"
ON pod_role_permissions
FOR ALL
TO authenticated
USING (
  -- Check if user is in active_pod_members as leader
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    WHERE apm.pod_id = pod_role_permissions.pod_id
    AND LOWER(apm.wallet) = LOWER(auth.jwt() ->> 'wallet_address')
    AND apm.membership_type = 'leader'
  )
  OR
  -- ALSO check if user is in pod_leads array (for newly created pods)
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_role_permissions.pod_id
    AND LOWER(auth.jwt() ->> 'wallet_address') = ANY(
      SELECT LOWER(unnest(p.pod_leads))
    )
  )
  OR
  -- ALSO check if user is the pod creator
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_role_permissions.pod_id
    AND LOWER(p.created_by_address) = LOWER(auth.jwt() ->> 'wallet_address')
  )
)
WITH CHECK (
  -- Same checks for INSERT/UPDATE
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    WHERE apm.pod_id = pod_role_permissions.pod_id
    AND LOWER(apm.wallet) = LOWER(auth.jwt() ->> 'wallet_address')
    AND apm.membership_type = 'leader'
  )
  OR
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_role_permissions.pod_id
    AND LOWER(auth.jwt() ->> 'wallet_address') = ANY(
      SELECT LOWER(unnest(p.pod_leads))
    )
  )
  OR
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_role_permissions.pod_id
    AND LOWER(p.created_by_address) = LOWER(auth.jwt() ->> 'wallet_address')
  )
);

-- Add helpful comment
COMMENT ON POLICY "Allow pod leaders to manage role permissions" ON pod_role_permissions IS
  'Allows pod leaders to manage role permissions. Checks active_pod_members, pod_leads array, and pod creator. Uses case-insensitive address comparison.';

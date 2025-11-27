-- Fix RLS policies for pod_membership_applications - CORRECTED VERSION
-- Issue: Previous version used auth.jwt()->>'wallet_address' which doesn't exist
-- Solution: Use (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) pattern like other working policies

-- Drop the incorrect policies
DROP POLICY IF EXISTS "pod_leaders_can_update_applications" ON pod_membership_applications;
DROP POLICY IF EXISTS "pod_leaders_can_read_applications" ON pod_membership_applications;

-- Create CORRECT policy: Pod leaders can UPDATE applications
CREATE POLICY "pod_leaders_can_update_applications" ON pod_membership_applications
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_membership_applications.pod_id
      AND (
        -- Use the correct authentication pattern
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(p.pod_leads)
        OR LOWER((SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())) = ANY(
          SELECT LOWER(unnest(p.pod_leads))
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_membership_applications.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(p.pod_leads)
        OR LOWER((SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())) = ANY(
          SELECT LOWER(unnest(p.pod_leads))
        )
      )
  )
);

-- Create CORRECT policy: Pod leaders can READ applications
CREATE POLICY "pod_leaders_can_read_applications" ON pod_membership_applications
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_membership_applications.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(p.pod_leads)
        OR LOWER((SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())) = ANY(
          SELECT LOWER(unnest(p.pod_leads))
        )
      )
  )
  OR LOWER(applicant_address) = LOWER((SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()))
);

-- Ensure RLS is enabled
ALTER TABLE pod_membership_applications ENABLE ROW LEVEL SECURITY;

-- Comment explaining the fix
COMMENT ON POLICY "pod_leaders_can_update_applications" ON pod_membership_applications IS
'Allows pod leaders to update (approve/reject) membership applications. Uses user_profiles table to get wallet_address linked to auth.uid() - matching pattern used throughout codebase.';

COMMENT ON POLICY "pod_leaders_can_read_applications" ON pod_membership_applications IS
'Allows pod leaders to view applications for their pods, and applicants to view their own applications. Uses user_profiles table for authentication.';

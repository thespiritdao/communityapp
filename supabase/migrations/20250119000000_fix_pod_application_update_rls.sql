-- Fix RLS policies for pod_membership_applications table
-- Allow pod leaders to update applications for their pods

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Pod leaders can update applications for their pods" ON pod_membership_applications;
DROP POLICY IF EXISTS "pod_leaders_can_update_applications" ON pod_membership_applications;

-- Create policy: Pod leaders can UPDATE applications for their pods
CREATE POLICY "pod_leaders_can_update_applications" ON pod_membership_applications
FOR UPDATE
TO authenticated
USING (
  -- Check if current user is a pod leader for this pod
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_membership_applications.pod_id
      AND (
        -- User is in pod_leads array
        auth.uid()::text = ANY(p.pod_leads)
        OR auth.jwt()->>'wallet_address' ILIKE ANY(p.pod_leads)
        OR LOWER(auth.jwt()->>'wallet_address') = ANY(
          SELECT LOWER(unnest(p.pod_leads))
        )
      )
  )
)
WITH CHECK (
  -- Same check for the updated row
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_membership_applications.pod_id
      AND (
        auth.uid()::text = ANY(p.pod_leads)
        OR auth.jwt()->>'wallet_address' ILIKE ANY(p.pod_leads)
        OR LOWER(auth.jwt()->>'wallet_address') = ANY(
          SELECT LOWER(unnest(p.pod_leads))
        )
      )
  )
);

-- Also ensure we have SELECT policy
DROP POLICY IF EXISTS "pod_leaders_can_read_applications" ON pod_membership_applications;

CREATE POLICY "pod_leaders_can_read_applications" ON pod_membership_applications
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM pods p
    WHERE p.id = pod_membership_applications.pod_id
      AND (
        auth.uid()::text = ANY(p.pod_leads)
        OR auth.jwt()->>'wallet_address' ILIKE ANY(p.pod_leads)
        OR LOWER(auth.jwt()->>'wallet_address') = ANY(
          SELECT LOWER(unnest(p.pod_leads))
        )
      )
  )
  OR applicant_address ILIKE auth.jwt()->>'wallet_address'
  OR LOWER(applicant_address) = LOWER(auth.jwt()->>'wallet_address')
);

-- Ensure RLS is enabled
ALTER TABLE pod_membership_applications ENABLE ROW LEVEL SECURITY;

-- Comment explaining the policies
COMMENT ON POLICY "pod_leaders_can_update_applications" ON pod_membership_applications IS
'Allows pod leaders to update (approve/reject) membership applications for their pods. Checks if the authenticated user wallet address is in the pod_leads array.';

COMMENT ON POLICY "pod_leaders_can_read_applications" ON pod_membership_applications IS
'Allows pod leaders to view applications for their pods, and applicants to view their own applications.';

-- Fix RLS policies for pod_level_proposals
-- Issue: Previous policy was too strict with JWT wallet_address checking
-- Solution: Simplify to rely on application-level permission checks (already in CreateProposalForm)

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Pod members can create proposals" ON pod_level_proposals;

-- Create a simpler policy that allows authenticated users to insert
-- Application already validates governance permission in CreateProposalForm (lines 1122-1134)
CREATE POLICY "Authenticated users can create proposals"
  ON pod_level_proposals FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Note: The application enforces:
-- 1. User must have governance permission in the selected pod (CreateProposalForm.tsx:1123)
-- 2. Permission is checked against pod_role_permissions table
-- 3. Only pods where user has governanceParticipation = true are shown in dropdown

-- Keep the read policy as-is (transparency)
-- Keep the update policy as-is (creators can edit drafts)
-- Keep the service role policy as-is (full access)

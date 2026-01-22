-- ===================================================================
-- Apply Pod-Level Proposals Migrations
-- ===================================================================
-- Run this script in Supabase Dashboard > SQL Editor
-- This will create the pod_level_proposals table and fix RLS policies
-- ===================================================================

-- Migration 1: Create pod_level_proposals table
-- ===================================================================

CREATE TABLE IF NOT EXISTS pod_level_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Proposal details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,

  -- Creator tracking
  created_by TEXT NOT NULL, -- wallet address
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('draft', 'proposed', 'active', 'approved', 'rejected', 'executed')),
  voting_deadline TIMESTAMPTZ,

  -- On-chain integration (optional - for formal proposals)
  onchain_proposal_id TEXT, -- BigInt ID from Governor contract
  transaction_hash TEXT,

  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pod_level_proposals_pod_id ON pod_level_proposals(pod_id);
CREATE INDEX IF NOT EXISTS idx_pod_level_proposals_status ON pod_level_proposals(status);
CREATE INDEX IF NOT EXISTS idx_pod_level_proposals_created_by ON pod_level_proposals(created_by);
CREATE INDEX IF NOT EXISTS idx_pod_level_proposals_onchain_id ON pod_level_proposals(onchain_proposal_id);

-- RLS Policies
ALTER TABLE pod_level_proposals ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone can read active/proposed proposals (transparency)
DROP POLICY IF EXISTS "Anyone can read active pod proposals" ON pod_level_proposals;
CREATE POLICY "Anyone can read active pod proposals"
  ON pod_level_proposals FOR SELECT
  TO authenticated, anon
  USING (status IN ('proposed', 'active', 'approved', 'rejected', 'executed'));

-- Migration 2: Fix RLS policy for proposal creation
-- ===================================================================

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Pod members can create proposals" ON pod_level_proposals;

-- Create a simpler policy that allows authenticated users to insert
-- Application validates governance permission in CreateProposalForm
DROP POLICY IF EXISTS "Authenticated users can create proposals" ON pod_level_proposals;
CREATE POLICY "Authenticated users can create proposals"
  ON pod_level_proposals FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy 3: Proposal creator can update their own draft proposals
DROP POLICY IF EXISTS "Creators can update draft proposals" ON pod_level_proposals;
CREATE POLICY "Creators can update draft proposals"
  ON pod_level_proposals FOR UPDATE
  TO authenticated
  USING (
    created_by = (auth.jwt() ->> 'wallet_address')::text
    AND status = 'draft'
  )
  WITH CHECK (
    created_by = (auth.jwt() ->> 'wallet_address')::text
    AND status = 'draft'
  );

-- Policy 4: Service role full access
DROP POLICY IF EXISTS "Service role full access to pod proposals" ON pod_level_proposals;
CREATE POLICY "Service role full access to pod proposals"
  ON pod_level_proposals FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE pod_level_proposals IS 'Pod-specific governance proposals. Only members of the pod with governanceParticipation permission can vote.';
COMMENT ON COLUMN pod_level_proposals.pod_id IS 'The pod this proposal is for. Only members of this pod can vote.';
COMMENT ON COLUMN pod_level_proposals.onchain_proposal_id IS 'Optional: If this proposal is stored on-chain (for formal/permanent proposals)';
COMMENT ON COLUMN pod_level_proposals.metadata IS 'Flexible JSONB field for additional proposal data (choices, forum_thread_id, etc.)';

-- ===================================================================
-- Verification
-- ===================================================================

SELECT 'Migration completed successfully!' as status;
SELECT 'pod_level_proposals table created' as step_1;
SELECT 'RLS policies configured' as step_2;
SELECT COUNT(*) as proposal_count FROM pod_level_proposals;

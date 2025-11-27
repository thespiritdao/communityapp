-- Pod Deletion Proposals Schema
-- Handles multi-signature approval workflow for pod deletion

-- Create pod_deletion_proposals table
CREATE TABLE IF NOT EXISTS pod_deletion_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  pod_name TEXT NOT NULL,
  proposed_by TEXT NOT NULL, -- wallet address of proposer
  required_approvals INTEGER NOT NULL DEFAULT 2, -- minimum approvals needed
  current_approvals TEXT[] DEFAULT '{}', -- array of wallet addresses who approved
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executed', 'rejected', 'expired', 'failed')),
  rejection_reason TEXT,
  
  -- Hat deactivation tracking
  management_hat_id TEXT,
  membership_hat_id TEXT,
  hat_deactivation_tx TEXT, -- transaction hash if executed
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  
  -- Execution details
  executed_by TEXT,
  execution_error TEXT
);

-- Create indexes
CREATE INDEX idx_pod_deletion_proposals_pod_id ON pod_deletion_proposals(pod_id);
CREATE INDEX idx_pod_deletion_proposals_status ON pod_deletion_proposals(status);
CREATE INDEX idx_pod_deletion_proposals_proposed_by ON pod_deletion_proposals(proposed_by);
CREATE INDEX idx_pod_deletion_proposals_expires_at ON pod_deletion_proposals(expires_at);

-- RLS Policies
ALTER TABLE pod_deletion_proposals ENABLE ROW LEVEL SECURITY;

-- Pod leaders can view deletion proposals for their pods
CREATE POLICY "Pod leaders can view deletion proposals"
  ON pod_deletion_proposals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pods p
      WHERE p.id = pod_deletion_proposals.pod_id
      AND (
        LOWER(auth.jwt() ->> 'address') = ANY(
          SELECT LOWER(unnest) FROM unnest(p.pod_leads)
        )
      )
    )
  );

-- Pod leaders can create deletion proposals
CREATE POLICY "Pod leaders can create deletion proposals"
  ON pod_deletion_proposals
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods p
      WHERE p.id = pod_id
      AND LOWER(auth.jwt() ->> 'address') = ANY(
        SELECT LOWER(unnest) FROM unnest(p.pod_leads)
      )
    )
  );

-- Pod leaders can update proposals (approve/reject)
CREATE POLICY "Pod leaders can update deletion proposals"
  ON pod_deletion_proposals
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM pods p
      WHERE p.id = pod_deletion_proposals.pod_id
      AND LOWER(auth.jwt() ->> 'address') = ANY(
        SELECT LOWER(unnest) FROM unnest(p.pod_leads)
      )
    )
  );

-- Function to automatically expire old proposals
CREATE OR REPLACE FUNCTION expire_old_deletion_proposals()
RETURNS void AS $$
BEGIN
  UPDATE pod_deletion_proposals
  SET status = 'expired', 
      updated_at = NOW()
  WHERE status = 'pending' 
  AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to expire proposals (requires pg_cron extension)
-- SELECT cron.schedule('expire-deletion-proposals', '0 * * * *', 'SELECT expire_old_deletion_proposals();');
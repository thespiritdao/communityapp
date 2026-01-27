-- Add fields to track on-chain recording of votes
-- This enables the batching system to know which votes have been posted to the blockchain

-- Add timestamp for when vote was recorded on-chain
ALTER TABLE governance_votes
ADD COLUMN IF NOT EXISTS onchain_recorded_at TIMESTAMPTZ;

-- Add index for efficiently querying unrecorded votes
CREATE INDEX IF NOT EXISTS idx_governance_votes_onchain_recorded
  ON governance_votes(onchain_recorded_at)
  WHERE onchain_recorded_at IS NULL;

-- Add field to track which pod a vote belongs to (for pod-level proposals)
ALTER TABLE governance_votes
ADD COLUMN IF NOT EXISTS pod_id UUID REFERENCES pods(id);

-- Add index for pod-based queries
CREATE INDEX IF NOT EXISTS idx_governance_votes_pod_id
  ON governance_votes(pod_id);

-- Comments
COMMENT ON COLUMN governance_votes.onchain_recorded_at IS 'Timestamp when this vote was posted to the PodGovernance contract';
COMMENT ON COLUMN governance_votes.pod_id IS 'The pod this vote belongs to (for pod-level proposals)';

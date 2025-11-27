-- ============================================
-- Pod Application Votes Table
-- ============================================
-- Tracks onchain votes for pod membership applications
-- Each vote requires a blockchain transaction

CREATE TABLE IF NOT EXISTS pod_application_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES pod_membership_applications(id) ON DELETE CASCADE,
  voter_address TEXT NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('approve', 'reject')),
  transaction_hash TEXT NOT NULL,
  block_number BIGINT,
  voted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one vote per person per application
  UNIQUE(application_id, voter_address)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_application_votes_application
  ON pod_application_votes(application_id);

CREATE INDEX IF NOT EXISTS idx_application_votes_voter
  ON pod_application_votes(voter_address);

CREATE INDEX IF NOT EXISTS idx_application_votes_tx
  ON pod_application_votes(transaction_hash);

-- Enable RLS
ALTER TABLE pod_application_votes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can read votes"
  ON pod_application_votes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can record votes"
  ON pod_application_votes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE pod_application_votes IS 'Onchain votes for pod membership applications - each vote is recorded as a blockchain transaction';

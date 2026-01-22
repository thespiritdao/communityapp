-- Create table to track on-chain governance proposal vote counts
-- This eliminates the need to query the blockchain contract for every page load

CREATE TABLE IF NOT EXISTS governance_proposal_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id TEXT NOT NULL UNIQUE, -- BigInt as string (matches Governor contract)
  for_votes BIGINT DEFAULT 0,
  against_votes BIGINT DEFAULT 0,
  abstain_votes BIGINT DEFAULT 0,
  total_votes BIGINT DEFAULT 0,
  last_updated_block BIGINT, -- Track which block we last synced from
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by proposal_id
CREATE INDEX IF NOT EXISTS idx_governance_proposal_votes_proposal_id
  ON governance_proposal_votes(proposal_id);

-- RLS Policies: Public read access (anyone can see vote counts)
ALTER TABLE governance_proposal_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read governance proposal votes"
  ON governance_proposal_votes
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Only service role can insert/update (via backend event listener)
CREATE POLICY "Service role can manage governance proposal votes"
  ON governance_proposal_votes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_governance_proposal_votes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_governance_proposal_votes_updated_at
  BEFORE UPDATE ON governance_proposal_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_governance_proposal_votes_updated_at();

-- Create table to track individual votes (for vote history and "has user voted" checks)
CREATE TABLE IF NOT EXISTS governance_user_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id TEXT NOT NULL,
  voter_address TEXT NOT NULL,
  choice INTEGER NOT NULL, -- 0=Against, 1=For, 2=Abstain (Governor values)
  voting_power BIGINT DEFAULT 1,
  tx_hash TEXT,
  block_number BIGINT,
  voted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one vote per user per proposal
  UNIQUE(proposal_id, voter_address)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_governance_user_votes_proposal_id
  ON governance_user_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_governance_user_votes_voter
  ON governance_user_votes(voter_address);

-- RLS Policies: Public read access
ALTER TABLE governance_user_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read governance user votes"
  ON governance_user_votes
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Only service role can insert/update
CREATE POLICY "Service role can manage governance user votes"
  ON governance_user_votes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE governance_proposal_votes IS 'Stores aggregated vote counts for on-chain governance proposals';
COMMENT ON TABLE governance_user_votes IS 'Stores individual user votes for on-chain governance proposals';

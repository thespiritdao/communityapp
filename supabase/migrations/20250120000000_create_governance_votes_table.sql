-- Create governance_votes table for pod creation voting
-- This table stores votes on pod creation proposals

CREATE TABLE IF NOT EXISTS governance_votes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    proposal_id TEXT NOT NULL, -- References pod ID (pods.id)
    voter_address TEXT NOT NULL,
    vote TEXT NOT NULL CHECK (vote IN ('for', 'against', 'abstain')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    hat_id TEXT, -- HAT ID used for voting (optional)
    signature TEXT, -- Optional signature for verification
    UNIQUE(proposal_id, voter_address) -- One vote per proposal per voter
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal_id ON governance_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_governance_votes_voter ON governance_votes(voter_address);
CREATE INDEX IF NOT EXISTS idx_governance_votes_timestamp ON governance_votes(timestamp DESC);

-- Enable RLS
ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can view governance votes
CREATE POLICY "Anyone can view governance votes" ON governance_votes
    FOR SELECT
    USING (true);

-- RLS Policy: Authenticated users can insert their own votes
CREATE POLICY "Users can insert their own votes" ON governance_votes
    FOR INSERT
    WITH CHECK (
        -- User must be authenticated
        auth.jwt() ->> 'sub' IS NOT NULL
        -- Vote must be from the authenticated user
        AND voter_address = (auth.jwt() ->> 'sub')
    );

-- RLS Policy: Users can update their own votes (change vote before proposal closes)
CREATE POLICY "Users can update their own votes" ON governance_votes
    FOR UPDATE
    USING (
        voter_address = (auth.jwt() ->> 'sub')
    )
    WITH CHECK (
        voter_address = (auth.jwt() ->> 'sub')
    );

-- RLS Policy: Users cannot delete votes (maintain audit trail)
-- No DELETE policy = no one can delete

-- Comments for documentation
COMMENT ON TABLE governance_votes IS 'Stores governance votes for pod creation proposals';
COMMENT ON COLUMN governance_votes.proposal_id IS 'Pod ID being voted on (from pods table)';
COMMENT ON COLUMN governance_votes.voter_address IS 'Wallet address of the voter';
COMMENT ON COLUMN governance_votes.vote IS 'Vote choice: for, against, or abstain';
COMMENT ON COLUMN governance_votes.hat_id IS 'HAT ID used for voting permission (optional tracking)';
COMMENT ON COLUMN governance_votes.signature IS 'Optional cryptographic signature for vote verification';

-- Pod Multi-Manager Governance Schema
-- Implements governance system for critical pod operations

-- Governance Proposals Table
CREATE TABLE IF NOT EXISTS pod_governance_proposals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pod_id TEXT NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
    proposal_type TEXT NOT NULL CHECK (proposal_type IN ('status_change', 'delete_pod', 'archive_pod', 'edit_description', 'update_image')),
    proposal_data JSONB NOT NULL, -- Stores proposal-specific data
    proposed_by TEXT NOT NULL, -- Wallet address of proposer
    required_approvals INTEGER NOT NULL, -- Number of approvals needed
    current_approvals TEXT[] DEFAULT '{}', -- Array of wallet addresses that approved
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE,
    execution_tx_hash TEXT -- Store transaction hash if blockchain action required
);

-- Governance Votes Table
CREATE TABLE IF NOT EXISTS pod_governance_votes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    proposal_id UUID NOT NULL REFERENCES pod_governance_proposals(id) ON DELETE CASCADE,
    voter_address TEXT NOT NULL,
    vote TEXT NOT NULL CHECK (vote IN ('approve', 'reject')),
    vote_reason TEXT,
    voted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(proposal_id, voter_address) -- One vote per proposal per voter
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pod_governance_proposals_pod_id ON pod_governance_proposals(pod_id);
CREATE INDEX IF NOT EXISTS idx_pod_governance_proposals_status ON pod_governance_proposals(status);
CREATE INDEX IF NOT EXISTS idx_pod_governance_proposals_expires_at ON pod_governance_proposals(expires_at);
CREATE INDEX IF NOT EXISTS idx_pod_governance_votes_proposal_id ON pod_governance_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_pod_governance_votes_voter ON pod_governance_votes(voter_address);

-- RLS Policies
ALTER TABLE pod_governance_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_governance_votes ENABLE ROW LEVEL SECURITY;

-- Proposals: Users can view proposals for pods they manage
CREATE POLICY "Users can view governance proposals for pods they manage" ON pod_governance_proposals
    FOR SELECT
    USING (
        pod_id IN (
            SELECT pod_id 
            FROM pod_members 
            WHERE wallet_address = auth.jwt() ->> 'sub' 
            AND role = 'manager' 
            AND status = 'active'
        )
    );

-- Proposals: Users can create proposals for pods they manage
CREATE POLICY "Users can create governance proposals for pods they manage" ON pod_governance_proposals
    FOR INSERT
    WITH CHECK (
        pod_id IN (
            SELECT pod_id 
            FROM pod_members 
            WHERE wallet_address = auth.jwt() ->> 'sub' 
            AND role = 'manager' 
            AND status = 'active'
        )
        AND proposed_by = auth.jwt() ->> 'sub'
    );

-- Proposals: Users can update proposals they created (only status changes by system)
CREATE POLICY "Users can update governance proposals" ON pod_governance_proposals
    FOR UPDATE
    USING (
        pod_id IN (
            SELECT pod_id 
            FROM pod_members 
            WHERE wallet_address = auth.jwt() ->> 'sub' 
            AND role = 'manager' 
            AND status = 'active'
        )
    );

-- Votes: Users can view votes on proposals for pods they manage
CREATE POLICY "Users can view governance votes for pods they manage" ON pod_governance_votes
    FOR SELECT
    USING (
        proposal_id IN (
            SELECT id 
            FROM pod_governance_proposals 
            WHERE pod_id IN (
                SELECT pod_id 
                FROM pod_members 
                WHERE wallet_address = auth.jwt() ->> 'sub' 
                AND role = 'manager' 
                AND status = 'active'
            )
        )
    );

-- Votes: Users can create votes on proposals for pods they manage
CREATE POLICY "Users can vote on governance proposals for pods they manage" ON pod_governance_votes
    FOR INSERT
    WITH CHECK (
        proposal_id IN (
            SELECT id 
            FROM pod_governance_proposals 
            WHERE pod_id IN (
                SELECT pod_id 
                FROM pod_members 
                WHERE wallet_address = auth.jwt() ->> 'sub' 
                AND role = 'manager' 
                AND status = 'active'
            )
        )
        AND voter_address = auth.jwt() ->> 'sub'
    );

-- Votes: Users can update their own votes
CREATE POLICY "Users can update their own governance votes" ON pod_governance_votes
    FOR UPDATE
    USING (voter_address = auth.jwt() ->> 'sub');

-- Function to automatically check and approve proposals when threshold is met
CREATE OR REPLACE FUNCTION check_proposal_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- Update proposal status if enough approvals received
    UPDATE pod_governance_proposals 
    SET status = 'approved'
    WHERE id = NEW.proposal_id
    AND status = 'pending'
    AND array_length(current_approvals, 1) >= required_approvals;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check approval status after each vote
CREATE TRIGGER trigger_check_proposal_approval
    AFTER INSERT OR UPDATE ON pod_governance_votes
    FOR EACH ROW
    EXECUTE FUNCTION check_proposal_approval();

-- Comments for documentation
COMMENT ON TABLE pod_governance_proposals IS 'Stores governance proposals for critical pod operations requiring multi-manager approval';
COMMENT ON TABLE pod_governance_votes IS 'Stores individual manager votes on governance proposals';
COMMENT ON COLUMN pod_governance_proposals.proposal_data IS 'JSON data specific to proposal type (e.g., new status, description, image URL)';
COMMENT ON COLUMN pod_governance_proposals.required_approvals IS 'Number of manager approvals needed (calculated as 67% of active managers)';
COMMENT ON COLUMN pod_governance_proposals.current_approvals IS 'Array of wallet addresses that have approved the proposal';
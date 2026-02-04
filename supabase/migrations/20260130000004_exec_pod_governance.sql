-- Executive Pod Governance System
-- Enables leaders to propose and vote on revoking other leaders
-- Implements 2-of-3 majority voting for revocation proposals
-- Generated: 2026-01-30

-- =====================================================
-- 1. REVOCATION PROPOSALS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS exec_pod_revocation_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Proposal details
    target_wallet TEXT NOT NULL,
    proposed_by TEXT NOT NULL,
    reason TEXT NOT NULL,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),

    -- Voting
    votes_for TEXT[] DEFAULT '{}',
    votes_against TEXT[] DEFAULT '{}',

    -- Execution
    executed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',

    -- Constraints
    CONSTRAINT no_self_revocation CHECK (target_wallet != proposed_by)
);

-- =====================================================
-- 2. RESTORATION PROPOSALS TABLE (Optional - For Reversibility)
-- =====================================================

CREATE TABLE IF NOT EXISTS exec_pod_restoration_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Proposal details
    target_wallet TEXT NOT NULL,
    proposed_by TEXT NOT NULL,
    reason TEXT NOT NULL,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),

    -- Voting
    votes_for TEXT[] DEFAULT '{}',
    votes_against TEXT[] DEFAULT '{}',

    -- Execution
    executed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

-- =====================================================
-- 3. UPDATE POD_MEMBERS TABLE
-- =====================================================

-- Add governance revocation tracking
ALTER TABLE pod_members ADD COLUMN IF NOT EXISTS revoked_by_governance BOOLEAN DEFAULT false;
ALTER TABLE pod_members ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE pod_members ADD COLUMN IF NOT EXISTS revocation_proposal_id UUID;

-- Foreign key to track which proposal caused the revocation
ALTER TABLE pod_members ADD CONSTRAINT fk_revocation_proposal
    FOREIGN KEY (revocation_proposal_id)
    REFERENCES exec_pod_revocation_proposals(id)
    ON DELETE SET NULL;

-- =====================================================
-- 4. INDEXES FOR PERFORMANCE
-- =====================================================

-- Find pending proposals
CREATE INDEX IF NOT EXISTS exec_revocation_status_idx
    ON exec_pod_revocation_proposals(status)
    WHERE status = 'pending';

-- Find proposals by target
CREATE INDEX IF NOT EXISTS exec_revocation_target_idx
    ON exec_pod_revocation_proposals(target_wallet);

-- Find proposals by proposer
CREATE INDEX IF NOT EXISTS exec_revocation_proposer_idx
    ON exec_pod_revocation_proposals(proposed_by);

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE exec_pod_revocation_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE exec_pod_restoration_proposals ENABLE ROW LEVEL SECURITY;

-- Anyone can view proposals (transparency)
CREATE POLICY "Revocation proposals are viewable by everyone"
    ON exec_pod_revocation_proposals
    FOR SELECT
    USING (true);

-- Only exec pod leaders can create proposals
CREATE POLICY "Exec pod leaders can create revocation proposals"
    ON exec_pod_revocation_proposals
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM pod_members
            WHERE wallet_address = (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
            AND pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'
            AND membership_type = 'leader'
            AND revoked_by_governance = false
        )
    );

-- Only exec pod leaders can update proposals (voting)
CREATE POLICY "Exec pod leaders can vote on proposals"
    ON exec_pod_revocation_proposals
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM pod_members
            WHERE wallet_address = (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
            AND pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'
            AND membership_type = 'leader'
            AND revoked_by_governance = false
        )
    );

-- Same policies for restoration proposals
CREATE POLICY "Restoration proposals are viewable by everyone"
    ON exec_pod_restoration_proposals
    FOR SELECT
    USING (true);

CREATE POLICY "Exec pod leaders can create restoration proposals"
    ON exec_pod_restoration_proposals
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM pod_members
            WHERE wallet_address = (auth.jwt() -> 'user_metadata' ->> 'wallet_address')
            AND pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'
            AND membership_type = 'leader'
            AND revoked_by_governance = false
        )
    );

-- =====================================================
-- 6. TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_revocation_proposal_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_revocation_proposal_updated_at
    BEFORE UPDATE ON exec_pod_revocation_proposals
    FOR EACH ROW
    EXECUTE FUNCTION update_revocation_proposal_timestamp();

CREATE TRIGGER trigger_restoration_proposal_updated_at
    BEFORE UPDATE ON exec_pod_restoration_proposals
    FOR EACH ROW
    EXECUTE FUNCTION update_revocation_proposal_timestamp();

-- Auto-expire old proposals (run daily via cron)
CREATE OR REPLACE FUNCTION expire_old_proposals()
RETURNS void AS $$
BEGIN
    UPDATE exec_pod_revocation_proposals
    SET status = 'expired'
    WHERE status = 'pending'
    AND expires_at < NOW();

    UPDATE exec_pod_restoration_proposals
    SET status = 'expired'
    WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

GRANT SELECT ON exec_pod_revocation_proposals TO authenticated;
GRANT INSERT, UPDATE ON exec_pod_revocation_proposals TO authenticated;

GRANT SELECT ON exec_pod_restoration_proposals TO authenticated;
GRANT INSERT, UPDATE ON exec_pod_restoration_proposals TO authenticated;

-- =====================================================
-- 8. VERIFICATION
-- =====================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'exec_pod_revocation_proposals'
    ) THEN
        RAISE NOTICE 'Governance tables created successfully';
    ELSE
        RAISE EXCEPTION 'Failed to create governance tables';
    END IF;
END $$;

SELECT 'Migration 20260130000004_exec_pod_governance completed successfully' as status;

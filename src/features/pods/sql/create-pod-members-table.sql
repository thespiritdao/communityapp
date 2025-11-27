-- Pod Members Table - Authoritative source for pod membership data
-- Replaces runtime HAT scanning with indexed, cached membership data

-- Create the pod_members table
CREATE TABLE IF NOT EXISTS pod_members (
  -- Primary identifiers
  pod_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  
  -- Membership metadata
  hat_id TEXT, -- The specific HAT ID that grants membership
  membership_type TEXT NOT NULL DEFAULT 'member', -- 'leader', 'member', 'admin'
  
  -- Data source tracking
  source TEXT NOT NULL DEFAULT 'indexer', -- 'manual', 'indexer', 'governance'
  indexed_at TIMESTAMPTZ DEFAULT NOW(), -- When this record was last indexed
  
  -- Status tracking
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ, -- Set when membership ends
  
  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Primary key on pod + wallet combination
  PRIMARY KEY (pod_id, wallet)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS pod_members_pod_idx ON pod_members(pod_id);
CREATE INDEX IF NOT EXISTS pod_members_wallet_idx ON pod_members(wallet);
CREATE INDEX IF NOT EXISTS pod_members_hat_idx ON pod_members(hat_id);
CREATE INDEX IF NOT EXISTS pod_members_active_idx ON pod_members(is_active);
CREATE INDEX IF NOT EXISTS pod_members_indexed_at_idx ON pod_members(indexed_at);
CREATE INDEX IF NOT EXISTS pod_members_source_idx ON pod_members(source);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS pod_members_pod_active_idx ON pod_members(pod_id, is_active);
CREATE INDEX IF NOT EXISTS pod_members_wallet_active_idx ON pod_members(wallet, is_active);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pod_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_pod_members_updated_at_trigger ON pod_members;
CREATE TRIGGER update_pod_members_updated_at_trigger
    BEFORE UPDATE ON pod_members
    FOR EACH ROW
    EXECUTE FUNCTION update_pod_members_updated_at();

-- View for active members only (commonly used)
CREATE OR REPLACE VIEW active_pod_members AS
SELECT 
    pod_id,
    wallet,
    hat_id,
    membership_type,
    source,
    indexed_at,
    joined_at,
    created_at,
    updated_at
FROM pod_members 
WHERE is_active = TRUE;

-- View for member counts by pod
CREATE OR REPLACE VIEW pod_member_counts AS
SELECT 
    pod_id,
    COUNT(*) as total_members,
    COUNT(CASE WHEN membership_type = 'leader' THEN 1 END) as leaders_count,
    COUNT(CASE WHEN membership_type = 'member' THEN 1 END) as members_count,
    COUNT(CASE WHEN membership_type = 'admin' THEN 1 END) as admins_count,
    MAX(indexed_at) as last_indexed_at,
    COUNT(CASE WHEN source = 'indexer' THEN 1 END) as indexed_members,
    COUNT(CASE WHEN source = 'manual' THEN 1 END) as manual_members
FROM active_pod_members
GROUP BY pod_id;

-- RLS policies (if Row Level Security is enabled)
-- Allow authenticated users to read membership data
-- Only allow service accounts to write membership data

-- Enable RLS on the table
ALTER TABLE pod_members ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read pod membership data
CREATE POLICY "Allow read access to pod_members" ON pod_members
    FOR SELECT USING (true);

-- Policy: Only authenticated users can insert/update (for manual management)
CREATE POLICY "Allow authenticated users to manage pod_members" ON pod_members
    FOR ALL USING (auth.role() = 'authenticated');

-- Policy: Service role can do everything (for indexer)
CREATE POLICY "Allow service role full access to pod_members" ON pod_members
    FOR ALL USING (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE pod_members IS 'Authoritative source for pod membership data, indexed from HAT contracts';
COMMENT ON COLUMN pod_members.pod_id IS 'References pods.id - the pod this membership relates to';
COMMENT ON COLUMN pod_members.wallet IS 'Ethereum wallet address of the member';
COMMENT ON COLUMN pod_members.hat_id IS 'The HAT token ID that grants this membership';
COMMENT ON COLUMN pod_members.membership_type IS 'Type of membership: leader, member, admin';
COMMENT ON COLUMN pod_members.source IS 'How this membership was recorded: indexer, manual, governance';
COMMENT ON COLUMN pod_members.indexed_at IS 'When this record was last updated by the indexer';
COMMENT ON COLUMN pod_members.is_active IS 'Whether this membership is currently active';
COMMENT ON COLUMN pod_members.joined_at IS 'When the member first joined the pod';
COMMENT ON COLUMN pod_members.left_at IS 'When the member left the pod (if applicable)';

-- Example queries for testing
-- Get all active members of a pod:
-- SELECT wallet, membership_type, joined_at FROM active_pod_members WHERE pod_id = 'your-pod-id';

-- Get member count for a pod:
-- SELECT * FROM pod_member_counts WHERE pod_id = 'your-pod-id';

-- Get all pods a wallet is a member of:
-- SELECT pod_id, membership_type, joined_at FROM active_pod_members WHERE wallet = '0x...';

-- Get stale memberships that need re-indexing (older than 1 hour):
-- SELECT pod_id, COUNT(*) FROM pod_members 
-- WHERE source = 'indexer' AND indexed_at < NOW() - INTERVAL '1 hour'
-- GROUP BY pod_id;
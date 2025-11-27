-- ============================================
-- PODS V2 DATABASE SCHEMA
-- ============================================
-- Simple, blockchain-first architecture
-- Database is just an INDEX/CACHE, not source of truth
-- Source of truth = Hats Protocol contracts
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PODS2 TABLE (Minimal Pod Tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS pods2 (
    -- Primary identifiers
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pod_id_hash TEXT NOT NULL UNIQUE, -- bytes32 from contract (as hex string)

    -- Basic info (cached from contract/events)
    name TEXT NOT NULL,
    description TEXT,
    image_uri TEXT,

    -- Blockchain references
    tophat_id NUMERIC(78, 0) NOT NULL UNIQUE, -- uint256
    admin_hat_id NUMERIC(78, 0) NOT NULL,
    member_hat_id NUMERIC(78, 0) NOT NULL,

    -- Creator and leaders
    creator_address TEXT NOT NULL,
    leader_addresses TEXT[] NOT NULL, -- Array of addresses

    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    is_linked_tree BOOLEAN NOT NULL DEFAULT false,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at_block BIGINT, -- Block number for event tracking
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexes
    CONSTRAINT valid_tophat_id CHECK (tophat_id > 0),
    CONSTRAINT valid_admin_hat CHECK (admin_hat_id > 0),
    CONSTRAINT valid_member_hat CHECK (member_hat_id > 0)
);

-- Indexes for performance
CREATE INDEX idx_pods2_tophat ON pods2(tophat_id);
CREATE INDEX idx_pods2_admin_hat ON pods2(admin_hat_id);
CREATE INDEX idx_pods2_creator ON pods2(creator_address);
CREATE INDEX idx_pods2_status ON pods2(status);
CREATE INDEX idx_pods2_created_at ON pods2(created_at DESC);

-- ============================================
-- 2. POD_MEMBERS2 TABLE (Member Cache)
-- ============================================

CREATE TABLE IF NOT EXISTS pod_members2 (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pod_id UUID NOT NULL REFERENCES pods2(id) ON DELETE CASCADE,

    -- Member info
    wallet_address TEXT NOT NULL,
    hat_id NUMERIC(78, 0) NOT NULL, -- Which hat they wear (admin or member)
    role TEXT NOT NULL CHECK (role IN ('admin', 'member')),

    -- Status (cached from blockchain)
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_eligible BOOLEAN NOT NULL DEFAULT true,
    in_good_standing BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(pod_id, wallet_address, hat_id)
);

-- Indexes
CREATE INDEX idx_pod_members2_pod ON pod_members2(pod_id);
CREATE INDEX idx_pod_members2_wallet ON pod_members2(wallet_address);
CREATE INDEX idx_pod_members2_hat ON pod_members2(hat_id);
CREATE INDEX idx_pod_members2_role ON pod_members2(role);
CREATE INDEX idx_pod_members2_active ON pod_members2(is_active);

-- Composite index for common queries
CREATE INDEX idx_pod_members2_pod_wallet ON pod_members2(pod_id, wallet_address);

-- ============================================
-- 3. POD_SYNC_LOG (Track Sync Status)
-- ============================================

CREATE TABLE IF NOT EXISTS pod_sync_log2 (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pod_id UUID REFERENCES pods2(id) ON DELETE CASCADE,

    sync_type TEXT NOT NULL CHECK (sync_type IN ('created', 'members_updated', 'status_changed', 'full_sync')),
    block_number BIGINT NOT NULL,
    transaction_hash TEXT,

    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'error')),
    error_message TEXT,

    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pod_sync_log2_pod ON pod_sync_log2(pod_id);
CREATE INDEX idx_pod_sync_log2_status ON pod_sync_log2(status);
CREATE INDEX idx_pod_sync_log2_block ON pod_sync_log2(block_number DESC);

-- ============================================
-- 4. VIEWS FOR COMMON QUERIES
-- ============================================

-- Active pods with member counts
CREATE OR REPLACE VIEW pods2_with_counts AS
SELECT
    p.id,
    p.pod_id_hash,
    p.name,
    p.description,
    p.image_uri,
    p.tophat_id,
    p.admin_hat_id,
    p.member_hat_id,
    p.creator_address,
    p.leader_addresses,
    p.status,
    p.is_linked_tree,
    p.created_at,
    COUNT(DISTINCT CASE WHEN pm.role = 'admin' AND pm.is_active THEN pm.wallet_address END) as admin_count,
    COUNT(DISTINCT CASE WHEN pm.role = 'member' AND pm.is_active THEN pm.wallet_address END) as member_count,
    COUNT(DISTINCT CASE WHEN pm.is_active THEN pm.wallet_address END) as total_member_count
FROM pods2 p
LEFT JOIN pod_members2 pm ON p.id = pm.pod_id
GROUP BY p.id;

-- User's pod memberships
CREATE OR REPLACE VIEW user_pod_memberships2 AS
SELECT
    pm.wallet_address,
    p.id as pod_id,
    p.pod_id_hash,
    p.name as pod_name,
    p.image_uri as pod_image,
    pm.role,
    pm.is_active,
    pm.joined_at,
    p.admin_hat_id,
    p.member_hat_id
FROM pod_members2 pm
JOIN pods2 p ON pm.pod_id = p.id
WHERE pm.is_active = true;

-- ============================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE pods2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_members2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_sync_log2 ENABLE ROW LEVEL SECURITY;

-- Public can view active pods
CREATE POLICY "Public read active pods2"
ON pods2 FOR SELECT
USING (status = 'active');

-- Authenticated users can view all pods
CREATE POLICY "Authenticated read all pods2"
ON pods2 FOR SELECT
TO authenticated
USING (true);

-- Service role has full access
CREATE POLICY "Service role full access pods2"
ON pods2 FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Public can view active members
CREATE POLICY "Public read active members2"
ON pod_members2 FOR SELECT
USING (is_active = true);

-- Authenticated users can view all members
CREATE POLICY "Authenticated read all members2"
ON pod_members2 FOR SELECT
TO authenticated
USING (true);

-- Service role full access
CREATE POLICY "Service role full access members2"
ON pod_members2 FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Sync log: authenticated users can read
CREATE POLICY "Authenticated read sync log2"
ON pod_sync_log2 FOR SELECT
TO authenticated
USING (true);

-- Service role full access
CREATE POLICY "Service role full access sync log2"
ON pod_sync_log2 FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- 6. FUNCTIONS
-- ============================================

/**
 * Get pod by tophat ID (common query)
 */
CREATE OR REPLACE FUNCTION get_pod2_by_tophat(p_tophat_id NUMERIC)
RETURNS TABLE (
    id UUID,
    pod_id_hash TEXT,
    name TEXT,
    admin_hat_id NUMERIC,
    member_hat_id NUMERIC,
    creator_address TEXT,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.pod_id_hash,
        p.name,
        p.admin_hat_id,
        p.member_hat_id,
        p.creator_address,
        p.status
    FROM pods2 p
    WHERE p.tophat_id = p_tophat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/**
 * Check if user is pod admin (via HAT ownership)
 * NOTE: This queries cached data. For real-time, query blockchain.
 */
CREATE OR REPLACE FUNCTION is_pod2_admin(p_pod_id UUID, p_wallet_address TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM pod_members2
        WHERE pod_id = p_pod_id
        AND wallet_address = p_wallet_address
        AND role = 'admin'
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/**
 * Update member cache from blockchain data
 * Called by indexer after verifying on-chain status
 */
CREATE OR REPLACE FUNCTION upsert_pod2_member(
    p_pod_id UUID,
    p_wallet_address TEXT,
    p_hat_id NUMERIC,
    p_role TEXT,
    p_is_active BOOLEAN,
    p_is_eligible BOOLEAN,
    p_in_good_standing BOOLEAN
) RETURNS VOID AS $$
BEGIN
    INSERT INTO pod_members2 (
        pod_id,
        wallet_address,
        hat_id,
        role,
        is_active,
        is_eligible,
        in_good_standing,
        joined_at,
        last_verified_at
    ) VALUES (
        p_pod_id,
        p_wallet_address,
        p_hat_id,
        p_role,
        p_is_active,
        p_is_eligible,
        p_in_good_standing,
        NOW(),
        NOW()
    )
    ON CONFLICT (pod_id, wallet_address, hat_id)
    DO UPDATE SET
        is_active = p_is_active,
        is_eligible = p_is_eligible,
        in_good_standing = p_in_good_standing,
        last_verified_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. COMMENTS
-- ============================================

COMMENT ON TABLE pods2 IS 'V2 POD system - minimal blockchain-first architecture. Database is cache/index only.';
COMMENT ON TABLE pod_members2 IS 'Cached member data from blockchain. Source of truth is Hats Protocol balanceOf().';
COMMENT ON TABLE pod_sync_log2 IS 'Track synchronization between database cache and blockchain state.';

COMMENT ON COLUMN pods2.pod_id_hash IS 'bytes32 podId from PodFactoryV2 contract (hex string with 0x prefix)';
COMMENT ON COLUMN pods2.tophat_id IS 'uint256 tophat ID - each pod gets its own tree';
COMMENT ON COLUMN pods2.is_linked_tree IS 'Whether pod is linked to platform tree (true) or independent (false)';
COMMENT ON COLUMN pod_members2.last_verified_at IS 'Last time we verified this member status on-chain';

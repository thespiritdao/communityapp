-- Complete Pod Members Database Setup for Supabase
-- This creates all necessary tables, views, indexes, and policies

-- =====================================================
-- 1. CREATE MAIN TABLES
-- =====================================================

-- Pod members table (if not exists)
CREATE TABLE IF NOT EXISTS pod_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pod_id UUID NOT NULL,
  wallet TEXT NOT NULL,
  hat_id TEXT,
  membership_type TEXT NOT NULL CHECK (membership_type IN ('leader', 'member', 'admin')),
  is_active BOOLEAN DEFAULT TRUE,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'indexer', 'governance')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  indexed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(pod_id, wallet),
  FOREIGN KEY (pod_id) REFERENCES pods(id) ON DELETE CASCADE
);

-- Pod member counts table for quick stats
CREATE TABLE IF NOT EXISTS pod_member_counts (
  pod_id UUID PRIMARY KEY,
  total_members INTEGER DEFAULT 0,
  leaders_count INTEGER DEFAULT 0,
  members_count INTEGER DEFAULT 0,
  admins_count INTEGER DEFAULT 0,
  last_indexed_at TIMESTAMP WITH TIME ZONE,
  indexed_members INTEGER DEFAULT 0,
  manual_members INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  FOREIGN KEY (pod_id) REFERENCES pods(id) ON DELETE CASCADE
);

-- Treasury transactions table
CREATE TABLE IF NOT EXISTS pod_treasury_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pod_id UUID NOT NULL,
  tx_hash TEXT NOT NULL,
  to_address TEXT NOT NULL,
  value TEXT NOT NULL,
  data TEXT,
  description TEXT,
  executed_by TEXT NOT NULL,
  block_number TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  FOREIGN KEY (pod_id) REFERENCES pods(id) ON DELETE CASCADE
);

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Pod members indexes
CREATE INDEX IF NOT EXISTS idx_pod_members_pod_id ON pod_members(pod_id);
CREATE INDEX IF NOT EXISTS idx_pod_members_wallet ON pod_members(wallet);
CREATE INDEX IF NOT EXISTS idx_pod_members_active ON pod_members(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_pod_members_membership_type ON pod_members(membership_type);
CREATE INDEX IF NOT EXISTS idx_pod_members_hat_id ON pod_members(hat_id) WHERE hat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pod_members_source ON pod_members(source);
CREATE INDEX IF NOT EXISTS idx_pod_members_joined_at ON pod_members(joined_at);

-- Compound indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pod_members_pod_active ON pod_members(pod_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pod_members_pod_type ON pod_members(pod_id, membership_type);
CREATE INDEX IF NOT EXISTS idx_pod_members_wallet_active ON pod_members(wallet, is_active);

-- Treasury transactions indexes
CREATE INDEX IF NOT EXISTS idx_treasury_tx_pod_id ON pod_treasury_transactions(pod_id);
CREATE INDEX IF NOT EXISTS idx_treasury_tx_hash ON pod_treasury_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_treasury_tx_status ON pod_treasury_transactions(status);

-- =====================================================
-- 3. CREATE VIEWS
-- =====================================================

-- Active pod members view (this is what the error is looking for)
CREATE OR REPLACE VIEW active_pod_members AS
SELECT 
  pm.id,
  pm.pod_id,
  pm.wallet,
  pm.hat_id,
  pm.membership_type,
  pm.joined_at,
  pm.indexed_at,
  pm.source
FROM pod_members pm
WHERE pm.is_active = TRUE
ORDER BY pm.joined_at DESC;

-- Pod member statistics view
CREATE OR REPLACE VIEW pod_member_stats AS
SELECT 
  p.id as pod_id,
  p.name as pod_name,
  COALESCE(pmc.total_members, 0) as total_members,
  COALESCE(pmc.leaders_count, 0) as leaders_count,
  COALESCE(pmc.members_count, 0) as members_count,
  COALESCE(pmc.admins_count, 0) as admins_count,
  pmc.last_indexed_at,
  COALESCE(pmc.indexed_members, 0) as indexed_members,
  COALESCE(pmc.manual_members, 0) as manual_members
FROM pods p
LEFT JOIN pod_member_counts pmc ON p.id = pmc.pod_id;

-- =====================================================
-- 4. CREATE FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to update member counts
CREATE OR REPLACE FUNCTION update_pod_member_counts()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete existing count record
  DELETE FROM pod_member_counts WHERE pod_id = COALESCE(NEW.pod_id, OLD.pod_id);
  
  -- Insert updated counts
  INSERT INTO pod_member_counts (
    pod_id,
    total_members,
    leaders_count,
    members_count,
    admins_count,
    indexed_members,
    manual_members,
    updated_at
  )
  SELECT 
    pod_id,
    COUNT(*) as total_members,
    COUNT(*) FILTER (WHERE membership_type = 'leader') as leaders_count,
    COUNT(*) FILTER (WHERE membership_type = 'member') as members_count,
    COUNT(*) FILTER (WHERE membership_type = 'admin') as admins_count,
    COUNT(*) FILTER (WHERE source = 'indexer') as indexed_members,
    COUNT(*) FILTER (WHERE source = 'manual') as manual_members,
    NOW()
  FROM pod_members 
  WHERE pod_id = COALESCE(NEW.pod_id, OLD.pod_id) 
    AND is_active = TRUE
  GROUP BY pod_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. CREATE TRIGGERS
-- =====================================================

-- Trigger to update member counts when pod_members changes
DROP TRIGGER IF EXISTS trigger_update_pod_member_counts ON pod_members;
CREATE TRIGGER trigger_update_pod_member_counts
  AFTER INSERT OR UPDATE OR DELETE ON pod_members
  FOR EACH ROW
  EXECUTE FUNCTION update_pod_member_counts();

-- Trigger to update updated_at on pod_members
DROP TRIGGER IF EXISTS trigger_pod_members_updated_at ON pod_members;
CREATE TRIGGER trigger_pod_members_updated_at
  BEFORE UPDATE ON pod_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on pod_member_counts
DROP TRIGGER IF EXISTS trigger_pod_member_counts_updated_at ON pod_member_counts;
CREATE TRIGGER trigger_pod_member_counts_updated_at
  BEFORE UPDATE ON pod_member_counts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on tables
ALTER TABLE pod_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_member_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_treasury_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for pod_members
DROP POLICY IF EXISTS "Pod members are viewable by everyone" ON pod_members;
CREATE POLICY "Pod members are viewable by everyone" ON pod_members
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Pod members can be inserted by authenticated users" ON pod_members;
CREATE POLICY "Pod members can be inserted by authenticated users" ON pod_members
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Pod members can be updated by authenticated users" ON pod_members;
CREATE POLICY "Pod members can be updated by authenticated users" ON pod_members
  FOR UPDATE USING (true);

-- Policies for pod_member_counts (read-only for most users)
DROP POLICY IF EXISTS "Pod member counts are viewable by everyone" ON pod_member_counts;
CREATE POLICY "Pod member counts are viewable by everyone" ON pod_member_counts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Pod member counts can be modified by system" ON pod_member_counts;
CREATE POLICY "Pod member counts can be modified by system" ON pod_member_counts
  FOR ALL USING (true);

-- Policies for treasury transactions
DROP POLICY IF EXISTS "Treasury transactions are viewable by everyone" ON pod_treasury_transactions;
CREATE POLICY "Treasury transactions are viewable by everyone" ON pod_treasury_transactions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Treasury transactions can be inserted by authenticated users" ON pod_treasury_transactions;
CREATE POLICY "Treasury transactions can be inserted by authenticated users" ON pod_treasury_transactions
  FOR INSERT WITH CHECK (true);

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

-- Grant permissions to authenticated users
GRANT ALL ON pod_members TO authenticated;
GRANT ALL ON pod_member_counts TO authenticated;
GRANT ALL ON pod_treasury_transactions TO authenticated;

-- Grant permissions to anonymous users (read-only)
GRANT SELECT ON pod_members TO anon;
GRANT SELECT ON pod_member_counts TO anon;
GRANT SELECT ON active_pod_members TO anon;
GRANT SELECT ON pod_member_stats TO anon;

-- Grant permissions on views
GRANT SELECT ON active_pod_members TO authenticated;
GRANT SELECT ON pod_member_stats TO authenticated;

-- =====================================================
-- 8. INSERT SAMPLE DATA (optional - for testing)
-- =====================================================

-- Example: Insert some test data if needed
-- INSERT INTO pod_members (pod_id, wallet, membership_type, source) VALUES
-- ('your-pod-id-here', '0x1234...', 'leader', 'manual'),
-- ('your-pod-id-here', '0x5678...', 'member', 'manual');

-- =====================================================
-- SETUP COMPLETE
-- =====================================================

-- Verify the setup
SELECT 'Pod members setup completed successfully' as status;

-- Show created objects
SELECT 
  'Tables created: ' || string_agg(tablename, ', ') as tables
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('pod_members', 'pod_member_counts', 'pod_treasury_transactions');

SELECT 
  'Views created: ' || string_agg(viewname, ', ') as views
FROM pg_views 
WHERE schemaname = 'public' 
  AND viewname IN ('active_pod_members', 'pod_member_stats');
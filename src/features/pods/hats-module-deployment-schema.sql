-- HATS Module Deployment Schema
-- This file contains SQL schema for tracking HATS module deployments and sync status

-- Create table for tracking HATS module deployments
CREATE TABLE IF NOT EXISTS hats_module_deployments (
  id VARCHAR(255) PRIMARY KEY,
  pod_id VARCHAR(255) NOT NULL,
  hat_id VARCHAR(255) NOT NULL,
  module_address VARCHAR(42) NOT NULL DEFAULT '',
  implementation_address VARCHAR(42) NOT NULL,
  criteria_hash VARCHAR(64) NOT NULL,
  deployment_tx VARCHAR(66) NOT NULL DEFAULT '',
  deployment_block BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sync_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error')),
  sync_error TEXT,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key constraints
  CONSTRAINT fk_hats_module_pod FOREIGN KEY (pod_id) REFERENCES pods(id) ON DELETE CASCADE,
  
  -- Unique constraint to prevent duplicate deployments
  UNIQUE(pod_id, hat_id, is_active),
  
  -- Index for efficient queries
  INDEX idx_hats_module_pod_hat (pod_id, hat_id),
  INDEX idx_hats_module_sync_status (sync_status),
  INDEX idx_hats_module_active (is_active),
  INDEX idx_hats_module_criteria (criteria_hash)
);

-- Add sync-related columns to pod_role_permissions table if they don't exist
ALTER TABLE pod_role_permissions 
ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'error'));

ALTER TABLE pod_role_permissions 
ADD COLUMN IF NOT EXISTS sync_error TEXT;

ALTER TABLE pod_role_permissions 
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

-- Create indexes for sync columns
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_sync_status ON pod_role_permissions(sync_status);
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_last_synced ON pod_role_permissions(last_synced_at);

-- Create table for tracking module operation history
CREATE TABLE IF NOT EXISTS hats_module_operations (
  id SERIAL PRIMARY KEY,
  deployment_id VARCHAR(255) NOT NULL,
  operation_type VARCHAR(50) NOT NULL, -- 'deploy', 'update_criteria', 'validate', 'sync'
  operation_data JSONB,
  transaction_hash VARCHAR(66),
  block_number BIGINT,
  gas_used BIGINT,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  performed_by VARCHAR(42) NOT NULL, -- wallet address
  performed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key constraint
  CONSTRAINT fk_module_operations_deployment FOREIGN KEY (deployment_id) REFERENCES hats_module_deployments(id) ON DELETE CASCADE,
  
  -- Indexes
  INDEX idx_module_operations_deployment (deployment_id),
  INDEX idx_module_operations_type (operation_type),
  INDEX idx_module_operations_success (success),
  INDEX idx_module_operations_performed_at (performed_at)
);

-- Create table for caching onchain eligibility checks
CREATE TABLE IF NOT EXISTS onchain_eligibility_cache (
  id SERIAL PRIMARY KEY,
  module_address VARCHAR(42) NOT NULL,
  hat_id VARCHAR(255) NOT NULL,
  user_address VARCHAR(42) NOT NULL,
  eligible BOOLEAN NOT NULL,
  standing BOOLEAN NOT NULL,
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
  
  -- Unique constraint for caching
  UNIQUE(module_address, hat_id, user_address),
  
  -- Indexes
  INDEX idx_eligibility_cache_module_hat_user (module_address, hat_id, user_address),
  INDEX idx_eligibility_cache_expires (expires_at),
  INDEX idx_eligibility_cache_user (user_address)
);

-- Create function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_eligibility_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM onchain_eligibility_cache 
  WHERE expires_at < CURRENT_TIMESTAMP;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create stored procedure for syncing module deployment status
CREATE OR REPLACE FUNCTION sync_module_deployment_status(
  p_deployment_id VARCHAR(255),
  p_module_address VARCHAR(42),
  p_sync_status VARCHAR(20),
  p_sync_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE hats_module_deployments 
  SET 
    module_address = p_module_address,
    sync_status = p_sync_status,
    sync_error = p_sync_error,
    last_synced_at = CASE WHEN p_sync_status = 'synced' THEN CURRENT_TIMESTAMP ELSE last_synced_at END,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_deployment_id;
  
  -- Also update the corresponding pod_role_permissions record
  UPDATE pod_role_permissions 
  SET 
    sync_status = p_sync_status,
    sync_error = p_sync_error,
    last_synced_at = CASE WHEN p_sync_status = 'synced' THEN CURRENT_TIMESTAMP ELSE last_synced_at END,
    updated_at = CURRENT_TIMESTAMP
  WHERE pod_id = (SELECT pod_id FROM hats_module_deployments WHERE id = p_deployment_id)
    AND hat_id = (SELECT hat_id FROM hats_module_deployments WHERE id = p_deployment_id);
END;
$$ LANGUAGE plpgsql;

-- Create function to get pod sync health summary
CREATE OR REPLACE FUNCTION get_pod_sync_health(p_pod_id VARCHAR(255))
RETURNS TABLE (
  total_roles INTEGER,
  synced INTEGER,
  needs_update INTEGER,
  errors INTEGER,
  never_synced INTEGER,
  health_percentage INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH role_stats AS (
    SELECT 
      COUNT(*)::INTEGER as total,
      COUNT(CASE WHEN rp.sync_status = 'synced' THEN 1 END)::INTEGER as synced,
      COUNT(CASE WHEN rp.sync_status = 'error' THEN 1 END)::INTEGER as errors,
      COUNT(CASE WHEN rp.sync_status = 'pending' OR rp.sync_status IS NULL THEN 1 END)::INTEGER as pending,
      COUNT(CASE WHEN hmd.criteria_hash IS NOT NULL AND hmd.criteria_hash != rp.eligibility_criteria::text THEN 1 END)::INTEGER as needs_update_count
    FROM pod_role_permissions rp
    LEFT JOIN hats_module_deployments hmd ON hmd.pod_id = rp.pod_id AND hmd.hat_id = rp.hat_id AND hmd.is_active = true
    WHERE rp.pod_id = p_pod_id AND rp.is_active = true
  )
  SELECT 
    rs.total,
    rs.synced,
    rs.needs_update_count,
    rs.errors,
    rs.pending,
    CASE 
      WHEN rs.total = 0 THEN 100
      ELSE ((rs.synced::FLOAT / rs.total::FLOAT) * 100)::INTEGER
    END
  FROM role_stats rs;
END;
$$ LANGUAGE plpgsql;

-- Create view for easy querying of module deployment status
CREATE OR REPLACE VIEW pod_module_status AS
SELECT 
  p.id as pod_id,
  p.name as pod_name,
  rp.id as role_id,
  rp.role_name,
  rp.hat_id,
  COALESCE(hmd.module_address, '') as module_address,
  COALESCE(hmd.sync_status, 'never_synced') as deployment_status,
  rp.sync_status as role_sync_status,
  hmd.criteria_hash,
  hmd.last_synced_at as deployment_last_synced,
  rp.last_synced_at as role_last_synced,
  hmd.sync_error as deployment_error,
  rp.sync_error as role_error,
  hmd.created_at as deployment_created_at,
  rp.created_at as role_created_at,
  CASE 
    WHEN hmd.id IS NULL THEN 'never_deployed'
    WHEN hmd.sync_status = 'error' THEN 'error'
    WHEN rp.sync_status = 'error' THEN 'error'
    WHEN hmd.sync_status = 'synced' AND rp.sync_status = 'synced' THEN 'healthy'
    WHEN hmd.criteria_hash != rp.eligibility_criteria::text THEN 'needs_update'
    ELSE 'pending'
  END as overall_status
FROM pods p
JOIN pod_role_permissions rp ON rp.pod_id = p.id AND rp.is_active = true
LEFT JOIN hats_module_deployments hmd ON hmd.pod_id = p.id AND hmd.hat_id = rp.hat_id AND hmd.is_active = true
WHERE p.is_active = true;

-- Create RLS policies for hats_module_deployments
ALTER TABLE hats_module_deployments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view deployments for pods they have access to
CREATE POLICY hats_module_deployments_select_policy ON hats_module_deployments
  FOR SELECT USING (
    pod_id IN (
      SELECT pod_id FROM pod_role_permissions 
      WHERE created_by = auth.jwt() ->> 'wallet_address'
      OR updated_by = auth.jwt() ->> 'wallet_address'
    )
    OR auth.jwt() ->> 'wallet_address' IN (
      SELECT UNNEST(pod_leads) FROM pods WHERE id = pod_id
    )
  );

-- Policy: Only pod leaders can insert/update module deployments
CREATE POLICY hats_module_deployments_modify_policy ON hats_module_deployments
  FOR ALL USING (
    auth.jwt() ->> 'wallet_address' IN (
      SELECT UNNEST(pod_leads) FROM pods WHERE id = pod_id
    )
  );

-- Create RLS policies for module operations
ALTER TABLE hats_module_operations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view operations for their modules
CREATE POLICY hats_module_operations_select_policy ON hats_module_operations
  FOR SELECT USING (
    deployment_id IN (
      SELECT id FROM hats_module_deployments 
      WHERE pod_id IN (
        SELECT pod_id FROM pod_role_permissions 
        WHERE created_by = auth.jwt() ->> 'wallet_address'
        OR updated_by = auth.jwt() ->> 'wallet_address'
      )
    )
  );

-- Policy: Only authorized users can insert operations
CREATE POLICY hats_module_operations_insert_policy ON hats_module_operations
  FOR INSERT WITH CHECK (
    performed_by = auth.jwt() ->> 'wallet_address'
  );

-- Create RLS policies for eligibility cache
ALTER TABLE onchain_eligibility_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own eligibility cache entries
CREATE POLICY eligibility_cache_select_policy ON onchain_eligibility_cache
  FOR SELECT USING (
    user_address = auth.jwt() ->> 'wallet_address'
    OR module_address IN (
      SELECT module_address FROM hats_module_deployments 
      WHERE pod_id IN (
        SELECT pod_id FROM pod_role_permissions 
        WHERE created_by = auth.jwt() ->> 'wallet_address'
        OR updated_by = auth.jwt() ->> 'wallet_address'
      )
    )
  );

-- Policy: System can insert/update cache entries
CREATE POLICY eligibility_cache_modify_policy ON onchain_eligibility_cache
  FOR ALL USING (true); -- This would be restricted to service accounts in production

-- Create trigger to auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to hats_module_deployments
CREATE TRIGGER update_hats_module_deployments_updated_at 
  BEFORE UPDATE ON hats_module_deployments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hats_module_deployments_composite 
  ON hats_module_deployments(pod_id, hat_id, is_active, sync_status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pod_role_permissions_eligibility_sync 
  ON pod_role_permissions(pod_id, hat_id, sync_status, last_synced_at);

-- Add comments for documentation
COMMENT ON TABLE hats_module_deployments IS 'Tracks HATS protocol eligibility module deployments for pod roles';
COMMENT ON TABLE hats_module_operations IS 'Audit log of operations performed on HATS modules';
COMMENT ON TABLE onchain_eligibility_cache IS 'Caches onchain eligibility check results to reduce RPC calls';
COMMENT ON VIEW pod_module_status IS 'Comprehensive view of pod role and module deployment status';
COMMENT ON FUNCTION get_pod_sync_health(VARCHAR) IS 'Returns health metrics for pod module synchronization';
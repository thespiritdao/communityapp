-- Migration: Add proxy contract fields to pods table
-- Purpose: Store PodAuthProxy addresses for proper hat deactivation
-- Date: 2025-10-23

-- Add proxy contract address and proxy admin hat ID columns
ALTER TABLE pods
ADD COLUMN IF NOT EXISTS proxy_contract_address TEXT,
ADD COLUMN IF NOT EXISTS proxy_admin_hat_id TEXT;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_pods_proxy_contract_address ON pods(proxy_contract_address);
CREATE INDEX IF NOT EXISTS idx_pods_proxy_admin_hat_id ON pods(proxy_admin_hat_id);

-- Add comment for documentation
COMMENT ON COLUMN pods.proxy_contract_address IS 'Address of the PodAuthProxy contract instance for this pod';
COMMENT ON COLUMN pods.proxy_admin_hat_id IS 'HAT ID worn by the proxy contract, granting admin rights over pod hats';

-- Note: Backfill will be handled by separate sync service
-- Run this SQL in your Supabase SQL editor first

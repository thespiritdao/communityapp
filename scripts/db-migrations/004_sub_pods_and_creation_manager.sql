-- Migration 004: Sub-pod support
-- Adds creation_manager_address to pods and sub_pods_enabled to pod_modules

-- 1. Store each pod's own PodCreationManagerV2 address (deployed on activation)
ALTER TABLE pods
  ADD COLUMN IF NOT EXISTS creation_manager_address TEXT;

-- 2. Add sub-pods module flag + config to pod_modules
ALTER TABLE pod_modules
  ADD COLUMN IF NOT EXISTS sub_pods_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sub_pods_config JSONB NOT NULL DEFAULT '{}';

-- 3. Community-level pods manager is already deployed — backfill from env if needed.
--    Run this manually after setting the correct address:
-- UPDATE pods
--   SET creation_manager_address = '0x<COMMUNITY_MANAGER_ADDRESS>'
--   WHERE id = '86d2d359-2e38-4267-b7b7-c7f6155063e2';

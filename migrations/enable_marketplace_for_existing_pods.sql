-- Backward Compatibility Migration for Marketplace Module
-- This migration enables marketplace for all existing pods to maintain current functionality
-- Created: 2025-11-16
-- Part of: Marketplace Unified Permissions Migration

-- Enable marketplace module for all existing pods (backward compatibility)
-- Pods can disable it later via Pod Modules UI if desired
UPDATE pod_modules
SET marketplace_enabled = true
WHERE marketplace_enabled IS NULL OR marketplace_enabled = false;

-- Verify the update
SELECT
  pod_id,
  marketplace_enabled,
  bounties_enabled,
  events_enabled,
  treasury_enabled
FROM pod_modules
ORDER BY pod_id;

-- Expected result: All pods should now have marketplace_enabled = true

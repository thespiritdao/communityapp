-- Add governance as a per-pod toggleable module.
--
-- Governance has always been on-by-default for every pod. This makes it
-- an explicit module toggle so:
--   1. Sub-pods that delegate decisions to a parent pod can disable
--      their own proposal surface.
--   2. The Modules section in the leader panel becomes the canonical
--      home for governance configuration (matches every other capability).
--
-- DEFAULT TRUE preserves backward compatibility — every existing pod
-- continues to have governance enabled. Existing proposals are
-- preserved when a pod later turns governance off; only the
-- create-new-proposal surface goes away. In-flight votes still close
-- under the rules they were created with.

ALTER TABLE pod_modules
  ADD COLUMN IF NOT EXISTS governance_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS governance_config JSONB DEFAULT '{}';

COMMENT ON COLUMN pod_modules.governance_enabled IS
  'Off-chain governance module. When true: members can file pod-level proposals and the proposal/voting UI surfaces on the pod page. When false: existing proposals remain viewable until they close, but no new proposals can be filed. Default TRUE for backward compatibility.';

-- Existing pods get the default automatically via the column default.
-- No backfill needed.

-- Add governance_tier to pod_level_proposals
-- Implements the 3-tier governance model from architecture doc:
--   DAO_CONSTITUTIONAL  → always on-chain (Governor)
--   POD_TREASURY_BINDING → vote in DB → submit execution tx only if passed
--   POD_OPERATIONAL     → DB only, never on-chain

ALTER TABLE pod_level_proposals
  ADD COLUMN IF NOT EXISTS governance_tier TEXT
    NOT NULL
    DEFAULT 'POD_OPERATIONAL'
    CHECK (governance_tier IN ('DAO_CONSTITUTIONAL', 'POD_TREASURY_BINDING', 'POD_OPERATIONAL'));

CREATE INDEX IF NOT EXISTS idx_pod_level_proposals_tier
  ON pod_level_proposals(governance_tier);

COMMENT ON COLUMN pod_level_proposals.governance_tier IS
  'Governance tier: DAO_CONSTITUTIONAL (always on-chain), POD_TREASURY_BINDING (DB vote → conditional execution), POD_OPERATIONAL (DB only)';

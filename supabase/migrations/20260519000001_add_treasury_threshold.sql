-- Add treasury_threshold_bps column to pods.
-- Stores the initial threshold (in basis points, 5001-10000) chosen at pod
-- creation for the PodTreasuryV3 deploy. Existing pods (V2WithVoting) remain
-- NULL and continue to use their hardcoded 50%+1 majority on-chain.

ALTER TABLE pods
  ADD COLUMN IF NOT EXISTS treasury_threshold_bps INTEGER;

ALTER TABLE pods
  ADD CONSTRAINT pods_treasury_threshold_bps_range
  CHECK (treasury_threshold_bps IS NULL OR (treasury_threshold_bps BETWEEN 5001 AND 10000));

COMMENT ON COLUMN pods.treasury_threshold_bps IS
  'Basis points (5001-10000) for PodTreasuryV3 initial approval threshold. NULL for V2 pods.';

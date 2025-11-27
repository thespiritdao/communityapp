-- Add parent_hat_id column to pods table for efficient child index queries
-- This enables Spencer's solution for gasless Phase 6 elimination

-- Add the column (nullable initially for existing pods)
ALTER TABLE pods
ADD COLUMN IF NOT EXISTS parent_hat_id TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_pods_parent_hat_id ON pods(parent_hat_id);

-- Backfill existing pods from pod_metadata JSONB field
UPDATE pods
SET parent_hat_id = (pod_metadata->>'parent_hat_id')::TEXT
WHERE pod_metadata IS NOT NULL
  AND pod_metadata ? 'parent_hat_id'
  AND parent_hat_id IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN pods.parent_hat_id IS 'Parent HAT ID for this pod - used to predict child HAT indices for gasless pod creation';

-- Note: Future pod creations should set this field directly
-- The pod_metadata field will still contain this for backwards compatibility

-- Add blockchain_pod_id column to pods table
-- This column stores the factory contract's pod ID (format: "pod-{timestamp}-{random}")
-- which is different from the database's auto-generated UUID
--
-- Background: Pod creation generates a blockchain ID for the factory contract,
-- but the database uses auto-generated UUIDs. This column bridges the gap.

-- Add the column (nullable for backward compatibility with existing pods)
ALTER TABLE pods
ADD COLUMN IF NOT EXISTS blockchain_pod_id TEXT;

-- Add unique constraint (blockchain pod IDs must be unique)
ALTER TABLE pods
ADD CONSTRAINT unique_blockchain_pod_id UNIQUE (blockchain_pod_id);

-- Create index for fast lookups by blockchain_pod_id
CREATE INDEX IF NOT EXISTS idx_pods_blockchain_pod_id
ON pods(blockchain_pod_id);

-- Add comment explaining the column
COMMENT ON COLUMN pods.blockchain_pod_id IS
'Factory contract pod ID (format: pod-{timestamp}-{random}). Used for factory operations like eligibility criteria management. Different from the database UUID (id column).';

-- For existing pods without blockchain_pod_id:
-- Option 1: Leave NULL (they won't be able to use eligibility criteria until recreated)
-- Option 2: Generate blockchain_pod_id from their UUID (requires custom logic)
-- Option 3: Query factory contract to find matching pods (complex)

-- For now, we'll leave existing pods with NULL blockchain_pod_id
-- New pods created after this migration will have blockchain_pod_id populated

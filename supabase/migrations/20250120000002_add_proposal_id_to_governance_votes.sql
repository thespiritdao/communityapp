-- Add missing proposal_id column to governance_votes table
-- This is required for the voting system to work

-- Add proposal_id column if it doesn't exist
ALTER TABLE governance_votes
ADD COLUMN IF NOT EXISTS proposal_id TEXT NOT NULL DEFAULT '';

-- Update default to null after adding (can't have NOT NULL without default on existing rows)
ALTER TABLE governance_votes
ALTER COLUMN proposal_id DROP DEFAULT;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal_id
ON governance_votes(proposal_id);

-- Drop existing unique constraint if it exists (might not have proposal_id)
ALTER TABLE governance_votes
DROP CONSTRAINT IF EXISTS governance_votes_proposal_id_voter_address_key;

ALTER TABLE governance_votes
DROP CONSTRAINT IF EXISTS governance_votes_voter_address_key;

-- Add unique constraint (one vote per proposal per voter)
ALTER TABLE governance_votes
ADD CONSTRAINT governance_votes_proposal_voter_unique
UNIQUE (proposal_id, voter_address);

-- Make voter_address NOT NULL if it isn't already
ALTER TABLE governance_votes
ALTER COLUMN voter_address SET NOT NULL;

-- Make vote NOT NULL if it isn't already
ALTER TABLE governance_votes
ALTER COLUMN vote SET NOT NULL;

-- Add check constraint for vote values
ALTER TABLE governance_votes
DROP CONSTRAINT IF EXISTS governance_votes_vote_check;

ALTER TABLE governance_votes
ADD CONSTRAINT governance_votes_vote_check
CHECK (vote IN ('for', 'against', 'abstain'));

-- Verify the changes
DO $$
BEGIN
    RAISE NOTICE 'governance_votes table schema updated:';
    RAISE NOTICE '  ✅ proposal_id column added';
    RAISE NOTICE '  ✅ UNIQUE constraint on (proposal_id, voter_address)';
    RAISE NOTICE '  ✅ Vote check constraint (for, against, abstain)';
    RAISE NOTICE '  ✅ Performance indexes created';
END $$;

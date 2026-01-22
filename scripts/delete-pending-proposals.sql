-- Delete all pending proposals with temp_ IDs
-- Run this in your Supabase SQL editor

DELETE FROM proposal_metadata
WHERE onchain_proposal_id LIKE 'temp_%';

-- Verify deletion
SELECT COUNT(*) as remaining_pending_proposals
FROM proposal_metadata
WHERE onchain_proposal_id LIKE 'temp_%';

-- Cleanup Script: Remove Test Governance Proposals
-- Run this in Supabase SQL Editor to clean up test data

-- =====================================================
-- STEP 1: Delete Pod-Level Proposals
-- =====================================================
-- These are the 3 proposals showing in your /governance page
DELETE FROM pod_level_proposals
WHERE title IN (
  'rrrrrrrrrrrrrrrrrrrrrrrr',
  'ttttttttttttttttttttttttttt',
  'ffffffffffffffffff'
);

-- Or delete ALL pod-level proposals (if all are test data):
-- DELETE FROM pod_level_proposals;

-- =====================================================
-- STEP 2: Delete Pod-Level Proposal Votes
-- =====================================================
DELETE FROM pod_level_votes;

-- =====================================================
-- STEP 3: Delete DAO-Wide Governance Proposals
-- =====================================================
-- Delete from proposal_metadata (your main proposals table)
DELETE FROM proposal_metadata;

-- =====================================================
-- STEP 4: Delete DAO-Wide Governance Votes
-- =====================================================
DELETE FROM governance_votes;

-- Delete aggregated vote counts
DELETE FROM governance_proposal_votes;

-- =====================================================
-- STEP 5: Delete Pod Creation Proposals
-- =====================================================
-- If you want to clean up pod creation proposals too
-- (only delete pods with status 'proposed' or 'draft')
DELETE FROM pods
WHERE status IN ('proposed', 'draft');

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Run these to verify all test data is removed:

SELECT COUNT(*) as pod_level_proposals FROM pod_level_proposals;
-- Expected: 0

SELECT COUNT(*) as dao_proposals FROM proposal_metadata;
-- Expected: 0

SELECT COUNT(*) as pod_level_votes FROM pod_level_votes;
-- Expected: 0

SELECT COUNT(*) as governance_votes FROM governance_votes;
-- Expected: 0

SELECT COUNT(*) as governance_vote_counts FROM governance_proposal_votes;
-- Expected: 0

-- =====================================================
-- NOTES
-- =====================================================
-- After running this script:
-- 1. Navigate to /governance in your app
-- 2. You should see: "No proposals available"
-- 3. Console should show: "✅ Loaded 0 pod-level proposals"
-- 4. No proposal cards should display

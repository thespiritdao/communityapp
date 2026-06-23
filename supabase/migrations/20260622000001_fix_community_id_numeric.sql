-- FIX: self_mint_queue.community_id must hold a uint224, not bigint.
--
-- communityId = keccak256(pod_uuid) & (2^224 - 1) — a ~67-digit integer, far
-- beyond bigint's max (~9.2e18). The original migration (20260616000001)
-- declared it BIGINT, which overflows on EVERY real earning insert (error
-- 22003 "out of range for type bigint"). This silently broke the earn-loop:
-- queueEarning threw on insert, and because the vote/bounty triggers are
-- fire-and-forget, the failure was invisible. Widen to NUMERIC(78,0) (holds any
-- uint256), matching the hours columns.
--
-- Apply manually via the Supabase SQL editor (project convention).

ALTER TABLE self_mint_queue
  ALTER COLUMN community_id TYPE NUMERIC(78,0) USING community_id::numeric;

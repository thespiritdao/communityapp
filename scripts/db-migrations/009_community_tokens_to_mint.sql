-- Migration 009: Add community_tokens_to_mint to pending_donations
-- Tracks the 4% community pool allocation ($SYSTEM minted to Exec Pod treasury)
-- separate from system_tokens_to_mint (donor allocation)

ALTER TABLE pending_donations
  ADD COLUMN IF NOT EXISTS community_tokens_to_mint NUMERIC(18, 8) DEFAULT 0;

COMMENT ON COLUMN pending_donations.community_tokens_to_mint IS
  '4% of net donation minted as $SYSTEM to Exec Pod treasury (community pool)';

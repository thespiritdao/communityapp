-- $SELF Phase 1b: add estimated_hours to bounties.
--
-- The poster's estimate of how many participation-hours the bounty represents.
-- On work approval, this is credited to the completer as $SELF (hour-anchored).
-- Whole hours; 0/absent ⇒ the bounty earns no $SELF (still fully functional).
--
-- Apply manually via the Supabase SQL editor (project convention).

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC NOT NULL DEFAULT 0
  CHECK (estimated_hours >= 0);

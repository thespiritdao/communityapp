-- Per-proposal token eligibility snapshots (TreeGens / Hydrex integration).
--
-- Pods that opt in (gov_snapshot_enabled) capture, at proposal publication,
-- each eligible voter's qualifying token amount (held + Hydrex-staked) and
-- whether it clears gov_snapshot_minimum. Voting on that proposal then
-- requires a passing row. Tallying remains 1-person-1-vote; this is an
-- eligibility-freshness gate, not token weighting.
--
-- Apply manually via the Supabase SQL editor (project convention).

-- Pod-level config: disabled by default; a pod gates nothing until an admin
-- deliberately sets all three values.
ALTER TABLE pods
  ADD COLUMN IF NOT EXISTS gov_snapshot_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gov_snapshot_token_id TEXT,
  ADD COLUMN IF NOT EXISTS gov_snapshot_minimum NUMERIC;

CREATE TABLE IF NOT EXISTS proposal_eligibility_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES pod_level_proposals(id) ON DELETE CASCADE,
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  token_id TEXT NOT NULL,
  held_amount NUMERIC NOT NULL DEFAULT 0,
  staked_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  minimum_required NUMERIC NOT NULL,
  passed BOOLEAN NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, wallet)
);

CREATE INDEX IF NOT EXISTS idx_proposal_eligibility_snapshots_proposal
  ON proposal_eligibility_snapshots (proposal_id);

ALTER TABLE proposal_eligibility_snapshots ENABLE ROW LEVEL SECURITY;

-- Reads: any authenticated user (snapshot rows are governance-transparency
-- data, same visibility as the proposals they belong to).
CREATE POLICY proposal_eligibility_snapshots_select
  ON proposal_eligibility_snapshots
  FOR SELECT TO authenticated
  USING (true);

-- Inserts: authenticated users — rows are written from the client during
-- proposal creation, mirroring the trust model of pod_level_proposals itself.
-- No UPDATE/DELETE policies: snapshots are immutable once captured.
CREATE POLICY proposal_eligibility_snapshots_insert
  ON proposal_eligibility_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (true);

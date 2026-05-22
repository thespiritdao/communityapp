-- Path B: per-pod voter-base toggle for off-chain governance.
--
-- Adds two nullable columns to `pods` so each pod can choose, per tier,
-- whether voting is open to leaders only or to all pod members:
--
--   'leaders'     → narrowed to pod_members.membership_type IN ('leader','admin')
--   'all_members' → any active pod_member with governanceParticipation
--                   permission on their role
--
-- NULL = use platform default. Platform defaults are now all_members for
-- both tiers (leaders-only is an opt-in narrowing). Per-role
-- governanceParticipation permission remains the highest-order signal:
-- a user with that permission OFF cannot vote regardless of voter_base.

ALTER TABLE pods
  ADD COLUMN IF NOT EXISTS gov_op_voter_base       TEXT,
  ADD COLUMN IF NOT EXISTS gov_treasury_voter_base TEXT;

ALTER TABLE pods
  ADD CONSTRAINT pods_gov_op_voter_base_check
    CHECK (gov_op_voter_base IS NULL OR gov_op_voter_base IN ('leaders', 'all_members')),
  ADD CONSTRAINT pods_gov_treasury_voter_base_check
    CHECK (gov_treasury_voter_base IS NULL OR gov_treasury_voter_base IN ('leaders', 'all_members'));

COMMENT ON COLUMN pods.gov_op_voter_base IS
  'POD_OPERATIONAL voter base: NULL=use platform default (all_members), or explicit leaders/all_members.';
COMMENT ON COLUMN pods.gov_treasury_voter_base IS
  'POD_TREASURY_BINDING voter base: NULL=use platform default (all_members), or explicit leaders/all_members.';

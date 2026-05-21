-- Pod-level governance configurability (Layer A).
--
-- Adds per-pod configuration columns for two governance tiers
-- (POD_OPERATIONAL and POD_TREASURY_BINDING) covering quorum %,
-- approval %, and voting period in hours. NULL = "use platform default"
-- so existing pods continue to behave exactly as before until a leader
-- explicitly opens the new Governance Settings UI.
--
-- Also adds per-proposal stricter override columns so a proposal author
-- can opt into a stricter approval/quorum bar than the pod default for
-- a single proposal (cannot go below the pod default).
--
-- `eligible_voter_count` is snapshotted at proposal creation so quorum is
-- computed against membership-at-creation, not membership-at-close.
--
-- DAO_CONSTITUTIONAL is unchanged here (on-chain Governor; Layer B).

ALTER TABLE pods
  ADD COLUMN IF NOT EXISTS gov_op_quorum_bps         INTEGER,
  ADD COLUMN IF NOT EXISTS gov_op_approval_bps       INTEGER,
  ADD COLUMN IF NOT EXISTS gov_op_voting_hours       INTEGER,
  ADD COLUMN IF NOT EXISTS gov_treasury_quorum_bps   INTEGER,
  ADD COLUMN IF NOT EXISTS gov_treasury_approval_bps INTEGER,
  ADD COLUMN IF NOT EXISTS gov_treasury_voting_hours INTEGER;

ALTER TABLE pods
  ADD CONSTRAINT pods_gov_op_quorum_range
    CHECK (gov_op_quorum_bps         IS NULL OR (gov_op_quorum_bps         BETWEEN 2000 AND 10000)),
  ADD CONSTRAINT pods_gov_op_approval_range
    CHECK (gov_op_approval_bps       IS NULL OR (gov_op_approval_bps       BETWEEN 5001 AND 10000)),
  ADD CONSTRAINT pods_gov_op_hours_range
    CHECK (gov_op_voting_hours       IS NULL OR (gov_op_voting_hours       BETWEEN 12 AND 720)),
  ADD CONSTRAINT pods_gov_treasury_quorum_range
    CHECK (gov_treasury_quorum_bps   IS NULL OR (gov_treasury_quorum_bps   BETWEEN 2000 AND 10000)),
  ADD CONSTRAINT pods_gov_treasury_approval_range
    CHECK (gov_treasury_approval_bps IS NULL OR (gov_treasury_approval_bps BETWEEN 5001 AND 10000)),
  ADD CONSTRAINT pods_gov_treasury_hours_range
    CHECK (gov_treasury_voting_hours IS NULL OR (gov_treasury_voting_hours BETWEEN 12 AND 720));

COMMENT ON COLUMN pods.gov_op_quorum_bps IS
  'POD_OPERATIONAL quorum threshold in basis points (2000-10000). NULL = platform default (30%).';
COMMENT ON COLUMN pods.gov_op_approval_bps IS
  'POD_OPERATIONAL approval threshold in basis points (5001-10000). NULL = platform default (50.01%).';
COMMENT ON COLUMN pods.gov_op_voting_hours IS
  'POD_OPERATIONAL voting period in hours (12-720). NULL = platform default (72).';
COMMENT ON COLUMN pods.gov_treasury_quorum_bps IS
  'POD_TREASURY_BINDING quorum threshold in basis points (2000-10000). NULL = platform default (50%).';
COMMENT ON COLUMN pods.gov_treasury_approval_bps IS
  'POD_TREASURY_BINDING approval threshold in basis points (5001-10000). NULL = platform default (66%).';
COMMENT ON COLUMN pods.gov_treasury_voting_hours IS
  'POD_TREASURY_BINDING voting period in hours (12-720). NULL = platform default (72).';

ALTER TABLE pod_level_proposals
  ADD COLUMN IF NOT EXISTS approval_threshold_bps INTEGER,
  ADD COLUMN IF NOT EXISTS quorum_threshold_bps   INTEGER,
  ADD COLUMN IF NOT EXISTS eligible_voter_count   INTEGER;

ALTER TABLE pod_level_proposals
  ADD CONSTRAINT pod_level_proposals_approval_range
    CHECK (approval_threshold_bps IS NULL OR (approval_threshold_bps BETWEEN 5001 AND 10000)),
  ADD CONSTRAINT pod_level_proposals_quorum_range
    CHECK (quorum_threshold_bps   IS NULL OR (quorum_threshold_bps   BETWEEN 2000 AND 10000));

COMMENT ON COLUMN pod_level_proposals.approval_threshold_bps IS
  'Effective approval threshold in basis points for this proposal. NULL on pre-PR rows = grandfathered to simple majority.';
COMMENT ON COLUMN pod_level_proposals.quorum_threshold_bps IS
  'Effective quorum threshold in basis points for this proposal. NULL on pre-PR rows = grandfathered (no quorum check).';
COMMENT ON COLUMN pod_level_proposals.eligible_voter_count IS
  'Snapshot of eligible voter count at proposal creation, used as quorum denominator. NULL = pre-PR row.';

-- pod_deletion_proposals is the real leader-multisig table used by the
-- pod-deletion API (src/app/api/pod-deletion/create-proposal/route.ts).
-- Adding the same approval_threshold_bps column so deletion proposals
-- snapshot the effective threshold they were created under.
ALTER TABLE pod_deletion_proposals
  ADD COLUMN IF NOT EXISTS approval_threshold_bps INTEGER;

ALTER TABLE pod_deletion_proposals
  ADD CONSTRAINT pod_deletion_proposals_approval_range
    CHECK (approval_threshold_bps IS NULL OR (approval_threshold_bps BETWEEN 5001 AND 10000));

COMMENT ON COLUMN pod_deletion_proposals.approval_threshold_bps IS
  'Effective approval threshold in basis points used to derive required_approvals at proposal creation. NULL on pre-PR rows.';

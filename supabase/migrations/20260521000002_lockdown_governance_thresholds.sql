-- Lock down the governance threshold columns introduced in
-- 20260521000001_add_governance_thresholds.sql so that:
--
-- 1. The per-pod governance configuration on `pods` (gov_* columns) can
--    only be changed by leaders of that pod.
-- 2. The per-proposal threshold columns on `pod_level_proposals` and
--    `pod_governance_proposals` are immutable after row creation — they
--    are a snapshot of the rules a proposal was created under and must
--    not drift.
--
-- PostgreSQL row-level security gates ENTIRE rows, not individual
-- columns. To enforce "you may UPDATE this row but you may not touch
-- THESE columns," we use BEFORE UPDATE triggers that raise an exception
-- if a locked column changes.

-- ---------------------------------------------------------------------
-- pods.gov_* — writable only by pod leaders
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_pod_governance_config_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_wallet TEXT;
  is_leader BOOLEAN;
  gov_changed BOOLEAN;
BEGIN
  -- Detect whether any of the gov_* columns actually changed.
  gov_changed := (
    OLD.gov_op_quorum_bps         IS DISTINCT FROM NEW.gov_op_quorum_bps
    OR OLD.gov_op_approval_bps    IS DISTINCT FROM NEW.gov_op_approval_bps
    OR OLD.gov_op_voting_hours    IS DISTINCT FROM NEW.gov_op_voting_hours
    OR OLD.gov_treasury_quorum_bps   IS DISTINCT FROM NEW.gov_treasury_quorum_bps
    OR OLD.gov_treasury_approval_bps IS DISTINCT FROM NEW.gov_treasury_approval_bps
    OR OLD.gov_treasury_voting_hours IS DISTINCT FROM NEW.gov_treasury_voting_hours
  );

  IF NOT gov_changed THEN
    RETURN NEW;
  END IF;

  -- Service role (server-side admin client) bypasses the leader check.
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RETURN NEW;
  END IF;

  caller_wallet := lower(coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
    ''
  ));

  IF caller_wallet = '' THEN
    RAISE EXCEPTION 'Governance config can only be modified by a pod leader (no wallet on request)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM unnest(NEW.pod_leads) AS lead_addr
    WHERE lower(lead_addr) = caller_wallet
  ) INTO is_leader;

  IF NOT is_leader THEN
    RAISE EXCEPTION 'Only pod leaders may update governance config columns';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pods_governance_config_authority ON pods;
CREATE TRIGGER pods_governance_config_authority
BEFORE UPDATE OF
  gov_op_quorum_bps,
  gov_op_approval_bps,
  gov_op_voting_hours,
  gov_treasury_quorum_bps,
  gov_treasury_approval_bps,
  gov_treasury_voting_hours
ON pods
FOR EACH ROW
EXECUTE FUNCTION enforce_pod_governance_config_authority();

-- ---------------------------------------------------------------------
-- pod_level_proposals.{approval_threshold_bps, quorum_threshold_bps,
--                     eligible_voter_count} — immutable after INSERT
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION freeze_pod_level_proposal_thresholds()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.approval_threshold_bps IS DISTINCT FROM NEW.approval_threshold_bps THEN
    RAISE EXCEPTION 'approval_threshold_bps is immutable after proposal creation';
  END IF;
  IF OLD.quorum_threshold_bps IS DISTINCT FROM NEW.quorum_threshold_bps THEN
    RAISE EXCEPTION 'quorum_threshold_bps is immutable after proposal creation';
  END IF;
  IF OLD.eligible_voter_count IS DISTINCT FROM NEW.eligible_voter_count THEN
    RAISE EXCEPTION 'eligible_voter_count is immutable after proposal creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pod_level_proposals_freeze_thresholds ON pod_level_proposals;
CREATE TRIGGER pod_level_proposals_freeze_thresholds
BEFORE UPDATE OF
  approval_threshold_bps,
  quorum_threshold_bps,
  eligible_voter_count
ON pod_level_proposals
FOR EACH ROW
EXECUTE FUNCTION freeze_pod_level_proposal_thresholds();

-- ---------------------------------------------------------------------
-- pod_deletion_proposals.approval_threshold_bps — immutable after INSERT
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION freeze_pod_deletion_proposal_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.approval_threshold_bps IS DISTINCT FROM NEW.approval_threshold_bps THEN
    RAISE EXCEPTION 'approval_threshold_bps is immutable after proposal creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pod_deletion_proposals_freeze_threshold ON pod_deletion_proposals;
CREATE TRIGGER pod_deletion_proposals_freeze_threshold
BEFORE UPDATE OF approval_threshold_bps
ON pod_deletion_proposals
FOR EACH ROW
EXECUTE FUNCTION freeze_pod_deletion_proposal_threshold();

COMMENT ON FUNCTION enforce_pod_governance_config_authority IS
  'Pod gov_* columns: writable only by listed pod leaders (or service role).';
COMMENT ON FUNCTION freeze_pod_level_proposal_thresholds IS
  'pod_level_proposals threshold/quorum/eligible columns: immutable after insert.';
COMMENT ON FUNCTION freeze_pod_deletion_proposal_threshold IS
  'pod_deletion_proposals.approval_threshold_bps: immutable after insert.';

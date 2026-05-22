-- Pulse triggers for proposal creation. Mirrors the pattern in
-- 20260428000001_pulse_forum_triggers.sql / _pulse_bounty_pod_triggers.sql.
--
-- Two proposal tables need coverage:
--
-- 1. pod_level_proposals — pod-scoped proposals (off-chain and treasury-binding).
--    URL uses ?proposal= deep-link form because there's no detail page for
--    UUID ids; the modal on /governance handles them.
--
-- 2. proposal_metadata — DAO-wide on-chain proposals indexed from the
--    DAOGovernor contract. URL uses the legacy /governance/<numeric-id>
--    detail page (now fixed to use OZ v5 ABI in commit 2228a316).
--
-- Both use EXCEPTION WHEN OTHERS THEN NULL so a trigger failure can never
-- block the underlying INSERT — matches established convention.

-- ── pod-level proposal created ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_pod_level_proposal_created()
RETURNS TRIGGER AS $$
DECLARE
  proposal_url TEXT;
BEGIN
  BEGIN
    proposal_url := '/governance?proposal=' || NEW.id::text;
    INSERT INTO explorer_events (
      type, category, title, actor, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'proposal_created',
      'governance',
      CASE
        WHEN NEW.governance_tier = 'POD_TREASURY_BINDING'
          THEN 'Pod treasury proposal created: ' || NEW.title
        ELSE 'Pod proposal created: ' || NEW.title
      END,
      LOWER(NEW.created_by),
      NEW.pod_id,
      proposal_url,
      jsonb_build_object(
        'proposal_id', NEW.id,
        'governance_tier', NEW.governance_tier,
        'voting_deadline', NEW.voting_deadline,
        'approval_threshold_bps', NEW.approval_threshold_bps,
        'quorum_threshold_bps', NEW.quorum_threshold_bps,
        'eligible_voter_count', NEW.eligible_voter_count,
        'onchain_proposal_id', NEW.onchain_proposal_id
      ),
      'proposal_created:pod_level:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_pod_level_proposal_created ON pod_level_proposals;
CREATE TRIGGER trg_pulse_pod_level_proposal_created
  AFTER INSERT ON pod_level_proposals
  FOR EACH ROW EXECUTE FUNCTION pulse_log_pod_level_proposal_created();

-- ── DAO-wide on-chain proposal created ───────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_dao_proposal_created()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, url, metadata, dedupe_key
    ) VALUES (
      'proposal_created',
      'governance',
      'DAO proposal created: ' || NEW.title,
      LOWER(NEW.proposer_address),
      '/governance/' || NEW.onchain_proposal_id,
      jsonb_build_object(
        'onchain_proposal_id', NEW.onchain_proposal_id,
        'forum_thread_id', NEW.forum_thread_id,
        'source', 'dao_wide'
      ),
      'proposal_created:dao_wide:' || NEW.onchain_proposal_id
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_dao_proposal_created ON proposal_metadata;
CREATE TRIGGER trg_pulse_dao_proposal_created
  AFTER INSERT ON proposal_metadata
  FOR EACH ROW EXECUTE FUNCTION pulse_log_dao_proposal_created();

COMMENT ON FUNCTION pulse_log_pod_level_proposal_created IS
  'Writes a proposal_created explorer_events row when a pod-level proposal is inserted. URL is the ?proposal= deep-link form because pod-level proposals are rendered via ProposalModal on /governance, not a dedicated detail page.';
COMMENT ON FUNCTION pulse_log_dao_proposal_created IS
  'Writes a proposal_created explorer_events row when a DAO-wide on-chain proposal is recorded in proposal_metadata. URL points at the legacy /governance/<numeric-id> detail page.';

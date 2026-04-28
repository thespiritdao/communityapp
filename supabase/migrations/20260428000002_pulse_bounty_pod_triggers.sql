-- Migration: Pulse triggers for bounty + pod-lifecycle events
--
-- Same pattern as the forum trigger migration: writes that happen client-side
-- or via status UPDATEs (rather than dedicated server routes) get surfaced
-- via DB triggers. SECURITY DEFINER lets the trigger insert into
-- explorer_events under the service_role policy regardless of caller RLS.
-- Every trigger body is wrapped in EXCEPTION WHEN OTHERS THEN NULL so a
-- Pulse-write hiccup can never break the source insert/update.

-- ── bid_placed ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_bid_placed()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, url, metadata, dedupe_key
    ) VALUES (
      'bid_placed',
      'bounties',
      'Bid placed on a bounty',
      LOWER(NEW.bidder_address),
      '/bounty/' || NEW.bounty_id::text,
      jsonb_build_object(
        'bid_id', NEW.id,
        'bounty_id', NEW.bounty_id,
        'proposed_amount', NEW.proposed_amount,
        'placement_tx_hash', NEW.placement_tx_hash
      ),
      'bid_placed:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_bid_placed ON bids;
CREATE TRIGGER trg_pulse_bid_placed
  AFTER INSERT ON bids
  FOR EACH ROW EXECUTE FUNCTION pulse_log_bid_placed();

-- ── bid_accepted / bid_rejected (status transitions on bids) ──────────────────
-- Maps bids.status changes to Pulse event types. We only fire when the
-- status actually changes and is one of the recognized terminal values.
CREATE OR REPLACE FUNCTION pulse_log_bid_status_change()
RETURNS TRIGGER AS $$
DECLARE
  evt TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      evt := CASE
        WHEN NEW.status IN ('accepted', 'work_approved') THEN 'bid_accepted'
        WHEN NEW.status IN ('rejected', 'declined') THEN 'bid_rejected'
        ELSE NULL
      END;
      IF evt IS NOT NULL THEN
        INSERT INTO explorer_events (
          type, category, title, actor, url, metadata, dedupe_key
        ) VALUES (
          evt,
          'bounties',
          CASE WHEN evt = 'bid_accepted' THEN 'Bid accepted' ELSE 'Bid rejected' END,
          LOWER(COALESCE(NEW.reviewer_address, NEW.final_approver_address, NEW.bidder_address)),
          '/bounty/' || NEW.bounty_id::text,
          jsonb_build_object(
            'bid_id', NEW.id,
            'bounty_id', NEW.bounty_id,
            'bidder_address', LOWER(NEW.bidder_address),
            'new_status', NEW.status
          ),
          evt || ':' || NEW.id::text
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_bid_status_change ON bids;
CREATE TRIGGER trg_pulse_bid_status_change
  AFTER UPDATE OF status ON bids
  FOR EACH ROW EXECUTE FUNCTION pulse_log_bid_status_change();

-- ── bid_review_submitted ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_bid_review()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, metadata, dedupe_key
    ) VALUES (
      'bid_review_submitted',
      'bounties',
      'Bid review submitted',
      LOWER(NEW.reviewer_address),
      jsonb_build_object(
        'bid_review_id', NEW.id,
        'bid_id', NEW.bid_id,
        'review_type', NEW.review_type,
        'status', NEW.status
      ),
      'bid_review_submitted:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_bid_review ON bid_reviews;
CREATE TRIGGER trg_pulse_bid_review
  AFTER INSERT ON bid_reviews
  FOR EACH ROW EXECUTE FUNCTION pulse_log_bid_review();

-- ── milestone_reached (milestones.status transitions to completed) ────────────
CREATE OR REPLACE FUNCTION pulse_log_milestone_reached()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    BEGIN
      INSERT INTO explorer_events (
        type, category, title, actor, url, metadata, dedupe_key
      ) VALUES (
        'milestone_reached',
        'bounties',
        'Milestone reached: ' || COALESCE(NEW.deliverable_description, 'a milestone'),
        LOWER(COALESCE(NEW.completed_by, '')),
        '/bounty/' || NEW.bounty_id::text,
        jsonb_build_object(
          'milestone_id', NEW.id,
          'bid_id', NEW.bid_id,
          'bounty_id', NEW.bounty_id,
          'payment_amount', NEW.payment_amount
        ),
        'milestone_reached:' || NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_milestone_reached ON milestones;
CREATE TRIGGER trg_pulse_milestone_reached
  AFTER UPDATE OF status ON milestones
  FOR EACH ROW EXECUTE FUNCTION pulse_log_milestone_reached();

-- ── dispute_mediator_assigned ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_dispute_mediator_assigned()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, recipient_address, metadata, dedupe_key
    ) VALUES (
      'dispute_mediator_assigned',
      'bounties',
      'Mediator assigned to dispute',
      LOWER(NEW.assigned_by),
      LOWER(NEW.mediator_address),
      jsonb_build_object(
        'dispute_id', NEW.dispute_id,
        'mediator_address', LOWER(NEW.mediator_address)
      ),
      'dispute_mediator_assigned:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_dispute_mediator_assigned ON dispute_mediators;
CREATE TRIGGER trg_pulse_dispute_mediator_assigned
  AFTER INSERT ON dispute_mediators
  FOR EACH ROW EXECUTE FUNCTION pulse_log_dispute_mediator_assigned();

-- ── pod_member_applied ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_pod_member_applied()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'pod_member_applied',
      'members',
      'Applied to join a pod',
      LOWER(NEW.applicant_address),
      NEW.pod_id,
      '/pods/' || NEW.pod_id::text,
      jsonb_build_object(
        'application_id', NEW.id,
        'intended_role', NEW.intended_role
      ),
      'pod_member_applied:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_pod_member_applied ON pod_membership_applications;
CREATE TRIGGER trg_pulse_pod_member_applied
  AFTER INSERT ON pod_membership_applications
  FOR EACH ROW EXECUTE FUNCTION pulse_log_pod_member_applied();

-- ── pod_member_approved / pod_member_rejected ─────────────────────────────────
-- Status transitions on pod_membership_applications.
CREATE OR REPLACE FUNCTION pulse_log_pod_member_status_change()
RETURNS TRIGGER AS $$
DECLARE
  evt TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      evt := CASE
        WHEN NEW.status = 'approved' THEN 'pod_member_approved'
        WHEN NEW.status = 'rejected' THEN 'pod_member_rejected'
        ELSE NULL
      END;
      IF evt IS NOT NULL THEN
        INSERT INTO explorer_events (
          type, category, title, actor, recipient_address, pod_id, url, metadata, dedupe_key
        ) VALUES (
          evt,
          'members',
          CASE WHEN evt = 'pod_member_approved'
            THEN 'Pod application approved'
            ELSE 'Pod application rejected' END,
          NULL, -- approver identity isn't stored on the row directly
          LOWER(NEW.applicant_address),
          NEW.pod_id,
          '/pods/' || NEW.pod_id::text,
          jsonb_build_object(
            'application_id', NEW.id,
            'applicant_address', LOWER(NEW.applicant_address),
            'rejection_reason', NEW.rejection_reason
          ),
          evt || ':' || NEW.id::text
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_pod_member_status_change ON pod_membership_applications;
CREATE TRIGGER trg_pulse_pod_member_status_change
  AFTER UPDATE OF status ON pod_membership_applications
  FOR EACH ROW EXECUTE FUNCTION pulse_log_pod_member_status_change();

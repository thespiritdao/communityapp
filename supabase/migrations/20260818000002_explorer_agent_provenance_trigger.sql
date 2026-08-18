-- 20260818000002_explorer_agent_provenance_trigger.sql
--
-- Congregant Phase 3: structural provenance for the Pulse ledger.
--
-- explorer_events rows are written by the service role on behalf of every
-- actor (human and agent), so actor_type cannot be trusted to call sites.
-- This trigger stamps it in the database: any row whose actor is a known
-- agent wallet is marked 'agent' regardless of what the writer claimed —
-- and vice versa, a human actor can never be mislabeled as an agent.

CREATE OR REPLACE FUNCTION public.stamp_explorer_actor_type()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.actor_type := CASE WHEN is_agent_wallet(NEW.actor) THEN 'agent' ELSE 'human' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_explorer_actor_type ON explorer_events;
CREATE TRIGGER trg_stamp_explorer_actor_type
  BEFORE INSERT ON explorer_events
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_explorer_actor_type();

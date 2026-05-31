-- Scope a gating-enabled community token to the pod(s) it belongs to.
--
-- Context: `gating_enabled` controls WHETHER a token can gate a role at all, but
-- not WHICH communities may select it. Without scoping, a community token like
-- $TGN would appear in every pod's governance-token dropdown. This adds an owning
-- pod so a community token is offered only inside its own community.
--
-- Semantics:
--   owner_pod_id = <pod uuid>  -> token is selectable ONLY in that pod (e.g. $TGN
--                                  for the TreeGens pod).
--   owner_pod_id IS NULL       -> platform-wide token, selectable in any pod
--                                  (the existing behaviour for any blessed token).
--
-- Idempotent: safe to re-run.

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS owner_pod_id UUID REFERENCES pods(id);

COMMENT ON COLUMN tokens.owner_pod_id IS
  'Community scope for gating: when set, this token may gate roles ONLY in that pod. NULL = platform-wide. Keeps a community token (e.g. $TGN) out of other communities'' governance settings.';

-- Video call session management and WebRTC signaling
--
-- Architecture:
--   video_call_sessions  — tracks the lifecycle of a call (ringing → active → ended)
--   video_call_signaling — ephemeral WebRTC signaling messages (offer/answer/ICE candidates)
--
-- Signaling uses Supabase Realtime (postgres_changes) so no dedicated websocket server needed.
-- ICE candidates accumulate during negotiation; old rows are cleaned up when the session ends.

-- ─── Sessions ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS video_call_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_wallet  VARCHAR NOT NULL,
  recipient_wallet  VARCHAR NOT NULL,
  status            VARCHAR NOT NULL DEFAULT 'ringing'
                    CHECK (status IN ('ringing', 'accepted', 'active', 'declined', 'ended', 'missed')),
  is_group          BOOLEAN NOT NULL DEFAULT false,
  group_participants JSONB,          -- array of wallet addresses for group calls
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_initiator FOREIGN KEY (initiator_wallet)
    REFERENCES user_profiles(wallet_address) ON DELETE CASCADE,
  CONSTRAINT fk_recipient FOREIGN KEY (recipient_wallet)
    REFERENCES user_profiles(wallet_address) ON DELETE CASCADE
);

CREATE INDEX idx_vcs_recipient ON video_call_sessions (recipient_wallet, status);
CREATE INDEX idx_vcs_initiator ON video_call_sessions (initiator_wallet, created_at DESC);

-- ─── Signaling ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS video_call_signaling (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES video_call_sessions(id) ON DELETE CASCADE,
  from_wallet  VARCHAR NOT NULL,
  to_wallet    VARCHAR NOT NULL,
  message_type VARCHAR NOT NULL
               CHECK (message_type IN ('offer', 'answer', 'ice_candidate')),
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vcsi_session_to ON video_call_signaling (session_id, to_wallet, created_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE video_call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_call_signaling ENABLE ROW LEVEL SECURITY;

-- Sessions: participants can read their own calls
CREATE POLICY "vcs_select_own" ON video_call_sessions
  FOR SELECT TO authenticated
  USING (
    LOWER(initiator_wallet) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    OR
    LOWER(recipient_wallet) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
  );

-- Sessions: only initiator can create
CREATE POLICY "vcs_insert_initiator" ON video_call_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    LOWER(initiator_wallet) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
  );

-- Sessions: participants can update (accept, decline, end)
CREATE POLICY "vcs_update_participant" ON video_call_sessions
  FOR UPDATE TO authenticated
  USING (
    LOWER(initiator_wallet) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    OR
    LOWER(recipient_wallet) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
  );

-- Signaling: participants can read signals addressed to them
CREATE POLICY "vcsi_select_own" ON video_call_signaling
  FOR SELECT TO authenticated
  USING (
    LOWER(to_wallet) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
    OR
    LOWER(from_wallet) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
  );

-- Signaling: participants can send signals
CREATE POLICY "vcsi_insert_participant" ON video_call_signaling
  FOR INSERT TO authenticated
  WITH CHECK (
    LOWER(from_wallet) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
  );

-- ─── Cleanup function ────────────────────────────────────────────────────────
-- Purge signaling rows for ended/declined sessions older than 1 hour
-- Call periodically via pg_cron or a background job

CREATE OR REPLACE FUNCTION cleanup_stale_video_signals()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM video_call_signaling
  WHERE session_id IN (
    SELECT id FROM video_call_sessions
    WHERE status IN ('ended', 'declined', 'missed')
      AND ended_at < NOW() - INTERVAL '1 hour'
  );
END;
$$;

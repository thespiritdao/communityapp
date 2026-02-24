-- =============================================================================
-- Conference Rooms Infrastructure
-- =============================================================================
-- Supports multi-person LiveKit-powered conference rooms, linked to events or
-- pods. Includes participant tracking, host permissions, and ephemeral emoji
-- reactions via Supabase Realtime Broadcast.
--
-- Tables:
--   conference_rooms        — one room per event/pod meeting session
--   conference_participants — live join/leave tracking with roles
--   conference_reactions    — ephemeral emoji reactions (auto-purge after 10 min)
-- =============================================================================


-- =============================================================================
-- SECTION 1: conference_rooms
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.conference_rooms (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Associations (both optional — a room can be standalone)
  event_id         UUID REFERENCES public.events(id) ON DELETE SET NULL,
  pod_id           UUID REFERENCES public.pods(id)   ON DELETE SET NULL,

  -- LiveKit room name — used as the key when creating the LiveKit room.
  -- Immutable after creation. Formatted as: "room_<uuid_short>" or "event_<event_id_short>"
  room_name        TEXT NOT NULL UNIQUE,

  display_name     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'live', 'ended')),

  host_wallet      TEXT NOT NULL,

  -- LiveKit room settings stored as JSONB for flexibility
  settings         JSONB NOT NULL DEFAULT '{
    "maxParticipants": 200,
    "recordingEnabled": false,
    "chatEnabled": true,
    "reactionsEnabled": true,
    "attendeesCanUnmute": false
  }'::jsonb,

  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conference_rooms_event   ON public.conference_rooms (event_id)  WHERE event_id IS NOT NULL;
CREATE INDEX idx_conference_rooms_pod     ON public.conference_rooms (pod_id)    WHERE pod_id IS NOT NULL;
CREATE INDEX idx_conference_rooms_status  ON public.conference_rooms (status);
CREATE INDEX idx_conference_rooms_host    ON public.conference_rooms (host_wallet);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_conference_room_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conference_rooms_updated_at
  BEFORE UPDATE ON public.conference_rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_conference_room_updated_at();


-- =============================================================================
-- SECTION 2: conference_participants
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.conference_participants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          UUID NOT NULL REFERENCES public.conference_rooms(id) ON DELETE CASCADE,
  wallet_address   TEXT NOT NULL,

  -- Role hierarchy: host > co_host > speaker > attendee
  -- host     — full control (mute, kick, promote, end meeting)
  -- co_host  — mute/unmute others, manage raise-hand queue
  -- speaker  — can publish audio + video
  -- attendee — subscribe-only until promoted
  role             TEXT NOT NULL DEFAULT 'attendee'
                   CHECK (role IN ('host', 'co_host', 'speaker', 'attendee')),

  -- LiveKit publish permission (mirrors role but can be overridden by host)
  can_publish      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Raise hand queue — host sees these in order of raised_at
  hand_raised      BOOLEAN NOT NULL DEFAULT FALSE,
  hand_raised_at   TIMESTAMPTZ,

  -- Presence
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at          TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,

  -- Unique active participant per room (a wallet can rejoin after leaving)
  CONSTRAINT uq_active_participant UNIQUE NULLS NOT DISTINCT (room_id, wallet_address, left_at)
);

CREATE INDEX idx_conf_participants_room    ON public.conference_participants (room_id, is_active);
CREATE INDEX idx_conf_participants_wallet  ON public.conference_participants (wallet_address);

-- Auto-set hand_raised_at
CREATE OR REPLACE FUNCTION public.set_hand_raised_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hand_raised = TRUE AND (OLD.hand_raised = FALSE OR OLD.hand_raised IS NULL) THEN
    NEW.hand_raised_at = NOW();
  ELSIF NEW.hand_raised = FALSE THEN
    NEW.hand_raised_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hand_raised_at
  BEFORE UPDATE ON public.conference_participants
  FOR EACH ROW EXECUTE FUNCTION public.set_hand_raised_at();


-- =============================================================================
-- SECTION 3: conference_reactions
-- =============================================================================
-- Reactions are delivered via Supabase Realtime Broadcast (no DB write needed
-- for the animation). This table is optional — used only if you want to persist
-- reaction analytics. Auto-purged after 10 minutes via cleanup function below.

CREATE TABLE IF NOT EXISTS public.conference_reactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        UUID NOT NULL REFERENCES public.conference_rooms(id) ON DELETE CASCADE,
  sender_wallet  TEXT NOT NULL,
  emoji          TEXT NOT NULL
                 CHECK (emoji IN ('clap', 'heart', 'laugh', 'wow', 'raise_hand')),
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conf_reactions_room    ON public.conference_reactions (room_id, sent_at DESC);
CREATE INDEX idx_conf_reactions_cleanup ON public.conference_reactions (sent_at);


-- =============================================================================
-- SECTION 4: RLS
-- =============================================================================

ALTER TABLE public.conference_rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conference_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conference_reactions     ENABLE ROW LEVEL SECURITY;

-- ── conference_rooms ──────────────────────────────────────────────────────────

-- Anyone (including anon) can view room info — needed so event pages can show
-- the "Join" button without requiring auth first.
CREATE POLICY "conf_rooms_select_public"
  ON public.conference_rooms FOR SELECT
  USING (true);

-- Only authenticated users can create rooms
CREATE POLICY "conf_rooms_insert_auth"
  ON public.conference_rooms FOR INSERT
  TO authenticated
  WITH CHECK (
    LOWER(host_wallet) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- Only the host can update their room
CREATE POLICY "conf_rooms_update_host"
  ON public.conference_rooms FOR UPDATE
  TO authenticated
  USING (
    LOWER(host_wallet) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- ── conference_participants ───────────────────────────────────────────────────

-- All authenticated users can view participants in any room
CREATE POLICY "conf_participants_select_auth"
  ON public.conference_participants FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert themselves as participants
CREATE POLICY "conf_participants_insert_self"
  ON public.conference_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    LOWER(wallet_address) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- Users can update their own participant row (raise hand, leave, etc.)
-- Hosts can update any participant row in their room (mute, promote, kick)
CREATE POLICY "conf_participants_update_self_or_host"
  ON public.conference_participants FOR UPDATE
  TO authenticated
  USING (
    -- Own row
    LOWER(wallet_address) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
    OR
    -- Host of this room
    EXISTS (
      SELECT 1 FROM public.conference_rooms cr
      WHERE cr.id = conference_participants.room_id
        AND LOWER(cr.host_wallet) = (
          SELECT LOWER(wallet_address) FROM public.user_profiles
          WHERE user_id = auth.uid() LIMIT 1
        )
    )
    OR
    -- Co-host of this room
    EXISTS (
      SELECT 1 FROM public.conference_participants cp
      WHERE cp.room_id = conference_participants.room_id
        AND LOWER(cp.wallet_address) = (
          SELECT LOWER(wallet_address) FROM public.user_profiles
          WHERE user_id = auth.uid() LIMIT 1
        )
        AND cp.role = 'co_host'
        AND cp.is_active = TRUE
    )
  );

-- ── conference_reactions ──────────────────────────────────────────────────────

-- All authenticated users can view reactions in any room
CREATE POLICY "conf_reactions_select_auth"
  ON public.conference_reactions FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert their own reactions
CREATE POLICY "conf_reactions_insert_self"
  ON public.conference_reactions FOR INSERT
  TO authenticated
  WITH CHECK (
    LOWER(sender_wallet) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );


-- =============================================================================
-- SECTION 5: Cleanup function
-- =============================================================================
-- Purge reactions older than 10 minutes and mark stale active participants
-- as left (safety net in case a client disconnects without calling leave).
-- Wire this up via pg_cron: SELECT cron.schedule('*/10 * * * *', $$SELECT cleanup_conference_stale_data()$$);

CREATE OR REPLACE FUNCTION public.cleanup_conference_stale_data()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Purge old reactions
  DELETE FROM public.conference_reactions
  WHERE sent_at < NOW() - INTERVAL '10 minutes';

  -- Mark participants as inactive if their room ended >30 minutes ago
  -- and they never explicitly left (client crash / network drop safety net)
  UPDATE public.conference_participants
  SET is_active = FALSE, left_at = NOW()
  WHERE is_active = TRUE
    AND room_id IN (
      SELECT id FROM public.conference_rooms
      WHERE status = 'ended'
        AND ended_at < NOW() - INTERVAL '30 minutes'
    );
END;
$$;

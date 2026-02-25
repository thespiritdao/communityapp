-- =============================================================================
-- Fix conference_rooms updated_at trigger
-- =============================================================================
-- The set_conference_room_updated_at trigger references NEW.updated_at but
-- the column may be missing if the previous migration partially failed.
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================

-- 1. Ensure updated_at column exists
ALTER TABLE public.conference_rooms
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Drop and recreate the trigger cleanly
DROP TRIGGER IF EXISTS trg_conference_rooms_updated_at ON public.conference_rooms;

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

-- ============================================================
-- Migration: Pod Places add-on module (shared map with typed pins)
-- Date: 2026-09-10
-- Spec: docs/spec-pod-places-and-journal.md (Phase 2)
--
-- Members-only by design: every pin is visible only to active members of
-- the pod. Writes go through /api/pods/[id]/places (service role, guarded by
-- the placesManage role permission OR pod leadership). Clients read under
-- RLS so realtime works.
-- Apply by hand per supabase/migrations/README.md.
-- ============================================================

-- 1. Module toggle + config on pod_modules (mirrors surveys/passwords)
ALTER TABLE pod_modules
  ADD COLUMN IF NOT EXISTS places_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pod_modules
  ADD COLUMN IF NOT EXISTS places_config JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN pod_modules.places_config IS
  'Pod-level settings for the Places module. Keys: label (section title override, <=20 chars), default_center {lat,lng,zoom}.';

-- 2. Membership helper for RLS (SECURITY DEFINER so it can read pod_members
--    regardless of the caller''s own policies). Mirrors is_pod_leader_current_user.
CREATE OR REPLACE FUNCTION public.is_pod_member_current_user(p_pod_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pod_members pm
    WHERE pm.pod_id = p_pod_id
      AND pm.is_active = true
      AND lower(pm.wallet) = lower(COALESCE(
        current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
        current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address',
        ''
      ))
  )
  OR EXISTS (
    SELECT 1 FROM pods p
    WHERE p.id = p_pod_id
      AND lower(COALESCE(
        current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
        current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address',
        ''
      )) = ANY (SELECT lower(x) FROM unnest(COALESCE(p.pod_leads, '{}'::text[])) AS x)
  );
$$;

-- 3. pod_places — one row per pin
CREATE TABLE IF NOT EXISTS pod_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'site'
    CHECK (kind IN ('asset', 'partner', 'site', 'resource', 'vision', 'other')),
  status TEXT NOT NULL DEFAULT 'existing'
    CHECK (status IN ('existing', 'proposed', 'retired')),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  address TEXT,
  precision TEXT NOT NULL DEFAULT 'exact'
    CHECK (precision IN ('exact', 'approximate')),
  cover_image_path TEXT,                      -- storage path in bucket place-images (private)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pod_places_lat_range CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90)),
  CONSTRAINT pod_places_lng_range CHECK (lng IS NULL OR (lng BETWEEN -180 AND 180)),
  CONSTRAINT pod_places_latlng_pair CHECK ((lat IS NULL) = (lng IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_pod_places_pod_id ON pod_places(pod_id);
CREATE INDEX IF NOT EXISTS idx_pod_places_pod_kind ON pod_places(pod_id, kind);
CREATE INDEX IF NOT EXISTS idx_pod_places_pod_status ON pod_places(pod_id, status);

-- 4. pod_place_links — relationships from a place to other things.
--    target_type 'place' + label expresses a local relationship between two
--    pins (drawn as a line when both are mapped).
CREATE TABLE IF NOT EXISTS pod_place_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES pod_places(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('thread', 'event', 'knowledge_item', 'member', 'pod', 'place')),
  target_id TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (place_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_pod_place_links_place ON pod_place_links(place_id);
CREATE INDEX IF NOT EXISTS idx_pod_place_links_target ON pod_place_links(target_type, target_id);

-- 5. updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_pod_places_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pod_places_updated_at ON pod_places;
CREATE TRIGGER trg_pod_places_updated_at
  BEFORE UPDATE ON pod_places
  FOR EACH ROW EXECUTE FUNCTION public.touch_pod_places_updated_at();

-- 6. RLS — members read; no client write policies (API + service role only)
ALTER TABLE pod_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_place_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pod_places_member_select" ON pod_places;
CREATE POLICY "pod_places_member_select" ON pod_places
  FOR SELECT TO authenticated
  USING (public.is_pod_member_current_user(pod_id));

DROP POLICY IF EXISTS "pod_places_service_all" ON pod_places;
CREATE POLICY "pod_places_service_all" ON pod_places
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pod_place_links_member_select" ON pod_place_links;
CREATE POLICY "pod_place_links_member_select" ON pod_place_links
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM pod_places pp
    WHERE pp.id = pod_place_links.place_id
      AND public.is_pod_member_current_user(pp.pod_id)
  ));

DROP POLICY IF EXISTS "pod_place_links_service_all" ON pod_place_links;
CREATE POLICY "pod_place_links_service_all" ON pod_place_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON pod_places TO authenticated;
GRANT SELECT ON pod_place_links TO authenticated;

-- 7. Private storage bucket for cover images. Served via signed URLs from
--    the API (members-only stays members-only even for image links).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('place-images', 'place-images', false, 5242880,
        ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
-- No storage.objects policies for authenticated: only the service role
-- reads/writes this bucket.

-- 8. Realtime (optional, harmless if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pod_places;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'pod_modules' AND column_name IN ('places_enabled', 'places_config');
SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('pod_places', 'pod_place_links');

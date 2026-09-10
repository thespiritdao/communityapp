-- ============================================================
-- Migration: member_locations — opt-in home location shared with one's pods
-- Date: 2026-09-10
-- Spec: docs/spec-pod-places-and-journal.md (Identity opt-in)
--
-- A member may choose (Identity → Location) to share where they are with the
-- pods they belong to. Kept in its own table (NOT user_profiles, whose SELECT
-- policy is USING(true) for every authenticated user) so the read scope can be
-- "people who share an active pod with you" and nothing wider.
-- Writes go through /api/account/location (service role, session-verified).
-- Apply by hand per supabase/migrations/README.md.
-- ============================================================

CREATE TABLE IF NOT EXISTS member_locations (
  wallet TEXT PRIMARY KEY,                    -- canonical wallet, lowercase
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  precision TEXT NOT NULL DEFAULT 'approximate'
    CHECK (precision IN ('exact', 'approximate')),
  address TEXT,                               -- display label only; may be null
  share_with_pods BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_member_locations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  NEW.wallet = lower(NEW.wallet);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_member_locations_updated_at ON member_locations;
CREATE TRIGGER trg_member_locations_updated_at
  BEFORE INSERT OR UPDATE ON member_locations
  FOR EACH ROW EXECUTE FUNCTION public.touch_member_locations_updated_at();

-- Does the caller share at least one active pod with `p_wallet`?
CREATE OR REPLACE FUNCTION public.shares_active_pod_with_current_user(p_wallet TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT lower(COALESCE(
      current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
      current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address',
      ''
    )) AS w
  )
  SELECT EXISTS (
    SELECT 1
    FROM pod_members a
    JOIN pod_members b ON a.pod_id = b.pod_id
    CROSS JOIN me
    WHERE a.is_active = true AND b.is_active = true
      AND lower(a.wallet) = me.w
      AND lower(b.wallet) = lower(p_wallet)
  );
$$;

ALTER TABLE member_locations ENABLE ROW LEVEL SECURITY;

-- Own row: always readable.
DROP POLICY IF EXISTS "member_locations_select_own" ON member_locations;
CREATE POLICY "member_locations_select_own" ON member_locations
  FOR SELECT TO authenticated
  USING (
    lower(wallet) = lower(COALESCE(
      current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
      current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address',
      ''
    ))
  );

-- Shared rows: readable by members of a pod you both belong to, only while
-- the owner has sharing on.
DROP POLICY IF EXISTS "member_locations_select_shared" ON member_locations;
CREATE POLICY "member_locations_select_shared" ON member_locations
  FOR SELECT TO authenticated
  USING (share_with_pods = true AND public.shares_active_pod_with_current_user(wallet));

DROP POLICY IF EXISTS "member_locations_service_all" ON member_locations;
CREATE POLICY "member_locations_service_all" ON member_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON member_locations TO authenticated;

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'member_locations';

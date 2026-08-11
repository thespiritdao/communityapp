-- ============================================================
-- Migration: Pod Faces (custom appearance) module
-- Date: 2026-08-11
-- Spec: docs/spec-pod-faces.md
--
-- Adds:
--   1. pod_modules.custom_appearance_enabled — opt-in module toggle
--   2. pod_faces — one face (colors + icon remap) per pod, draft/published
--   3. user_profiles.active_face_pod_id — which pod's face a member wears
--   4. has_pod_permission_current_user() — reusable RLS helper for granular
--      JSONB permission keys (first consumer: appearanceManage)
--   5. RLS on pod_faces: published faces are world-readable; writes require
--      pod leadership OR the appearanceManage role permission
--
-- Reversible: drop the policies, function, table, and the two columns.
-- ============================================================

-- 1. Module toggle (mirrors surveys/passwords add-on pattern)
ALTER TABLE pod_modules
ADD COLUMN IF NOT EXISTS custom_appearance_enabled BOOLEAN DEFAULT false;

UPDATE pod_modules
SET custom_appearance_enabled = false
WHERE custom_appearance_enabled IS NULL;

-- 2. pod_faces — a pod's designed "face". Single row per pod; the draft is
-- edited in place and flipped to 'published'. colors/icon_map shapes are
-- validated in the API layer against src/features/pods/faces/faceConfig.ts.
CREATE TABLE IF NOT EXISTS pod_faces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  colors JSONB NOT NULL DEFAULT '{}'::jsonb,
  icon_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  updated_by TEXT NOT NULL, -- wallet, lowercase
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pod_id)
);

CREATE INDEX IF NOT EXISTS idx_pod_faces_status ON pod_faces(status);

-- 3. Which pod's face this user wears app-wide. NULL = SpiritDAO default.
-- References pods (not pod_faces) so unpublishing a face doesn't cascade;
-- the client falls back to default when no published face exists.
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS active_face_pod_id UUID REFERENCES pods(id) ON DELETE SET NULL;

-- 4. Helper: does the CURRENT authenticated caller hold a role in this pod
-- whose permissions JSONB grants the given key? Companion to
-- is_pod_leader_current_user() (20260808000001). SECURITY DEFINER so the
-- nested check_pod_permission() read of pod_members/pod_role_permissions
-- works regardless of the caller's own row visibility.
CREATE OR REPLACE FUNCTION public.has_pod_permission_current_user(
  target_pod_id UUID,
  permission_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.check_pod_permission(
      (
        SELECT lower(up.wallet_address)
        FROM public.user_profiles up
        WHERE up.user_id = auth.uid()
        LIMIT 1
      ),
      target_pod_id,
      permission_key
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.has_pod_permission_current_user(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.has_pod_permission_current_user(UUID, TEXT) TO authenticated, service_role;

-- 5. RLS
ALTER TABLE pod_faces ENABLE ROW LEVEL SECURITY;

-- Published faces are public — anyone (including anon, e.g. first paint
-- before session restore) must be able to render them. Faces contain no
-- secrets: colors and icon names only.
CREATE POLICY "pod_faces_select_published"
  ON pod_faces FOR SELECT
  USING (status = 'published');

-- Drafts are visible to those who can edit them.
CREATE POLICY "pod_faces_select_managers"
  ON pod_faces FOR SELECT TO authenticated
  USING (
    public.is_pod_leader_current_user(pod_id)
    OR public.has_pod_permission_current_user(pod_id, 'appearanceManage')
  );

CREATE POLICY "pod_faces_insert_managers"
  ON pod_faces FOR INSERT TO authenticated
  WITH CHECK (
    public.is_pod_leader_current_user(pod_id)
    OR public.has_pod_permission_current_user(pod_id, 'appearanceManage')
  );

CREATE POLICY "pod_faces_update_managers"
  ON pod_faces FOR UPDATE TO authenticated
  USING (
    public.is_pod_leader_current_user(pod_id)
    OR public.has_pod_permission_current_user(pod_id, 'appearanceManage')
  )
  WITH CHECK (
    public.is_pod_leader_current_user(pod_id)
    OR public.has_pod_permission_current_user(pod_id, 'appearanceManage')
  );

CREATE POLICY "pod_faces_delete_managers"
  ON pod_faces FOR DELETE TO authenticated
  USING (
    public.is_pod_leader_current_user(pod_id)
    OR public.has_pod_permission_current_user(pod_id, 'appearanceManage')
  );

-- Server routes (service key) retain full access, matching every other table.
CREATE POLICY "pod_faces_service_role"
  ON pod_faces FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Grants
GRANT SELECT ON pod_faces TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON pod_faces TO authenticated;
GRANT ALL ON pod_faces TO service_role;

-- Comments
COMMENT ON TABLE pod_faces IS 'Per-pod custom appearance ("face"): color tokens + main-screen icon remap. See docs/spec-pod-faces.md';
COMMENT ON COLUMN pod_faces.colors IS 'Hex colors keyed by CSS token (primary, background, …) — validated against faceConfig.ts';
COMMENT ON COLUMN pod_faces.icon_map IS 'Icon slot → pack source, e.g. {"chat": {"type": "pack", "value": "minimal/chat"}}';
COMMENT ON COLUMN user_profiles.active_face_pod_id IS 'Pod whose published face this user wears app-wide; NULL = default appearance';

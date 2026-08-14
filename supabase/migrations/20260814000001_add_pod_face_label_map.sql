-- ============================================================
-- Migration: Pod Faces — menu-item renaming (label_map)
-- Date: 2026-08-14
-- Spec: docs/spec-pod-faces.md
--
-- Adds pod_faces.label_map: slot → custom display name for the home-screen
-- module grid (and bottom-nav aria-labels). Parallel to icon_map; validated
-- in the API layer against src/features/pods/faces/faceConfig.ts.
--
-- No RLS/grant changes — the column rides the existing pod_faces policies.
-- Reversible: ALTER TABLE pod_faces DROP COLUMN label_map;
-- ============================================================

ALTER TABLE pod_faces
ADD COLUMN IF NOT EXISTS label_map JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN pod_faces.label_map IS 'Icon slot → custom menu label, e.g. {"bounties": "Quests"} — validated against faceConfig.ts (logo excluded, max 20 chars)';

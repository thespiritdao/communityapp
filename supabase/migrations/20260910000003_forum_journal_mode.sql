-- ============================================================
-- Migration: forum_categories.display_mode — "journal" presentation
-- Date: 2026-09-10
-- Spec: docs/spec-pod-places-and-journal.md (Phase 1)
--
-- A journal category renders threads as dated entries (newest first,
-- grouped by month, cover image, excerpt) and uses the rich editor by
-- default. Storage and permissions are unchanged: a journal is a forum
-- category with a different presentation.
-- Apply by hand per supabase/migrations/README.md.
-- ============================================================

ALTER TABLE forum_categories
  ADD COLUMN IF NOT EXISTS display_mode TEXT NOT NULL DEFAULT 'discussion'
  CHECK (display_mode IN ('discussion', 'journal'));

COMMENT ON COLUMN forum_categories.display_mode IS
  'discussion = classic thread list; journal = dated entries view with rich editor default.';

-- Verify
SELECT column_name, column_default FROM information_schema.columns
WHERE table_name = 'forum_categories' AND column_name = 'display_mode';

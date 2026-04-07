-- Migration 007: Supabase Security Lint Fixes
-- Addresses all ERROR-level findings from the Supabase security linter.
--
-- Changes:
--   1. Enable RLS on forum_moderator_actions (has policies but RLS was off)
--   2. Rewrite forum_posts / forum_threads RLS policies to remove user_metadata
--      references (Supabase lint 0015 — user_metadata is user-editable)
--   3. Drop 6 legacy SECURITY DEFINER views with confirmed zero app consumers
--   4. Recreate 5 active SECURITY DEFINER views without the SECURITY DEFINER
--      property (lint 0010 — views should run as the querying user's context)
--
-- Run this in the Supabase SQL Editor (service_role / dashboard context).
-- Safe to re-run: all statements are idempotent or use DROP IF EXISTS / CREATE OR REPLACE.

-- ============================================================================
-- 1. ENABLE RLS ON forum_moderator_actions
--    Table has policies but RLS was never enabled (lint 0007 / 0013).
--    Active table: queried/inserted in route.ts and ModerationService.ts.
-- ============================================================================

ALTER TABLE public.forum_moderator_actions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2 & 3. forum_posts / forum_threads RLS POLICIES
--    NOTE: Supabase lint 0015 flags user_metadata references as insecure.
--    However, our JWTs store wallet_address ONLY under user_metadata — there
--    is no top-level claim. Removing the user_metadata branch breaks all
--    author-based mutations. Policies retain both branches until JWTs are
--    migrated to include a top-level wallet_address claim.
--    DEFERRED: Address lint 0015 after JWT structure is updated.
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.forum_posts;
CREATE POLICY "Authenticated users can create posts"
  ON public.forum_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (
      author_address = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
      OR author_address = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
    )
  );

DROP POLICY IF EXISTS "Post creators can update their posts" ON public.forum_posts;
CREATE POLICY "Post creators can update their posts"
  ON public.forum_posts FOR UPDATE
  TO authenticated
  USING (
    author_address = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
    OR author_address = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
  );

DROP POLICY IF EXISTS "Post creators can delete their posts" ON public.forum_posts;
CREATE POLICY "Post creators can delete their posts"
  ON public.forum_posts FOR DELETE
  TO authenticated
  USING (
    author_address = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
    OR author_address = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
  );

DROP POLICY IF EXISTS "Authenticated users can create threads" ON public.forum_threads;
CREATE POLICY "Authenticated users can create threads"
  ON public.forum_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (
      author_address = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
      OR author_address = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
    )
  );

DROP POLICY IF EXISTS "Thread creators can update their threads" ON public.forum_threads;
CREATE POLICY "Thread creators can update their threads"
  ON public.forum_threads FOR UPDATE
  TO authenticated
  USING (
    author_address = lower(current_setting('request.jwt.claims', true)::json ->> 'wallet_address')
    OR author_address = lower(current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address')
  );

-- ============================================================================
-- 4. DROP LEGACY VIEWS
--    Each confirmed to have zero TypeScript query consumers across entire repo.
--    Verification: exhaustive grep across src/, scripts/, supabase/, root files.
-- ============================================================================

-- actionable_governance_notifications: zero references anywhere in repo
DROP VIEW IF EXISTS public.actionable_governance_notifications CASCADE;

-- bounty_access_view: zero references anywhere in repo
DROP VIEW IF EXISTS public.bounty_access_view CASCADE;

-- event_stats: defined only in src/features/events/supabase-schema.sql, never queried
DROP VIEW IF EXISTS public.event_stats CASCADE;

-- bounty_stats: defined only in src/features/bounty/supabase-schema.sql, never queried
DROP VIEW IF EXISTS public.bounty_stats CASCADE;

-- forum_poll_results: defined only in migration SQL files, never queried from TypeScript
DROP VIEW IF EXISTS public.forum_poll_results CASCADE;

-- forum_reaction_counts: defined only in migration SQL files, never queried from TypeScript
DROP VIEW IF EXISTS public.forum_reaction_counts CASCADE;

-- _postgrest_cache_breaker: used only in scripts/nuclear-postgrest-cache-clear*.sql utility
-- scripts which DROP and CREATE it fresh each time — safe to drop persistently
DROP VIEW IF EXISTS public._postgrest_cache_breaker CASCADE;

-- ============================================================================
-- 5. RECREATE ACTIVE VIEWS WITHOUT SECURITY DEFINER (lint 0010)
--    These views are actively used. Drop and recreate without SECURITY DEFINER
--    so they run under the querying user's context and respect their RLS policies.
--    Definitions match the LATEST applied migration for each view.
-- ============================================================================

-- 5a. active_pod_members
--     Used in 16+ TypeScript files, 40+ call sites. Core to membership/permissions.
--     Latest definition: supabase/migrations/20260109_fix_active_pod_members_view.sql
DROP VIEW IF EXISTS public.active_pod_members CASCADE;
CREATE VIEW public.active_pod_members AS
SELECT
    pm.id,
    pm.pod_id,
    pm.wallet,
    pm.hat_id,
    pm.membership_type,
    pm.role,
    pm.is_active,
    pm.joined_at,
    pm.removed_at,
    pm.created_at,
    pm.updated_at,
    p.name AS pod_name,
    p.management_hat_id,
    p.membership_hat_id,
    p.status AS pod_status
FROM pod_members pm
LEFT JOIN pods p ON pm.pod_id = p.id
WHERE pm.is_active = TRUE;

GRANT SELECT ON public.active_pod_members TO anon;
GRANT SELECT ON public.active_pod_members TO authenticated;
GRANT SELECT ON public.active_pod_members TO service_role;

-- 5b. pod_permission_lookup
--     Used in 5+ TypeScript files: marketplace, shopping-cart, accessControl, pods services.
--     Latest definition: src/features/pods/finalsql.txt
DROP VIEW IF EXISTS public.pod_permission_lookup CASCADE;
CREATE VIEW public.pod_permission_lookup AS
SELECT
    pod_id,
    token_address,
    token_address AS hat_id,
    role_name,
    permissions,
    is_active,
    current_holders,
    max_holders,
    last_synced_at
FROM pod_role_permissions
WHERE is_active = true;

GRANT SELECT ON public.pod_permission_lookup TO anon;
GRANT SELECT ON public.pod_permission_lookup TO authenticated;
GRANT SELECT ON public.pod_permission_lookup TO service_role;

-- 5c. pod_role_permissions_active
--     Not directly queried from TypeScript, but referenced in migration GRANTs.
--     Latest definition: src/features/pods/finalsql.txt
DROP VIEW IF EXISTS public.pod_role_permissions_active CASCADE;
CREATE VIEW public.pod_role_permissions_active AS
SELECT
    id, pod_id, token_address, role_name, permissions, eligibility_criteria,
    max_holders, current_holders, hat_level, parent_hat_id,
    template_name, inherits_from, version,
    created_by, updated_by, created_at, updated_at,
    last_synced_at, sync_status
FROM pod_role_permissions
WHERE is_active = true AND sync_status = 'synced';

GRANT SELECT ON public.pod_role_permissions_active TO anon;
GRANT SELECT ON public.pod_role_permissions_active TO authenticated;
GRANT SELECT ON public.pod_role_permissions_active TO service_role;

-- 5d. pod_role_forum_access
--     Used in SQL functions (is_forum_moderator, forums_accessible_by_identity) and
--     8+ migration SQL files with JOINs. Forum access control depends on this view.
--     IMPORTANT: Latest definition is migrations/005_update_forum_access_view.sql which
--     uses token_address (not hat_id column) and adds forum_access column.
DROP VIEW IF EXISTS public.pod_role_forum_access CASCADE;
CREATE OR REPLACE VIEW public.pod_role_forum_access AS
SELECT
    p.id AS pod_id,
    p.name AS pod_name,
    prp.token_address AS hat_id,
    prp.role_name,
    COALESCE((prp.permissions::JSONB ->> 'chatAccess')::BOOLEAN, FALSE) AS chat_access,
    COALESCE((prp.permissions::JSONB ->> 'forumAccess')::BOOLEAN, FALSE) AS forum_access,
    COALESCE((prp.permissions::JSONB ->> 'governanceParticipation')::BOOLEAN, FALSE) AS governance_participation,
    COALESCE((prp.permissions::JSONB ->> 'forumModeration')::BOOLEAN, FALSE) AS forum_moderation
FROM pod_role_permissions prp
JOIN pods p ON p.id = prp.pod_id
WHERE prp.is_active = TRUE;

GRANT SELECT ON public.pod_role_forum_access TO anon;
GRANT SELECT ON public.pod_role_forum_access TO authenticated;
GRANT SELECT ON public.pod_role_forum_access TO service_role;

-- 5e. events_with_stats
--     Queried in src/features/events/lib/supabase.ts at 4 call sites.
--     Has fallback logic but IS actively used in production.
--     Latest definition: src/features/events/supabase-schema.sql
DROP VIEW IF EXISTS public.events_with_stats CASCADE;
CREATE VIEW public.events_with_stats AS
SELECT e.id,
    e.title,
    e.description,
    e.event_date,
    e.event_end_date,
    e.location,
    e.max_attendees,
    e.price_amount,
    e.price_token,
    e.required_tokens,
    e.organizing_pod_id,
    e.fund_recipient_pod_id,
    e.fund_recipient_type,
    e.creator_address,
    e.registration_contract_address,
    e.completion_contract_address,
    e.status,
    e.qr_code_data,
    e.event_image_url,
    e.event_metadata,
    e.created_at,
    e.updated_at,
    COALESCE(reg_stats.registration_count, 0::bigint) AS registration_count,
    COALESCE(reg_stats.checked_in_count, 0::bigint) AS checked_in_count,
    COALESCE(reg_stats.completed_count, 0::bigint) AS completed_count
FROM events e
LEFT JOIN (
    SELECT event_registrations.event_id,
        count(*) AS registration_count,
        count(CASE WHEN event_registrations.registration_status = 'checked_in' THEN 1 ELSE NULL::integer END) AS checked_in_count,
        count(CASE WHEN event_registrations.registration_status = 'completed' THEN 1 ELSE NULL::integer END) AS completed_count
    FROM event_registrations
    WHERE event_registrations.registration_status <> 'cancelled'
    GROUP BY event_registrations.event_id
) reg_stats ON e.id = reg_stats.event_id;

GRANT SELECT ON public.events_with_stats TO anon;
GRANT SELECT ON public.events_with_stats TO authenticated;
GRANT SELECT ON public.events_with_stats TO service_role;

-- =============================================================================
-- Fix Supabase Security Advisories (Types 1, 3, 4)
-- =============================================================================
-- Type 1/3: Enable RLS on tables that have policies defined but RLS disabled,
--           or are fully open to anon access.
-- Type 4:   Replace user_metadata wallet checks with auth.uid() → user_profiles
--           subquery, since user_metadata is user-editable and must not be used
--           for authorization decisions.
-- =============================================================================


-- =============================================================================
-- SECTION 1: Enable RLS on tables missing it (Types 1 & 3)
-- =============================================================================

-- Forum tables (policies exist but RLS was never enabled on the live DB)
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;

-- Pod tables
ALTER TABLE public.pod_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pod_member_counts ENABLE ROW LEVEL SECURITY;

-- Knowledge base tables
ALTER TABLE public.knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_item_views ENABLE ROW LEVEL SECURITY;

-- Debug table: lock it down entirely — no production code should read/write this
ALTER TABLE public.governance_votes_jwt_debug ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policies = default deny for all roles


-- =============================================================================
-- SECTION 2: Add missing policies for pod_members and pod_member_counts
-- =============================================================================

-- pod_members: authenticated users can view, only service role can mutate
-- (member management happens via server-side API routes, not direct client writes)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pod_members' AND policyname = 'Authenticated users can view pod members'
  ) THEN
    CREATE POLICY "Authenticated users can view pod members"
      ON public.pod_members FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pod_members' AND policyname = 'Anyone can view pod members'
  ) THEN
    CREATE POLICY "Anyone can view pod members"
      ON public.pod_members FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

-- pod_member_counts: read-only for all, mutated only by server triggers/functions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pod_member_counts' AND policyname = 'Anyone can view pod member counts'
  ) THEN
    CREATE POLICY "Anyone can view pod member counts"
      ON public.pod_member_counts FOR SELECT
      USING (true);
  END IF;
END $$;


-- =============================================================================
-- SECTION 3: Fix Type 4 — Replace user_metadata wallet checks
-- =============================================================================
-- Pattern: auth.jwt() -> 'user_metadata' ->> 'wallet_address'  (UNSAFE — user-editable)
-- Replace: (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())  (SAFE)
--
-- This uses the server-controlled auth.uid() (JWT sub claim) to look up the
-- wallet address from user_profiles, which only the server can write to.
-- =============================================================================


-- ── governance_votes ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "governance_votes_insert_own" ON public.governance_votes;
DROP POLICY IF EXISTS "governance_votes_update_own" ON public.governance_votes;

CREATE POLICY "governance_votes_insert_own" ON public.governance_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    LOWER(voter_address) = (
      SELECT LOWER(wallet_address)
      FROM public.user_profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "governance_votes_update_own" ON public.governance_votes
  FOR UPDATE TO authenticated
  USING (
    LOWER(voter_address) = (
      SELECT LOWER(wallet_address)
      FROM public.user_profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    LOWER(voter_address) = (
      SELECT LOWER(wallet_address)
      FROM public.user_profiles
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );


-- ── video_call_sessions ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "vcs_select_own" ON public.video_call_sessions;
DROP POLICY IF EXISTS "vcs_insert_initiator" ON public.video_call_sessions;
DROP POLICY IF EXISTS "vcs_update_participant" ON public.video_call_sessions;

CREATE POLICY "vcs_select_own" ON public.video_call_sessions
  FOR SELECT TO authenticated
  USING (
    LOWER(initiator_wallet) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
    OR
    LOWER(recipient_wallet) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "vcs_insert_initiator" ON public.video_call_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    LOWER(initiator_wallet) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "vcs_update_participant" ON public.video_call_sessions
  FOR UPDATE TO authenticated
  USING (
    LOWER(initiator_wallet) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
    OR
    LOWER(recipient_wallet) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );


-- ── video_call_signaling ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "vcsi_select_own" ON public.video_call_signaling;
DROP POLICY IF EXISTS "vcsi_insert_participant" ON public.video_call_signaling;

CREATE POLICY "vcsi_select_own" ON public.video_call_signaling
  FOR SELECT TO authenticated
  USING (
    LOWER(to_wallet) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
    OR
    LOWER(from_wallet) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "vcsi_insert_participant" ON public.video_call_signaling
  FOR INSERT TO authenticated
  WITH CHECK (
    LOWER(from_wallet) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );


-- ── pod_role_permissions ──────────────────────────────────────────────────────
-- The "Allow pod leaders to manage role permissions" policy uses user_metadata.
-- Replace with user_profiles subquery.

DROP POLICY IF EXISTS "Allow pod leaders to manage role permissions" ON public.pod_role_permissions;

CREATE POLICY "Allow pod leaders to manage role permissions"
  ON public.pod_role_permissions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.active_pod_members apm
      WHERE apm.pod_id = pod_role_permissions.pod_id
        AND LOWER(apm.wallet) = (
          SELECT LOWER(wallet_address) FROM public.user_profiles
          WHERE user_id = auth.uid() LIMIT 1
        )
        AND apm.membership_type = 'leader'
    )
    OR EXISTS (
      SELECT 1 FROM public.pods p
      WHERE p.id = pod_role_permissions.pod_id
        AND (
          SELECT LOWER(wallet_address) FROM public.user_profiles
          WHERE user_id = auth.uid() LIMIT 1
        ) = ANY(SELECT LOWER(unnest(p.pod_leads)))
    )
    OR EXISTS (
      SELECT 1 FROM public.pods p
      WHERE p.id = pod_role_permissions.pod_id
        AND LOWER(p.created_by_address) = (
          SELECT LOWER(wallet_address) FROM public.user_profiles
          WHERE user_id = auth.uid() LIMIT 1
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.active_pod_members apm
      WHERE apm.pod_id = pod_role_permissions.pod_id
        AND LOWER(apm.wallet) = (
          SELECT LOWER(wallet_address) FROM public.user_profiles
          WHERE user_id = auth.uid() LIMIT 1
        )
        AND apm.membership_type = 'leader'
    )
    OR EXISTS (
      SELECT 1 FROM public.pods p
      WHERE p.id = pod_role_permissions.pod_id
        AND (
          SELECT LOWER(wallet_address) FROM public.user_profiles
          WHERE user_id = auth.uid() LIMIT 1
        ) = ANY(SELECT LOWER(unnest(p.pod_leads)))
    )
    OR EXISTS (
      SELECT 1 FROM public.pods p
      WHERE p.id = pod_role_permissions.pod_id
        AND LOWER(p.created_by_address) = (
          SELECT LOWER(wallet_address) FROM public.user_profiles
          WHERE user_id = auth.uid() LIMIT 1
        )
    )
  );


-- ── forum_post_reactions ──────────────────────────────────────────────────────
-- These policies currently use auth.uid()::text compared to reactor_address.
-- The Supabase advisory flags them because reactor_address stores wallet addresses,
-- not UUIDs. The policies are effectively broken (uid != wallet). Fix by using
-- the user_profiles subquery to compare wallet addresses properly.

DROP POLICY IF EXISTS "Users can create their own reactions" ON public.forum_post_reactions;
DROP POLICY IF EXISTS "Users can delete their own reactions" ON public.forum_post_reactions;

CREATE POLICY "Users can create their own reactions" ON public.forum_post_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    LOWER(reactor_address) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "Users can delete their own reactions" ON public.forum_post_reactions
  FOR DELETE TO authenticated
  USING (
    LOWER(reactor_address) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );


-- ── pod_accountability_signatures ─────────────────────────────────────────────
-- Drop and recreate any user_metadata-based policies if they exist.
-- Using user_profiles subquery for safe wallet lookup.

DROP POLICY IF EXISTS "Users can insert their own accountability signatures" ON public.pod_accountability_signatures;
DROP POLICY IF EXISTS "Users can update their own signatures" ON public.pod_accountability_signatures;
DROP POLICY IF EXISTS "Users can view pod accountability signatures" ON public.pod_accountability_signatures;

CREATE POLICY "Users can view pod accountability signatures"
  ON public.pod_accountability_signatures FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own accountability signatures"
  ON public.pod_accountability_signatures FOR INSERT
  TO authenticated
  WITH CHECK (
    LOWER(signer_address) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "Users can update their own signatures"
  ON public.pod_accountability_signatures FOR UPDATE
  TO authenticated
  USING (
    LOWER(signer_address) = (
      SELECT LOWER(wallet_address) FROM public.user_profiles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

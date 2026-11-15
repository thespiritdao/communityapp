-- Phase 0 of APP_AUDIT_2026-09-15.md: stop the bleeding.
--
-- Finding F1: pod_members carries INSERT/UPDATE policies for `authenticated`
-- that exist only in the dashboard. Any signed-in member could insert
-- themselves into any pod as role='leader' with the management hat, or set
-- their own hat_id to a leader hat — and check_pod_permission() then granted
-- every permission. Eight browser flows still write this table, so the policy
-- cannot simply be dropped yet (Phase 1 moves those writes server-side). A
-- trigger closes the escalation today without breaking them: members may only
-- write member rows for themselves; pod leads and the pod creator keep their
-- current abilities; the service role is untouched.
--
-- Finding F2: any member could insert a forged pod_accountability_signatures
-- row. Signer must now be the caller.
--
-- Finding F3: general_notifications was readable by anon and by every member
-- (323 rows of recipient/sender/message). Scoped to the recipient; senders
-- may still insert from the browser as their own address.
--
-- Verified by scripts/verify/audit-probes.mjs, which must print all-blocked after
-- this is applied.

-- ────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ────────────────────────────────────────────────────────────────────────────

-- The wallet the session belongs to. The app signs its own HS256 JWTs with a
-- top-level wallet_address claim (see /api/auth/onchainkit). NULL for anon,
-- service role, cron and the community_agent role.
CREATE OR REPLACE FUNCTION public.session_wallet()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT lower(NULLIF(auth.jwt() ->> 'wallet_address', ''));
$$;

-- Is the caller a lead or the creator of this pod? Reads only columns members
-- cannot write (pods.pod_leads / created_by_address are RLS-protected — an
-- ordinary member's UPDATE on pods returns no rows, verified in the audit).
CREATE OR REPLACE FUNCTION public.session_leads_pod(p_pod_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pods p
    WHERE p.id = p_pod_id
      AND (
        public.session_wallet() = ANY (SELECT lower(x) FROM unnest(COALESCE(p.pod_leads, '{}'::text[])) AS x)
        OR lower(COALESCE(p.created_by_address, '')) = public.session_wallet()
      )
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- F1: pod_members write guard
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pod_members_authority_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  caller text := public.session_wallet();
BEGIN
  -- Only sessions of ordinary users are constrained. Service role, cron and
  -- the scoped community_agent role are server code and keep their access.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF caller IS NULL THEN
    RAISE EXCEPTION 'pod_members: session has no wallet' USING ERRCODE = '42501';
  END IF;

  -- Leads and the pod creator keep what they can do today (approve
  -- applications, remove members, claim the management hat at creation).
  IF public.session_leads_pod(NEW.pod_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF lower(NEW.wallet) <> caller THEN
      RAISE EXCEPTION 'pod_members: you can only add yourself' USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM 'member'
       OR NEW.membership_type IS DISTINCT FROM 'member' THEN
      RAISE EXCEPTION 'pod_members: only leads can assign a leader role' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: own row only, and nothing that confers authority may change.
  IF lower(OLD.wallet) <> caller THEN
    RAISE EXCEPTION 'pod_members: you can only edit your own membership' USING ERRCODE = '42501';
  END IF;
  IF NEW.wallet IS DISTINCT FROM OLD.wallet
     OR NEW.pod_id IS DISTINCT FROM OLD.pod_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.membership_type IS DISTINCT FROM OLD.membership_type
     OR NEW.hat_id IS DISTINCT FROM OLD.hat_id THEN
    RAISE EXCEPTION 'pod_members: role, hat and pod can only be changed by a lead' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pod_members_authority_guard ON public.pod_members;
CREATE TRIGGER pod_members_authority_guard
  BEFORE INSERT OR UPDATE ON public.pod_members
  FOR EACH ROW EXECUTE FUNCTION public.pod_members_authority_guard();

-- ────────────────────────────────────────────────────────────────────────────
-- F2: signatures must be the caller's own
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accountability_signature_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  caller text := public.session_wallet();
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF caller IS NULL OR lower(NEW.signer_address) <> caller THEN
    RAISE EXCEPTION 'pod_accountability_signatures: signer must be the signed-in wallet' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND lower(OLD.signer_address) <> caller THEN
    RAISE EXCEPTION 'pod_accountability_signatures: not your signature' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accountability_signature_guard ON public.pod_accountability_signatures;
CREATE TRIGGER accountability_signature_guard
  BEFORE INSERT OR UPDATE ON public.pod_accountability_signatures
  FOR EACH ROW EXECUTE FUNCTION public.accountability_signature_guard();

-- ────────────────────────────────────────────────────────────────────────────
-- F3: general_notifications scoped to the recipient
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.general_notifications ENABLE ROW LEVEL SECURITY;

-- The current policies were created in the dashboard and are not in the
-- repo, so drop whatever is there by name at runtime rather than guessing.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname, cmd, roles, qual
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'general_notifications'
  LOOP
    RAISE NOTICE 'dropping % policy % (roles=%, using=%)', pol.cmd, pol.policyname, pol.roles, pol.qual;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.general_notifications', pol.policyname);
  END LOOP;
END $$;

-- Read your own.
CREATE POLICY "notifications: recipient reads own"
  ON public.general_notifications FOR SELECT
  TO authenticated
  USING (lower(recipient_address) = public.session_wallet());

-- Mark your own as read (and nothing else about them).
CREATE POLICY "notifications: recipient updates own"
  ON public.general_notifications FOR UPDATE
  TO authenticated
  USING (lower(recipient_address) = public.session_wallet())
  WITH CHECK (lower(recipient_address) = public.session_wallet());

-- The browser still sends some notifications (application approved, member
-- removed, governance). It may do so only as itself.
CREATE POLICY "notifications: sender inserts as self"
  ON public.general_notifications FOR INSERT
  TO authenticated
  WITH CHECK (lower(sender_address) = public.session_wallet());

-- No anon access. Server code uses the service role and is unaffected.

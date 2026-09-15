-- Phase 1, step 3 of APP_AUDIT_2026-09-15.md: pod_members is written by the
-- server only.
--
-- Apply AFTER the deploy that moves the browser's writes behind
-- /api/pods/[id]/members (approve, claim-hat, reindex, deactivate, purge).
-- Until then the Phase 0 trigger (20260915000001) holds the line; it stays in
-- place afterwards as belt-and-braces.
--
-- The INSERT/UPDATE/DELETE policies being dropped were created in the
-- dashboard and never committed — which is how F1 happened. From here the
-- repo is the record: the only client access to pod_members is SELECT.

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname, cmd, roles, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pod_members'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    RAISE NOTICE 'dropping % policy % on pod_members (roles=%, using=%)',
      pol.cmd, pol.policyname, pol.roles, pol.qual;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.pod_members', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.pod_members ENABLE ROW LEVEL SECURITY;

-- Reads are unchanged: authenticated users can view members (membership
-- lists are part of a pod's public face inside the app). The anon SELECT
-- policy from 20260224000001 is left as it was; the audit records it as low.

COMMENT ON TABLE public.pod_members IS
  'Written only by server routes under /api/pods/[id]/members after the chain confirms the hat. Client access is SELECT only (APP_AUDIT_2026-09-15, Phase 1).';

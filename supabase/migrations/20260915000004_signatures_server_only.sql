-- Phase 1, step 4 of APP_AUDIT_2026-09-15.md: agreement signatures are
-- recorded by the server after checking the proof.
--
-- Apply AFTER the deploy that routes AgreementSigningModal through
-- POST /api/pods/[id]/agreements/sign. The Phase 0 trigger on
-- pod_accountability_signatures (signer must be the caller) stays in place.
--
-- Drops every client write policy on pod_accountability_signatures and
-- user_eligibility_status. Reads are unchanged.

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname, cmd, roles, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('pod_accountability_signatures', 'user_eligibility_status')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    RAISE NOTICE 'dropping % policy % on % (roles=%, using=%)',
      pol.cmd, pol.policyname, pol.tablename, pol.roles, pol.qual;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

ALTER TABLE public.pod_accountability_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_eligibility_status ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pod_accountability_signatures IS
  'Written only by /api/pods/[id]/agreements/sign after the chain (or a verified message signature) proves the signer. Client access is SELECT only (APP_AUDIT_2026-09-15, Phase 1).';

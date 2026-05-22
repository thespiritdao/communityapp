-- Lock down active_pod_members view to enforce RLS via the caller's context.
--
-- The underlying pod_members table already has RLS enabled (migration
-- 20260224000001_fix_security_advisories.sql) with a policy that allows
-- authenticated users to SELECT. But Postgres views default to the
-- view-owner's privilege context (security_definer-style), which means
-- a query against the view can bypass the underlying table's RLS.
--
-- Flipping the view to security_invoker = true makes it respect the
-- calling user's role and RLS context against pod_members. Net effect:
--   anon users  → blocked (no policy grants them SELECT on pod_members)
--   authed user → allowed (existing "Authenticated users can view pod members" policy)
--
-- This is consistent with the security posture of the rest of the app;
-- the unrestricted view was an accidental gap, not an intentional
-- exposure of pod membership to anon scrapers.

ALTER VIEW active_pod_members SET (security_invoker = true);

COMMENT ON VIEW active_pod_members IS
  'Active pod members with pod details joined from pods table. security_invoker=true so RLS is enforced via the underlying pod_members table policies.';

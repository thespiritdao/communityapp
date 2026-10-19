-- Re-grant the two identity RPCs the browser calls directly.
--
-- 20260920000001 revoked EXECUTE on every public function from
-- public/anon/authenticated and granted back "five called by the browser".
-- Two were missed: events_accessible_by_identity (the only source for the
-- events "My Events" tab, the Calendar tab, and the registrable list) and
-- forums_accessible_by_identity (link-table forum access). Since 2026-09-20
-- the events hook has caught the 42501 error and cleared all three of its
-- lists, so every member sees 0 registered events and an empty calendar.
-- The forum hook falls back to the direct required_token query, so only
-- link-table-gated categories went missing there.
--
-- Both functions are SECURITY DEFINER and take the caller's token/hat lists
-- as input, which is the same trust model they had before the revoke.
--
-- Applied: 2026-10-19 via the us-east-1 pooler (verified: authenticated
-- has EXECUTE on both, anon does not).

begin;

grant execute on function public.events_accessible_by_identity(user_tokens text[], user_hats text[]) to authenticated;
grant execute on function public.forums_accessible_by_identity(user_tokens text[], user_hats text[]) to authenticated;

commit;

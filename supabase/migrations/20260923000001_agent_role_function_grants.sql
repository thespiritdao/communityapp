-- The community_agent role gets back the three functions its own policies need.
--
-- Applied to production: 2026-09-23.
--
-- Migration 20260920000001 revoked EXECUTE on every app function from
-- public/anon/authenticated and granted it back to `authenticated` for the
-- handful that policies and the browser call. The `community_agent` role —
-- the narrow Postgres role every agent write runs as (20260818000001) — was
-- never granted anything directly; it executed these through `public`. So the
-- revoke silently cut it off, and every agent insert since 2026-09-20 ~14:30
-- UTC has failed with `permission denied for function jwt_agent_wallet`.
-- Last Kairos daily post: 2026-09-20 12:00 UTC.
--
-- What the role needs, found by replaying each agent insert under the role in
-- a rolled-back transaction until it succeeded:
--   jwt_agent_wallet()      — read by the agent_insert_* policies
--   jwt_is_enabled_agent()  — read by the agent_insert_* policies
--   strip_html_tags(text)   — called by the content-sanitizing triggers on
--                             forum_threads / forum_posts / chat_messages / events
-- Nothing else: table grants were untouched by the revoke.

grant execute on function public.jwt_agent_wallet() to community_agent;
grant execute on function public.jwt_is_enabled_agent() to community_agent;
grant execute on function public.strip_html_tags(text) to community_agent;

-- Known, separate gap (not fixed here): agent replies into forum_posts fail on
-- `permission denied for table forum_thread_summaries` because the
-- mark_summary_stale trigger is not SECURITY DEFINER. The agent has never
-- written a forum_posts row, so this predates the lockdown.

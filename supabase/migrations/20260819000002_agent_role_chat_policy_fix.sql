-- 20260819000002_agent_role_chat_policy_fix.sql
--
-- Fix: community_agent chat inserts failed with "permission denied for table
-- user_profiles" (42501).
--
-- Cause: chat_messages has legacy permissive INSERT policies declared
-- TO public — which includes community_agent — and Postgres evaluates every
-- applicable policy's subquery with the caller's privileges. Two of those
-- subqueries read user_profiles (wallet_address, user_id), which the agent
-- role could not SELECT, aborting the whole insert even though the agent's
-- own policy would have passed.
--
-- Fix: COLUMN-scoped grant on exactly the two columns those policies
-- reference. Profile contents (names, bios, avatars, contact fields) remain
-- inaccessible to the agent role — the constitutional claim "no access to
-- profiles" narrows only to "no access to profile contents".

GRANT SELECT (wallet_address, user_id) ON user_profiles TO community_agent;

-- Applied to production 2026-09-25.
-- create_pod_forum_category() runs when a pod_modules row turns the forum
-- on/off and writes forum_categories + forum_category_required_tokens. It ran
-- with the caller's rights; since 20260925000003 members cannot write the
-- category gates directly, so a leader enabling the forum from the browser
-- would fail. It derives the gate from the pod's own configuration and only
-- fires on pod_modules changes that pod_modules' own policies allow, so it
-- runs as definer with a fixed search_path.

begin;
alter function public.create_pod_forum_category() security definer;
alter function public.create_pod_forum_category() set search_path = public;
revoke execute on function public.create_pod_forum_category() from public, anon, authenticated;
commit;

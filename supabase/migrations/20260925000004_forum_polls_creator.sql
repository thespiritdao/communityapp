-- Applied to production 2026-09-25.
-- forum_polls INSERT only required a session (auth.jwt() IS NOT NULL), so a
-- member could create a poll naming someone else as created_by, and the
-- poll's creator is who may manage its options. Now created_by is the caller.

begin;
drop policy if exists "Authenticated users can create polls" on public.forum_polls;
drop policy if exists "Members create polls as themselves" on public.forum_polls;
create policy "Members create polls as themselves" on public.forum_polls
  for insert to authenticated
  with check (public.is_my_wallet(created_by));
commit;

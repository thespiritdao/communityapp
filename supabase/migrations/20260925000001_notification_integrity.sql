-- Applied to production 2026-09-25.
-- Notifications: links stay on the app, and members send only as themselves.
--
-- Before (found 2026-09-23/25):
--   * context_url was free text. The daily digest email builds
--     `${APP_URL}${context_url}`, so '.evil.com/x' became a link to
--     https://app.spiritdao.org.evil.com/x in mail from the DAO's own
--     address; push notifications open the same value on tap.
--   * governance_notifications INSERT was `true` (any sender, any
--     recipient); bounty_notifications INSERT was `true` for anyone.
--
-- After:
--   * CHECK: context_url is null or a same-site path ('/...' but not '//'
--     and no backslash) on general_, governance_ and event_notifications.
--     All 792 existing rows already comply.
--   * governance_notifications: members insert only as the sender
--     (same rule general_notifications already has); the server route and
--     crons use the service role.
--   * bounty_notifications: no member inserts (the table is unused; bounty
--     notices go through /api/notifications/send).

begin;

create or replace function public.is_safe_app_path(p text)
returns boolean
language sql
immutable
as $$
  select p is null or (p ~ '^/([^/]|$)' and position(chr(92) in p) = 0);
$$;

alter table public.general_notifications drop constraint if exists general_notifications_safe_context_url;
alter table public.general_notifications
  add constraint general_notifications_safe_context_url check (public.is_safe_app_path(context_url));

alter table public.governance_notifications drop constraint if exists governance_notifications_safe_context_url;
alter table public.governance_notifications
  add constraint governance_notifications_safe_context_url check (public.is_safe_app_path(context_url));

alter table public.event_notifications drop constraint if exists event_notifications_safe_context_url;
alter table public.event_notifications
  add constraint event_notifications_safe_context_url check (public.is_safe_app_path(context_url));

drop policy if exists "Users can insert governance notifications" on public.governance_notifications;
drop policy if exists "governance notifications: sender inserts as self" on public.governance_notifications;
create policy "governance notifications: sender inserts as self" on public.governance_notifications
  for insert to authenticated
  with check (public.is_my_wallet(sender_address));

drop policy if exists "Anyone can create notifications" on public.bounty_notifications;

commit;

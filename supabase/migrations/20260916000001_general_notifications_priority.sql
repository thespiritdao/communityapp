-- general_notifications.priority
--
-- Eight code paths insert a `priority` field into general_notifications
-- (membership approvals to exec/leaders, voting reminders, the agent
-- subscription cron, /api/notifications/send, pod governance, the unified
-- notification service) and the notifications page already renders it —
-- but no migration ever created the column. PostgREST rejects every one of
-- those inserts with PGRST204 "Could not find the 'priority' column", so
-- those notifications have silently never been delivered.
--
-- Found 2026-09-16 while testing the rewired application-approval flow.
-- Adding the column is the smaller, safer fix: it makes the existing writers
-- and reader agree instead of touching eight call sites.

alter table public.general_notifications
  add column if not exists priority text not null default 'medium';

alter table public.general_notifications
  drop constraint if exists general_notifications_priority_check;

alter table public.general_notifications
  add constraint general_notifications_priority_check
  check (priority in ('low', 'medium', 'high', 'urgent'));

-- PostgREST caches the schema; the ALTER emits the reload notification, but
-- send it explicitly so the column is usable immediately.
notify pgrst, 'reload schema';

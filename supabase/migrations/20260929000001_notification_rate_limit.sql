-- Applied to production 2026-09-29 (dry-run 8/8 in a rolled-back transaction first).
-- Notifications: rate limit per sender.
--
-- Before: any member could send any other member unlimited notifications,
-- either through /api/notifications/send or by inserting into
-- general_/governance_notifications directly (RLS only checks that the
-- sender is the caller). Each one can also fire a push to the recipient's
-- devices.
--
-- After: a BEFORE INSERT trigger on both tables refuses, per sender
-- (case-insensitive, both tables combined):
--   * more than 20 to the same recipient in the last hour (flooding one
--     person), and
--   * more than 1000 in total in the last hour (mass spam).
-- It fires for every role, so the send route (service role, sender =
-- verified caller) and direct member inserts share one limit. Server-only
-- senders ('system' — crons, reminders) are exempt.
--
-- Calibration (2026-09-29, all 728 rows): largest legitimate burst was a
-- pod-wide proposal fan-out of 100/hour from one sender; the most any
-- sender sent one recipient in an hour was 8.
--
-- Refusals raise SQLSTATE 'P0429' so callers can map them to HTTP 429.

begin;

create index if not exists idx_general_notifications_sender_created
  on public.general_notifications (lower(sender_address), created_at desc);
create index if not exists idx_governance_notifications_sender_created
  on public.governance_notifications (lower(sender_address), created_at desc);

-- SECURITY DEFINER: members can only read notifications addressed to them,
-- so an invoker-rights count would not see what they have sent.
create or replace function public.enforce_notification_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sender text := lower(new.sender_address);
  v_recipient text := lower(new.recipient_address);
  v_since timestamptz := now() - interval '1 hour';
  v_total int;
  v_pair int;
begin
  if v_sender is null or v_sender = 'system' then
    return new;
  end if;

  select
    count(*),
    count(*) filter (where lower(recipient_address) = v_recipient)
  into v_total, v_pair
  from (
    select recipient_address from public.general_notifications
      where lower(sender_address) = v_sender and created_at > v_since
    union all
    select recipient_address from public.governance_notifications
      where lower(sender_address) = v_sender and created_at > v_since
  ) recent;

  if v_pair >= 20 then
    raise exception 'notification rate limit: at most 20 notifications per hour to the same member'
      using errcode = 'P0429';
  end if;
  if v_total >= 1000 then
    raise exception 'notification rate limit: at most 1000 notifications per hour'
      using errcode = 'P0429';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_notification_rate_limit() from public, anon, authenticated;

drop trigger if exists notification_rate_limit on public.general_notifications;
create trigger notification_rate_limit
  before insert on public.general_notifications
  for each row execute function public.enforce_notification_rate_limit();

drop trigger if exists notification_rate_limit on public.governance_notifications;
create trigger notification_rate_limit
  before insert on public.governance_notifications
  for each row execute function public.enforce_notification_rate_limit();

commit;

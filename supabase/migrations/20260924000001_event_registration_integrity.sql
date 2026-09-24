-- Applied to production 2026-09-24.
-- Event registrations: members write only their own row, only organizers
-- check people in, and nobody edits payment facts from the browser.
--
-- Before (found 2026-09-23): "Anyone can register for events" (INSERT true)
-- and an ALL policy with no condition let any member insert or rewrite any
-- registration: register other people (the reminder cron then emails them),
-- mark their own ticket paid, or set checked_in_at on themselves, which the
-- (not yet scheduled) /api/self/earn/event route turns into $SELF.
--
-- After:
--   * INSERT/UPDATE own rows, where "own" includes device wallets linked in
--     user_wallets (the old own-row policy only knew the profile wallet).
--   * UPDATE for the event's creator or manager.
--   * event_registrations_guard decides which columns each may change:
--       member     register (free events only) / cancel / re-register
--       organizer  check-in, completion, refund status, cancel
--       nobody     event, attendee, payment amount/token/tx hash
--     Paid registrations are written by POST /api/events/[id]/register with
--     the service role after isRegisteredForEvent is confirmed on-chain.
--   * checked_in_by records the wallet that performed each check-in.

begin;

create or replace function public.is_my_wallet(target text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target is not null and (
    exists (
      select 1 from public.user_wallets uw
      where uw.user_id = auth.uid() and lower(uw.wallet_address) = lower(target)
    )
    or exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid() and lower(up.wallet_address) = lower(target)
    )
  );
$$;
revoke execute on function public.is_my_wallet(text) from public, anon;
grant execute on function public.is_my_wallet(text) to authenticated;

create or replace function public.is_event_organizer(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (public.is_my_wallet(e.creator_address) or public.is_my_wallet(e.manager_address))
  );
$$;
revoke execute on function public.is_event_organizer(uuid) from public, anon;
grant execute on function public.is_event_organizer(uuid) to authenticated;

alter table public.event_registrations add column if not exists checked_in_by text;

drop policy if exists "Anyone can register for events" on public.event_registrations;
drop policy if exists "Authenticated users can register for events by wallet" on public.event_registrations;
drop policy if exists "Users can create their own registrations" on public.event_registrations;
drop policy if exists "Users can update their own registrations" on public.event_registrations;
drop policy if exists "Members register themselves" on public.event_registrations;
drop policy if exists "Members update own registration" on public.event_registrations;
drop policy if exists "Organizers update their event registrations" on public.event_registrations;

create policy "Members register themselves" on public.event_registrations
  for insert to authenticated
  with check (public.is_my_wallet(user_address));

create policy "Members update own registration" on public.event_registrations
  for update to authenticated
  using (public.is_my_wallet(user_address))
  with check (public.is_my_wallet(user_address));

create policy "Organizers update their event registrations" on public.event_registrations
  for update to authenticated
  using (public.is_event_organizer(event_id))
  with check (public.is_event_organizer(event_id));

create or replace function public.event_registrations_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_free boolean;
  organizer boolean;
  own boolean;
  caller text := lower(auth.jwt() ->> 'wallet_address');
begin
  -- Server routes (service role) and direct DB sessions are trusted.
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  select coalesce(nullif(trim(e.price_amount), ''), '0') ~ '^0*(\.0*)?$'
     and coalesce(nullif(trim(e.price_self_amount), ''), '0') ~ '^0*(\.0*)?$'
    into is_free
  from public.events e
  where e.id = coalesce(new.event_id, old.event_id);
  is_free := coalesce(is_free, false);

  if tg_op = 'INSERT' then
    if not is_free then
      raise exception 'Paid registrations are recorded by the server once the payment is confirmed on-chain'
        using errcode = '42501';
    end if;
    new.registration_status := 'registered';
    new.payment_status := 'completed';
    new.payment_amount := '0';
    new.checked_in_at := null;
    new.checked_in_by := null;
    new.completed_at := null;
    new.completion_token_id := null;
    new.cancelled_at := null;
    return new;
  end if;

  -- UPDATE
  organizer := public.is_event_organizer(old.event_id);
  own := public.is_my_wallet(old.user_address);

  if new.event_id is distinct from old.event_id
     or lower(new.user_address) is distinct from lower(old.user_address)
     or new.payment_amount is distinct from old.payment_amount
     or new.payment_token is distinct from old.payment_token
     or new.payment_tx_hash is distinct from old.payment_tx_hash then
    raise exception 'Event, attendee and payment details cannot be changed'
      using errcode = '42501';
  end if;

  if new.payment_status is distinct from old.payment_status
     and not (organizer and new.payment_status in ('refunded', 'refund_pending')) then
    raise exception 'Only the event organizer can record a refund'
      using errcode = '42501';
  end if;

  if (new.checked_in_at is distinct from old.checked_in_at
      or new.completed_at is distinct from old.completed_at
      or new.completion_token_id is distinct from old.completion_token_id)
     and not organizer then
    raise exception 'Only the event organizer can check attendees in or complete them'
      using errcode = '42501';
  end if;

  if new.registration_status is distinct from old.registration_status then
    if new.registration_status in ('checked_in', 'completed') and not organizer then
      raise exception 'Only the event organizer can check attendees in or complete them'
        using errcode = '42501';
    end if;
    if new.registration_status = 'registered' and not organizer and not (own and is_free) then
      raise exception 'Re-registering for a paid event goes through the server'
        using errcode = '42501';
    end if;
  end if;

  -- Who checked this attendee in is recorded, never supplied.
  if new.checked_in_at is distinct from old.checked_in_at then
    new.checked_in_by := case when new.checked_in_at is null then null else caller end;
  else
    new.checked_in_by := old.checked_in_by;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_event_registrations_guard on public.event_registrations;
create trigger trg_event_registrations_guard
  before insert or update on public.event_registrations
  for each row execute function public.event_registrations_guard();

commit;

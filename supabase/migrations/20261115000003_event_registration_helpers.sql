-- Event registrations, step 1 of 2: helpers for scoping visibility.
-- Step 2 (20261115000004) narrows the read policy; apply it only after the
-- app version that reads counts through event_registration_counts() is live.
--
-- Before: "Authenticated users can read event registrations" let any signed-in
-- member read every registration for every event (who attends what, payment
-- status, check-in times).
--
-- After, a member can read a registration when it is their own, when they are
-- registered (not cancelled) for the same event, or when they organise it
-- (creator or manager). Attendee numbers stay public to members through
-- event_registration_counts(), which returns counts and no identities.
--
-- Idempotent.

begin;

create or replace function public.is_registered_for_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.event_registrations r
    where r.event_id = p_event_id
      and r.registration_status <> 'cancelled'
      and public.is_my_wallet(r.user_address)
  );
$$;

revoke all on function public.is_registered_for_event(uuid) from public, anon;
grant execute on function public.is_registered_for_event(uuid) to authenticated;

-- Counts per event. p_event_ids null = every event.
create or replace function public.event_registration_counts(p_event_ids uuid[] default null)
returns table (event_id uuid, registration_count bigint, checked_in_count bigint, completed_count bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.event_id,
         count(*) filter (where r.registration_status in ('registered', 'checked_in', 'completed')),
         count(*) filter (where r.registration_status in ('checked_in', 'completed')),
         count(*) filter (where r.registration_status = 'completed')
  from public.event_registrations r
  where p_event_ids is null or r.event_id = any (p_event_ids)
  group by r.event_id;
$$;

revoke all on function public.event_registration_counts(uuid[]) from public, anon;
grant execute on function public.event_registration_counts(uuid[]) to authenticated;

commit;

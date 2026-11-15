-- Event registrations, step 2 of 2: attendees and organisers only.
-- Requires 20261115000003 and the app version that reads attendee numbers
-- through event_registration_counts(). See step 1 for the rationale.
--
-- Idempotent.

begin;

drop policy if exists "Authenticated users can read event registrations" on public.event_registrations;
drop policy if exists "Attendees and organisers read registrations" on public.event_registrations;
create policy "Attendees and organisers read registrations" on public.event_registrations
  for select to authenticated
  using (public.is_registered_for_event(event_id) or public.is_event_organizer(event_id));

commit;

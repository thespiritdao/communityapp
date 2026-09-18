-- Member-facing profile reads without private columns.
--
-- Problem: user_profiles has SELECT policy "true" for authenticated, and the
-- table grant covers every column, so any logged-in member can read every other
-- member's email/phone/address/date of birth with one PostgREST request,
-- regardless of what the client code selects.
--
-- Fix, step 1 (this file): a public_profiles view with the display columns only.
-- Peer-facing client reads move to the view. Own-row reads (profile edit form),
-- writes, and service-role server code keep using user_profiles.
--
-- The view deliberately runs with the owner's privileges (security_invoker
-- off), so it keeps working after step 2 tightens the base-table policy to
-- own-row only. It exposes no private column, so that is safe.
--
-- Step 2 (separate migration, after step 1 has run clean in production):
--   drop policy "Authenticated users can read all profiles" on user_profiles;
--   create policy "Users can read own profile" on user_profiles
--     for select to authenticated using (user_id = auth.uid());
--
-- Applied to production: 2026-09-18 (psql via pooler).

create or replace view public.public_profiles
with (security_invoker = false) as
select
  user_id,
  wallet_address,
  first_name,
  last_name,
  profile_picture,
  bio,
  interests,
  seeking,
  occupation,
  skills_expertise,
  workplace_organization,
  projects_or_initiatives,
  desired_involvement,
  open_to_connect,
  linkedin,
  twitter,
  instagram,
  facebook,
  tiktok,
  discord,
  github,
  youtube,
  twitch,
  website,
  membership_status,
  onboarded_at,
  tos_signed_at,
  tos_version,
  active_face_pod_id
from public.user_profiles;

comment on view public.public_profiles is
  'Display columns of user_profiles for member-facing reads. No email, phone, address, date of birth, ToS signature, referral or corpus-opt-out columns. Runs as owner on purpose; see 20260918000001.';

alter view public.public_profiles owner to postgres;

-- Supabase default privileges grant everything on new public objects to
-- anon/authenticated; keep only what members need.
revoke all on public.public_profiles from public;
revoke all on public.public_profiles from anon;
revoke all on public.public_profiles from authenticated;
grant select on public.public_profiles to authenticated;
grant select on public.public_profiles to service_role;

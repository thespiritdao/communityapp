-- Onboarding redo, Phase A: intent-driven first run.
-- Scope: docs/onboarding-redo-phase-a-scope-2026-10-19.md
--
-- Three private columns on user_profiles. None are added to the
-- public_profiles view (column-listed, verified 2026-10-19), so other
-- members cannot read them. Own-row RLS already covers reads and writes:
--   "Users can read own profile"   SELECT  user_id = auth.uid()
--   "Users can update own profile" UPDATE  user_id = auth.uid()
--
--   onboarding_intent        what the member said they came for
--   onboarding_visited       { "<route-key>": "<iso timestamp>" } — the only
--                            stored progress; every other checklist item is
--                            derived live from profile / membership rows
--   onboarding_dismissed_at  member hid the progress card
--
-- Applied: 2026-10-19 via the us-east-1 pooler (verified: three columns
-- present, public_profiles view definition unchanged).

begin;

alter table public.user_profiles
  add column if not exists onboarding_intent text
    check (onboarding_intent in ('join', 'found', 'explore')),
  add column if not exists onboarding_visited jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_dismissed_at timestamptz;

comment on column public.user_profiles.onboarding_intent is
  'Phase A onboarding: join | found | explore. Null = not asked yet.';
comment on column public.user_profiles.onboarding_visited is
  'Phase A onboarding: route-key -> first-visit timestamp. Only stored progress.';
comment on column public.user_profiles.onboarding_dismissed_at is
  'Phase A onboarding: when the member hid the progress card.';

commit;

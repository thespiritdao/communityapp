# Spec — Member Email Privacy (public_profiles view)

*Status: step 1 SHIPPED 2026-09-18. The `public_profiles` view exists in
production (`supabase/migrations/20260918000001_public_profiles_view.sql`),
every peer-facing client read uses it, `ProfileService.getOwnByWallet` is the
only client path that reads private columns (own row), the conference
`participant-name` route requires a session and no longer falls back to the
email local-part, and `scripts/check-profile-email-leaks.mjs` now fails
(exit 1) on regressions. Step 2, tightening the base-table SELECT policy to
own-row, is pending a week of clean production; the SQL is in the migration
header.*

## Problem

`user_profiles.email` is readable by every authenticated member: RLS on
`user_profiles` is `USING (true)` for the `authenticated` role, and many client
queries use `select('*')`, so a logged-in member's browser receives every other
member's email. It is member-gated (anonymous/public users get nothing) but any
member can harvest the full email list via the API/dev-tools even where it is not
displayed.

## What is already done (2026-07)

The visible / harvest-prone surfaces were fixed to select explicit public columns
without `email`, and the clickable email was removed:

- `ProfileModal` — removed `email` from `SOCIAL_PLATFORMS` (was a broken link and
  an exposure). Contact is via the in-app **Message** button (Direct Messages).
- `app/members/page.tsx` — members directory query: explicit public columns.
- `app/vote/page.tsx` — the two peer-profile queries: explicit columns / no email.
- `features/chat/components/ChatContainer.tsx` (peer list) — explicit columns.
- `features/chat/components/HatGatedChatContainer.tsx` (peer list + sender) —
  explicit columns.
- `features/chat/components/IncomingCallBanner.tsx` — name/avatar only.

## What remains (DEFERRED)

`scripts/check-profile-email-leaks.mjs` (advisory) lists ~30 remaining client
`select('*')` on `user_profiles` across bounty, events, marketplace, surveys, and
a few chat/vote spots. Fixing these one-by-one is broad and risky, especially
right before onboarding. Do NOT chase them individually.

## The definitive fix: a `public_profiles` view

Create a view that exposes all display columns EXCEPT `email` (and any other
PII), and repoint peer-facing client reads at it. Own-row reads (the user's own
email in the edit form) and server/service-role reads (emailDigest, donation
receipts, auth `.eq('email', ...)` lookups) continue to use the base table.

Why a view and not `REVOKE SELECT(email)`:
- `REVOKE SELECT(email) FROM authenticated` also breaks the auth/onboarding
  `.eq('email', ...)` lookups (Postgres denies a query that even references a
  column you lack privilege on) and every `select('*')`. Too blunt; breaks login.
- A view is additive: nothing existing breaks; you migrate peer reads to it at
  your own pace, and it is a real DB boundary (the view has no email column).

Sketch (verify against live schema before applying):

```sql
create view public_profiles as
  select user_id, wallet_address, first_name, last_name, profile_picture, bio,
         website, twitter, discord, github, linkedin, tiktok, instagram,
         facebook, youtube, twitch, interests, seeking, open_to_connect
  from user_profiles;
-- grant select to authenticated; keep base-table email for own-row + service-role.
```

Then migrate the client `select('*')`/email reads (per the guard's list) to
`from('public_profiles')`, and flip `check-profile-email-leaks.mjs` back to
`process.exit(1)` so regressions fail CI.

## Recommended timing

After the first communities are onboarded and the app has proven stable, not
before. This is defense-in-depth, not an emergency: nothing is publicly exposed.

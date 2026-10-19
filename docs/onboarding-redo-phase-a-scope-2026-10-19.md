# Onboarding Redo — Phase A Scope

**Date:** 2026-10-19
**Status:** Built 2026-10-19 (same day). Migration applied to prod. See "As built" at the end for the deviations from this scope.
**Owner:** Ron (decisions), Claude (build)

## Goal

Replace the one-size-fits-all first run with a short, intent-driven one. A new
member says what they came for, gets a track of real actions that fit that
intent, and sees their progress on `/home` until the track is done. Phase A
does this on the existing home-only tour engine. Multi-page walkthroughs
(Phase B) and the guided pod-founding flow (Phase C) are out of scope here.

## What exists today (baseline)

| Piece | Where | Behaviour |
|---|---|---|
| Entry | `src/app/page.tsx`, `src/components/InviteCodeModal.tsx` | Invite modal (optional code), CDP wallet, Proof of Curiosity mint, `onboarded_at` set via `/api/onboarding/complete` |
| Arrival | `src/app/home/page.tsx` | TOS modal if unsigned, "Complete your profile" box if no first name, module grid |
| Tour | `src/context/TourContext.tsx`, `src/components/tour/*` | One 13-step spotlight tour over the home icons, prompted once, stored in `user_profiles.tour_completed_at` |
| Profile motivations | `src/features/identity/components/ProfileEditForm.tsx` | `seeking` (10 options), `interests` (12), `desired_involvement`, `open_to_connect`. Never asked at the door |
| Pod invite links | `src/components/PodInviteRedeemer.tsx` | `?invite=POD-…` redeemed on `/home` after auth |
| Pod founding | `src/app/pods/page.tsx` lines 115-119 | Every Proof of Curiosity holder can open `/pods/create-with-modules`. Founding is open to all onboarded members |

The tour engine finds targets by `data-tour="id"` on the current page only
(`TourOverlay.tsx` line 27). It cannot navigate.

## Phase A deliverables

### A1. Intent question

A single full-width card on `/home`, shown once after TOS is signed and
before anything else on the page.

> **What brings you here?**
> - **Join a community** — find a pod and the people in it
> - **Found a community** — start a pod and invite others
> - **Just explore** — look around first, decide later

Rules:
- Skipped automatically when a pod invite is pending in sessionStorage
  (treated as Join).
- Answer stored in `user_profiles.onboarding_intent` (`join | found | explore`),
  written client-side under the existing own-row RLS policy.
- Changeable later from Identity → profile edit (one select field).
- Dismissable ("ask me later") sets nothing and the card returns next visit.

### A2. One track per intent

Each track is an ordered list of 4-6 checklist items. An item has a label,
a target route, a `done` predicate computed from real state, and an optional
tour step id so "Show me" can spotlight the home icon. No new engine: the
"Show me" button starts the existing tour at that single step.

**Join**
1. Add your name and photo → `/identity`. Done: `first_name` and `profile_picture` set.
2. Say what you're seeking → `/identity`. Done: `seeking` non-empty.
3. Meet the members → `/members`. Done: visited (see A4).
4. Find a pod → `/pods`. Done: at least one active `pod_members` row, or a pending application.
5. Say hello in General chat → `/chat`. Done: visited.

**Found**
1. Add your name and photo → `/identity`. Done: as above.
2. Add a bio → `/identity`. Done: `bio` non-empty. (Founders need to be legible.)
3. See how pods work → `/pods`. Done: visited.
4. Create your pod → `/pods/create-with-modules`. Done: the member is in `pod_leads` of any pod.
5. Share your invite link → `/pods/[id]/manage`. Done: at least one `pod_invite_links` row (or equivalent) created by this member. Falls back to "visited" if no cheap query exists.

**Explore**
1. Ask Sensemaker one question → `/sensemaker-ai`. Done: one `sensemaker_conversations` row for this member.
2. Browse the Knowledge Base → `/knowledge`. Done: visited.
3. Read the Forum → `/forum`. Done: visited.
4. Watch the Pulse → `/explorer`. Done: visited.
5. Ready to join or found? → re-opens the intent question with Explore removed.

`seeking` and `interests` are collected in Phase A but only used for
sorting the suggested pods in Phase C.

### A3. Progress card on `/home`

Replaces the current "Complete your profile" box (lines 79-142 of
`src/app/home/page.tsx`). Shows the track title, N of M done, the items with
checkmarks, and the next undone item as the primary button. "Show me" on an
item runs the single tour step. The card hides itself when every item is done
or when the member dismisses it; dismissal is stored so it stays hidden.

A compact variant of the same card goes on the bottom of `/identity` so the
member sees progress right after editing the profile.

### A4. State and storage

One migration, `supabase/migrations/20261019000001_onboarding_intent.sql`:

```sql
alter table user_profiles
  add column onboarding_intent text
    check (onboarding_intent in ('join','found','explore')),
  add column onboarding_visited jsonb not null default '{}'::jsonb,
  add column onboarding_dismissed_at timestamptz;
```

- `onboarding_visited` holds `{ "/members": "2026-10-19T…" }` and is the
  only stored progress. A small `useRecordVisit()` hook writes the route on
  first mount of each tracked page. Everything else is derived live from
  profile, pod membership, leads, and conversation rows the client can already
  read.
- `public_profiles` view is **not** widened; none of the three columns are
  public. Confirm the view is column-listed, not `select *`.
- Policy check: `user_profiles` own-row update already permits these writes
  (anon has no grants; members update their own row only).

### A5. Copy refresh for the existing tour

Same engine, new text, done in the same pass because the tour steps are
reused by "Show me":
- Artifacts: drop the `$SELF`/`$SYSTEM` wording, describe the marketplace plainly.
- Pods: mention Places and Journal as add-ons.
- Identity: mention "what you're seeking" since the track asks for it.
- Members: say that completed profiles list first.
- Final step: point at the progress card rather than "Start exploring".

## Out of scope (later phases)

- Multi-page tour engine (route-aware steps, wait-for-mount). Phase B.
- Per-page first-visit mini-tours. Phase B.
- Pod suggestions matched on `interests`. Phase C.
- Guided founding steps inside `create-with-modules`. Phase C.
- Changing the pre-auth invite modal or the mint step. Not planned.

## Files touched (estimate)

| File | Change |
|---|---|
| `supabase/migrations/20261019000001_onboarding_intent.sql` | new |
| `src/features/onboarding/tracks.ts` | new: track definitions and `done` predicates |
| `src/features/onboarding/useOnboardingProgress.ts` | new: loads profile + membership + leads, returns items with done flags |
| `src/features/onboarding/useRecordVisit.ts` | new: writes `onboarding_visited` |
| `src/features/onboarding/components/IntentCard.tsx` | new |
| `src/features/onboarding/components/ProgressCard.tsx` | new |
| `src/app/home/page.tsx` | swap profile box for IntentCard / ProgressCard |
| `src/app/identity/page.tsx` | compact ProgressCard |
| `src/features/identity/components/ProfileEditForm.tsx` | intent select |
| `src/context/TourContext.tsx` | `startTourAt(stepId)`, copy refresh |
| `src/app/members/page.tsx`, `/chat`, `/forum`, `/knowledge`, `/explorer`, `/pods`, `/sensemaker-ai` | one-line `useRecordVisit()` each |
| `src/features/identity/types.ts` | three new optional fields |

## Acceptance

1. New member, no invite link: after TOS, sees the intent card. Picks Found.
   `/home` now shows a 5-item Found track with 0/5. Adding a name and photo
   flips item 1 without a reload of anything but the profile hook.
2. New member via `?invite=POD-…`: never sees the intent card, lands on a Join
   track with item 4 already done.
3. Returning member with `onboarding_intent` null and `tour_completed_at`
   set: sees the intent card once, can dismiss it, and it does not return
   after dismissal.
4. "Show me" on any item spotlights the matching home icon and nothing else.
5. `public_profiles` exposes none of the three new columns.
6. Existing tour prompt still fires for members with `tour_completed_at` null.

## Effort

Two working days: half a day for migration, types, and tracks; one day for
the two cards and the home/identity wiring; half a day for the visit hook
across seven pages, tour copy, and a prod smoke test.

## As built (2026-10-19)

Files: `src/features/onboarding/{tracks.ts, useOnboardingProgress.ts,
VisitRecorder.tsx, components/IntentCard.tsx, components/ProgressCard.tsx}`,
migration `20261019000002_onboarding_intent.sql`, plus edits to
`src/app/home/page.tsx`, `src/app/identity/page.tsx`,
`src/app/providers.tsx`, `src/context/TourContext.tsx`,
`ProfileEditForm.tsx`, `updateProfile.ts`, `useUserProfile.ts`.

Deviations from the scope above:

- **Visits are recorded by one component, not seven hooks.** `VisitRecorder`
  is mounted in providers, watches the pathname, and writes the route key
  the first time a signed-in member opens it. No page was edited for this.
  Route keys: identity, members, chat, forum, knowledge, explorer, pods,
  pods-manage, sensemaker (`tracks.ts: visitKeyForPath`).
- **Explore item 1 is a visit check**, not a conversation-row check:
  `sensemaker_conversations` does not exist in prod (the API route's insert
  into it fails silently).
- **Found item 5 is a visit check** on any `/pods/<id>/manage` page:
  `pod_invite_links` has no SELECT policy for members, so there is no cheap
  client-side "has created a link" signal.
- **Join item 4 counts membership only**, not pending applications.
- **Pod invite arrival** sets intent to `join` silently from the home page
  (read synchronously before the redeemer clears the key).
- **"Ask me later"** is per browser session (sessionStorage), as scoped.
  While deferred and with no name set, the old "Complete your profile" box
  still shows.
- **Change path** lives on the progress card as well as in the profile
  edit form ("Your path" select, stored as null when "Not chosen").
- **Single-step tour**: `startTourAt(stepId)` in `TourContext` runs one
  step and never touches `tour_completed_at`. The tooltip shows "1 / 1".
- Tour copy refreshed: Identity, Artifacts, Pods, Members, final step.

Not verified in a browser yet: the cards were type-checked and the
migration verified in prod, but no member session was driven through the
flow. First prod smoke test should follow the acceptance list above.

## Decisions needed from Ron

1. **Intent card placement.** Scoped as after TOS on `/home`. Alternative is
   the "Welcome, Friend" screen in the invite modal, which is currently a
   dead spinner. That would need the intent passed through
   `/api/onboarding/complete`. Default stays `/home` unless you prefer the
   ritual moment.
2. **Explore track length.** Four visits plus a re-ask. Trim to three if it
   feels like homework.
3. **Found item 5.** "Share your invite link" needs a cheap "has created a
   link" signal. If none exists, it degrades to a visit check. Fine either way?

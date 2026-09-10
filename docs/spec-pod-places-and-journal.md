# Spec: Pod Places (shared map) + Journal mode for the Forum

*Last updated: 2026-09-10. Status: Phases 1–2 BUILT (see "As built" at the end); Phase 3 open.*

## The request

> Shared map with pinned locations with details: assets, local relationships,
> a shared journal for envisioning, etc. How would the app serve this? (Feels
> like the forum is a shared journal.) Combined with our skinning feature they
> can name it "Journaling".

Two capabilities are being asked for, and they have very different costs:

1. **A shared journal for envisioning.** The forum already is one, with two
   cosmetic gaps. Mostly configuration; one small feature.
2. **A shared map with typed pins** (assets, local relationships, sites) whose
   details link to the journal, events, and people. Nothing in the app stores a
   coordinate today. This is a new pod module.

## What the app does today

| Need | Exists? | Where |
|---|---|---|
| Pod-scoped, token-gated discussion space | yes | forum categories with `pod_id` + `required_token` |
| Entries with text, media, polls, reactions, @mentions | yes | `forum_threads` / `forum_posts` / `forum_media_attachments` / polls |
| Tags, bookmarks, read tracking | in repo, live state unverified | `scripts/db-migrations/013_forum_upgrades.sql` |
| Rename "Forum" to "Journal" on the home screen | yes | Pod Faces `label_map` (leaders: Manage → Modules → Custom Appearance) |
| Rename the page heading inside the forum | no | Faces deliberately leave headings standard (`whats-new.md`) |
| Chronological "journal" view (entries by date, cover image) | no | forum lists by activity, not as a diary |
| Rich editor by default | no | `ReplyForm.tsx` `USE_RICH_EDITOR=false`; plain textarea |
| A pin, a coordinate, a map | no | `events.location` is free text; no lat/lng anywhere; no map library |
| Photos of a place | partial | forum media + KB uploads exist, not attachable to a location |
| "Vision" vs "existing" status on a thing | no | |
| Per-pod agent that can summarize the journal | yes | Community Agent, forum corpus ingestion (consent-gated) |

**Bottom line:** the journal is 80% there and can be turned on this week by a
pod leader with no code. The map is new work.

## Phase 0 — turn on the journal now (no code, one guide)

For a pod leader:

1. Manage → Modules → Custom Appearance → rename the **Forum** button to
   **Journal** (label ≤ 20 chars). Members who wear the face see it.
2. Create a forum category **"Envisioning Journal"** for the pod (token-gated
   to the member hat).
3. Pin a "Where we are going" thread as the living vision; use polls in it
   for decisions-in-progress; use `@everyone` in chat to announce new entries.
4. Optionally enable the Community Agent with `corpus_includes_forum` so the
   agent can answer "what have we said about the orchard?"

Deliverable: a one-page member guide `src/guides/user/19-journaling.md`
(mirrored to KB and the site). Half a day, mostly writing.

## Phase 1 — Journal mode for a category (small feature)

Make a category *feel* like a journal without forking the forum:

- `forum_categories.display_mode` enum `discussion | journal` (migration).
- Journal mode renders threads as **entries**: newest first, grouped by
  month, first attached image as cover, excerpt, author, tag chips.
- Rich editor on by default in journal categories (flip `USE_RICH_EDITOR`
  per category rather than globally).
- Page heading uses the face label for the `forum` slot when the viewer
  wears a face (a small, explicit exception to the "headings stay standard"
  rule, limited to this one heading).
- Verify the 013 upgrades (tags, bookmarks) are applied live; if not, apply.

Effort: 2–3 days. Touches `src/features/forum` (list view, composer flag),
one migration, `FaceContext` label read on `/forum`.

## Phase 2 — Pod Places: the shared map (new module)

### Data

```
pod_places
  id uuid pk
  pod_id uuid → pods            (RLS scope)
  title text, description text
  kind text  check in ('asset','partner','site','resource','vision','other')
  status text check in ('existing','proposed','retired') default 'existing'
  lat double precision, lng double precision   -- nullable: a place may be unmapped
  address text                                  -- display only
  precision text check in ('exact','approximate') default 'exact'
  visibility text check in ('pod','public') default 'pod'
  cover_image_url text
  metadata jsonb default '{}'                   -- kind-specific fields
  created_by text (wallet), created_at, updated_at

pod_place_links
  place_id uuid → pod_places
  target_type text check in ('thread','event','knowledge_item','member','pod','place')
  target_id text
  label text                                    -- e.g. "supplier", "steward", "same site"
  primary key (place_id, target_type, target_id)
```

"Local relationships" are `pod_place_links` with `target_type='place'` or
`'member'` and a `label`; the map can draw them as lines when both ends are
mapped.

### Permissions (follows the review's constraints)

- New `HatPermissions` key `placesManage` (catalogue becomes 23 keys) and a
  module flag `places_enabled` in `pod_modules` (ADD-ONS, leader-toggled,
  synced in `api/pods/[id]/modules/route.ts` like surveys).
- RLS: SELECT for pod members via `active_pod_members ⋈ pod_role_permissions`
  (plus `visibility='public'` for anon); INSERT/UPDATE/DELETE via
  `is_pod_leader_current_user(pod_id)` OR the `placesManage` flag.
- Writes go through `POST/PUT/DELETE /api/pods/[id]/places` guarded by
  `requirePodPermissionOrLeader(req, podId, 'placesManage')`. No new
  service-role-trusts-body routes.
- Pulse: `place_added` / `place_updated` event types in `explorerEvents.ts`
  and a category mapping in `api/explorer/route.ts`.

### Privacy (must decide before build)

Pins can be homes, land, and people. Defaults: `visibility='pod'`, and a
`precision='approximate'` option that renders a ~500 m circle instead of a
point. Member-type links show the member's display name only. Public pins are
opt-in per pin by a `placesManage` holder. Exported GeoJSON honours the same
rules.

### Map UI

- **MapLibre GL JS** (open source, npm-installed, no API key) with
  **Protomaps** or OpenFreeMap vector tiles. Both need a CSP change:
  `img-src`/`connect-src` for the tile host, `worker-src blob:` for MapLibre.
- Mobile-first: tap-and-hold to drop a pin; address search via Nominatim
  (rate-limited, fine at pod scale) or paste coordinates.
- Pin sheet: title, kind, status, description, cover photo (reuse KB
  storage buckets), linked entries/events/people, "Open in Journal".
- Filters: kind, status (existing / proposed), tag.
- Home screen: new `places` slot in `FACE_ICON_SLOTS` and
  `HOME_COMMUNITY_MODULES` (`/pods/[id]/places` or `/places` scoped to the
  active pod), so Faces can rename it ("Territory", "Commons", ...).

Effort: 5–7 days. New feature folder `src/features/places`, 2 migrations,
3 routes, module toggle, CSP, one user guide, docs/README entry.

## Phase 3 — Journal ↔ Map ↔ Governance (integration)

- An entry can attach a place; a place shows its entries as a timeline.
- `status='proposed'` pins are the "envisioning" layer: one tap creates a
  POD_OPERATIONAL proposal from a proposed place; approval flips it to
  `existing`. Uses the existing governance tiers, no new voting code.
- Events can reference a place (replace free-text `events.location` with an
  optional `place_id`; keep the text for off-map events).
- Agent: places become corpus items ("what do we know about the north
  field?") under the same consent rules as forum ingestion.

Effort: 2–3 days after Phase 2.

## Adjacent work this unlocks

`docs/spec-treegens-planting-verification.md` (Phase 2: photo → verify →
mint) needs exactly a place record with photos and a status. Pod Places is
the substrate for it; building it generically avoids a TreeGens-only map.

## Open questions for the requesting community

1. Is the map for members only, or a public face of the pod?
2. Which pin kinds matter first: land/assets, partner organisations, or
   gathering sites?
3. Do they want the envisioning layer tied to votes (Phase 3) or kept as a
   conversation (Phase 0/1)?
4. Is "relationship" a link between two places/people (a line on the map) or
   just a category of pin?

## Recommendation

Ship Phase 0 this week (it is a guide and a category), build Phase 1 while
the community uses it and tells us what a journal view should look like,
and treat Phase 2 as the next real feature, scoped with their answers above.

---

## As built (2026-09-10)

Decisions taken with the community's answers: **members only** (no public
pins), map lives on the **pod page** (not the home grid), **add-on** module
(not paid), managing is the **`placesManage`** role permission, members may
**opt in** to appear on the map from Identity.

| Piece | Where |
|---|---|
| Migrations (apply by hand) | `supabase/migrations/20260910000001_add_places_module.sql`, `..._member_locations.sql`, `..._forum_journal_mode.sql` |
| Module toggle + permission sync | `api/pods/[id]/modules/route.ts` (`places_enabled` → `placesManage` on leader roles), `PodModulesManager.tsx` (Add-Ons) |
| Permission key | `HatPermissions.placesManage` in `hatPermissionsService.ts`; editor group in `UnifiedMembershipManager.tsx`; defaults in `PodRolePermissionsService.ts`, `HatMetadataService.ts`; aggregation in `useHatPermissions.ts` |
| Guards | `src/lib/placesGuard.ts` (`requirePlacesManager` = leader ∨ placesManage ∨ Exec; `canManagePlaces`; `getPlacesModule`), `apiPodGuard.requirePodMember`, `serverPodAuth.isPodMember` |
| Routes | `GET/POST/PATCH /api/pods/[id]/places`, `PUT/DELETE /api/pods/[id]/places/[placeId]`, `POST .../[placeId]/image` (private bucket `place-images`, signed URLs 1 h) |
| Server helpers | `src/features/places/server/placesServer.ts` (validation, link title resolution, signed covers) |
| UI | `src/features/places/components/{PodPlacesSection,PlacesMap,PlaceDetailSheet,PlaceEditorModal}.tsx`, mounted in `src/app/pods/[id]/page.tsx` between the surveys banner and the meeting section |
| Map | MapLibre GL 5.6 (pinned), OpenFreeMap "liberty" style; CSP: `connect-src https://tiles.openfreemap.org`, `worker-src 'self' blob:`, `child-src 'self' blob:` |
| Member opt-in | `member_locations` (RLS: own row + members sharing an active pod), `GET/PUT/DELETE /api/account/location`, `GET /api/geocode` (Nominatim proxy, session required), `LocationSection.tsx` on Identity. Approximate = coordinates coarsened to 2 decimals server-side. |
| Pulse | `place_added` / `place_updated` / `place_removed` in category `places` |
| Journal mode | `forum_categories.display_mode`; `PodForumManager.tsx` presentation choice; `JournalEntryList.tsx` on the category page; `ReplyForm.tsx` rich editor when journal; forum heading follows the Pod Face label for the `forum` slot |
| Docs | `src/guides/user/19-journal-and-places.md`, `whats-new.md` |

Not built (Phase 3): events ↔ places, proposed pin → pod proposal, agent
ingestion of places, GeoJSON export.

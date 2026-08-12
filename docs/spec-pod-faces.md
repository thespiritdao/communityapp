# Spec: Pod Faces (Community Skinning)

**Status:** All phases (1–5) implemented 2026-08-11. First migration applied to prod; **second migration (`20260811000002_add_pod_face_notification_type.sql`) pending application** — until it runs, the first-publish member notification insert will fail (caught + logged; publish itself is unaffected). Remaining: end-to-end manual QA on a device.
**Date:** 2026-08-10 (updated 2026-08-11)
**Depends on:** existing pod module system, `pod_role_permissions`, Hats-backed role model

---

## 1. Summary

Pod Faces lets a pod's leadership design a custom "face" for the app — a color
scheme plus a remapping of the main-screen module icons and bottom-nav icons —
which members of that pod can opt to wear as their app experience. Core pod
interface icons remain stock; this is surface-level customization only.

Permissioning follows the universal app pattern: **role-based + leaders**,
database-first checks in the UI, RLS as the enforcement backstop.

---

## 2. Architecture context (why this design)

Findings from the 2026-08-10 audit that shape this spec:

### 2.1 The permission model (three layers)

1. **Onchain (source of authority):** Hats Protocol on Base
   (`0x3bc1a0ad72417f2d411118085256fc53cbddd137`). Every pod has a
   `management_hat_id` and `membership_hat_id`; roles are hat tokens checked via
   `balanceOf(address, hatId)`. Treasuries are Safe-based (`PodTreasuryV3`
   proxies + `AutoExecuteModule`).

2. **Database (source of truth for speed):**
   - `active_pod_members` — wallet + `hat_id` + `membership_type: 'leader'|'member'`
   - `pods.pod_leads[]` — leader wallet array
   - `pod_role_permissions` — keyed `(pod_id, token_address=hat_id)` with a
     `permissions` JSONB of feature flags (`treasuryManagement`,
     `bountyManagement`, `knowledgeBaseManage`, `marketplaceManage`, …)

3. **Enforcement, three places by risk level:**
   - UI gating: `src/hooks/useDatabaseFirstPermissions.ts`,
     `src/hooks/useHatPermissions.ts` (DB-only, ~50–100ms).
     `canManagePodSync()` shows the Manage tab for leaders OR any `*Manage` flag;
     executive leaders bypass everything.
   - Fund ops: `src/hooks/useHybridPodPermission.ts` — onchain hat balance
     + DB flag + signed agreements, all three required.
   - Server: `src/lib/serverPodAuth.ts` (`isPodLeader()`),
     `src/lib/apiPodGuard.ts`, and Supabase RLS via
     `is_pod_leader_current_user()` (see migration
     `20260808000001_fix_pod_role_permissions_rls.sql`).

Pod Faces is **not** a fund operation → it uses the DB-first pattern for UI and
RLS + API guards for writes. No onchain component needed.

### 2.2 Theming surface (current state)

- Colors are CSS custom properties in `src/app/globals.css` (HSL triplets:
  `--primary`, `--background`, `--foreground`, …) consumed by Tailwind as
  `hsl(var(--primary))`, plus `--ock-*` overrides for OnchainKit components.
  **This is the foundation that makes runtime skinning cheap — inject new
  variable values, no rebuild.**
- Brand palette: sage `#2F5D50`, cream `#F5F4ED`, bronze `#C6933F`,
  earth-red `#8B3A3A`. Class-based dark mode exists but has no toggle UI.
- **Main screen** (`src/app/home/page.tsx`): hardcoded grid of `<Link>` cards,
  each a PNG from `/public/images/icons/` — 3 user modules (Identity,
  Artifacts, Sensemaker) + 9 community modules (Chat, Forum, Pods, Events,
  Members, Governance, Bounties, Knowledge, Pulse).
- **Bottom nav** (`src/components/MobileBottomNav.tsx`): 4 hardcoded
  lucide-react icons (Home, HeartHandshake, Vote, Bell) with inline hex colors.
- Existing per-pod branding: only `pod_image_url` (2MB logo upload via
  `PodImageUpload.tsx`).

### 2.3 Two constraints discovered in audit

1. **Hardcoded hexes are scattered** across the surfaces the face must touch:
   inline styles in `home/page.tsx` and `MobileBottomNav.tsx`, Tailwind
   arbitrary values (`text-[#2F5D50]`), and `features/home/styles/HomePage.css`.
   Skinning will not visibly work until these are swept onto tokens.
   **This sweep is the single biggest effort item in the project.**

2. **`pods.pod_metadata` is unreliable as a theme home.** Some code paths write
   it as an object (`podGovernanceService.ts`), others as `JSON.stringify(...)`
   strings (`hatSyncService.ts:223-247`, `usePodCreation.ts`). Themes get a
   dedicated table instead.

---

## 3. Key design decision: whose face renders?

The main screen is app-global, but users belong to many pods.

**Decision (recommended): leaders publish a face; members choose which to wear.**

- A member picks an "active face" from the published faces of pods they belong
  to, or the SpiritDAO default. Stored on `user_profiles.active_face_pod_id`.
- Matches the product framing ("members create their own experience").
- Avoids conflicts over whose theme wins for multi-pod members.
- Losing pod membership simply reverts the member to default (validated
  server-side on set; `FaceProvider` falls back at render time if membership
  lapses).
- Auto-applying a sole/primary pod's face can be layered on later as a default
  behavior without schema change.

---

## 4. Phase 1 — Schema + permissions

### 4.1 New table `pod_faces`

```sql
create table public.pod_faces (
  id          uuid primary key default gen_random_uuid(),
  pod_id      uuid not null references public.pods(id) on delete cascade,
  colors      jsonb not null default '{}'::jsonb,
  icon_map    jsonb not null default '{}'::jsonb,
  status      text not null default 'draft' check (status in ('draft','published')),
  updated_by  text not null,          -- wallet, lowercase
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (pod_id)
);
```

**`colors`** — constrained to the existing token set so values drop directly
into the CSS variable system:

```json
{
  "primary": "#2F5D50",
  "primaryForeground": "#F5F4ED",
  "background": "#F5F4ED",
  "foreground": "#1F453A",
  "secondary": "#F5F5F0",
  "accent": "#E8F1EE",
  "destructive": "#8B3A3A"
}
```

Stored as hex; converted to HSL triplets at injection time. `--ock-*` values
derived from the same tokens so OnchainKit surfaces follow.

**`icon_map`** — slot → source:

```json
{
  "chat":   { "type": "pack", "value": "minimal/chat" },
  "forum":  { "type": "pack", "value": "minimal/forum" },
  "nav.home": { "type": "pack", "value": "minimal/home" }
}
```

Slots: the 12 home modules + 4 bottom-nav items + optional `logo`.
Missing slot → default asset. Phase 2 ships curated packs only; `type: "upload"`
is reserved for a later phase (see §8).

### 4.2 Permission integration (exactly the existing pattern)

| Change | Where |
|---|---|
| New JSONB key **`appearanceManage`** | `pod_role_permissions.permissions` — naming consistent with `knowledgeBaseManage`, `marketplaceManage` |
| Add to `MANAGE_KEYS` | `src/hooks/useDatabaseFirstPermissions.ts` (~line 150) so grantees see the Manage tab |
| Add to permission matrix UI | `PodManagerControlPanel.tsx` flag list |
| New module toggle **`custom_appearance_enabled`** | `pod_modules` table + `PodModulesManager.tsx` module list (Palette icon) — faces are opt-in per pod like every other module |
| `user_profiles.active_face_pod_id` | nullable uuid; RLS self-update only; server validates active membership on set |

### 4.3 RLS (mirror `20260808000001_fix_pod_role_permissions_rls.sql`)

- **SELECT:** public for `status = 'published'`; drafts visible to pod leaders
  and `appearanceManage` grantees. (Anyone must be able to render a published
  face — including logged-out/first-paint contexts.)
- **INSERT / UPDATE / DELETE:** `is_pod_leader_current_user(pod_id)` OR an
  `appearanceManage` join through `active_pod_members` → `pod_role_permissions`
  (same shape as the leader check in
  `20260116000000_fix_pod_role_permissions_rls_v2.sql`).

### 4.4 API routes

- `GET  /api/pods/[id]/face` — public, returns published face (draft included
  for authorized callers).
- `PUT  /api/pods/[id]/face` — upsert draft / publish. Guarded via
  `apiPodGuard` extended with the `appearanceManage` check. Server-side
  validation: hex format, token whitelist, known slots/pack IDs, WCAG
  contrast (see §6).
- `DELETE /api/pods/[id]/face` — revert pod to default (same guard).
- `GET/PUT /api/account/active-face` — member reads/sets `active_face_pod_id`
  (under the existing `api/account/` user-scoped namespace); PUT validates the
  target pod has a published face and the caller is an active member.

---

## 5. Phase 2 — Theme engine

### 5.1 `FaceProvider`

New provider in `src/app/providers.tsx` chain:

- Loads the user's active face (React Query; localStorage snapshot to avoid
  flash-of-default on cold start).
- Converts hex → HSL triplets, sets variables on `document.documentElement`
  (`--primary`, `--background`, …, plus derived `--ock-*`).
- No Tailwind config change needed — this is the payoff of the existing
  `hsl(var(--token))` setup.
- Fallback chain: active face → SpiritDAO default. Reverts silently if the
  face is unpublished or membership lapses.

### 5.2 Icon registry refactor

- Extract the hardcoded home grid into a `MODULE_REGISTRY` config: slot key,
  route, label, default PNG path, `data-tour` id. `home/page.tsx` renders from
  the registry.
- Same for `NAV_ITEMS` in `MobileBottomNav.tsx`.
- `<SlotIcon slot="chat" />` resolves: active face `icon_map` → default.
- Ship **2–3 curated icon packs** (complete 16-slot sets, consistent style).
  Packs guarantee visual coherence and avoid the moderation/quality problems of
  arbitrary uploads.

### 5.3 The hex sweep (critical path)

Replace hardcoded colors with token classes on the surfaces the face touches:

- `src/components/MobileBottomNav.tsx` — inline `#2F5D50` / `#5F5A54` /
  `#f5f4ed` / badge red → `text-primary`, `bg-background`, etc.
- `src/app/home/page.tsx` — inline style objects (profile reminder card,
  header, buttons).
- `src/features/home/styles/HomePage.css`.
- Arbitrary values (`text-[#2F5D50]`) in shared chrome components.

**Scope the sweep to face-affected surfaces only** (home, bottom nav, shared
chrome) — not the whole app. Other screens inherit tokens gradually. Visual QA
per surface, both light-mode default and a test face.

---

## 6. Phase 3 — Leader-facing Face editor

- New panel in `/pods/[id]/manage`, visible when `custom_appearance_enabled`
  and gated by `isPodLeader || appearanceManage`.
- Per-token color pickers with **live preview** (miniature home screen + bottom
  nav rendered from draft variables).
- Icon pack selector — whole-set apply, optional per-slot override.
- **WCAG AA contrast validation blocks publish** (foreground/background,
  primary/primaryForeground pairs). Be strict — members live in these themes.
- 4–6 preset palettes derived from the sage/earth system for the first-run
  experience.
- Draft → publish flow (`status` column).

---

## 7. Phase 4 — Member experience

### 7.1 Where the UX lives (two personas, two homes)

**Creating/editing a face — pod-scoped, in Manage.**
Leaders and `appearanceManage` grantees edit the face from
`/pods/[id]/manage` → new "Appearance" panel, sitting alongside Modules,
Roles, Members, Treasury. This is where all pod-admin capability already
lives and is already gated by `canManagePodSync()`. Regular members never
see this panel.

**Wearing a face — personal + app-global, canonical control in Identity.**
Selecting a face changes *your* home screen and nav everywhere, not the
pod's page — so the durable control belongs with the user, not inside any
one pod. `/identity` gets an "Appearance" section listing SpiritDAO default
plus the published faces of every pod the user belongs to, side by side,
with one-tap switch and revert-to-default.

**Discovery — contextual entry points, since nobody browses settings:**

1. **Pod detail page** (`/pods/[id]`, `PodDetailsContainer` header area):
   if the pod has a published face and the viewer is a member, show a small
   "Wear this look" chip. One tap writes the same
   `user_profiles.active_face_pod_id` — a shortcut to, not a replacement
   for, the Identity control.
2. **Notification** (existing notification system): one-time, when a pod
   publishes its first face, deep-linking to apply it.

Flow: leaders design in Manage → members discover on the pod page or via
notification → the full switcher lives in Identity → Appearance.

### 7.2 Build items

- Identity → Appearance section: face cards (pod image + palette swatch
  preview), active indicator, apply/revert.
- "Wear this look" chip on pod detail page (member-only, published-only).
- First-publish notification hook.

---

## 8. Phase 5 — Hardening & later expansion

**Shipped (2026-08-11):**
- ✅ **CDN caching:** anonymous `GET /api/pods/[id]/face` responses (published
  face or no-face) carry `Cache-Control: public, s-maxage=60,
  stale-while-revalidate=300`. Authorized requests (which may include drafts)
  are never cached. 60s propagation replaces explicit purge-on-publish.
- ✅ **Member push notification on first publish:**
  `notifyMembersOfFace()` in the face route fans out a `pod_face_published`
  notification (type added by migration `20260811000002`) to all active
  members + leads except the publisher, via `sendServerNotificationBatch` —
  full preference checks, quiet hours, and web-push delivery for free.
  Priority `low`, deep-links to `/identity`. Fire-and-forget: fan-out never
  blocks the publish response.
- ✅ **Unit tests:** `src/features/pods/faces/faceConfig.test.ts` (vitest,
  16 tests) covering color/icon-map validation, WCAG contrast math,
  hex→HSL conversion, and a pack-completeness check that fails the build if
  a future icon pack misses a slot.

**Deliberately deferred:**
- **Dark mode:** faces are light-mode-only (dark mode has no toggle UI
  today). A face can carry an optional dark variant later.
- Accepted limits: PWA `manifest.json` theme color and the Capacitor iOS shell
  splash stay SpiritDAO-branded (static assets); acceptable for a surface-level
  skin.
- ~~Custom icon uploads~~ **SHIPPED 2026-08-11** (turned out to be the core
  intent, not an expansion): per-slot upload via
  `POST /api/pods/[id]/face/icon` (multipart; PNG/JPEG/WebP ≤1MB) into the
  public `pod-faces` storage bucket (lazily created), stored as
  `{type:'upload', value:url}` in icon_map. Uploads override packs per slot
  and are the only source that can remap the `logo` slot. Server verifies
  upload URLs belong to the pod's own bucket folder; replaced icons delete
  their predecessors (timestamped names bust CDN caches). Editor gained a
  "Your own icons" per-slot grid; `SlotIcon`/preview render uploads with
  broken-image fallback to pack/default; nav uploads show active state via
  opacity (images can't inherit link color). Guard extracted to
  `src/lib/faceGuard.ts` for reuse.
- **Broader hex sweep:** extend tokenization beyond home + bottom nav
  (identity page headers, pod pages, etc.) if faces feel too subtle in
  practice — surface-by-surface, driven by real feedback.

---

## 9. Effort & risk

| Phase | Size | Risk |
|---|---|---|
| 1. Schema + permissions + RLS | S–M | Low — pure pattern-following |
| 2. Theme engine + hex sweep | M–L | Sweep is the risk; surface-by-surface with visual QA |
| 3. Leader editor | M | Low |
| 4. Member selector | S | Low |
| 5. Hardening | S | Low |

- Critical path: Phase 2's tokenization sweep. Everything else applies
  established patterns.
- Phases 1–2 ship invisibly (no user-facing change until a face is published),
  so work can land incrementally on main without a long-lived feature branch.

---

## 10. File touch list (quick reference)

**New (✅ = shipped in Phase 1)**
- ✅ `supabase/migrations/20260811000001_add_pod_faces.sql`
- ✅ `src/features/pods/faces/faceConfig.ts` — shared tokens/slots/validation (incl. WCAG contrast)
- ✅ `src/app/api/pods/[id]/face/route.ts`
- ✅ `src/app/api/account/active-face/route.ts`
- ✅ `src/context/FaceContext.tsx` — FaceProvider (fetch, localStorage snapshot, CSS var injection)
- ✅ `src/features/pods/faces/faceTheme.ts` — hex→HSL, token→CSS-var mapping incl. `--ock-*` derivations
- ✅ `src/config/moduleRegistry.ts` — home grid + bottom nav definitions (slot, route, label, default icon)
- ✅ `src/config/iconPacks.ts` — two lucide packs ("Linework", "Cosmos"), full 16-slot coverage
- ✅ `src/components/SlotIcon.tsx` — `HomeModuleIcon` + `NavSlotIcon` resolvers
- ✅ `src/features/pods/components/PodFaceEditor.tsx` — presets, per-token pickers, live preview, pack selector, draft/publish/remove; wired into `PodModulesManager` as the module's `configComponent: 'appearance'` panel

**Phase 3 implementation notes**
- The editor lives as the Custom Appearance module's inline config panel in
  Manage → Modules (same pattern as chat/forum/governance config), auto-
  expanding when the module is first enabled — no new tab needed.
- Publish is blocked client-side until WCAG AA passes (mirroring the server
  check); the contrast readout is always visible so leaders see ratios live.
- Saving a draft over a published face warns that it unpublishes (single-row
  design: the draft IS the published row's next state).
- 5 starter presets (Forest = default, Ocean, Dusk, Ember, Slate), all
  pre-verified to pass the AA pairs.
- If the editing leader is currently wearing this pod's face, publish/remove
  re-applies their theme immediately via `refreshFace()`.

**Modified (✅ = shipped in Phase 1)**
- ✅ `src/services/hatPermissionsService.ts` — `appearanceManage?` on `HatPermissions`
- ✅ `src/hooks/useDatabaseFirstPermissions.ts` — `appearanceManage` in `MANAGE_KEYS`
- ✅ `src/features/pods/components/PodModulesManager.tsx` — Custom Appearance add-on toggle
- ✅ `src/features/pods/components/UnifiedMembershipManager.tsx` — Appearance Manage permission group
- ✅ `src/features/pods/services/PodRolePermissionsService.ts` — default role templates
- ✅ `src/app/api/pods/[id]/modules/route.ts` — `custom_appearance_enabled` in ALLOWED_KEYS + leader-role permission sync on toggle
- ✅ `src/app/home/page.tsx` — registry-driven grids; inline styles tokenized
- ✅ `src/components/MobileBottomNav.tsx` — registry items via `NavSlotIcon`; colors tokenized (active=primary, inactive=muted-foreground, badge=destructive, bg=background)
- ✅ `src/features/home/styles/HomePage.css` — all hexes → `hsl(var(--token))`; section-2 derives from secondary via `color-mix` to keep the two bands distinct under any face
- ✅ `src/app/providers.tsx` — `FaceProvider` mounted inside `CommunityProvider` (needs `AuthProvider` for `useUserWallet`)
- ✅ `src/features/identity/components/AppearanceSection.tsx` + mount in `src/app/identity/page.tsx` — canonical face switcher (default + published faces of the user's pods, swatch previews, apply/revert)
- ✅ `src/app/api/account/faces/route.ts` — lists the caller's available published faces in one round trip
- ✅ `src/features/pods/faces/WearFaceChip.tsx` + mount in `PodDetailsContainer.tsx` — "Wear this look" / "Wearing this look" toggle chip next to the pod status badge; renders only for members of pods with a published face
- ✅ `src/lib/explorerEvents.ts` + face route — `pod_face_published` Pulse event on a pod's FIRST publish (dedupe-keyed per pod, fires once ever)

**Phase 4 implementation notes**
- Discovery notification shipped as a Pulse (explorer) event rather than a
  push notification — a push type would need a new `notification_type` CHECK
  constraint migration; deferred to Phase 5 if wanted.
- The chip fetches the face WITHOUT auth, so drafts can never surface there
  (the API only returns drafts to authorized managers with a token).
- AppearanceSection renders nothing when the user has no available faces and
  no active face — no empty section for the common case.

**Phase 2 implementation notes**
- Icon pack values are `"<packId>/<slot>"` (e.g. `linework/chat`) so stored
  faces are self-describing; `resolvePackIcon()` returns null for unknown
  packs → SlotIcon falls back to the default icon rather than crashing.
- Face vars are set as inline styles on `<html>`, which beat the stylesheet
  in both light and dark class scopes — faces are effectively light-mode-only
  as specced (§8). `clearFaceColors()` removes every var a face may have set,
  so switching faces or reverting never leaves stale overrides.
- Derived shades (hover/active, `--ock-bg-primary-hover`, CSS `color-mix`)
  are computed rather than stored — faces stay a 7-token object.
- Default rendering is byte-identical markup for icons and visually identical
  colors (token defaults match the removed hexes), so this phase ships dark.
- Manual QA still needed on a device: home grid + nav render, then (once
  Phase 3 exists) a published face applying end-to-end.

**Phase 1 implementation notes**
- No `apiPodGuard.ts` change was needed — `requirePodPermissionOrLeader` is
  generic over `keyof HatPermissions`, so adding the type key sufficed. The
  face route additionally honors the Executive Pod Leader bypass, matching the
  modules route.
- New reusable RLS helper `has_pod_permission_current_user(pod_id, key)` —
  companion to `is_pod_leader_current_user()`, works for ANY granular JSONB
  permission key; future modules can reuse it.
- Module toggle sync grants `appearanceManage` to leader roles on enable and
  strips it from everyone on disable (mirrors `agentManage`).
- Server-side WCAG AA contrast validation runs at publish time only; drafts
  are unvalidated works-in-progress.

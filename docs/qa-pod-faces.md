# QA Guide: Pod Faces (Custom Appearance)

**Feature spec:** `docs/spec-pod-faces.md`
**API layer already verified 2026-08-11** (all routes, permissions, contrast
gate, caching, Pulse dedupe — see spec §status). This guide covers the
**visual/UX half** that needs a real authenticated session.

**Current test state:** the **"Top hat"** pod already has the module enabled
and a published face (Dusk purple palette, Linework icons on `chat` +
`nav.home` only). Your `active_face_pod_id` is null. So you can start at
Part 2 immediately, or reset Top hat and do Part 1 from scratch.

---

## Part 1 — Leader flow: design & publish

**Where:** Pods → (your pod) → **Manage** → **Modules** tab → *Add-On
Modules* section.

1. **Enable the module.** Find **Custom Appearance** (purple Palette icon)
   under Add-Ons. Toggle it on.
   - ✔ Expect: the Face editor auto-expands beneath the toggle.
   - ✔ Expect (if the pod has roles): leader roles silently gain the
     `appearanceManage` permission — check Members/Roles → your leader role →
     Custom Appearance group shows **Appearance Manage** on.
2. **Design.** In the editor:
   - Tap a preset (**Dusk** or **Ember** give the most obvious change).
   - ✔ Expect: the **live preview** (mini home screen + nav bar) updates
     instantly; contrast readout below the pickers shows ratios with a ✓.
   - Drag the **Text** color to something pale (near-white).
   - ✔ Expect: a red contrast error appears naming the failing pair, and the
     **Publish** button disables (hover/long-press shows why).
   - Fix the color; pick an **Icon set** (Linework or Cosmos).
   - ✔ Expect: preview tiles swap from PNG circles to tinted line icons.
3. **Save draft**, leave the page, come back.
   - ✔ Expect: editor reloads your draft (colors, pack, "Draft" badge).
4. **Publish.**
   - ✔ Expect: toast "Face published"; badge flips to **Published**.
   - ✔ Expect (Pulse): one card in **Pulse/Explorer** — "*{Pod} published a
     custom look*". Re-publishing later must NOT add a second card.
   - ✔ Expect (notifications): other members get "*{Pod} has a new look*"
     (push + Alerts tab; you as publisher get nothing). NOTE: only fires on
     the FIRST publish ever per pod — Top hat already consumed its one shot,
     so test this on a different pod with ≥2 members.

## Part 2 — Member flow: wear it

**Where A (canonical):** **Identity** → scroll to **Appearance** section
(below Linked Wallets).

5. ✔ Expect: "SpiritDAO default" row + a row per pod you belong to that has
   a published face ("Top hat" with a purple/lavender swatch). Checkmark on
   whatever's active. (Section is hidden entirely if you have no faces
   available — that's by design.)
6. **Tap the pod's face.**
   - ✔ Expect, immediately, no reload: home screen background/sections
     re-tint, primary buttons and active nav icon turn the face's primary
     color, bottom-nav background follows. With a pack applied to slots, the
     mapped icons change (Top hat's face only remaps **Chat** on the home
     grid and the **Home** nav icon — the rest stay default PNGs; that
     partial remap is valid, not a bug).
7. **Reload the app / kill and reopen.**
   - ✔ Expect: face still applied with NO flash of default green on cold
     start (localStorage snapshot).
8. **Where B (shortcut):** open the pod's detail page (`/pods/{id}`).
   - ✔ Expect: a chip next to the status badge — filled "**Wearing this
     look ✓**" when active, outlined "**Wear this look**" when not. Tap
     toggles it; Identity → Appearance stays in sync.
9. **Revert:** tap "SpiritDAO default" in Identity.
   - ✔ Expect: instant return to sage green everywhere, no stale colors on
     any surface (check nav badge, buttons, section bands).

## Part 3 — Negative / edge checks

10. **Non-leader member** (second account): pod Manage should be invisible
    unless their role has `appearanceManage`; granting that role permission
    (Members → role → Custom Appearance → Appearance Manage) should let them
    open Manage and edit the face. This is the delegation path that migration
    `20260811000003` just fixed — worth exercising.
11. **Unpublish/remove:** as leader, **Remove face** in the editor while a
    member is wearing it → member's app reverts to default on next load, no
    errors.
12. **Module off:** toggle Custom Appearance off → editor hides; the API
    rejects saves; already-published face stays in DB but editor is gone.
    (Wearing members keep the face until it's removed — deliberate.)
13. **Scope check:** the reskin covers **home screen + bottom nav + shared
    chrome**. Inner pages (forum, chat, pod pages) keep default styling
    except where they already used theme tokens — that's the specced Phase-2
    scope, not a regression. Note anywhere it feels jarring; that feeds the
    "broader hex sweep" backlog (spec §8).

## Where everything lives (for debugging)

| Thing | Location |
|---|---|
| Leader editor | `src/features/pods/components/PodFaceEditor.tsx` (rendered by `PodModulesManager`) |
| Member switcher | `src/features/identity/components/AppearanceSection.tsx` (Identity page) |
| Pod-page chip | `src/features/pods/faces/WearFaceChip.tsx` (in `PodDetailsContainer`) |
| Theme engine | `src/context/FaceContext.tsx` → `src/features/pods/faces/faceTheme.ts` (CSS vars on `<html>`) |
| Icon slots/packs | `src/config/moduleRegistry.ts`, `src/config/iconPacks.ts`, `src/components/SlotIcon.tsx` |
| API | `/api/pods/[id]/face`, `/api/account/active-face`, `/api/account/faces` |
| Data | `pod_faces` table; `user_profiles.active_face_pod_id`; `pod_modules.custom_appearance_enabled` |
| Kill switch | delete the pod's `pod_faces` row (or Remove face in editor) — everyone reverts |

**Quick diagnostics:** DevTools → `document.documentElement.style` shows the
injected `--primary`/`--ock-*` overrides when a face is active (empty when
default). `localStorage['pod-face-cache-v1']` holds the snapshot — clear it
if you suspect stale colors.

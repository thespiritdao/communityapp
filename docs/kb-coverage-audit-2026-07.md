# In-App Knowledge Base — Coverage Audit

*Last updated: 2026-07-16. Snapshot of `knowledge_categories` / `knowledge_items`
vs. total app function. Re-run `scripts/kb-inventory.mjs` for a fresh dump.*

## State at audit time

13 categories, 33 items. Everything global was **video-only** until this audit
(the first markdown item is the TreeGens wallet-linking guide, added today).
One pod-scoped category existed before (TN pod "Books"); TreeGens "Guides" added today.

Fixed during audit:
- Two orphaned items had `category_id NULL` and were invisible when browsing:
  **Using Invite Codes** → Getting Started, **Members Directory** → Identity.

## Coverage map

| Feature | KB content | Status |
|---|---|---|
| Bounties | 6 videos (full lifecycle) | ✅ Best-covered feature |
| Pods (create/apply/roles/treasury/modules) | 5 videos | ✅ Good; Treasury video may predate V3 |
| Events | 3 videos | ⚠️ No $SELF burn-to-pay ticket coverage (new) |
| Identity/Profile | 3 videos (+1 duplicate) | ⚠️ Duplicate "Profile Setup"; no multi-device or linked-wallets item (TreeGens copy is pod-scoped) |
| Getting Started | 3 videos | ⚠️ No PWA-install/onboarding item; "Claiming Tokens" may predate $SELF redesign |
| Donations | 2 videos | ✅ |
| Forums / Marketplace / Pulse / Sensemaker / KB itself | 1–2 videos each | ✅ Thin but present |
| Governance | 1 video (voting only) | 🔴 No proposal creation, 3-tier model, or snapshot eligibility |
| **Surveys** | none | 🔴 Zero coverage |
| **Password vault** | none | 🔴 Zero coverage |
| **Community Agent (per-pod AI)** | none | 🔴 Zero coverage |
| **Chat / direct messages** | none (only pod-modules video) | 🔴 Zero coverage |
| **$SELF system (decay, Tenure, burn-to-pay)** | none | 🔴 Zero — and biggest staleness risk in existing videos |
| **Agreements (pod accountability signing)** | none | 🔴 Zero coverage |
| **Notifications / newsletter** | none | 🔴 Zero coverage |

## Staleness risk (videos showing old UI/behavior)

Recorded before recent changes — worth a review pass, re-record or caption:
`Claiming Tokens` ($SELF redesign), `Pod Treasury` (V3), `Voting on Proposals`
(snapshot gating), `Profile Setup` (also duplicated — one copy has 0 views and
can likely be deleted).

## Cheapest wins

1. ✅ **DONE 2026-07-16 — Mirrored the 10 user guides** into the KB as global
   markdown items via `scripts/kb-mirror-guides.mjs`. **Re-run that script
   whenever the guides change** (same cadence as `npm run embed:spiritdao`) —
   it updates existing items in place. This closed the Governance-depth,
   wallet-linking (global), and onboarding-text gaps.
2. Write short markdown items for the zero-coverage features (Surveys, Vault,
   Community Agent, Chat, $SELF/Tenure, Agreements) — the guides corpus doesn't
   cover most of these either, so writing them as guides 11+ enriches Sensemaker
   AND the KB (embed + mirror both sweep the directory/manifest).
3. Delete the 0-view duplicate "Profile Setup" video (needs a human check of
   which copy is current first).

## Pipelines (how content flows — for reference)

- **Sensemaker (in-app)**: `src/guides/user/*.md` + QUICK_REFERENCE +
  operations guide → `npm run embed:spiritdao` → Pinecone `spiritdao`
  namespace (clears + re-embeds all, idempotent).
- **KB**: rows in `knowledge_categories`/`knowledge_items` (service-role insert
  or the in-app Pod Knowledge Manager). `content_type='markdown'` renders
  `content_text` via innerHTML → store clean HTML.
- **docs.spiritdao.org**: `website/functions/build-docs.mjs` reads the same
  guides but has a **hardcoded PAGES list** — new guides must be added there,
  then the website redeployed (Cloudflare Pages).

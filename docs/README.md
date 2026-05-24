# SpiritDAO commapp — Engineering Docs

This directory holds the engineering and product reference docs for
the SpiritDAO Community App. New contributors should start here.

## Architecture (read these first)

| Doc | Topic |
|---|---|
| [pods-architecture-overview](pods-architecture-overview.md) | Pods feature — the central organizing unit. Layer cake, services map, creation flow, footguns |
| [authentication-and-session-model](authentication-and-session-model.md) | How CDP wallet identity becomes a Supabase JWT, what RLS sees |
| [role-permissions-design-philosophy](role-permissions-design-philosophy.md) | Three principles behind the permission model (module ↔ permission coupling, Core/Add-Ons/Paid, capability-exposing UI) |
| [paymaster-gas-sponsorship](paymaster-gas-sponsorship.md) | ERC-7677 proxy that sponsors gas for per-pod contracts |
| [rag-stack-overview](rag-stack-overview.md) | Community Agent (per-pod) vs Sensemaker (DAO-wide) |

## Feature-specific architecture

| Doc | Feature |
|---|---|
| [password-vault-architecture](password-vault-architecture.md) | E2EE pod password vault |
| [treasury-v3-audit-and-deployment-2026-05](treasury-v3-audit-and-deployment-2026-05.md) | Treasury V3 contracts + migration path |
| [governance-flexibility-layer-a-2026-05](governance-flexibility-layer-a-2026-05.md) | Per-pod configurable governance parameters |
| [builder-codes-integration-scope](builder-codes-integration-scope.md) | ERC-8021 transaction attribution |

## UX patterns

| Doc | Pattern |
|---|---|
| [collapsible-categories-pattern](collapsible-categories-pattern.md) | Core/Add-Ons/Paid collapsibles used in Modules + Permissions |

## Operations

| Doc | Topic |
|---|---|
| [cron-jobs-catalog](cron-jobs-catalog.md) | Every scheduled job, its purpose, idempotency notes |
| [VIDEO_CONTENT_GUIDE](VIDEO_CONTENT_GUIDE.md) | Knowledge base videos — inventory + hosting |

## Roadmap & specs

| Doc | Status |
|---|---|
| [roadmap-action-items-2026-05](roadmap-action-items-2026-05.md) | May 2026 prioritized roadmap |
| [competitive-analysis-feature-roadmap](competitive-analysis-feature-roadmap.md) | Feature ideas from competitive analysis |
| [spec-inter-pod-agreements](spec-inter-pod-agreements.md) | Future: formal agreements between pods |
| [spec-contributor-compensation](spec-contributor-compensation.md) | Future: role archetypes + $SELF payroll |
| [spec-automated-blog-digest](spec-automated-blog-digest.md) | Future: AI-generated weekly community digest |

## Newsletter drafts

Community-facing announcements written alongside engineering work. Not
authoritative — they document intent, not state.

| Doc | What it announces |
|---|---|
| [newsletter-password-vault](newsletter-password-vault.md) | Password Vault launch |
| [newsletter-permissions-update](newsletter-permissions-update.md) | Per-role permissions surface |
| [newsletter-permissions-collapsible](newsletter-permissions-collapsible.md) | Collapsible permission editor |

## What's NOT in here

- **Memory** lives at `C:\Users\PC\.claude\projects\C--Users-PC-Documents-DAO-App-commapp\memory\` —
  point-in-time observations, may be stale. Use as a hint, not a
  source of truth.
- **Schema migrations** live at `supabase/migrations/` — the
  authoritative DB shape.
- **Per-feature READMEs** sometimes exist inside `src/features/*/`
  for very feature-local notes.
- **Outreach / partnership materials** previously lived here; those
  have moved out of this directory to keep the engineering doc
  surface clean.

## When you add a doc

1. Put it in this folder.
2. Add it to this README under the right section.
3. If it documents a pattern other code should follow, cross-link to
   it from the related code's comments.
4. Date the doc at the top (`*Last updated: YYYY-MM-DD*`).
5. Prefer "where to look when X" sections over exhaustive enumeration —
   they age better.

# SpiritDAO commapp — Engineering Docs

This directory holds the engineering and product reference docs for
the SpiritDAO Community App. New contributors should start here.

## Architecture (read these first)

| Doc | Topic |
|---|---|
| [pods-architecture-overview](pods-architecture-overview.md) | Pods feature — the central organizing unit. Layer cake, services map, creation flow, footguns |
| [authentication-and-session-model](authentication-and-session-model.md) | How CDP wallet identity becomes a Supabase JWT, what RLS sees. **Includes the wallet-hook rule: `useUserWallet` for identity, `useSigningWallet` for signing — never `useEvmAddress` for identity** |
| [role-permissions-design-philosophy](role-permissions-design-philosophy.md) | Three principles behind the permission model (module ↔ permission coupling, Core/Add-Ons/Paid, capability-exposing UI) |
| [paymaster-gas-sponsorship](paymaster-gas-sponsorship.md) | ERC-7677 proxy that sponsors gas for per-pod contracts |
| [rag-stack-overview](rag-stack-overview.md) | Community Agent (per-pod) vs Sensemaker (DAO-wide) |

## Feature-specific architecture

| Doc | Feature |
|---|---|
| [password-vault-architecture](password-vault-architecture.md) | E2EE pod password vault |
| [treasury-v3-audit-and-deployment-2026-05](treasury-v3-audit-and-deployment-2026-05.md) | Treasury V3 contracts + migration path |
| [governance-flexibility-layer-a-2026-05](governance-flexibility-layer-a-2026-05.md) | Per-pod configurable governance parameters |
| [treegens-integration](treegens-integration.md) | Generic per-pod token eligibility gate ($TGN); 501(c)(3) governance-only guardrails |
| [guide-treegens-external-wallet-linking](guide-treegens-external-wallet-linking.md) | Member-facing step-by-step: link an external wallet so its $TGN counts (for the TreeGens knowledge base) |
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
| [kb-coverage-audit-2026-07](kb-coverage-audit-2026-07.md) | Knowledge base coverage vs app features — gaps, staleness, content pipelines (Sensemaker/KB/docs site) |

## Roadmap & specs

| Doc | Status |
|---|---|
| [roadmap-action-items-2026-05](roadmap-action-items-2026-05.md) | May 2026 prioritized roadmap |
| [competitive-analysis-feature-roadmap](competitive-analysis-feature-roadmap.md) | Feature ideas from competitive analysis |
| [spec-platform-identity-multi-wallet](spec-platform-identity-multi-wallet.md) | **Active spec** — Platform multi-wallet identity layer (CDP per-device wallets) |
| [spec-identity-comparison-audit](spec-identity-comparison-audit.md) | **Active spec** — Proactive audit of identity-comparison patterns across the codebase |
| [spec-vault-multi-wallet-identity](spec-vault-multi-wallet-identity.md) | Superseded — folded into platform identity spec |
| [spec-treegens-planting-verification](spec-treegens-planting-verification.md) | Future (Phase 2): MGRO planting verification — photo → verify → mint |
| [spec-inter-pod-agreements](spec-inter-pod-agreements.md) | Future: formal agreements between pods |
| [spec-contributor-compensation](spec-contributor-compensation.md) | Future: role archetypes + $SELF payroll |
| [spec-automated-blog-digest](spec-automated-blog-digest.md) | Future: AI-generated weekly community digest |

## Newsletter drafts

Community-facing announcements written alongside engineering work. Not
authoritative — they document intent, not state. Published drafts are archived
in [`archive/newsletters/`](archive/newsletters/).

## Archive

Historical, superseded, and one-off docs live in [`archive/`](archive/) to keep
the active surface clean. Nothing is deleted — kept for record/reasoning, but NOT
current reference:

| Subfolder | Contents |
|---|---|
| `archive/newsletters/` | Published member-facing newsletter drafts (point-in-time). |
| `archive/outreach/` | Outreach drafts, the investor/partner memo, the TreeGens ask. |
| `archive/self-redesign-specs/` | Working notes + intermediate specs from the $SELF redesign. Canonical shipped spec stays active: `spec-self-soulbound-redesign.md`. |
| `archive/audits/` | Dated point-in-time audits (snapshots, not living docs). |
| `archive/research/` | Ecosystem/competitive research + conversation notes. |

To resurrect something as living reference, move it back and index it above.

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

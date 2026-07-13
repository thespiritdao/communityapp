# SpiritDAO: Data Model & Activity Feed (Developer Documentation)

> **Audience:** developers, integrators, and technical evaluators. This document
> describes the application database: its table groups, how access is gated, and
> the activity firehose that powers the live feed.
>
> **Scope note:** This is public-safe documentation. It describes the *shape* of
> the data model and the *conceptual* access-control approach. It deliberately
> omits row-level-security policy bodies, admin-only flows, and any
> security-sensitive internals.

---

## What this is

The blockchain is the system of record for **balances, votes, and hat
ownership**. **Supabase (Postgres)** is the application database and read-model:
it stores content, metadata, hat-ID resolution, queues, and the activity feed.
Most features read from Supabase (fast) and verify against chain at decision
points. See `00-architecture-overview.md` → "Two sources of truth".

---

## Access control: Row-Level Security, conceptually

Every table is protected by **Row-Level Security (RLS)**. Access is keyed off the
**`wallet_address` claim** carried in the Supabase JWT that the app issues at sign
-in (see `01-identity-and-auth.md`). At a conceptual level, tables fall into a
handful of access patterns:

| Pattern | Used for | Idea |
|---------|----------|------|
| **Service-role writes** | system-generated rows (notifications, queues, the activity feed, settlement records) | only the trusted server, using the service role, may insert/update (never the browser) |
| **User-scoped reads/writes** | a member's own profile, wallet links, votes, registrations | a row is visible/writable only to the wallet that owns it |
| **Pod-membership-gated** | pod content, pod budgets, pod-level proposals | visible/writable only to wallets that belong to the pod (membership resolved via hats) |
| **Public reads** | hat registry, public proposal metadata, published knowledge entries | readable without a session |
| **Anonymous insert** | AI conversation logging (e.g. Sensemaker chats from non-signed-in visitors) | inserts allowed without a session, but reads are restricted |

The policy bodies themselves are intentionally not reproduced here. When this
documentation says a table is "RLS-gated by pod membership" or "service-role
only," that is the *contract*: the SQL enforcing it lives in the migrations.

---

## Key table groups

One line each: enough to orient, not an exhaustive column list.

### Identity
- `user_wallets`: wallet records linked to a member identity (multi-device).
- `user_profiles`: display name, avatar, bio, preferences. **`email` is a private column:** client- and peer-facing queries must omit it and select explicit public columns instead. The eventual boundary is a DB-level `public_profiles` view (see `docs/spec-member-email-privacy.md`); email is for the member's own login and notifications, not shared with other members.
- `user_wallet_link_codes`: short-lived codes for linking a new device/wallet.

### Pods
- `pods`: pod records (name, status, `management_hat_id`, treasury address).
- `pod_role_permissions`: the **hat-ID source of truth** (role → hat id → permissions); see `04-governance-and-pods.md`.
- `active_pod_members`: view resolving current membership from on-chain hats.
- `pod_modules`: per-pod feature toggles (incl. the Community Agent config); see "Pod modules" below.

### Governance
- `proposal_metadata`: on-chain proposals indexed by the Governor (temp IDs while pending).
- `pod_level_proposals`: pod-scoped proposals, with a `governance_tier` column (the 3-tier model).
- `governance_votes`: pod-level vote records.
- `governance_proposal_votes`: cached on-chain vote counts.

### Tokens & treasury
- `pod_self_budgets`: per-pod **$SELF mint budget** (pods hold a budget, not a balance).
- `self_mint_queue`: queued $SELF mints awaiting batch processing.
- `self_member_epoch_earned`: $SELF earned per member per epoch (soulbound accounting).
- `treasury_transactions`: recorded treasury movements (by tx hash).

### Social & content
- `forum_threads`, `forum_posts`, `forum_categories`, `forum_reactions`: the forum.
- `chat_groups`, `chat_messages`: group/DM chat.
- `events`, `event_registrations`: events and RSVPs/check-ins.
- `knowledge_*`: knowledge-base entries, sections, and metadata.

### Notifications
- `general_notifications`: in-app notifications.
- `governance_notifications`: governance-specific alerts.
- `notification_preferences`: per-member channel/topic preferences.

### Activity feed
- `explorer_events`: the single **Pulse firehose** (see below).

---

## The Pulse / activity firehose

The live activity feed (the `/explorer` page) is backed by **one table**:
`explorer_events`. It is an append-only firehose of everything notable that
happens across the platform.

- **Writer:** `recordExplorerEvent()` in `src/lib/explorerEvents.ts`. This helper
  is the single entry point; features call it after a successful action (note
  step 7 of the request lifecycle in `00-architecture-overview.md`).
- **Coverage:** ~50+ event types spanning **pods, governance, treasury, members,
  bounties, events, marketplace, forum, and knowledge**.
- **Access:** **service-role insert only**; the browser never writes here
  directly. Reads are public-safe (the feed is meant to be seen).
- **Trigger-sourced events:** some events are emitted by **Postgres triggers**
  (the `pulse_*` triggers) rather than application code, so that
  database-internal state changes still surface on the feed without an explicit
  `recordExplorerEvent()` call.

Because it is a firehose, the maintenance rule is: **when you add a new
cross-cutting action, remember to emit its event.** A historical gap (a mint
route that forgot to record) is documented in the team's silent-failure notes:
grep for sibling routes when wiring a new event type.

---

## Pod modules: flat columns, three UI tiers

`pod_modules` is a **flat table of boolean `*_enabled` columns** (one per feature:
`chat_enabled`, `forum_enabled`, `treasury_enabled`, `governance_enabled`,
`events_enabled`, `bounties_enabled`, `marketplace_enabled`,
`knowledge_base_enabled`, `sub_pods_enabled`, `surveys_enabled`,
`passwords_enabled`, `community_agent_enabled`), plus a `community_agent_config`
JSON column.

The admin UI (`src/features/pods/components/PodModulesManager.tsx`) presents these
in **three tiers**, but the tiers are a **client-side grouping only**
(`CORE_MODULES` / `ADDON_MODULES` / `PAID_MODULES` arrays), **not a DB schema
field**:

| Tier | Modules |
|------|---------|
| **Core** | Chat, Forum, Treasury, Governance, Events, Bounties, Marketplace, Knowledge Base, Sub-Pods |
| **Add-ons** | Surveys, Password Vault |
| **Paid** | Community AI Agent |

The **Paid** tier (Community AI Agent) is **not** hard-gated by the module toggle.
It is enforced by a **separate subscription flow**: **25 $SYSTEM / month**, paid
via an on-chain $SYSTEM burn and verified server-side, with pause/resume, through
`POST /api/community-agent/subscribe`. The `community_agent_enabled` boolean and
the subscription are distinct concerns.

---

## Migrations: two sources (a known duality)

Schema, RLS, and triggers live in **two** places. This duality is a known
maintenance consideration: when changing schema, check both:

| Location | Role |
|----------|------|
| `supabase/migrations/` | **Primary.** Dated migration files; the canonical, ordered history. |
| `scripts/db-migrations/` | **Secondary / legacy.** Numbered fix scripts and one-off RLS adjustments, some applied manually to production. |

When in doubt, the dated files under `supabase/migrations/` are authoritative for
the current schema; the `scripts/db-migrations/` set captures targeted fixes that
have, in places, been applied directly.

---

## Where to go next

- **`04-governance-and-pods.md`**: how `pod_role_permissions` resolves hats
- **`06-api-reference.md`**: the routes that read/write these tables
- **`07-ai-agents.md`**: the agents that read pod config and log conversations

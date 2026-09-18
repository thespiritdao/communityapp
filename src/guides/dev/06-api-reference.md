# SpiritDAO: API Surface (Developer Documentation)

> **Audience:** developers and integrators. This document maps the server-side
> API surface: how it authenticates, how it's rate-limited, and what the main
> route groups do.
>
> **Scope note:** This is public-safe documentation. It describes the route
> *surface* and auth *model* conceptually. It omits exact authorization-gate
> logic, RLS policy details, and admin-only internals.

---

## Shape of the API

The API is implemented as **Next.js App Router route handlers** under
`src/app/api/*`. There are roughly **136 route files** organized into about **36
groups** (one folder per group). Each `route.ts` exports the HTTP verbs it
supports (`GET`, `POST`, etc.).

---

## Auth model

Most routes require a **Supabase JWT Bearer token** (issued at sign-in; see
`01-identity-and-auth.md`). The token carries a **`wallet_address` claim**, and
that claim drives **Row-Level Security** on every Supabase query the route makes,
so a route inherits per-wallet data scoping for free (see
`05-data-model-and-rls.md`).

A few routes are intentionally public (e.g. hat-registry lookup, the Sensemaker
assistant) and a few are service-to-service (webhooks, cron).

---

## Rate limiting

Sensitive routes are rate-limited via **Upstash Redis** (`src/lib/ratelimit.ts`),
using sliding-window limiters with **graceful fallback**: if Redis is
unavailable, the limiter fails open rather than blocking the app. Representative
limits:

| Limiter | Limit | Why |
|---------|-------|-----|
| `sensemaker` | 10 / min | abuse protection on the public AI assistant |
| `airdrop` | 3 / hr | prevents spam of gas-sponsored mints |
| `notifications` | 100 / hr | caps notification/push fan-out per sender |
| `bountyCreate` | 10 / hr | caps bounty creation per wallet |

---

## The canonical on-chain write pattern

Many routes that touch the chain follow the gasless write triad from
`00-architecture-overview.md`:

```
authorize (server verifies hat, returns calldata)
   → sendUserOperation (client smart wallet, gas sponsored by paymaster)
      → dbUpdate (server records result by txHash)
```

Routes named `…/authorize`, `…/dbUpdate`, or returning calldata are part of this
pattern. The on-chain leg always runs on the **caller's smart wallet**, never an
admin EOA.

---

## Main route groups

| Group | Purpose |
|-------|---------|
| `/auth` | Wallet auth, JWT issuance, multi-device linking |
| `/pods` | Pod CRUD, review, permissions, role sync |
| `/governance` | Proposals, vote recording, thresholds |
| `/bounty` | Create / bid / assign / work / dispute |
| `/events` | Event creation, calendar, check-in |
| `/donations` | Stripe checkout → $SYSTEM minting flow |
| `/webhooks/stripe` | Payment settlement + downstream minting |
| `/claims` | Burn $SYSTEM to claim fiat |
| `/self` | $SELF holdings, mint-batch processing |
| `/admin/self` | Admin-side $SELF operations |
| `/marketplace` | Listings, accessibility, search |
| `/chat-messages`, `/chat-groups` | Group/DM chat messages and group management |
| `/forum` | Threads, posts, categories, reactions |
| `/gifts` | Token gifting: **primarily $SYSTEM** (see note below) |
| `/notifications` | In-app notifications + `/send` web-push |
| `/conference` | LiveKit tokens, room lifecycle, host-action |
| `/pods/[id]/places` | Places add-on: `GET` (active members) pins + links + opted-in member locations; `POST`/`PATCH` and `/[placeId]` `PUT`/`DELETE`, `/[placeId]/image` (pod leader, `placesManage` grantee, or Exec) |
| `/account/location` | The caller's own opt-in location (`GET`/`PUT`/`DELETE`); session wallet only |
| `/geocode` | Address search proxy (Nominatim); session required |
| `/hat-registry` | **Public** hat-ID lookup (cached) |
| `/invite` | Invite-code validation |
| `/onboarding` | Mint Proof of Curiosity + Advocate credential |
| `/community-agent` | Per-pod agent config, corpus, and `subscribe` (paid tier: 25 $SYSTEM/month, on-chain verified, pause/resume) |
| `/sensemaker` | Public Q&A assistant: chat, logging, health |
| `/cron` | Scheduled jobs |

### Note on `/gifts`

Gifting is **primarily a $SYSTEM operation**. Because **$SELF is soulbound**, it
can only be **earned or burned** (never transferred), so it cannot be gifted
wallet-to-wallet. Treat $SYSTEM as the giftable token; any $SELF "gifting" surface
is constrained accordingly. See `03-tokens-and-treasury.md`.

---

## Where to go next

- **`01-identity-and-auth.md`**: how the JWT and `wallet_address` claim are issued
- **`03-tokens-and-treasury.md`**: the $SYSTEM/$SELF distinction behind `/gifts`, `/self`, `/claims`
- **`05-data-model-and-rls.md`**: the tables these routes read and write
- **`07-ai-agents.md`**: the AI behind `/community-agent` and `/sensemaker`

# SpiritDAO: Architecture Overview (Developer Documentation)

> **Audience:** developers, integrators, and technical evaluators. This tier
> documents how the SpiritDAO Community App is built. For member-facing "how to
> use it" guides, see the user documentation. For the philosophy and mission,
> see the operations guide.
>
> **Scope note:** This is public-safe documentation. It describes architecture,
> on-chain contract addresses (already public), the token model, the API
> surface, and the agent layer. It deliberately omits security-sensitive
> internals (row-level-security policy details, admin-only flows, exact
> authorization-gate logic).

---

## What this is

The SpiritDAO Community App is **federated infrastructure for self-sovereign
communities**: a 501(c)(3) nonprofit DAO. It is a token-gated platform for a
"community of communities," combining on-chain governance, self-governing
**Pods**, a participation-and-utility token economy, social and content features
(forum, chat, video, events, knowledge base), and an AI agent layer, on top of
the Base L2 blockchain. It runs **open enrollment**: new communities and members
can join, it is not invitation-only.

It is a **Progressive Web App** built with Next.js (App Router). The blockchain
is a system of record for identity, roles, tokens, and votes. **Supabase
(Postgres)** is the application database and read-model, and **Pinecone + Claude**
power the AI layer.

---

## Stack at a glance

| Layer | Technology |
|-------|-----------|
| Frontend / SSR | Next.js 15 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS, Radix UI, styled-components |
| Wallet / Auth | Coinbase CDP embedded wallets (ERC-4337 smart wallets), custom Supabase JWT |
| On-chain | Base (L2), viem / wagmi / OnchainKit, Hats Protocol for roles |
| Gasless | Coinbase Paymaster (sponsored UserOperations) |
| Database | Supabase (Postgres + Row-Level Security + Realtime) |
| Payments (fiat) | Stripe (donations → $SYSTEM minting) |
| Video | LiveKit (self-hosted), plus WebRTC for 1:1 calls |
| AI / RAG | Anthropic Claude (Haiku/Sonnet), OpenAI embeddings, Pinecone |
| Rate limiting | Upstash Redis |
| Hosting | Vercel (app), Cloudflare Pages (marketing site + docs) |

---

## Subsystem map

The codebase is organized by feature under `src/features/*`, with the API
surface under `src/app/api/*` (Next.js route handlers) and shared logic in
`src/lib`, `src/services`, and `src/contracts`.

| Subsystem | Where | What it does |
|-----------|-------|--------------|
| **Identity & wallet** | `src/features/identity`, `src/wallet`, `src/app/api/auth` | CDP embedded wallets, multi-device linking, JWT issuance |
| **Governance & pods** | `src/features/governance`, `src/features/pods`, `src/app/api/pods` | 3-tier governance, pod lifecycle, Hats-based roles |
| **Tokens & treasury** | `src/features/self`, `src/features/marketplace`, `src/features/bounty`, `src/contracts` | $SYSTEM, $SELF, pod treasuries, burn-to-pay |
| **Social & content** | `src/features/forum`, `src/features/chat`, `src/features/conference`, `src/features/events`, `src/features/knowledge` | forum, chat, video, events, knowledge base |
| **Notifications & Pulse** | `src/features/notifications`, `src/lib/explorerEvents.ts` | web-push, in-app feed, the activity firehose |
| **AI agents** | `src/services/communityAgent`, `src/services/sensemaker` | per-pod content agent + public Q&A assistant |
| **Data** | `supabase/migrations`, `scripts/db-migrations` | schema, RLS, triggers |

See the per-subsystem documents (`01`–`07`) for detail.

---

## The four cross-cutting patterns

Almost everything in the app is shaped by four recurring patterns. Understanding
these is the fastest way to read the codebase.

### 1. Hats Protocol is the universal permission primitive

Roles (pod leader, pod member, executive, moderator, treasurer) are
[Hats Protocol](https://www.hatsprotocol.xyz/) tokens (ERC-1155). "Can this
wallet do X?" almost always reduces to "does this wallet wear the right hat?"

Hat IDs are **resolved from the database** (the `pod_role_permissions` table),
not from environment variables or a hardcoded registry. This means a hat tree
can be redeployed and the app picks up the new IDs by updating one table.
Resolution is cached and exposed via a public registry endpoint. See
`04-governance-and-pods.md`.

### 2. The gasless write triad: authorize → sendUserOperation → dbUpdate

All transactions are **gasless** (sponsored by the Coinbase Paymaster). The
canonical pattern for any on-chain write that also touches the database is three
steps:

1. **authorize**: the server verifies the caller is permitted (e.g. wears the
   required hat) and returns the calldata to execute.
2. **sendUserOperation**: the **client's** smart wallet submits the
   UserOperation (gas sponsored by the paymaster).
3. **dbUpdate**: the server records the result in Supabase, keyed by the
   transaction hash.

A key rule: **on-chain writes go through the caller's smart wallet, never an
admin EOA**. Only smart wallets can use the paymaster, and using the caller's
wallet keeps authorship and authorization honest. See `02-onchain-and-contracts.md`.

### 3. Two sources of truth, reconciled

The blockchain is authoritative for **balances, votes, and hat ownership**. The
database is authoritative for **content, metadata, and hat-ID resolution**. Most
features read from the database (fast) and verify against chain at decision
points. Where the two can drift (e.g. a vote tallied in the DB before its
on-chain execution), the feature documents which side wins.

### 4. Soulbound-by-default token model

The participation token ($SELF) and the membership credential (Proof of
Curiosity) are **soulbound** (non-transferable). Value comes from participation
and time, not from speculation or transfer. Only $SYSTEM (the capital-backed
utility token) is freely transferable. This shapes the entire economic surface:
"paying" with $SELF means **burning** it, not transferring it. See
`03-tokens-and-treasury.md`.

---

## Request lifecycle (typical authenticated action)

```
Browser (CDP smart wallet)
   │  1. sign in: email OTP / Google OAuth → device-scoped smart wallet
   │  2. POST /api/auth/onchainkit  → server resolves identity, issues Supabase JWT
   ▼
Next.js API route (src/app/api/*)
   │  3. verify JWT (wallet_address claim) → RLS-scoped Supabase access
   │  4. for on-chain actions: verify hat ownership ("authorize")
   ▼
Client smart wallet
   │  5. sendUserOperation (gas sponsored by Coinbase Paymaster)
   ▼
Base L2  ──emits events──►  Next.js API route
                              │  6. dbUpdate: record result in Supabase (by txHash)
                              │  7. recordExplorerEvent(): write to Pulse firehose
                              ▼
                           Supabase (Postgres + Realtime) → UI updates live
```

---

## Where to go next

- **`01-identity-and-auth.md`**: CDP wallets, the multi-device problem, JWT/RLS
- **`02-onchain-and-contracts.md`**: Base, Hats, contract registry + addresses, paymaster
- **`03-tokens-and-treasury.md`**: $SYSTEM, $SELF (soulbound epochs, decay, Tenure), treasury, burn-to-pay
- **`04-governance-and-pods.md`**: the 3-tier model, pod lifecycle, hat resolution
- **`05-data-model-and-rls.md`**: Supabase schema, the Pulse firehose, migrations
- **`06-api-reference.md`**: the API route surface
- **`07-ai-agents.md`**: Community Agent (Kairos) and Sensemaker

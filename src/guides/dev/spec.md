# SpiritDAO Community App: Specification

> **Audience:** external evaluators, directories, and integrators. This page
> describes the app as a product: what it is, who owns it, its license, stack,
> status, and dependencies. It is public-safe and follows the same scope rules
> as the rest of the developer documentation.

---

## What it is

SpiritDAO Community App is the software platform built and stewarded by
SpiritDAO, a US 501(c)(3) nonprofit. This page describes the app as a product.
For the nonprofit and its own governance, see
[How SpiritDAO Works](spiritdao-operations-guide.md). The app is a token-gated
platform for a community of communities: any group can create a self-governing
**Pod** with its own treasury, roles, governance, forum, chat, video, events,
bounties, marketplace, and a per-pod AI agent. It runs on the Base L2
blockchain, operates open enrollment (new communities and members can join, it
is not invitation-only), and is delivered as a Progressive Web App.

---

## At a glance

| Field | Value |
|-------|-------|
| Type | Decentralized application (multi-community platform) |
| Status | Active, in production, open enrollment |
| Start year | 2023 (first commit December 2023) |
| License | MIT (per the repository LICENSE). The source repository is not currently public. |
| Owner | SpiritDAO, a 501(c)(3) nonprofit, EIN 99-1308806 |
| Governance of the software | The SpiritDAO nonprofit maintains the codebase and controls application releases and contract deployments. DAO-wide constitutional changes are decided by on-chain votes of Advocate credential holders and executed through a timelock; pods govern their own treasuries and operations. See [Governance & Pods](04-governance-and-pods.md). |
| Country | USA |
| Chain | Base (Ethereum L2) |
| Funding | Donations (tax-deductible, processed via Stripe). The nonprofit states it is sustained by donations, not subscriptions, venture capital, or advertising. |
| Docs | [Architecture Overview](00-architecture-overview.md) |
| Live app | [app.spiritdao.org](https://app.spiritdao.org) |
| Community | [spiritdao.org/community](https://www.spiritdao.org/community.html) |

---

## Core capabilities

Every community on the platform gets:

- [Pods](02-pod-management.md): self-governing sub-communities with their own roles, agreements, and treasury
- [Three-tier governance and voting](03-governance-voting.md): constitutional (on-chain), treasury-binding, and operational proposals
- [Hats Protocol roles](04-governance-and-pods.md): on-chain roles and permissions
- [Pod treasuries](03-tokens-and-treasury.md): multi-signature, hat-gated $SYSTEM treasuries
- [$SELF and $SYSTEM economy](15-self-token-and-tenure.md) with Tenure standing
- [Bounties](04-bounties-system.md) and a [Marketplace](07-marketplace-shopping.md)
- [Forum](06-forum-discussions.md), [chat and direct messages](14-chat-and-messages.md), [video conferencing](08-video-chat-conferencing.md), and [events with a calendar](05-events-calendar.md)
- Knowledge base, [surveys](11-surveys.md), and a [password vault](12-password-vault.md)
- [Community Agent (Kairos)](13-community-agent.md), a per-pod AI agent, and [Sensemaker](07-ai-agents.md), a public Q&A assistant

---

## Token model

**$SELF** is a soulbound, non-transferable participation credit denominated in
verified hours. It is granted in quarterly epochs, decays over roughly six
months, and is spent by burning, never by transfer; lifetime earnings accrue as
permanent **Tenure** standing. **$SYSTEM** is a capital-backed, transferable
ERC-20 utility token, backed roughly 1:1 by USD held by the nonprofit, minted
from donations through Stripe, and redeemable back to fiat via Claims. **Proof
of Curiosity** is a soulbound ERC-721 membership credential. Full detail:
[Tokens & Treasury](03-tokens-and-treasury.md).

---

## Architecture and stack

Condensed from the [Architecture Overview](00-architecture-overview.md), which
is the maintained source:

| Layer | Technology |
|-------|-----------|
| Frontend / SSR | Next.js 15 (App Router), React 18, TypeScript, PWA |
| Wallet / Auth | Coinbase CDP embedded wallets (ERC-4337), Supabase JWT |
| On-chain | Base (L2), viem / wagmi / OnchainKit, Hats Protocol roles |
| Gasless writes | Coinbase Paymaster (sponsored UserOperations) |
| Database | Supabase (Postgres, Row-Level Security, Realtime) |
| Payments (fiat) | Stripe (donations mint $SYSTEM) |
| Video | LiveKit (self-hosted) plus WebRTC for 1:1 calls |
| AI / RAG | Anthropic Claude, OpenAI embeddings, Pinecone |
| Hosting | Vercel (app), Cloudflare Pages (site and docs) |

Four cross-cutting patterns shape the app:

- Hats Protocol (ERC-1155) is the universal permission primitive; hat IDs resolve from the database, not hardcoded config.
- Every on-chain write is gasless and runs through the caller's smart wallet (authorize, then sendUserOperation, then dbUpdate), never an admin EOA.
- Two sources of truth, reconciled: the chain is authoritative for balances, votes, and roles; the database for content and metadata.
- Soulbound by default: only $SYSTEM is transferable; $SELF and membership credentials never move between wallets.

---

## Interoperability surface

- **Public API routes** such as `GET /api/hat-registry` (unauthenticated hat-ID lookup) and the Sensemaker assistant; see [API Surface](06-api-reference.md).
- **Hats Protocol trees**: roles are standard ERC-1155 hats readable by any Hats tooling (top hat tree id `0x00000749`).
- **ERC-4337 smart wallets**: accounts follow the account-abstraction standard.
- **External wallet linking**: members can [link external wallets](10-linking-external-wallets.md) to their identity.
- **Published contract addresses** on Base, verifiable on Basescan; see [On-Chain & Contracts](02-onchain-and-contracts.md).
- **Standard token interfaces**: ERC-20 ($SYSTEM), ERC-721 (Proof of Curiosity, Advocate ERC721Votes), ERC-1155 ($SELF).
- **Data export**: on-chain state is publicly readable by anyone. There is no self-serve export of application-layer data (forum posts, chat, profiles) today.

---

## Dependencies and centralization points

The app depends on several centralized providers. A candid inventory:

| Component | Provider | What happens if it goes away | Portability |
|-----------|----------|------------------------------|-------------|
| Embedded wallets | Coinbase CDP | Sign-in and transaction signing stop working | Low: wallets are standard ERC-4337 accounts, but key management is Coinbase-hosted; replacement means new wallet infrastructure and re-linking members |
| Gas sponsorship | Coinbase Paymaster | Writes stop being gasless and fail until users fund gas or a new paymaster is configured | Medium: ERC-4337 paymasters are a standard, substitutable |
| L2 sequencer | Base (Coinbase) | Transactions halt until the sequencer returns | On-chain state persists and settles to Ethereum |
| Database | Supabase | All application content and auth unavailable | Medium: standard Postgres, exportable by the operator, but auth, RLS, and realtime are Supabase-integrated |
| App hosting | Vercel | App offline until redeployed | High: standard Next.js; scheduled jobs would need rewiring |
| Site and docs hosting | Cloudflare Pages | Marketing site and docs offline | High: static files |
| AI models | Anthropic (Claude) | Community Agent and Sensemaker stop responding | Medium: another LLM provider could be substituted |
| Embeddings | OpenAI | Knowledge indexing and semantic search degrade | Medium: requires re-embedding with another model |
| Vector database | Pinecone | Agent knowledge retrieval stops | Medium: corpus can be re-indexed elsewhere |
| Fiat payments | Stripe | Donations, $SYSTEM minting, and fiat claims stop | Medium: another processor could be integrated |
| Video | LiveKit (self-hosted by SpiritDAO) | Video calls stop; this is operated in-house, not a third-party dependency | High: open source |
| Rate limiting | Upstash Redis | Limiters fail open by design; the app keeps working | High |

On-chain state (token balances, votes, Hats roles, and the published contract
addresses) is portable and independently verifiable on Base; the application
layer (database content, hosting, and AI services) currently is not.

---

## Roadmap and status

The app is at version 0.35.x and in active development. Documented planned work,
not yet shipped: cross-community recognition weights for Tenure (federation
across communities) and governance staking of $SELF (a lock seam exists in the
contracts but is not wired up). Recent changes are tracked in
[What's New](whats-new.md).

---

## Citing this page

Canonical URL: `https://www.spiritdao.org/docs/spec`. Last updated: August 27, 2026.

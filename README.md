# SpiritDAO Community App

Open-source infrastructure for communities that want to talk, decide, coordinate
and hold resources together in one system they own. Built and run by
[SpiritDAO Inc](https://spiritdao.org), a 501(c)(3) nonprofit, and used in
production at [app.spiritdao.org](https://app.spiritdao.org).

The app gives a federation of communities ("pods") shared identity and
membership, threaded forums that feed into formal proposals, three tiers of
governance up to binding on-chain votes, pod treasuries, bounties, events with
attendance credentials, a knowledge base with courses and accreditations,
chat and video, and an AI sensemaker trained on the community's own material.
Membership and roles are on-chain and non-custodial (Hats Protocol on Base);
gas is sponsored so members never need to buy a token to participate.

## Status

This is a working production codebase, not a polished framework. It was built
by a very small team over 2024-2026 and is being published so others can run
it, learn from it, audit it and contribute. Expect rough edges:

- `next build` passes with `ignoreBuildErrors` on; `tsc` still reports type errors.
- The unit test suite is small (`npm test`, 8 files, all passing) and covers
  session verification, vault crypto, hat-id prediction and a few services.
  Most features have no automated tests yet.
- Several one-off operational scripts in `scripts/` assume the SpiritDAO
  deployment (contract addresses, pod ids). Treat them as examples.

The engineering docs in [`docs/README.md`](docs/README.md) are the best place to
start. The architecture overview, authentication model and permission design are
listed there first for a reason.

## Stack

| Layer | Technology |
|---|---|
| Web app | Next.js 15 (App Router), React 18, Tailwind, TypeScript |
| Identity and wallets | Coinbase Developer Platform embedded wallets (`@coinbase/cdp-hooks`), wagmi, viem |
| Membership and roles | Hats Protocol on Base mainnet, custom eligibility and toggle modules |
| Governance and treasury | Solidity contracts in `src/contracts/` (Governor, pod treasuries, bounty manager, event manager, purchase routers) with Hardhat |
| Database and auth | Supabase (Postgres, Row Level Security, Supabase-issued sessions via a custom access-token hook) |
| Video | LiveKit (self-hosted) |
| Maps | MapLibre |
| AI | Anthropic Claude for the Sensemaker and the per-pod community agent; Pinecone for retrieval |
| Email and payments | Resend, Stripe (donations) |
| Hosting | Vercel (web), scheduled jobs via Vercel cron (`vercel.json`) |

## Running it locally

Prerequisites: Node 24 (see `.nvmrc`), npm, a Supabase project, and a Coinbase
Developer Platform project for embedded wallets. A Base RPC endpoint and a
paymaster are needed for anything on-chain.

```bash
git clone https://github.com/thespiritdao/communityapp.git
cd communityapp
npm install
cp .env.example .env        # then fill in your values
npm run dev
```

Database schema lives in `supabase/migrations/` and is applied by hand with
`psql` or the Supabase SQL editor, in timestamp order. The Row Level Security
policies are the authoritative access-control layer; read
[`docs/authentication-and-session-model.md`](docs/authentication-and-session-model.md)
before touching them.

Smart contracts compile with `npx hardhat compile`. Deploying your own set
means creating your own Hats tree and updating the `NEXT_PUBLIC_*` contract
addresses in `.env`; see `scripts/deploy-*` and the runbooks in `docs/`.

Useful commands:

```bash
npm run dev            # local dev server
npm run build          # production build
npm test               # vitest
npm run verify:static  # static guard: member private data must not reach a peer's browser
npm run hooks:install  # git hooks, including the one that refuses commits touching secrets files
```

## Repository layout

```
src/app/           Next.js routes and API handlers (src/app/api/**)
src/features/      Feature modules: pods, governance, forum, bounty, events, chat, identity, knowledge, ...
src/contracts/     Solidity sources
src/lib/           Server-side helpers: session verification, pod authorization guards, CDP auth
supabase/          Migrations (schema, RLS policies, RPCs, triggers)
scripts/           Operational and verification scripts
docs/              Engineering docs; start at docs/README.md
user-flows/        Narrative walkthroughs of each feature from the member's point of view
public/images/docs Screenshots used by the in-app documentation
```

## Security

Please do not open public issues for security problems. See
[`SECURITY.md`](SECURITY.md) for how to report them. The design of the
authority model (what the server trusts, what the chain enforces, what RLS
enforces) is written up in `docs/permission-systems-architecture.md` and
`docs/secrets-and-key-custody.md`.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Good first contributions are
documentation fixes, type-error cleanup, test coverage for `src/lib/` and
`src/features/*/services/`, and reproducible bug reports from running your own
instance.

## Provenance and license

This repository began as a fork of Coinbase's
[OnchainKit](https://github.com/coinbase/onchainkit) in December 2023. The
OnchainKit code was removed in November 2026, but earlier commits contain it and
some build and test configuration descends from it. That material remains under
Coinbase's MIT license; see [`NOTICE.md`](NOTICE.md).

The code is Copyright (c) 2024-2026 SpiritDAO Inc and released under the
GNU Affero General Public License v3.0. See [`LICENSE`](LICENSE). In short: you
may run, study, modify and redistribute it, and if you run a modified version as
a service you must offer its source to your users under the same terms.

The SpiritDAO name, logo and brand assets are not covered by the code license
and may not be used to present a fork as SpiritDAO or as endorsed by it.

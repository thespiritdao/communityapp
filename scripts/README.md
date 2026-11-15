# scripts/

Operator tooling for running your own deployment. Nothing here runs in the app
itself. Every script reads its configuration from `.env` (see `.env.example`
and `docs/configuration.md`); none of them carries addresses, pod ids or
domains of any particular deployment. Scripts that need a value you have not
set stop and say which variable is missing.

Scripts that send transactions say so at the top of the file. Read them before
running them against mainnet.

| Folder | What it is for | Typical variables |
|---|---|---|
| `build/` | Run by `npm run build` / `dev` and by tooling: env check, MapLibre worker copy, PWA icons, ABI sync, git hook install | `PWA_ICON_SOURCE` |
| `db/` | Backups, restore, applying a SQL file, KB mirror | `SUPABASE_DB_URL` or `SUPABASE_DB_PASSWORD` + `SUPABASE_POOLER_HOST`, `SUPABASE_SERVICE_ROLE_KEY` |
| `deploy/` | Deploying and wiring your contracts, creating service wallets, checking a deployment | `CONTRACT_ADMIN_PRIVATE_KEY`, `POD_ADMIN_PRIVATE_KEY`, `BACKEND_SMART_WALLET_ADDRESS`, `MEMBER_HAT_ID`, `EXECUTIVE_POD_LEADER_HAT_ID`, the `NEXT_PUBLIC_*` contract addresses |
| `ops/` | Recurring or occasional operations: epochs, stipends, reconciliation, airdrops, raising limits, triggering a cron job | `CRON_SECRET`, `POD_ADMIN_PRIVATE_KEY`, bounty manager addresses |
| `verify/` | Security and end-to-end suites run against a live deployment (`npm run verify:*`) | `NEXT_PUBLIC_APP_URL` or `VERIFY_BASE_URL`, `VERIFY_POD_ID`, `NEXT_PUBLIC_GOVERNANCE_POD_ID`, `VERIFY_EMAIL_DOMAIN`, `AGENT_EMAIL_DOMAIN` |
| `embed/` | Pinecone index setup and document embedding for the community agent | `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `PINECONE_PHILOSOPHY_INDEX` |
| `hooks/` | Git hooks installed by `npm run hooks:install` | none |

## Order for a new deployment

1. Database: apply `supabase/baseline/` (see its README), then `supabase/migrations/`.
2. Contracts: follow `docs/SETUP.md` sections 4 to 6 (about half the contracts have a script here; the rest are deployed by hand). Run `node scripts/deploy/verify-env-vars.mjs` once your addresses are in `.env`; it fails on any address without contract code.
3. Checks: `npm run verify:static`, then the live suites (`verify:exposure`, `verify:authority`, `verify:linking`, `verify:session`, `verify:storage`) against your deployed app.

## The verify suites write to your database

The live suites create throwaway accounts and rows, then delete them. Point
them at a deployment you operate. `VERIFY_POD_ID` picks the pod they use for
test rows; it defaults to `NEXT_PUBLIC_DEFAULT_POD_ID`.

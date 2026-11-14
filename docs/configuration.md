# Configuration

*Last updated: 2026-11-14*

This app is configured entirely through environment variables. No contract
address, pod, hat, domain, mailbox or service name of any particular deployment
is built into the code, so a fresh clone talks to nothing until you point it at
your own infrastructure.

- **`.env.example`** lists every variable the code reads, grouped by area, with
  a one-line description. Copy it to `.env` and fill it in.
- **`src/config/deployment.ts`** reads the public (`NEXT_PUBLIC_*`) settings.
  It is safe to import from client components.
- **`src/config/deployment.server.ts`** reads server-only settings (mail
  senders, service wallets, integrations). It throws if bundled into the
  browser.
- **`src/config/contracts.ts`** collects contract addresses.
- **`scripts/check-env.mjs`** runs before every `npm run build` and fails the
  build with a readable list when a required value is missing or malformed.
  Run it on its own with `npm run check:env`.

## Required settings

The build will not start without these:

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Public URL of the deployment. Used in emails, invite links and calendar feeds. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase project, with `supabase/migrations` applied. |
| `NEXT_PUBLIC_CDP_PROJECT_ID` | Coinbase Developer Platform project for embedded wallets. |
| `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_PAYMASTER` | RPC and paymaster/bundler endpoints. Members' transactions are sponsored through the paymaster. |
| `NEXT_PUBLIC_GOVERNANCE_POD_ID` | The governance (executive) pod; see below. |
| `NEXT_PUBLIC_SYSTEM_TOKEN`, `NEXT_PUBLIC_SELF_TOKEN`, `NEXT_PUBLIC_PROOF_OF_CURIOSITY` | Core token and membership contracts. |
| `CRON_SECRET` | Shared secret for the scheduled jobs in `vercel.json`. |

Some settings are required together: `RESEND_API_KEY` with `EMAIL_FROM`; the
three `LIVEKIT_*` values; `POD_ADMIN_PRIVATE_KEY` with
`BACKEND_SMART_WALLET_ADDRESS`; `PINECONE_API_KEY` with `PINECONE_INDEX_NAME`.

## Structural pods and hats

The governance model gives a few pods special meaning. Their ids are rows in
your own `pods` table, so they are configuration:

| Variable | Role |
|---|---|
| `NEXT_PUBLIC_GOVERNANCE_POD_ID` | The executive pod. Its leaders review new pods, approve donations and hold DAO-level governance rights. Required. |
| `NEXT_PUBLIC_COMMUNITY_POD_ID` | Parent of all community pods. |
| `NEXT_PUBLIC_DEFAULT_POD_ID` | Optional. New members are enrolled in this community at onboarding. |
| `NEXT_PUBLIC_KAIROS_POD_ID` | Optional. This pod's community agent uses the dedicated Kairos persona and the shared philosophy index. |

Hat ids are never configured directly. `src/lib/hatRegistry.ts` reads them from
those pods' rows: a pod's `management_hat_id` is its leader hat and its
`membership_hat_id` its member hat. When you redeploy a hat tree, update those
two columns and the app follows.

## Organisation identity

Donation receipts claim tax-deductibility and print the organisation's legal
name and US EIN. Set `NEXT_PUBLIC_ORG_NAME` and `NEXT_PUBLIC_ORG_EIN` to your
own registered values before enabling donations. `NEXT_PUBLIC_CONTACT_EMAIL`,
`NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_ORG_URL` and `EMAIL_FROM` control the
addresses shown to members and the sender of every email.

The Terms of Service and Privacy Policy pages (`src/app/terms`,
`src/app/privacy`) are the original operator's legal documents. Replace them
with your own before launching.

## Branding

`NEXT_PUBLIC_APP_NAME` sets the page title, wallet prompts and email footers.
Product copy elsewhere still says "SpiritDAO". The SpiritDAO name and logo are
not covered by the code license, so a public deployment of a fork must replace
them; see `NOTICE.md`.

## What is still Base-specific

The app targets Base. `NEXT_PUBLIC_CHAIN_ID` selects the explorer URL, but many
call sites still import viem's `base` chain directly and fall back to the public
Base RPC. Running on another chain needs those call sites routed through the
config first.

# Running your own deployment

*Last updated: 2026-11-15*

This guide takes a new community from an empty set of accounts to a working
instance of the app. Nothing in the code points at SpiritDAO's deployment, so
every step below creates something of your own: database, wallets, contracts,
Hats tree and hosting.

Plan for a few days, not an afternoon. The app is a production system with
real on-chain authority. Most of the time goes into the contracts and the Hats
tree, and into deciding who holds which key.

If you only want to read or work on the code, `README.md` covers local
development. [`configuration.md`](configuration.md) explains every setting;
this guide says in what order to create them.

## 0. Decide before you start

- **Network.** The app runs on **Base mainnet** only today. The wallet
  configuration, the server's user operations and the deploy scripts all name
  Base mainnet directly, so Base Sepolia does not work without code changes
  (see [Known gaps](#known-gaps)). Rehearse with small amounts on mainnet, and
  with keys you can afford to rotate.
- **Keys and custody.** You will create several server-side keys (section 4).
  Whoever holds them can mint membership, create pods and move funds through
  the admin paths. Read [`secrets-and-key-custody.md`](secrets-and-key-custody.md)
  and decide where they live before they hold anything of value.
- **Legal.** Donation receipts claim tax-deductibility and print your
  organisation's legal name and EIN. The Terms and Privacy pages are SpiritDAO's
  documents. Replace both before launch.
- **Branding.** The SpiritDAO name and logo are not licensed with the code. A
  public fork must replace them (`NOTICE.md`).

## 1. Accounts you need

| Service | Used for | Required? |
|---|---|---|
| [Supabase](https://supabase.com) | Database, Row Level Security, sessions, file storage | Yes |
| [Coinbase Developer Platform](https://portal.cdp.coinbase.com) (CDP) | Members' embedded wallets, login verification, gas sponsorship | Yes |
| A Base RPC provider | Chain reads and writes (CDP's node endpoint works) | Yes |
| A host for Next.js | The web app and scheduled jobs. Vercel is what `vercel.json` targets; every-5-minute jobs need a paid plan | Yes |
| [Hats Protocol](https://app.hatsprotocol.xyz) | Membership and roles (shared protocol contract, nothing to sign up for) | Yes |
| [Resend](https://resend.com) | Email (digests, invitations, receipts) | Recommended |
| [Pinata](https://pinata.cloud) | IPFS pinning for agreements, bounties and records | Recommended |
| [LiveKit](https://livekit.io) | Video calls (cloud or self-hosted) | Optional |
| Anthropic, OpenAI, [Pinecone](https://pinecone.io) | Sensemaker, community agents, thread summaries | Optional |
| [Stripe](https://stripe.com) | Card donations | Optional |

## 2. Database (Supabase)

1. Create a Supabase project. Note the project URL, the anon key and the
   service-role key.
2. Apply the baseline, in order, as the `postgres` role. Then apply every
   migration in `supabase/migrations/` dated after 2026-11-14, in filename
   order. Full details are in
   [`supabase/baseline/README.md`](../supabase/baseline/README.md).

   ```bash
   export SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres"
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline/00_prerequisites.sql
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline/01_schema.sql
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline/02_storage.sql
   for f in supabase/migrations/20261115*.sql; do node scripts/db/apply-migration.mjs "$f"; done
   ```

3. In the Supabase dashboard:
   - **JWT signing keys**: switch the project to asymmetric keys (ECC/P-256 or
     RSA). The server only accepts ES256 or RS256 session tokens and verifies
     them against the project's published keys. With the legacy shared secret,
     every login fails.
   - **Authentication, Hooks**: set the custom access token hook to
     `public.custom_access_token_hook`. It stamps each session with the
     member's wallet and, for agent accounts, the `community_agent` role.
     Without it, Row Level Security sees no wallet and members can read almost
     nothing.
   - **Authentication, Providers, Email**: keep the provider enabled but turn
     off "Allow new users to sign up". Members never sign in to Supabase
     directly. The server creates the account and issues the session after
     verifying the member's Coinbase wallet, and nothing is emailed.
4. Put the URL and keys in `.env` (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

Row Level Security is the access-control layer. Read
[`authentication-and-session-model.md`](authentication-and-session-model.md)
before changing a policy.

## 3. Coinbase Developer Platform

Create **your own** CDP project. Never reuse another deployment's project or
keys: the project decides which domains may create wallets and who pays for
gas.

1. **Project id**: `NEXT_PUBLIC_CDP_PROJECT_ID`.
2. **Embedded wallets**: enable them and add your app's domains (and
   `http://localhost:3000` for development) to the allowed origins. Members
   sign in with email, Google or Apple and get a smart wallet.
3. **Client API key**: `NEXT_PUBLIC_CDP_API_CLIENT`. It ships in the browser
   bundle, so restrict it to your domains in the portal.
4. **Secret API key**: `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`. The server
   uses it to verify that a member controls the wallet they claim
   (`src/lib/cdpAuth.ts`) before issuing a session. Login fails closed without
   it. The Coinbase server SDK paths read the same key under older names: set
   `CDP_API_KEY` to the key id and `EXECUTIVE_MINTING_PRIVATE_KEY` to the
   secret.
5. **Node and paymaster**: copy the Base RPC and paymaster/bundler URLs into
   `NEXT_PUBLIC_RPC_URL` and `NEXT_PUBLIC_PAYMASTER`. Set a sensible daily
   sponsorship limit.
6. **Paymaster allowlist**: after deploying your contracts (section 5), add
   the static contracts members call to the CDP paymaster allowlist. Contracts
   created per pod (treasuries and creation managers) cannot be listed ahead
   of time. The app's own proxy at `/api/paymaster` sponsors those after
   checking them against your `pods` table; see
   [`paymaster-gas-sponsorship.md`](paymaster-gas-sponsorship.md).

## 4. Server keys

The server signs some transactions itself: onboarding mints, pod provisioning,
$SELF issuance, agent registration and the weekly ledger anchor. Create these
wallets before the contracts, because several contracts take them as
constructor arguments or owners.

| Variable | What it is | What it needs on-chain |
|---|---|---|
| `POD_ADMIN_PRIVATE_KEY` | The server's admin EOA. Signs for the smart wallet below, and sends some transactions directly (executive-hat and Advocate mints, the ledger anchor, the fallback pod-creation path). | ETH on Base for gas. Wears the governance pod's leader hat, the community-parent hat and the default pod's leader hat (section 5). Minter on AdvocateV2, authorized caller on HatMinter, owner or caller on LedgerAnchor. |
| `BACKEND_SMART_WALLET_ADDRESS` | A Coinbase smart wallet owned by that EOA. Sends gas-sponsored backend operations. | Minter on ProofOfCuriosityV2, authorized caller on HatMinter, owner of AgentRegistry, the $SELF roles in step 9 below. |
| `PRIVATE_KEY` | Owner key for contracts you deploy (HatMinter, PodCreationManager). Can be the same as the admin EOA. | Contract owner. |
| `SELF_ATTESTOR_PRIVATE_KEY` | Optional separate signer for $SELF issuance. | Must own the smart wallet if set. |
| `AGENT_WALLET_MASTER_KEY` | Random 32 bytes. Derives community agents' wallets. | None. |
| `CDP_API_KEY` / `EXECUTIVE_MINTING_PRIVATE_KEY` | Your CDP secret key's id and secret again, under the names the Coinbase server SDK paths read. Not wallet keys. | None. |

Script-only keys, needed while you deploy and best removed from the
environment afterwards: `CONTRACT_ADMIN_PRIVATE_KEY` (owner of the treasury
contracts), `TOP_HAT_PRIVATE_KEY` (top hat wearer), `DEPLOYER_PRIVATE_KEY`,
`ADMIN_EPOCH_PRIVATE_KEY`.

Create the admin EOA with any wallet tool (`npx tsx
scripts/deploy/generate-service-wallet.ts` prints a new one). Then create its
smart wallet with the Coinbase SDK the app already uses:

```js
// node --env-file=.env create-smart-wallet.mjs
import { Coinbase, createSmartWallet } from '@coinbase/coinbase-sdk';
import { privateKeyToAccount } from 'viem/accounts';

Coinbase.configure({
  apiKeyName: process.env.CDP_API_KEY,
  privateKey: process.env.EXECUTIVE_MINTING_PRIVATE_KEY.replace(/\\n/g, '\n'),
});
const key = process.env.POD_ADMIN_PRIVATE_KEY;
const signer = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
const wallet = await createSmartWallet({ signer });
console.log('BACKEND_SMART_WALLET_ADDRESS=' + wallet.address);
```

## 5. Hats tree and structural pods

Membership and roles are [Hats](https://docs.hatsprotocol.xyz). No script
creates the tree. Create it in the Hats app (app.hatsprotocol.xyz) from the
wallet that will hold the top hat. The shape the app expects, as used by the
reference deployment:

```
Top hat                        your top-hat wallet
├── 1  Governance leader hat    executive leaders, the HatMinter, the admin EOA
└── 2  Community parent hat     the PodCreationManager, the admin EOA
       ├── 2.1  Default pod leader hat     pod leaders, the HatMinter, the admin EOA
       │        └── 2.1.1  Default pod member hat
       └── 2.n  Other pod leader hats      created by the app
                └── 2.n.1  Member hats      created by the app
```

- The **governance leader hat** is the executive role: it activates and
  vetoes new pods, approves donations, and is the minter check on
  SystemToken. **Every wearer can mint SYSTEM**, so keep the list short.
- The **community-parent hat** must be worn by the PodCreationManagerV2
  contract. Pod leader hats are created under it.
- The **HatMinter** wears the default pod's leader hat. That makes it an admin
  of the default member hat, which is how onboarding mints membership. A hat
  is never its own admin, so new executive leaders are minted by the top-hat
  wallet.
- Member hats for other pods are created by the pod leader's wallet when the
  first application is approved.

Then create the pods rows. Hat ids go in as `0x`-prefixed 64-digit hex:
the app ignores any other format.

```sql
insert into pods (name, status, is_active, management_hat_id, parent_hat_id)
values ('Governance', 'active', true, '0x<governance leader hat>', '0x<top hat>')
returning id;   -- NEXT_PUBLIC_GOVERNANCE_POD_ID

insert into pods (name, status, is_active, management_hat_id, parent_hat_id)
values ('Communities', 'active', true, '0x<community parent hat>', '0x<top hat>')
returning id;   -- NEXT_PUBLIC_COMMUNITY_POD_ID

insert into pods (name, status, is_active, parent_pod_id, management_hat_id, membership_hat_id, parent_hat_id)
values ('<Your first community>', 'active', true, '<communities pod id>',
        '0x<default pod leader hat>', '0x<default pod member hat>', '0x<community parent hat>')
returning id;   -- NEXT_PUBLIC_DEFAULT_POD_ID
```

Put the script copies of two hat ids in `.env` as well:
`EXECUTIVE_POD_LEADER_HAT_ID` (the governance leader hat) and `MEMBER_HAT_ID`
(the default pod member hat).

## 6. Contracts

There is no one-command deployment. About half the contracts have a script in
`scripts/deploy/`; the rest are deployed by hand with Hardhat
(`npx hardhat compile`, sources in `src/contracts/`) or Remix (compiler 0.8.26,
optimizer 200 runs, EVM `cancun`). Do them in this order, because later
contracts take earlier addresses as constructor arguments. Put each address in
`.env` as you go.

`src/contracts/treasury-deploy/` holds byte-identical copies of five treasury
contracts, so use fully qualified names with Hardhat
(`src/contracts/PodTreasuryV3.sol:PodTreasuryV3`).

| # | Contract (`src/contracts/`) | How | Constructor | Then |
|---|---|---|---|---|
| 1 | `SystemToken` | by hand | `(initialSupply, executiveAddress, hats, governanceLeaderHatId)` | → `NEXT_PUBLIC_SYSTEM_TOKEN` |
| 2 | `SelfToken` | by hand | `(initialSupply, initialMinter)` | → `NEXT_PUBLIC_SELF_TOKEN` |
| 3 | `ProofOfCuriosityV2` | by hand | `(owner, baseURI)` | `setMinter(BACKEND_SMART_WALLET_ADDRESS)` → `NEXT_PUBLIC_PROOF_OF_CURIOSITY` |
| 4 | `AdvocateV2` (voting token) | by hand | `(owner, baseURI)` | `setMinter(admin EOA)` → `NEXT_PUBLIC_ADVOCATE` |
| 5 | `DAOTimelock`, then `DAOGovernor` | by hand | Timelock `(minDelay, proposers, executors, admin)`; Governor `(AdvocateV2, timelock, name, votingDelay, votingPeriod, threshold, quorumPercent)` | Grant the Governor the proposer and canceller roles on the Timelock. The voting token must be AdvocateV2; SystemToken has no votes extension. |
| 6 | `BountyManagerV5` | `scripts/deploy/deploy-bounty-manager-v5.cjs` | `(hats, SYSTEM, SELF)`; the deployer becomes its permanent admin | Must exist before step 7: the treasury factory takes it and has no setter. |
| 7 | `PodTreasuryFactoryV3`, `TreasuryProxy`, `PodTreasuryDeployerV3` | by hand | Factory `(hats, [SYSTEM, SELF], owner, proxyPlaceholder, bountyManager)`; Proxy `(factory, owner)`; Deployer `(hats, factory, topHatDomain, owner)` | Deploy the factory with any non-zero placeholder for the proxy, then the proxy, then the deployer. Run `node scripts/deploy/wire-treasury-factory.mjs`, which points the factory at the real proxy and deployer and the other contracts at the factory. Set both `NEXT_PUBLIC_POD_TREASURY_FACTORY` and `..._FACTORY_V3` to the factory. |
| 8 | `PodAuthProxy` (template), then `PodAuthorizationFactory` | by hand | Factory `(template)` | → `NEXT_PUBLIC_POD_AUTH_FACTORY`. Pod creation fails without it. |
| 9 | `PodCreationManagerV2` | by hand | `(hats, communityParentHatId, governanceLeaderHatId, treasuryFactory, [SYSTEM, SELF], owner)` | Mint the community-parent hat to it. Optionally `node scripts/ops/set-max-pods-per-creator.mjs`. |
| 10 | $SELF: `SelfReceipt`, `SelfEpochsV2`, `SelfMinter`, `SelfPaymentV2`, `SelfPrestige` | by hand ([`runbook-self-decay-deploy.md`](runbook-self-decay-deploy.md)) | see the runbook | Role grants in the runbook. Check with `node scripts/deploy/verify-self-roles.mjs`. Optional: the $SELF features stay off without them. |
| 11 | `EventManagerV2` | by hand ([`runbook-eventmanager-v2-deploy.md`](runbook-eventmanager-v2-deploy.md)) | `(hats, eventManagementHatId, SYSTEM, selfReceipt)` | Grant it `FULFILLER_ROLE` on SelfReceipt. |
| 12 | `PurchaseRouterDecentralized` | by hand | `(SYSTEM, SELF, hats, treasuryFactory)` | Marketplace. `PurchaseRouter`, `PurchaseBurn` and `TokenClaim` are optional. |
| 13 | `HatMinter` | `scripts/deploy/deploy-hat-minter.cjs` | `(hats, MEMBER_HAT_ID, EXECUTIVE_POD_LEADER_HAT_ID, owner)` | Mint it the default pod leader hat and the governance leader hat. Run `npx tsx scripts/deploy/authorize-backend-caller.ts` (authorizes both server wallets), then `verify-hat-minter-setup.ts`. |
| 14 | `AgentRegistry`, then `PodEligibilityModule` | `deploy-agent-registry.cjs`, `deploy-pod-eligibility-module.cjs` | see the scripts | `attach-pod-eligibility.mjs` attaches the module to existing hats. Hats the app creates later do not get it automatically; re-run the script. "Remove member" needs it. |
| 15 | `LedgerAnchor` | `deploy-ledger-anchor.cjs` | `(owner)` | Set `LEDGER_ANCHOR_OWNER` to the admin EOA; the weekly job signs with it. |

The runbooks under `docs/` and `src/guides/deployment/` were written for the
reference deployment and quote its addresses and hat ids. Read them for the
steps, and substitute your own values.

When the addresses are in `.env`:

1. `node scripts/deploy/verify-env-vars.mjs` fails on any address without
   contract code.
2. Add the static contracts members call to the **CDP paymaster allowlist**:
   the Hats contract and module factory, HatMinter, PodCreationManager and its
   factory, TreasuryProxy, BountyManager, EventManager and the $SELF contracts
   (the list is `STATIC_WHITELIST` in `src/app/api/paymaster/route.ts`).

## 7. Configure and deploy the app

1. Copy `.env.example` to `.env` and fill in everything above. `npm run
   check:env` lists any required value that is missing or malformed. The
   production build runs the same check and stops if it fails.
2. Set the identity values: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME`,
   `NEXT_PUBLIC_ORG_NAME`, `NEXT_PUBLIC_ORG_EIN`, `NEXT_PUBLIC_CONTACT_EMAIL`,
   `NEXT_PUBLIC_SUPPORT_EMAIL`, `EMAIL_FROM` (a sender on a domain you have
   verified in Resend).
3. Generate the shared secrets with a random generator
   (`openssl rand -hex 32`): `CRON_SECRET`, `EVENT_QR_SECRET`,
   `INTERNAL_API_KEY`, `INTERNAL_API_SECRET`. For push notifications, generate
   a VAPID key pair (`npx web-push generate-vapid-keys`).
4. Set `NEXT_PUBLIC_INVITE_BOOTSTRAP_WALLETS` to your own wallet so you can
   join without an invite code. Remove it once invitations work.
5. Create the host project, add every variable from `.env`, and deploy.
   On Vercel, the scheduled jobs in `vercel.json` are picked up automatically
   and call `/api/cron/*` with `Authorization: Bearer $CRON_SECRET`. On another
   host, call the same paths on the same schedule with that header. The jobs
   are described in [`cron-jobs-catalog.md`](cron-jobs-catalog.md).
6. Optional services, each switched on by setting its variables:
   - **Video**: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
     `NEXT_PUBLIC_LIVEKIT_URL`.
   - **AI**: `ANTHROPIC_API_KEY` for the Sensemaker and community agents,
     `OPENAI_API_KEY` for thread summaries, and Pinecone (`npm run
     pinecone:setup`, then `npm run embed:docs`). Agent accounts sign in as
     `<wallet>@AGENT_EMAIL_DOMAIN`. Pick a domain you control, and do not change
     it once agents exist.
   - **Donations**: the Stripe keys and webhook secrets. Create two Stripe
     webhook endpoints, `/api/webhooks/stripe` (signed with
     `STRIPE_SYSTEM_WEBHOOK_SECRET`) and `/api/webhooks/stripe-direct`
     (`STRIPE_DIRECT_DONATION_WEBHOOK_SECRET`).

## 8. Check it

Run the checks against your own deployment. They create throwaway accounts and
rows, then delete them, so point them only at a deployment you operate.

```bash
npm run verify:static                      # no private member data reaches a peer's browser
node scripts/deploy/verify-env-vars.mjs    # every configured address has contract code
npm run verify:exposure                    # nothing readable or callable without a session
npm run verify:session                     # sessions are issued and scoped correctly
npm run verify:authority                   # authority decisions match the chain
npm run verify:linking                     # wallet linking end to end
npm run verify:storage                     # only uploaders can overwrite or delete files
```

The suites need `NEXT_PUBLIC_APP_URL` (or `VERIFY_BASE_URL`), `VERIFY_POD_ID`
or `NEXT_PUBLIC_DEFAULT_POD_ID`, `VERIFY_EMAIL_DOMAIN` and
`AGENT_EMAIL_DOMAIN`. `.github/workflows/security-checks.yml` runs them after
each production deploy if you set the same values as repository variables.

Then sign in as a member, as you would for the first time: create a wallet,
complete onboarding, join the default pod, post in the forum, register for an
event, and open a proposal.

## Known gaps

- **Base mainnet only.** wagmi is configured for `base`, the write transport
  falls back to the public mainnet RPC, about 60 files import viem's `base`
  chain, client user operations pass `network: 'base'`, server ones pass chain
  id 8453, and the deploy scripts sign with `chain: base`. Supporting another
  network means routing all of these through `NEXT_PUBLIC_CHAIN_ID`.
- **No one-command contract deployment.** Section 6 is a manual sequence. A
  deployment script that does it end to end, including the role wiring, would
  be a valuable contribution.
- **Product copy** still says "SpiritDAO" in places.
- **Admin keys are hot.** Scheduled jobs sign with the server keys, so they
  sit in the host's environment.
- More in [`known-limitations.md`](known-limitations.md).

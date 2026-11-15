# Known limitations and design decisions

*Last updated: 2026-11-15*

This page lists behaviour that a careful reader of the code or the dated audits
under `docs/` will notice, and says whether it is a decision, a deferred item or
an open bug. Please read it before reporting something listed here. Security
problems that are **not** listed go to the address in `SECURITY.md`.

## Governance and treasury semantics (decisions)

**A pod leader can spend from the pod treasury alone.** Pod treasuries sit
behind `TreasuryProxy`, which checks that the caller wears the pod's management
hat. Two spending paths exist: `proxyDistributeTokens` (any single manager, no
approval threshold) and `proxyProposeDistribution` / `proxyApproveProposal`
(multi-manager threshold). The app currently uses the single-manager path,
because the reference deployment's pods each have one human manager and a
threshold of one adds a step without adding a check. The approvals screen is
deferred until a pod has two or more human managers. If your pods have several
leaders, wire the UI to the proposal path (`useTreasuryProposals.ts`).

**"Binding" treasury proposals are advisory.** A passed `POD_TREASURY_BINDING`
proposal is not executed on-chain automatically. When it closes, pod leaders are
notified that the transfer still has to be submitted. Automatic execution is
planned; until then, treat the binding tier as a recorded mandate.

**Missing quorum is recorded as "rejected".** For ordinary proposals,
`proposalResultEngine.ts` records any proposal that misses quorum or approval as
`rejected`. The community-agent referendum distinguishes the two. Changing the
general rule changes the meaning of past records, so it waits for a community
decision.

**Single-key custody of admin roles.** The contract admin, the top hat and the
server's signing wallet are single externally owned keys held in the server
environment, because scheduled jobs sign with them. A hardware wallet or key
service is not in place. A fork should decide its own custody model before
holding real funds; see `docs/secrets-and-key-custody.md`.

## Contract status

What is deployed in the reference deployment differs in places from the source
in `src/contracts/`. Items below are known and accepted; please do not
re-report them unless you can show impact beyond what is described.

| Item | Where | Status |
|---|---|---|
| `TokenClaim` has no pause and no cap | `TokenClaim.sol` | Source and deployed. The one item with member-loss potential (a phished approval leads to an irreversible burn). Fix planned before wider use. |
| Treasury V3 approval cap | `PodTreasuryV3.sol` | Not implemented. |
| `PodGovernanceV3.aggregateVotes` / `finalizeProposal` callable by anyone | `PodGovernanceV3.sol` | Source. They emit events from off-chain tallies; the app does not trust them for authority. |
| `MultiCriteriaEligibilityModule.setHatAdmin` callable by anyone | `MultiCriteriaEligibilityModule.sol` | Source. Harmless while no hat uses that module instance; fix before attaching it. |
| `BountyManagerV5.registerPodMetadataFor` admin bypass | `BountyManagerV5.sol` | Admin-only and metadata-only. Accepted. |
| PurchaseRouter approval revocation and O(n) loops | `PurchaseRouter*.sol` | Fixed in source 2026-08-10, not redeployed. |
| Retired contracts | `docs/archive/contracts/` | Not compiled, not deployed by new operators. |

The full findings are in `docs/contract-security-audit-2026-07-21.md`.

## Engineering debt

- **Type errors.** `next build` runs with `ignoreBuildErrors` and
  `ignoreDuringBuilds` on (type checking ran out of memory in the build).
  `npx tsc --noEmit` reports about 120 errors. Fixing them is welcome; see below.
- **Tests.** The unit suite (`npm test`) is small and green. Most features have
  no automated tests. The security behaviour is covered by the live suites in
  `scripts/verify/` (`npm run verify:*`), which need a deployment to run against.
- **Base mainnet only.** Wallet configuration, user operations and deploy
  scripts name Base mainnet directly, so testnets need code changes. See
  `docs/configuration.md`.
- **No one-command contract deployment.** `docs/SETUP.md` section 6 is a
  manual sequence.
- **Branding.** Product copy still says "SpiritDAO" in places. A public fork
  must replace the name and logo (`NOTICE.md`).
- **Content Security Policy.** `script-src` still allows `'unsafe-inline'`.
  Member HTML is sanitised before rendering (`src/lib/sanitizeHtml.ts`), so this
  is defence in depth; removing it needs per-request nonces.
- **Chat attachments** are stored in a public bucket, so anyone holding a
  file's link can open it. Members cannot list other members' files. Moving
  attachments to a private bucket with signed URLs is planned.

## Good first issues

Low-severity cleanups, safe to pick up without deep context:

1. **Delete dead server routes** that query with the public key and no longer
   return data since anonymous access was removed: `api/bounty/assignment`,
   `api/bounty/bids`, `api/bounty/permissions`, `api/chat-groups`,
   `api/pod/permissions`, `api/marketplace/products/{list,search,accessible}`.
   Check for callers first.
2. **Require a session on read-only helper routes** that currently answer for
   any wallet in the request body: `api/eligibility/verify`,
   `api/pods/[id]/eligibility`, `api/chat/everyone-permission`,
   `api/self/pod-summary`, `api/events/bulk-events-data`. Rate-limit
   `api/forum/view` and the `?force=true` re-sync on `api/proposalStates`.
3. **Remove or guard operator pages**: `/pods/demo-hats-modules`,
   `/admin/bulk-events`, `/admin/sync-pod-members`, and `/faucet` (duplicate of
   `/claims`).
4. **Security headers**: add `X-Content-Type-Options`, `Referrer-Policy`,
   `Permissions-Policy` and `frame-ancestors` in `next.config.mjs`.
5. **Privacy policy**: name Google Analytics and its sign-up event in the
   third-party list (`src/app/privacy/page.tsx`), or remove the tag.
6. **Type errors**: pick a feature folder and make it pass `tsc`.
7. **Port `src/utils/fetchTokenBalances.ts` from web3.js to viem**. It is the
   only use of web3.js, which accounts for most of the remaining `npm audit`
   findings. Token gating depends on it, so include tests.
8. **Upgrade vitest to 5** and fix the three test files that break (JSX
   transform and mocked constructors).

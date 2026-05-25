# Spec: Identity-Comparison Audit

*Status: Open / Not Yet Started*
*Created: 2026-05-25*
*Estimated: 2–3 focused days*

## Why this exists

In May 2026 we built and shipped the platform multi-wallet identity
layer ([`spec-platform-identity-multi-wallet.md`](spec-platform-identity-multi-wallet.md)).
The foundation (auth, schema, linking, foundational hooks) is now
correct: a single SpiritDAO user can hold many EVM addresses, and the
system recognizes any linked wallet as authoritative for that user.

But the platform was built before that model existed. The codebase
contains roughly 170 files that read `useEvmAddress()` from CDP,
dozens of server routes that compare `jwt.wallet_address` against a
single column, and a long tail of RLS policies that do the same. Most
of those usages were written assuming one user = one wallet. Some are
correct as-is (signing contexts genuinely need the per-device wallet).
Many are silent bugs waiting to surface the next time someone signs
in from a non-canonical device.

We hit that wall repeatedly while shipping the vault: the same root
cause appearing in eleven different places, each fixed in isolation
as users hit it. The right move now is a proactive sweep before more
users hit more of them.

## What this audit produces

1. An inventory of every place the platform compares an identity-bearing
   wallet address — client, server, and database.
2. A classification of each: signing-context (leave alone), identity-read
   (migrate), or hybrid (needs both).
3. Patches for the identity-read sites to use the canonical helpers.
4. A small set of standards / lint rules so this doesn't regrow.

## Out of scope

- Redesigning the multi-wallet model. Foundations stay as-shipped.
- Refactoring features. We're patching existing usage patterns, not
  rewriting features.
- New tests. We add a couple of regression tests against the worst
  offenders but don't try to build a comprehensive multi-wallet test
  suite (separate effort).

## Three surfaces to audit

### A. Client hooks and components

**Pattern to find:** `useEvmAddress()` callsites, plus any code that
reads `currentUser.evmAccounts[0]`.

**Pattern to apply:**

- If the address is going into `useSignEvmMessage`, `useSendUserOperation`,
  or any other CDP signing API → **leave alone** (or rename to
  `useSigningWallet()` for clarity).
- If the address is being compared against database rows, used as a
  filter key, or used to ask "is this me" → **migrate to `useUserWallet()`**.
- If both → **separate the concerns**. Use `useUserWallet()` for
  identity, `useSigningWallet()` for the signature.

**Foundational hooks already migrated:**

- `useUserWallet` (created 2026-05-24)
- `useHatPermissions`
- `useHybridPodPermission` + `useHybridPodRole`
- `useDatabaseFirstPermissions`

**Probable identity-read offenders (sample, not exhaustive):**

- `src/features/forum/hooks/useForumAccess.ts` — pod membership lookups
- `src/features/bounty/hooks/useBountyPermissions.ts`
- `src/features/events/hooks/useEventRegistrationStatus.ts`
- `src/features/marketplace/hooks/useMarketplaceManagementAccess.ts`
- `src/features/pods/hooks/usePodAccessControl.ts`
- `src/features/pods/hooks/usePodEligibilityAgreements.ts`
- `src/features/governance/hooks/useGovernanceParticipation.ts`
- `src/features/identity/hooks/useSnapshotAuth.ts`
- Every `useEvmAddress()` in `src/components/` that reads for display,
  attribution, or filtering (e.g. `PresenceTracker`, `TosModal`,
  `OnboardingHatMinting`, `UnifiedNotificationsPage`)

**Probable signing-context (leave alone):**

- `src/features/pods/components/Pod*Manager.tsx` files that wrap
  `sendUserOperation`
- `src/features/bounty/components/Bounty*Transaction.tsx` files
- `src/features/events/hooks/useEventTransactions.ts`,
  `useSimplifiedEventTransactions.ts`
- `src/wallet/components/*` files
- `src/utils/cdpTransaction.ts`

**Estimated:** ~50 files actually need to change. Most are 1–2 line
swaps.

### B. Server routes

**Pattern to find:** `getCallerWallet`, `jwt.verify`-then-extract-wallet
sites, and any `.eq('wallet_address', caller)` or `.eq('recipient_eoa', caller)`
DB queries.

**Pattern to apply:**

- For authorization (does this wallet own this resource?) → use
  `walletAuthService.authorizeOwnedWallet(req, targetWallet)`
- For "find rows where the caller is the user" (e.g. caller's wraps,
  caller's notifications, caller's votes) → look up against the
  caller's **linked wallet set**, not just the JWT's canonical.
  Use `getCallerLinkedWallets(canonical)` (currently inline in the
  vault routes; should be promoted to `walletAuthService`).
- For caller-identity logging (`accessor_eoa`, `actor`, etc.) → store
  the JWT's canonical wallet. That's the stable user identifier.

**Specific routes already migrated:**

- `/api/vault/keys` (POST) — uses `authorizeOwnedWallet`
- `/api/pods/[id]/passwords` (GET list + POST create) — linked-wallet
  wrap lookup + multi-wallet recipient resolution
- `/api/pods/[id]/passwords/[entryId]` (GET) — linked-wallet wrap
  lookup
- `/api/pods/[id]/passwords/recipients` — linked-wallet pubkey
  resolution

**Routes to audit (sample):**

- `/api/notifications/*` — recipient_wallet comparisons
- `/api/bounty/*` — bidder_wallet, claimant comparisons
- `/api/events/*` — registrant comparisons
- `/api/forum/*` — author comparisons
- `/api/marketplace/*` — buyer / seller comparisons
- `/api/pods/[id]/applications/*` — applicant comparisons
- `/api/pods/[id]/treasury/*` — destination / authority comparisons
- `/api/community-agent/*` — pod-membership reads
- `/api/conference/*` — participant identity for LiveKit tokens
- `/api/cron/*` — server-initiated; usually doesn't apply but worth
  spot-checking the bounty + event reminder scans

**Estimated:** ~30 routes need changes. About half are simple swaps
(use the helper). The other half need a small bit of design — "what
should this route do when the caller has multiple linked wallets but
the resource was written under just one?"

### C. RLS policies (Supabase)

**Pattern to find:** RLS policies comparing
`auth.jwt() ->> 'wallet_address'` (or `auth.uid()` in unusual cases)
against a column.

**Pattern to apply:**

```sql
-- Before
USING (some_column = LOWER(auth.jwt() ->> 'wallet_address'))

-- After (when "any of the user's wallets" should match)
USING (
  some_column IN (
    SELECT wallet_address FROM user_wallets
    WHERE user_id = (auth.jwt() ->> 'sub')::uuid
  )
)
```

This is the most invasive surface. RLS changes need:

- Phased rollout: add the new check as an `OR` alongside the old, then
  drop the old once verified
- Performance check: the subquery should index-scan against
  `user_wallets_user_id_idx`; cost is small but real per row
- Migration ordering: every existing canonical wallet must have a
  `user_wallets` row before the new check goes live (the
  `20260524000001_user_wallets.sql` migration backfilled this; verify
  on production before swapping policies)

**RLS files to audit:**

- `supabase/migrations/20260126000004_add_knowledge_base_rls.sql`
- `supabase/migrations/20260122000003_fix_pod_role_permissions_rls_cdp*.sql`
- `supabase/migrations/20260122000000_create_pod_level_proposals.sql`
- `supabase/migrations/20260523000002_vault_rls.sql` (vault — recently
  added; uses single-wallet check)
- Probably 8–12 more RLS-defining migrations

**Estimated:** ~20 RLS policies need updating. Cost per policy is
small (one OR clause); the real cost is testing each one doesn't
regress.

## Phasing

### Phase 1 — Client hooks (1 day)

Migrate identified identity-read callsites to `useUserWallet`. Lower
risk because most callsites read through one of the already-migrated
foundational hooks anyway; the patches are surgical.

Acceptance: on a non-canonical-wallet session (mobile or incognito),
every feature that previously worked on canonical should now work
identically. The 12 files flagged as on-chain action triggers should
either work (linked) or surface a clear linking prompt.

### Phase 2 — Server routes (1 day)

Promote `getCallerLinkedWallets` from the vault routes into
`walletAuthService`. Migrate the ~30 routes. Reuse
`authorizeOwnedWallet` for authorization checks.

Acceptance: every API route that compares wallets handles linked
wallets correctly. Quick smoke test of high-traffic routes (chat,
forum, pods, treasury) under a mobile session.

### Phase 3 — RLS (0.5 day)

Add OR-fallback policies. Keep the old single-wallet check live
alongside the linked-wallet check. Plan a Phase 4 cleanup (months
later) once we've validated.

Acceptance: RLS regression tests pass. Anon reads still return 0
rows. Cross-user reads still return 0 rows. Same-user reads return
expected rows regardless of which linked wallet the JWT carries.

### Phase 4 — Standards + lint (0.5 day)

- An ESLint rule (custom) that flags `useEvmAddress()` outside of
  designated signing files. Files that genuinely need it can add a
  `// signing-context-ok` comment to opt out.
- A code comment style: every wallet comparison gets a one-line
  intent annotation: `// identity-check` or `// signing-binding`.
  Helps future audits.
- A short paragraph added to the contributor docs.

Acceptance: a new feature can't accidentally regress to the
single-wallet pattern without the lint rule complaining.

## Risks

- **RLS performance regression.** Subqueries against `user_wallets`
  on every read are cheap but additive. If we apply the OR pattern
  to a hot table (e.g. `notifications`), there could be a noticeable
  cost. Mitigate by index-checking each policy change and load-testing
  the highest-traffic ones.
- **Hidden assumption surfaces.** The audit will likely find weird
  patterns we don't have a clean answer for ("this code stored a hash
  derived from the wallet; if the user now has multiple, what does it
  mean?"). Track these as follow-up specs rather than blocking the
  audit.
- **Test fragility.** Existing tests were written assuming a single
  wallet. Some may break in confusing ways once the production code
  starts looking at the linked set. Fix tests as encountered, don't
  defer.

## What we explicitly will NOT do

- Migrate every `useEvmAddress()` call. Many are correct usage (signing).
- Rewrite features. The audit is identity-comparison surgery; behavior
  stays the same.
- Add a comprehensive multi-wallet test suite. That's a separate
  initiative.
- Drop the OR-fallback in RLS during the audit. That's Phase 4
  cleanup, done weeks later after observing production.

## Success criteria

- A user signing in on a brand-new device (any browser, any auth
  method) can use every feature they could use on their canonical
  device, with no manual intervention except the one-time linking
  step.
- Newly-shipped features automatically inherit multi-wallet
  correctness because they use the standard hooks/helpers.
- The next time we add a new permission or feature flag, we don't
  hit the same class of bug.

## Related docs

- [spec-platform-identity-multi-wallet.md](spec-platform-identity-multi-wallet.md) — the active identity model
- [authentication-and-session-model.md](authentication-and-session-model.md) — how JWTs carry the canonical wallet
- [role-permissions-design-philosophy.md](role-permissions-design-philosophy.md) — how permissions chain through identity
- [password-vault-architecture.md](password-vault-architecture.md) — the feature that surfaced the gap and ate the most repair work

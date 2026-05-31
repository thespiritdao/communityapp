# TreeGens Integration — Generic Per-Pod Token Eligibility Gate

*Last updated: 2026-05-30*
*Status: implemented (launch path); Hydrex + MGRO are seams/future*

## Why this exists

TreeGens is an existing, token-native DAO ($TGN on Base) onboarding as a SpiritDAO
anchor community — and the first instance of a pattern we expect to replicate for
other communities. Per the onboarding conversation (`TreeGens __ SpiritDAO.md`,
5/21), the approved governance model for launch is **role-eligibility / 1-person-
1-vote**, not token-weighted ("launch with your existing form & grow towards a dual
voting model in future"). A member who holds **≥ 2,000 $TGN** qualifies for a
**Verifier** role; that role grants one vote.

The gap this closed: SpiritDAO's eligibility framework already had the *data model*
to gate a pod role on an arbitrary token balance, but its *execution path* was
hardcoded to platform tokens ($SYSTEM/$SELF/PoC/HATs). Any other contract address
was rejected as "not configured." This work makes the gate **generic and decimal-
aware** so any registered community ERC-20 can gate a role/vote — with guardrails
that keep third-party tokens **governance-only**.

## 501(c)(3) guardrails (enforced in code, not just convention)

Third-party community tokens are **governance signals only** — never issued, held,
swapped, or custodied by the platform.

- **`tokens.gating_enabled` flag (default FALSE):** a token can gate a role/vote
  ONLY when an admin explicitly blesses it. A newly registered token gates nothing
  until deliberately enabled.
- **`tokens.owner_pod_id` (community scope):** a community token is offered ONLY
  inside its owning pod. `owner_pod_id = <pod>` → selectable only in that pod (e.g.
  $TGN for TreeGens); `NULL` → platform-wide. So $TGN never appears in another
  community's governance settings. The criteria builder filters to
  `owner_pod_id IS NULL OR owner_pod_id = <this pod>`.
- **No free-text address entry in the leader UI:** the criteria builder's
  "community governance token" selector lists ONLY `gating_enabled` ERC-20s from
  the registry. A leader cannot paste an arbitrary/speculative token.
- **Registration is admin-only and deliberate** (a backend script, like
  `registerAdvocateToken`). There is no self-serve "create my token" path anywhere.
- **Display is a labeled eligibility signal**, pod-scoped, with no buy/swap/transfer
  affordance (`PodGovernanceTokenBalance`).

## Architecture: why governance code needed zero changes

Eligibility is a **one-time admission gate, not a per-vote check**. Approval-time
enforcement (`ApproveApplicationButton.checkApplicantEligibility` →
`EligibilityService.checkUserEligibility`) gates HAT minting. Governance vote-
eligibility (`podGovernanceConfigService.getEligibleVoterWallets`) is gated purely
by `active_pod_members` membership + the role's `governanceParticipation`
permission — it does **not** re-check criteria.

So: gate the Verifier role on $TGN ≥ 2000, give it `governanceParticipation: true`,
and the existing governance-flexibility layer auto-confers vote eligibility once the
hat is held. The result engine and config service are untouched.

**Server-side enforcement (added with this work):** the happy path was correct, but
vote-casting and proposal-creation were previously gated client-side only (the UI
hides the control). For a token-governance community that is an integrity gap — a
direct API call could persist a vote/proposal from a wallet without the role. So
`governanceService.submitVote` now re-checks `getEligibleVoterWallets(pod, tier)`
server-side before persisting a pod-level vote, and `createPodLevelProposal` requires
the creator to hold a governance-participating role. This makes "hold ≥2K $TGN →
Verifier → one vote" actually enforced, not merely suggested. Voting remains strictly
1-person-1-vote (no token weighting).

## What changed (code)

| File | Change |
|---|---|
| `supabase/migrations/20260530000001_add_token_decimals.sql` | `tokens` gains `decimals`, `minimum_balance`, `gating_enabled` (default FALSE) |
| `src/services/ScalableTokenService.ts` | `TokenInfo.token_type` adds `'erc20'` + optional `decimals`; new `erc20` `balanceOf` branch in `checkTokenBalance` (returns raw wei) |
| `src/features/pods/services/EligibilityService.ts` | `evaluateTokenBalance` falls back to the registry for non-platform addresses via new `evaluateRegisteredErc20Balance` (decimal-aware threshold); `evaluateStaking` wired to the Hydrex seam (disabled) |
| `src/features/pods/services/hydrexStakingService.ts` (new) | Hydrex staking source — STUB, `HYDREX_STAKING_ENABLED=false`, pool addresses captured |
| `src/features/pods/components/EligibilityCriteriaBuilder.tsx` | Loads `gating_enabled` ERC-20s; renders constrained "community governance token" selector + minimum-amount in the Currency form |
| `src/features/pods/components/PodGovernanceTokenBalance.tsx` (new) | Read-only, pod-scoped governance-eligibility balance chip |
| `src/scripts/registerTgnToken.mjs` (new) | Registers $TGN (reads decimals on-chain; sets `gating_enabled: true`) |
| `src/features/governance/services/governanceService.ts` | Server-side eligibility re-check in `submitVote`; creator-role check in `createPodLevelProposal` |
| `src/features/governance/components/EnhancedVoteButton.tsx` | Clearer "why you can't vote" message for ineligible members |

## Operational runbook (launch TreeGens)

1. **Apply migration** `20260530000001_add_token_decimals.sql` (Supabase SQL editor).
2. **Register $TGN** — confirm the canonical $TGN ERC-20 contract on Base with
   TreeGens (the doc gives Hydrex *pool* addresses, NOT the token address), then:
   ```
   TGN_TOKEN_ADDRESS=0x<tgn_on_base> node src/scripts/registerTgnToken.mjs
   ```
   The script reads `decimals()` on-chain and sets `gating_enabled: true`.
3. **Create the TreeGens pod** via the existing Option-D flow. Then scope $TGN to
   it: set `tokens.owner_pod_id = <treegens pod uuid>` (UPDATE in Supabase, or re-run
   the register script with `OWNER_POD_ID=<uuid>`). Until scoped, $TGN is platform-
   wide (owner_pod_id NULL).
4. **Create the Verifier role** in `UnifiedMembershipManager`; set
   `governanceParticipation: true`.
5. **Add the eligibility criterion** in `EligibilityCriteriaBuilder` → Currency:
   under "Community governance token", select **$TGN**, minimum amount **2000**.
6. **Confirm pod governance config** (quorum/approval/voting period) via
   `GovernanceSettingsCard`.
7. **(Optional) Display:** render `<PodGovernanceTokenBalance walletAddress={...} />`
   in the pod member surface. Pass the current user's address from the identity hook
   (`useUserWallet` per `authentication-and-session-model.md` — NOT `useEvmAddress`).
   The chip self-hides unless a `gating_enabled` token exists and a balance reads.

## Open items

- **$TGN contract address + decimals** — confirm canonical token contract on Base
  before running the registration script (decimals are read on-chain; address is not
  knowable from the repo).
- **Hydrex (blocking for that source only):** the Hydrex endpoint returns **LP-pool
  positions** (AZUSD/TGN, USDC/TGN), not a clean per-wallet *staked* $TGN figure. LP
  exposure ≠ staked governance snapshot. Before enabling `hydrexStakingService`,
  confirm with Hydrex **which number is the governance snapshot**. Launch does not
  depend on this — direct on-chain balance (source #1) is the launch gate.
- **SD-native staking (future):** the `staking` criterion type is the drop-in slot
  when SpiritDAO builds native staking (roadmap). Same seam, no re-architecture.
- **Dual voting (future):** token-weighted voting is explicitly Phase 2+ per the
  TreeGens agreement; not built.

## Replicating for other communities

Zero new code. For community X with token $XYZ on Base:
1. Register $XYZ via the same script pattern (set `gating_enabled: true`).
2. Create their pod + role; add a Currency criterion selecting $XYZ + threshold.
The generic ERC-20 path + registry-driven selector handle the rest.

## Related

- `governance-flexibility-layer-a-2026-05.md` — the per-pod governance config this
  plugs into (untouched by this work).
- `pods-architecture-overview.md`, `role-permissions-design-philosophy.md`.
- `spec-treegens-planting-verification.md` — Phase 2 MGRO workflow.

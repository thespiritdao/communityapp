# SpiritDAO: Governance & Pods (Developer Documentation)

> **Audience:** developers, integrators, and technical evaluators. This document
> covers the governance model and the Pod (self-governing sub-community)
> lifecycle.
>
> **Scope note:** This is public-safe documentation. Contract addresses below are
> already public on Base. It deliberately omits security-sensitive internals
> (row-level-security policies, admin-only flows, and exact authorization-gate
> logic). For the permission primitive these all build on, see "Hats Protocol" in
> `00-architecture-overview.md`.

---

## The 3-tier governance model

Not every decision belongs on-chain. A routine "approve this member" vote should
not cost a timelock cycle, and a constitutional change should not be a casual DB
write. SpiritDAO splits governance into **three tiers**, each with a different
home for the vote and the execution.

The tier of a proposal is **enforced at two layers**: a database `CHECK`
constraint on the proposal row, and the `proposalResultEngine.ts` service that
decides how a passed proposal is executed.

| Tier | Vote lives | Execution | Electorate | Window |
|------|-----------|-----------|-----------|--------|
| **DAO_CONSTITUTIONAL** | On-chain (Governor) | On-chain via timelock | All **Advocate** holders | 7-day vote + timelock |
| **POD_TREASURY_BINDING** | DB vote | If passed, an **on-chain execution tx** is submitted | Pod electorate | Per-pod config |
| **POD_OPERATIONAL** | DB only | DB only, **never on-chain** | Pod electorate | Per-pod config |

- **DAO_CONSTITUTIONAL**: DAO-wide changes. A standard on-chain Governor vote
  (`DAOGovernor.sol`), open to all Advocate-tier holders, 7-day voting period,
  and **timelock execution** before the change lands. The **Advocate** credential
  is an `ERC721Votes` NFT (`AdvocateV2`) that **auto-delegates on mint**, so a new
  holder's voting power is live immediately with **no separate delegate
  transaction** (see `02-onchain-and-contracts.md`).
- **POD_TREASURY_BINDING**: decisions that move pod funds. The vote happens in
  the database (fast, gasless to participate); **only if it passes** does an
  on-chain execution transaction get submitted. This is the bridge tier: DB vote,
  on-chain effect.
- **POD_OPERATIONAL**: routine coordination (role approvals, scheduling, internal
  decisions). **DB-only, never touches chain.**

**Quorum and approval thresholds are configurable per pod** (see
`podGovernanceConfigService.ts`), within the system's guardrails.

> **Drift note:** for POD_TREASURY_BINDING the DB tally is authoritative until the
> on-chain execution lands. This is the "two sources of truth, reconciled" pattern
> from the overview: the feature documents which side wins at each step.

---

## Pod creation: the "Option D" flow

Creating a pod means minting new **Hats Protocol** roles, which normally requires
the caller to *already* hold the parent hat (a chicken-and-egg problem, since no
member holds `COMMUNITY_PODS_PARENT`). "Option D" solves it by putting the parent
hat inside a contract that anyone can call.

- **Contract:** `PodCreationManagerV2`, `NEXT_PUBLIC_POD_CREATION_MANAGER`
  (`0x086eD4...`), source `src/contracts/PodCreationManagerV2.sol`.
- The contract **holds the `COMMUNITY_PODS_PARENT` hat** and creates child hats
  **internally** on the caller's behalf.

The lifecycle:

```
createPodProposal()           ← permissionless; anyone may propose a pod
   │
   ▼  emits PodProposed(managementHatId)
48-hour veto window           ← Exec can veto during this window
   │
   ▼  (no veto) → permissionless finalize
pod active
```

- `createPodProposal()` is **permissionless**: anyone can propose.
- It emits **`PodProposed(managementHatId)`** carrying the new management hat id.
- A **48-hour veto window** follows, during which the **Exec** pod may veto.
- After the window, **finalize is permissionless** (anyone can trigger it) and the
  pod goes live.

**DB status path:** `pending_review` → `active`.

API: `src/app/api/pods/create/route.ts` (proposal),
`src/app/api/pods/review/route.ts` (Exec veto/review).

---

## Hat-based roles

Every pod has **two hats**:

| Hat | Held by | Stored as |
|-----|---------|-----------|
| **management_hat_id** | leaders / admins | a hat id |
| **membership_hat_id** | members | a hat id |

Each role's hat id lives in **`pod_role_permissions.token_address`**, alongside a
**`permissions` JSONB** column describing what that role may do, e.g.:

```jsonc
{
  "governanceParticipation": true,
  "memberManagement": true,
  "forumModeration": false
  // ... etc
}
```

**Membership is derived from on-chain hat ownership** via the
**`active_pod_members`** view (i.e. "who wears this pod's membership hat right
now").

> **There is NO `pod_role_assignments` table.** Role membership is *not* a stored
> assignment list; it is computed from hat ownership against
> `pod_role_permissions`. Code that assumes a `pod_role_assignments` table is
> wrong and will error.

---

## Hat ID resolution

Hat ids are **resolved from the database**, never hardcoded, so a hat tree can be
redeployed by updating one table (see `00-architecture-overview.md`).

| Side | Module | How |
|------|--------|-----|
| **Server** | `src/lib/hatRegistry.ts` | Maps `HatKey` → `(pod_id, role_name)` → `pod_role_permissions.token_address` |
| **Client** | `src/lib/hatRegistryClient.ts` | A sync store **populated at boot** from `GET /api/hat-registry` (~5-min cache) |

The public `GET /api/hat-registry` endpoint requires no auth and is cached; the
client registry initializer loads it once at startup so client code can resolve
hat ids synchronously.

---

## Key files

```
src/features/governance/hooks/useEnhancedProposals.ts        # aggregates all 3 tiers
src/features/governance/services/governanceService.ts        # vote submission, pod-level proposals
src/features/governance/services/proposalResultEngine.ts     # tier-aware execution of passed proposals
src/features/pods/services/podGovernanceConfigService.ts     # per-pod quorum / approval config

src/app/api/pods/create/route.ts                             # createPodProposal entry
src/app/api/pods/review/route.ts                             # Exec veto / review

src/contracts/DAOGovernor.sol                                # DAO_CONSTITUTIONAL on-chain Governor
src/contracts/PodCreationManagerV2.sol                       # Option D pod creation
src/contracts/PodTreasuryV3.sol                              # hat-gated pod treasury
```

---

## Where to go next

- **`00-architecture-overview.md`**: the four cross-cutting patterns
- **`02-onchain-and-contracts.md`**: Base, Hats, contract registry, paymaster
- **`03-tokens-and-treasury.md`**: $SYSTEM, $SELF, treasuries, burn-to-pay

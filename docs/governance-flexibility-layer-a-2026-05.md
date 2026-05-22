# Pod Governance Flexibility — Layer A + B Technical Documentation

**Originally shipped:** 2026-05-21
**Last revised:** 2026-05-22 (Layer B shipped — DAO Governor parameters tunable via proposal)
**Status:** Production
**Roadmap item:** [#4 — Governance Quorum + Voting Flexibility](roadmap-action-items-2026-05.md)

---

## 1. What this is

**Layer A** makes pod-level governance configurable per pod. Four knobs per tier (voter base, quorum %, approval %, voting period), with platform-set defaults and bounded floors. Per-proposal stricter overrides allowed; weakening below the pod default is not. Governance itself is a toggleable module — pods that delegate decisions to a parent (or simply don't run their own proposals) can turn it off without affecting any other capability.

**Layer B** makes the DAO-wide on-chain Governor's parameters (voting delay, voting period, quorum %) tunable via DAO proposal. No contract redeploy required — the deployed Governor already inherits OZ's `GovernorSettings` and `GovernorVotesQuorumFraction`, exposing the necessary setters guarded by `onlyGovernance`. Layer B is a UI surface that helps Exec Pod leaders construct a DAO proposal whose calldata invokes those setters.

### Revision history

The feature shipped iteratively as design assumptions surfaced during testing:

| Revision | What changed | Why |
|---|---|---|
| Initial Layer A (2026-05-21) | Three knobs per tier (quorum/approval/voting period). OPERATIONAL hardcoded leaders-only; TREASURY_BINDING all members. | Recommended default: routine ops handled by leaders to avoid governance fatigue. |
| Path B (2026-05-22) | Voter base became per-pod-configurable, defaulting to all_members for both tiers. Leaders-only is opt-in. | Surfaced during a missing-notification investigation: hardcoding the audience broke the principle "pods are self-governing." |
| Module toggle (2026-05-22) | Governance became a toggleable module (`pod_modules.governance_enabled`). Settings card moved from public pod page to the leader-only Modules panel. | Pod settings shouldn't live on member-facing surfaces, even gated. Sub-pods may delegate governance; the toggle makes that explicit. |
| Server-side enforcement (2026-05-22) | `createPodLevelProposal` and `notifyEligibleVoters` both check `isPodGovernanceEnabled` server-side. | Defense in depth: the UI dropdown filter was the only enforcement before this. |
| Layer B (2026-05-22) | DAO-wide Governor params tunable via proposal. New `DAOGovernanceSettingsCard` lives inside the Exec Pod's Governance module config. No contract redeploy — used the deployed Governor's pre-existing `GovernorSettings` setters. | Doing this before any community formally onboards avoids the migration headache that would come later. |

---

## 2. Architecture

### Data model

Four tables touched, plus a new pure helper module.

**`pods`** — eight new columns, two per (tier × knob group):

| Column | Type | Range / Values | NULL = |
|---|---|---|---|
| `gov_op_quorum_bps` | INTEGER | 2000–10000 | platform default (30%) |
| `gov_op_approval_bps` | INTEGER | 5001–10000 | platform default (50.01%) |
| `gov_op_voting_hours` | INTEGER | 12–720 | platform default (72h) |
| `gov_op_voter_base` | TEXT | `'leaders'` \| `'all_members'` | platform default (`all_members`) |
| `gov_treasury_quorum_bps` | INTEGER | 2000–10000 | platform default (50%) |
| `gov_treasury_approval_bps` | INTEGER | 5001–10000 | platform default (66%) |
| `gov_treasury_voting_hours` | INTEGER | 12–720 | platform default (72h) |
| `gov_treasury_voter_base` | TEXT | `'leaders'` \| `'all_members'` | platform default (`all_members`) |

NULL distinguishes "never configured" from "explicitly chose the default value." The service layer null-coalesces at read time.

**`pod_modules`** — one new column:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `governance_enabled` | BOOLEAN | TRUE | Module toggle: when false, pod-level proposal creation is blocked server-side; existing proposals continue to display and close cleanly. |

Default TRUE preserves backward compatibility — every existing pod retains governance enabled.

**`pod_level_proposals`** — three new columns for member-vote proposals:

| Column | Type | Purpose |
|---|---|---|
| `approval_threshold_bps` | INTEGER (5001–10000) | Effective approval threshold at row creation |
| `quorum_threshold_bps` | INTEGER (2000–10000) | Effective quorum threshold at row creation |
| `eligible_voter_count` | INTEGER | Snapshot of eligible-voter count at row creation |

NULL on all three flags a pre-PR row → grandfathered to simple-majority semantics at close-out.

**`pod_deletion_proposals`** — one new column for the leader-multisig deletion flow:

| Column | Type | Purpose |
|---|---|---|
| `approval_threshold_bps` | INTEGER (5001–10000) | Effective approval threshold at row creation |

(Original audit referenced a generic `pod_governance_proposals` table that doesn't exist in the live DB; the real leader-multisig flow used in production is deletion-specific.)

### Resolution engine

`src/features/governance/services/proposalResultEngine.ts` — pure module, no DB or network imports. Single export:

```ts
determineProposalResult(
  tally: { for, against, abstain, total },
  podConfig: { approval_bps, quorum_bps, voting_hours },
  proposalOverride: { approval_bps?, quorum_bps? } | null,
  tier: 'POD_OPERATIONAL' | 'POD_TREASURY_BINDING' | 'DAO_CONSTITUTIONAL',
  eligibleVoters: number,
): {
  result: 'approved' | 'rejected',
  quorumMet: boolean,
  approvalMet: boolean,
  requiredQuorum: number,
  requiredApproval: number,
  effectiveApprovalBps: number,
  effectiveQuorumBps: number,
}
```

**Logic:**
1. `effectiveApproval = max(podConfig.approval_bps, override?.approval_bps ?? 0)`, clamped to [5001, 10000].
2. `effectiveQuorum = max(podConfig.quorum_bps, override?.quorum_bps ?? 0)`, clamped to [2000, 10000].
3. `requiredQuorum = ceil(eligibleVoters × effectiveQuorum / 10000)`.
4. `quorumMet = tally.total >= requiredQuorum`.
5. Abstentions excluded from approval denominator: `forPlusAgainst = tally.for + tally.against`.
6. `requiredApproval = ceil(forPlusAgainst × effectiveApproval / 10000)`.
7. `approvalMet = forPlusAgainst > 0 && tally.for >= requiredApproval`.
8. `result = quorumMet && approvalMet ? 'approved' : 'rejected'`.

**Edge cases handled:**
- Zero eligible voters → quorum trivially met, approval check determines outcome.
- Zero votes total → quorum fails (unless eligible is also zero).
- All votes abstain → approval fails (forPlusAgainst is zero).
- Override below floor → silently clamped to floor; surfaces in `effectiveApprovalBps`/`effectiveQuorumBps` so caller can detect.

Used in two places: server-side at proposal close-out (`ipfsAggregationService`) and client-side in `ProposalModal` for live status display. Same math everywhere, no risk of drift.

### Config service

`src/features/pods/services/podGovernanceConfigService.ts` — wraps the new pod columns:

- **`getPodGovernanceConfig(podId)`** — reads the 8 columns, null-coalesces against `PLATFORM_DEFAULTS`, returns a fully resolved `{ operational: TierConfig, treasury: TierConfig }` object where each `TierConfig` includes `voter_base`.
- **`getVoterBaseForTier(config, tier)`** — convenience accessor for the per-tier voter_base setting.
- **`updatePodGovernanceConfig(podId, tier, partial)`** — validates ranges and voter_base enum values before write; throws on out-of-range values.
- **`getEligibleVoterWallets(podId, tier)`** — the canonical "who can vote" query. Two joins:
  - `active_pod_members` filtered by `pod_id` (and `membership_type IN ('leader','admin')` if `voter_base = 'leaders'`).
  - `pod_role_permissions` filtered by `is_active = true` AND `permissions->>'governanceParticipation' = 'true'`.
  - Returns the intersection — every wallet that is BOTH in the audience AND has the role permission.
- **`getEligibleVoterCount(podId, tier)`** — delegates to `getEligibleVoterWallets` so denominator and recipient set stay in lockstep.

`PLATFORM_DEFAULTS` constants (Path B, 2026-05-22):

```
POD_OPERATIONAL:       quorum=3000 (30%), approval=5001 (50.01%), voting=72h, voter_base=all_members
POD_TREASURY_BINDING:  quorum=5000 (50%), approval=6600 (66%),    voting=72h, voter_base=all_members
```

### Permission hierarchy

Three independent gates form an AND-chain. A user can vote on a pod-level proposal only if all three are true:

```
1. pod_modules.governance_enabled = TRUE         (module gate)
2. user is in the voter_base audience            (audience gate)
   ├─ voter_base = 'all_members': active pod_member of any membership_type
   └─ voter_base = 'leaders':     active pod_member with membership_type IN ('leader','admin')
3. user's role has governanceParticipation = TRUE (permission gate, highest order)
```

Gate 1 is set in the leader Modules panel. Gate 2 is set in the same Governance settings card (per tier). Gate 3 is set per-role in `pod_role_permissions` and represents the "individual key" that lets a specific role into the audience defined by gates 1+2.

### Flow: creating a member-vote proposal

```
CreateProposalForm
    │
    ▼
GovernanceService.createPodLevelProposal({
  pod_id, governance_tier, approval_threshold_override_bps?, ...
})
    │
    ├──► getPodGovernanceConfig(pod_id)
    ├──► getEligibleVoterCount(pod_id, tier)
    ├──► Validate override >= pod default (throws if weaker)
    ├──► Compute effectiveApprovalBps = max(default, override ?? 0)
    ├──► Compute effectiveQuorumBps   = max(default, quorumOverride ?? 0)
    └──► INSERT pod_level_proposals {
            approval_threshold_bps: effective,
            quorum_threshold_bps:   effective,
            eligible_voter_count:   snapshotted,
            voting_deadline:        now + cfg.voting_hours,
            ...
         }
```

The three threshold columns are then immutable for the row's lifetime (enforced by trigger).

### Flow: closing a proposal

```
ipfsAggregationService.aggregateProposalVotes(proposalId)
    │
    ├──► SELECT pod_level_proposals + tally votes
    │
    ├──► Grandfather check:
    │      IF eligible_voter_count IS NULL AND quorum_threshold_bps IS NULL
    │      THEN result = (for > against ? 'approved' : 'rejected')
    │      (preserves pre-PR simple-majority for in-flight proposals)
    │
    └──► Otherwise:
           ├──► getPodGovernanceConfig(pod_id) for defaults
           ├──► eligibleVoters = row's snapshot ?? live count
           ├──► determineProposalResult(tally, defaults, override, tier, eligible)
           └──► Persist result + thresholds + quorum/approval-met flags
                into the IPFS manifest for audit.
```

### Flow: configuring a pod's defaults

```
Pod page → GovernanceSettingsCard (leader-gated)
    │
    ├──► getPodGovernanceConfig(podId) on mount
    │
    ├──► User adjusts knobs in TierBlock components
    │      (uses generic ThresholdPicker — preset chips + custom slider)
    │
    └──► updatePodGovernanceConfig(podId, tier, partial)
           ├──► Range validation (throws on out-of-bounds)
           └──► UPDATE pods SET gov_{tier}_{knob}_bps = ...
                  └──► BEFORE UPDATE trigger:
                         IF JWT wallet_address NOT IN pod.pod_leads
                         THEN raise exception
                  (service role bypasses trigger)
```

---

## 3. Per-tier defaults

The split between OPERATIONAL and TREASURY_BINDING matches the existing `governance_tier` enum already used by `pod_level_proposals` and `CreateProposalForm`.

> **Path B update (2026-05-22):** voter base is now per-pod-configurable per tier via `pods.gov_op_voter_base` / `pods.gov_treasury_voter_base` (migration `20260522000001`). Platform defaults are **`all_members` for both tiers**. Leaders-only is an opt-in narrowing surfaced in `GovernanceSettingsCard` via a "Who votes?" toggle. The per-role `governanceParticipation` permission remains the highest-order signal — a user with that permission OFF cannot vote regardless of the pod's voter_base setting. The voter_base setting widens or narrows the audience; the role permission is the per-user gate into it.

**POD_OPERATIONAL**
- Voter base (default): all active pod members with `governanceParticipation = true`
- Voter base (opt-in narrowing): pod leaders only (`pod_members.membership_type IN ('leader','admin')` AND `governanceParticipation = true`)
- Default quorum: 30% — keeps routine coordination moving
- Default approval: 50.01% — simple majority of cast votes
- Default voting period: 72h
- Use case: status changes, role approvals, meeting agendas. Pods that prefer leader-coordinated operational decisions can flip the toggle to leaders-only.

**POD_TREASURY_BINDING**
- Voter base (default): all active pod members with `governanceParticipation = true`
- Voter base (opt-in narrowing): pod leaders only — available via the same toggle, though rarely the right choice for funds-binding decisions
- Default quorum: 50% — meaningful participation required for funds to move
- Default approval: 66% — supermajority of cast votes
- Default voting period: 72h
- Use case: any proposal moving funds, even though the funds movement itself happens on-chain through the V3 treasury contract

**DAO_CONSTITUTIONAL** — untouched in Layer A. On-chain Governor enforces its own immutable quorum/voting rules.

---

## 4. Floors and ceilings

Platform-enforced bounds prevent pods from disabling governance entirely:

| Knob | Floor | Ceiling | Enforced by |
|---|---|---|---|
| Approval threshold | 5001 bps (50.01%) | 10000 bps (100%) | DB CHECK + service validation |
| Quorum | 2000 bps (20%) | 10000 bps (100%) | DB CHECK + service validation |
| Voting period | 12 hours | 720 hours (30 days) | DB CHECK + service validation |

The approval floor of 50.01% (not 50%) ensures odd-vote-count outcomes always have a clear winner — a 50/50 tie counts as a rejection, never a pass.

---

## 5. Backward compatibility

**Existing pods with NULL gov columns**: behave identically to pre-PR. `getPodGovernanceConfig` null-coalesces at read time; no backfill needed.

**In-flight `pod_level_proposals` created before this PR**: NULL `eligible_voter_count` AND NULL `quorum_threshold_bps` triggers the sentinel branch in `aggregateProposalVotes`:

```ts
if (proposal.eligible_voter_count == null && proposal.quorum_threshold_bps == null) {
  result = tally.for > tally.against ? 'approved' : 'rejected';
}
```

Anything voted under the old rules closes under the old rules. No retroactive re-scoring.

**Pre-existing `pod_deletion_proposals` rows**: `approval_threshold_bps` column is NULL on old rows. Aggregation logic for deletion proposals (which is server-side multisig, not the engine path) continues to compare `current_approvals.length >= required_approvals` — the existing `required_approvals` value on the row was set at creation and is preserved.

---

## 6. Lockdown via triggers (migration `20260521000002`)

PostgreSQL row-level security gates entire rows, not individual columns. To enforce "you may update this row but not THESE columns," we use BEFORE UPDATE triggers that raise an exception on illegal changes.

Three triggers:

1. **`pods_governance_config_authority`** on `pods` — if any `gov_*` column is changing AND the JWT's `wallet_address` is not in `pod.pod_leads`, raise. Service-role calls (no JWT claims) bypass.
2. **`pod_level_proposals_freeze_thresholds`** on `pod_level_proposals` — `approval_threshold_bps`, `quorum_threshold_bps`, and `eligible_voter_count` cannot change after row creation. Any update that changes them raises.
3. **`pod_deletion_proposals_freeze_threshold`** on `pod_deletion_proposals` — `approval_threshold_bps` cannot change after row creation.

This prevents two failure modes: (a) a malicious or buggy server route mutating snapshot values mid-vote, and (b) someone manually editing a row in Supabase Studio mid-flight and changing the bar.

---

## 7. UI surfaces

### `GovernanceSettingsCard` (lives inside the Governance module config)
Settings card was originally rendered on the public pod page (`/pods/[id]`) gated on `isLeader`. As of 2026-05-22 it lives inside `PodModulesManager` as the Governance module's `configComponent` — that is, it appears in the leader-only Modules panel and is shown when the leader expands "Configure Governance". This separates **public pod content** (member-facing) from **pod settings** (leader-facing), matching the pattern of every other module (chat, forum, knowledge base).

Four controls per tier (Operational, Treasury):
- **Voter base** — two-button selector: All pod members / Pod leaders only. Default all_members.
- Quorum picker (preset chips 25/33/50/66 + custom slider)
- Approval picker (preset chips Simple/Strict/Strong/Unanimous + custom slider)
- Voting period (quick-pick chips 24h/72h/7d/14d/30d + custom number input)

"Reset to platform default" link per tier. Save button writes all four knobs via `updatePodGovernanceConfig`. Toast on success/failure. Loads via a single `useEffect([podId])` — earlier render-loop bug where `toast` in the dep array caused unbounded re-fetches (`ERR_INSUFFICIENT_RESOURCES`) was fixed by removing the dep.

### `PodModulesManager` — Governance toggle
Added 2026-05-22. The Governance entry appears under Core Modules between Treasury and Events (Vote icon, sage palette). Toggling ON expands the settings card inline. Toggling OFF blocks new proposal creation server-side (see § 8) but preserves existing proposals' visibility and ability to close cleanly.

### `CreateProposalForm` — stricter override
Loads pod gov config on selected-token change. Shows a collapsible "Require a stricter approval threshold for this proposal?" section below the tier selector. Uses the generic `ThresholdPicker` with min = pod's resolved default for that tier. Client-side blocks submit if override is below the pod default (server-side blocks too — defense in depth).

The pod-selection dropdown filters out pods where `pod_modules.governance_enabled = false`, so a member can't even see those pods as proposal targets. DAO-wide option for Executive Pod members remains available regardless of any single pod's setting (DAO-wide goes through the on-chain Governor, independent of pod-level modules).

### `ProposalModal` — live status
For pod-level proposals only, surfaces below the raw vote tally:
- "Quorum: X/Y" with green check or red X
- "Approval: A/B" with green check or red X
Both computed via `determineProposalResult` against the snapshotted thresholds. Grandfathered rows skip this block (they have no stored thresholds to render against).

### `ThresholdPicker` (generic)
Extracted from PR 2's `TreasuryThresholdPicker`. Props-driven label, helper text, min/max, presets. Both PR 2 (treasury) and PR 3 (governance + per-proposal override) use it. Identical UX across all three pickers ensures consistency without duplication.

---

## 8. Module gate enforcement (audit, 2026-05-22)

Adding the `governance_enabled` module toggle required checking every governance touchpoint to decide whether it should be gated. The audit found 11 touchpoints; gating decisions follow the principle **"block new activity, preserve in-flight"**:

| Touchpoint | Gated? | Reason |
|---|---|---|
| `CreateProposalForm` dropdown | YES — client-side | Hides disabled pods so members can't select them |
| `GovernanceService.createPodLevelProposal` | YES — server-side | Defense in depth; refuses inserts even from direct API callers |
| `GovernanceService.notifyEligibleVoters` | YES — server-side | Skips fan-out if module disabled (defensive; moot via the upstream gate) |
| `GovernanceService.castVote` (vote upsert) | NO | Preserves in-flight votes on existing proposals |
| `useEnhancedProposals` (visibility) | NO | Existing proposals stay visible |
| `ProposalModal` (display) | NO | Existing proposals stay viewable |
| `ipfsAggregationService.aggregateProposalVotes` | NO | Existing proposals must close cleanly at deadline |
| `votingReminderService` 48/24/6/1h cron | NO | Existing proposals still notify per their schedule |
| `pod_level_proposals_pulse_trigger` | Indirectly | No new proposals can INSERT, so trigger doesn't fire — moot |
| `governanceParticipation` permission check (6 sites) | Independent | Per-role permission is the highest-order signal across all sites |
| DAO-wide Governor proposals | Untouched | On-chain; not under pod module control |

### Single source of truth

```ts
GovernanceService.isPodGovernanceEnabled(podId: string): Promise<boolean>
```

- Direct read of `pod_modules.governance_enabled` for the pod.
- Fails open on read errors (returns true) so a transient lookup glitch doesn't block all governance writes.
- NULL → true (backward compatibility).
- Called from `createPodLevelProposal` and `notifyEligibleVoters`.

This pattern (one accessor, called from every write gate, with documented fail-open semantics) is what I'd reach for next time a similar module toggle gets added.

---

## 9. Layer B: DAO Governor parameters via proposal (2026-05-22)

### Why no redeploy

The deployed `DAOGovernor.sol` (OZ v5) already inherits `GovernorSettings` and `GovernorVotesQuorumFraction`. It already exposes:

- `setVotingDelay(uint48 newVotingDelay)` — voting delay in blocks
- `setVotingPeriod(uint32 newVotingPeriod)` — voting period in blocks
- `updateQuorumNumerator(uint256 newQuorumNumerator)` — quorum %, with denominator=100

All three are gated by `onlyGovernance` — the Governor itself, via a passing DAO proposal, is the only caller. So Layer B's only requirement is a UI that helps Exec Pod leaders construct such a proposal.

### Scope decision: three knobs, not four

- **Voting delay**, **voting period**, **quorum %** are all tunable via DAO proposal.
- **Approval threshold** stays at simple majority of cast votes (`GovernorCountingSimple`). Treasury V3 contracts already provide per-pod supermajority for fund-moving decisions, which is where the supermajority requirement actually matters.
- **Proposal threshold** stays at 0. Permission to propose is gated in-app via the `governanceParticipation` role permission (per the existing permission hierarchy).

### Architecture

```
Exec Pod leader opens pods/<exec-pod-id>/manage → Modules → Governance config
    │
    ├──► pod-level GovernanceSettingsCard (always visible)
    │
    └──► DAOGovernanceSettingsCard (NEW — visible only when isExecPod && isManager)
            │
            ├──► On mount: readContract for votingDelay / votingPeriod / quorumNumerator / quorumDenominator
            │      (publicClient from viem against base mainnet)
            │
            ├──► User adjusts knobs (only changed knobs are included in the proposal)
            │
            └──► Click "Propose change"
                    │
                    ├──► buildDaoParamProposal(GOV, changes, title, rationale, threadId)
                    │       → encodes one or more setter calldatas
                    │
                    ├──► encodeFunctionData(proposeWithMetadata, [targets, values, calldatas, ...])
                    │
                    ├──► sendUserOperation({ to: GOV, data, useCdpPaymaster: true })
                    │       — gas-sponsored; Governor address is whitelisted in Coinbase's
                    │         hosted paymaster policy (proven by existing DAO-wide proposal flow)
                    │
                    └──► insertProposalMetadata({ tempProposalId, title, body, ... })
                            — writes proposal_metadata row with temp_<hash> id;
                              cron resolves real onchain_proposal_id later
```

The on-chain enforcement is the Governor's `onlyGovernance` modifier. The UI gating is `isExecPod && isManager`. Server-side enforcement: nothing extra needed — the contract is the gate.

### Policy bounds

Narrower than the contract permits:

| Knob | Floor | Ceiling | Step |
|---|---|---|---|
| Voting delay | 1 hour | 72 hours | 1 hour |
| Voting period | 12 hours | 336 hours (14 days) | 1 hour |
| Quorum % | 4% | 20% | 1% |

Enforced both in the UI (clamped inputs) and in `buildDaoParamProposal` (throws on out-of-bounds).

### Sanity check on mount

The card reads `quorumDenominator()` and refuses to render controls if it isn't `100`. The percent→arg conversion assumes denominator=100; a different value would cause silent off-by-100 mis-proposals. This should never trip in practice (OZ default is 100), but the failure mode is bad enough to warrant a guard.

### Refactor: `insertProposalMetadata`

Both `CreateProposalForm` (general DAO-wide proposals) and `DAOGovernanceSettingsCard` (parameter-change proposals) need to insert a `proposal_metadata` row after submitting on-chain. Extracted into `src/features/governance/services/proposalMetadataService.ts` to avoid drift. The mention-extraction regex and dedup-on-temp-id behavior are preserved 1:1.

### Files added/modified

**New:**
- `src/features/governance/services/daoGovernorParamProposal.ts` — pure helper (no React, no wallet). Exports `buildDaoParamProposal`, `blocksToHours`, `hoursToBlocks`, bounds constants.
- `src/features/governance/services/proposalMetadataService.ts` — extracted from CreateProposalForm. Exports `insertProposalMetadata`.
- `src/features/governance/components/DAOGovernanceSettingsCard.tsx` — the new card.

**Modified:**
- `src/features/pods/components/PodManagementContainer.tsx` — pass `isExecPod` to `PodModulesManager`.
- `src/features/pods/components/PodModulesManager.tsx` — accept `isExecPod`, render `DAOGovernanceSettingsCard` inside the Governance module config when `isExecPod && isManager`.
- `src/features/governance/components/CreateProposalForm.tsx` — refactored the 40-line metadata-insert block to call `insertProposalMetadata`. Behaviour identical.

### What's still NOT done (and on purpose)

- **Approval threshold tunability** — would require redeploy with a custom counting module. The Treasury V3 contracts hold the supermajority knob where it matters.
- **Per-proposal supermajority overrides at the DAO tier** — same reason.
- **DAO Timelock parameter changes** — the execution delay is in the Timelock, not the Governor. Tunable separately if ever needed.
- **Concurrent-proposal race UI hint** — if two governance-param proposals are in flight simultaneously, the one that executes second overwrites the first. Allowed by OZ. Worth a UI warning in a follow-up if it becomes a real concern.

---

## 10. What this does NOT do

Explicit scope boundaries (revised after Layer B):

- **No on-chain enforcement of pod-level rules.** Pod-level configuration (Layer A) is off-chain. The on-chain effect (e.g., a treasury V3 proposal hitting `approveProposal`) is governed by the on-chain treasury contract's own threshold, set at deploy time.
- **No retroactive re-scoring.** Pre-PR proposals close under the rules they were created under.
- **No threshold-change governance flow at the pod tier.** Pod leaders can change their pod's config directly via the settings card. DAO-tier changes DO go through a proposal-vote-execute cycle (Layer B).
- **No DAO approval-threshold tunability.** See Layer B "What's still NOT done."
- **No DAO Timelock parameter changes.** See Layer B.

---

## 11. Lessons learned

Things that made this implementation noisier than it needed to be:

- **Audit drift.** Initial audit asserted `pod_governance_proposals` existed in the live DB. It doesn't — the CREATE TABLE lives in a repo SQL file that was never applied. First migration attempt failed on the live DB. Lesson: when planning migrations, ask the user for a real list of live tables before writing ALTER statements. I cannot see live Supabase state from this environment.
- **"Two parallel systems" was misleading framing.** The audit described `pod_governance_proposals` (multisig) and `pod_level_proposals` (member-vote) as peer governance systems. In reality, the multisig flow in production is *only* used for pod deletion, via `pod_deletion_proposals`. The generic multisig service exists in code but no UI reaches it. Lesson: trace UI callsites, not just service definitions.
- **`MINIMUM_MANAGERS_REQUIRED = 3` was a hidden floor.** That constant in `podMultiManagerGovernance.ts` would have silently blocked governance for any pod with 1–2 leaders — a likely real configuration for new communities. Removed to 1, which is the actual minimum (the proposer themselves must be a manager).
- **`pod_members` column name drift.** Initial helpers queried `wallet_address` / `status='active'` / `role='manager'` — none of which exist on the live `pod_members` schema. Canonical columns are `wallet` / `is_active` / `membership_type`. The `getEligibleVoterCount` and `getEligibleVoterWallets` helpers returned empty result sets silently for every pod for the entire week between Layer A and the Path B revision. Lesson: when adding a query against a table I haven't worked with recently, do `SELECT *` and confirm the actual column list before writing the WHERE clause.
- **`removeConsole` in `next.config.mjs` strips all `console.log`/`console.warn` in production.** Diagnostic logs added during the missing-notification investigation were invisible until temporarily swapped to `console.error`. Lesson: any future debugging that needs runtime visibility should use `console.error` from the start, or build a small `logger.info` wrapper that calls `console.error` internally.
- **Architectural assumptions imported from other DAO platforms didn't match the SpiritDAO model.** I shipped Layer A with "operational decisions = leaders only" as the hardcoded default because that's how most DAO platforms work. But SpiritDAO's principle is pod self-governance — members govern their pod. The user-facing test that surfaced this was a notification gap (a single-member pod had no recipients after self-exclusion), but the real bug was the design assumption. Path B (voter base as per-pod, default `all_members`) is the right shape. Lesson: explicitly distinguish "platform convention" from "user-stated principle" in design choices and default toward the latter when they conflict.
- **`useCallback` with non-stable hook returns causes render loops.** `toast` from shadcn's `useToast()` does not have a stable identity across renders; including it in a `useCallback` dep array caused the load effect to re-fire on every render and exhaust the browser's resource budget. Lesson: side-effect dispatchers (toast, router) generally don't belong in `useCallback`/`useEffect` deps even when the linter complains.

---

## 12. Open follow-ups

- **DAO_CONSTITUTIONAL Layer B** — on-chain Governor replacement or `GovernorSettings` extension. Required for DAO-wide vote flexibility. Separate workstream.
- **Threshold change via vote** — currently pod leaders edit the config directly. A future iteration could require a leader vote to change governance config (vote on the new config, apply after passing). Not implemented; arguably a natural extension once pods stress-test the direct-edit model.
- **`pod_governance_proposals` table reconciliation** — the schema file at `src/features/pods/sql/pod-governance-schema.sql` is dead code. Either delete the file or wire up the generic multisig flow.
- **Live schema dump checked into the repo.** Twice we've hit "code queried a column that doesn't exist in the live DB" because the canonical schema files in the repo don't match production. A periodic `pg_dump --schema-only` committed to the repo would catch drift cheaply.
- **`'admin'` membership_type** — never actively used in practice but recognized as a leader-equivalent across the codebase. Worth a future cleanup to either drop the value or define its meaning explicitly.

---

## 13. References

**Migrations** (apply in chronological order via Supabase SQL editor):
- [`20260521000001_add_governance_thresholds.sql`](../supabase/migrations/20260521000001_add_governance_thresholds.sql) — initial threshold + quorum columns on pods, pod_level_proposals, pod_governance_proposals
- [`20260521000002_lockdown_governance_thresholds.sql`](../supabase/migrations/20260521000002_lockdown_governance_thresholds.sql) — RLS triggers freezing snapshotted thresholds; leader-only `gov_*` writes
- [`20260521000003_lockdown_active_pod_members_view.sql`](../supabase/migrations/20260521000003_lockdown_active_pod_members_view.sql) — `security_invoker = true` on the membership view
- [`20260521000004_pulse_proposal_triggers.sql`](../supabase/migrations/20260521000004_pulse_proposal_triggers.sql) — `proposal_created` events written to `explorer_events` on insert
- [`20260522000001_add_governance_voter_base.sql`](../supabase/migrations/20260522000001_add_governance_voter_base.sql) — Path B per-pod voter_base columns
- [`20260522000002_add_governance_module.sql`](../supabase/migrations/20260522000002_add_governance_module.sql) — Governance as a toggleable module (`pod_modules.governance_enabled`)

**Code (Layer A):**
- Resolution engine: [`src/features/governance/services/proposalResultEngine.ts`](../src/features/governance/services/proposalResultEngine.ts)
- Config service: [`src/features/pods/services/podGovernanceConfigService.ts`](../src/features/pods/services/podGovernanceConfigService.ts) — config CRUD, voter base resolution, eligible-voter queries
- Governance service: [`src/features/governance/services/governanceService.ts`](../src/features/governance/services/governanceService.ts) — `createPodLevelProposal`, `notifyEligibleVoters`, `isPodGovernanceEnabled`
- Aggregation: [`src/services/ipfsAggregationService.ts`](../src/services/ipfsAggregationService.ts)
- Pod-level settings UI (inside Modules panel): [`src/features/pods/components/GovernanceSettingsCard.tsx`](../src/features/pods/components/GovernanceSettingsCard.tsx)
- Modules manager: [`src/features/pods/components/PodModulesManager.tsx`](../src/features/pods/components/PodModulesManager.tsx)
- Proposal creation form: [`src/features/governance/components/CreateProposalForm.tsx`](../src/features/governance/components/CreateProposalForm.tsx)
- Proposal display: [`src/features/governance/components/ProposalModal.tsx`](../src/features/governance/components/ProposalModal.tsx)
- Modules API: [`src/app/api/pods/[id]/modules/route.ts`](../src/app/api/pods/[id]/modules/route.ts)

**Code (Layer B):**
- DAO param proposal helper: [`src/features/governance/services/daoGovernorParamProposal.ts`](../src/features/governance/services/daoGovernorParamProposal.ts) — pure helper; bounds + block/hour conversion + `buildDaoParamProposal`
- Proposal metadata service: [`src/features/governance/services/proposalMetadataService.ts`](../src/features/governance/services/proposalMetadataService.ts) — extracted from CreateProposalForm; used by both DAO-wide and DAO-param proposals
- DAO settings card: [`src/features/governance/components/DAOGovernanceSettingsCard.tsx`](../src/features/governance/components/DAOGovernanceSettingsCard.tsx) — Exec-only, lives inside Governance module config
- Pod management container (wiring): [`src/features/pods/components/PodManagementContainer.tsx`](../src/features/pods/components/PodManagementContainer.tsx)

**Roadmap:** [`roadmap-action-items-2026-05.md`](roadmap-action-items-2026-05.md)

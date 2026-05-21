# Pod Governance Flexibility — Layer A Technical Documentation

**Date:** 2026-05-21
**Status:** Shipped in commits `c3a8ac7f`, `3c84db3d`, `4b1620c7`
**Roadmap item:** [#4 — Governance Quorum + Voting Flexibility](roadmap-action-items-2026-05.md)

---

## 1. What this is

Layer A makes pod-level governance configurable per pod. Three knobs per tier (quorum %, approval %, voting period), with platform-set defaults and bounded floors. Per-proposal stricter overrides allowed; weakening below the pod default is not.

Layer B (on-chain DAO Governor changes for `DAO_CONSTITUTIONAL` tier) is deferred — current Governor contract is immutable post-deployment, and replacing it is a separate workstream.

---

## 2. Architecture

### Data model

Three tables touched, plus a new pure helper module.

**`pods`** — six new columns, one per (tier × knob):

| Column | Type | Range | NULL = |
|---|---|---|---|
| `gov_op_quorum_bps` | INTEGER | 2000–10000 | platform default (30%) |
| `gov_op_approval_bps` | INTEGER | 5001–10000 | platform default (50.01%) |
| `gov_op_voting_hours` | INTEGER | 12–720 | platform default (72h) |
| `gov_treasury_quorum_bps` | INTEGER | 2000–10000 | platform default (50%) |
| `gov_treasury_approval_bps` | INTEGER | 5001–10000 | platform default (66%) |
| `gov_treasury_voting_hours` | INTEGER | 12–720 | platform default (72h) |

NULL distinguishes "never configured" from "explicitly chose the default value." The service layer null-coalesces at read time.

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

- **`getPodGovernanceConfig(podId)`** — reads the 6 columns, null-coalesces against `PLATFORM_DEFAULTS`, returns a fully resolved `{ operational, treasury }` object.
- **`updatePodGovernanceConfig(podId, tier, partial)`** — validates ranges before write; throws on out-of-range values.
- **`getEligibleVoterCount(podId, tier)`** — queries `pod_members`:
  - `POD_OPERATIONAL` → `role='manager' AND status='active'`
  - `POD_TREASURY_BINDING` → `status='active'` (all active members)
  - `DAO_CONSTITUTIONAL` → returns 0 (on-chain tier; off-chain count irrelevant)

`PLATFORM_DEFAULTS` constants:

```
POD_OPERATIONAL:       quorum=3000 (30%), approval=5001 (50.01%), voting=72h
POD_TREASURY_BINDING:  quorum=5000 (50%), approval=6600 (66%),    voting=72h
```

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

**POD_OPERATIONAL**
- Voter base: pod leaders only (managers in `pod_members`)
- Default quorum: 30% — keeps routine coordination moving
- Default approval: 50.01% — simple majority of cast votes
- Default voting period: 72h
- Use case: status changes, role approvals, meeting agendas

**POD_TREASURY_BINDING**
- Voter base: all active pod members
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

### `GovernanceSettingsCard`
Leader-gated card on `/pods/[id]`. Collapsible by default. Two tier sections (Operational, Treasury) each with three controls:
- Quorum picker (preset chips 25/33/50/66 + custom slider)
- Approval picker (preset chips Simple/Strict/Strong/Unanimous + custom slider)
- Voting period (quick-pick chips 24h/72h/7d/14d/30d + custom number input)

"Reset to platform default" link per tier. Save button writes all values via `updatePodGovernanceConfig`. Toast on success/failure.

### `CreateProposalForm` — stricter override
Loads pod gov config on selected-token change. Shows a collapsible "Require a stricter approval threshold for this proposal?" section below the tier selector. Uses the generic `ThresholdPicker` with min = pod's resolved default for that tier. Client-side blocks submit if override is below the pod default (server-side blocks too — defense in depth).

### `ProposalModal` — live status
For pod-level proposals only, surfaces below the raw vote tally:
- "Quorum: X/Y" with green check or red X
- "Approval: A/B" with green check or red X
Both computed via `determineProposalResult` against the snapshotted thresholds. Grandfathered rows skip this block (they have no stored thresholds to render against).

### `ThresholdPicker` (generic)
Extracted from PR 2's `TreasuryThresholdPicker`. Props-driven label, helper text, min/max, presets. Both PR 2 (treasury) and PR 3 (governance + per-proposal override) use it. Identical UX across all three pickers ensures consistency without duplication.

---

## 8. What this does NOT do

Explicit scope boundaries:

- **DAO_CONSTITUTIONAL governance is unchanged.** The on-chain Governor contract is immutable and Layer A only addresses pod-scoped governance.
- **No on-chain enforcement.** All Layer A configuration is off-chain. The on-chain effect (e.g., a treasury V3 proposal hitting `approveProposal`) is governed by the on-chain treasury contract's own threshold, set at deploy time.
- **No retroactive re-scoring.** Pre-PR proposals close under pre-PR rules.
- **No per-tier voting-base override.** OPERATIONAL is always leaders-only; TREASURY_BINDING is always all active members. Pods configure thresholds, not the denominator.
- **No threshold-change governance flow.** Pod leaders can change the config directly via the settings card — there's no "propose a new threshold, vote on it, then apply" cycle. The trigger restricts writes to leaders, which is the access control. A future PR could add a propose-then-vote pattern if pods want that level of self-binding.

---

## 9. Lessons learned

Three things that made this implementation noisier than it needed to be:

- **Audit drift.** Initial audit asserted `pod_governance_proposals` existed in the live DB. It doesn't — the CREATE TABLE lives in a repo SQL file that was never applied. First migration attempt failed on the live DB. Lesson: when planning migrations, ask the user for a real list of live tables before writing ALTER statements. I cannot see live Supabase state from this environment.
- **"Two parallel systems" was misleading framing.** The audit described `pod_governance_proposals` (multisig) and `pod_level_proposals` (member-vote) as peer governance systems. In reality, the multisig flow in production is *only* used for pod deletion, via `pod_deletion_proposals`. The generic multisig service exists in code but no UI reaches it. Lesson: trace UI callsites, not just service definitions.
- **`MINIMUM_MANAGERS_REQUIRED = 3` was a hidden floor.** That constant in `podMultiManagerGovernance.ts` would have silently blocked governance for any pod with 1–2 leaders — a likely real configuration for new communities. Removed to 1, which is the actual minimum (the proposer themselves must be a manager).

---

## 10. Open follow-ups

- **DAO_CONSTITUTIONAL Layer B** — on-chain Governor replacement or `GovernorSettings` extension. Required for DAO-wide vote flexibility. Separate workstream.
- **Threshold change via vote** — currently pod leaders edit the config directly. A future iteration could require a leader vote to change governance config (vote on the new config, apply after passing). Not implemented; arguably a natural extension once pods stress-test the direct-edit model.
- **Voter-base flexibility** — current Layer A hardcodes OPERATIONAL = leaders, TREASURY_BINDING = all members. Could be made configurable, but adds substantial cognitive load on proposal authors. Wait for a real ask.
- **`pod_governance_proposals` table reconciliation** — the schema file at `src/features/pods/sql/pod-governance-schema.sql` is dead code. Either delete the file or wire up the generic multisig flow. Today's PR doesn't touch this.

---

## 11. References

- Schema migration: [`supabase/migrations/20260521000001_add_governance_thresholds.sql`](../supabase/migrations/20260521000001_add_governance_thresholds.sql)
- Lockdown migration: [`supabase/migrations/20260521000002_lockdown_governance_thresholds.sql`](../supabase/migrations/20260521000002_lockdown_governance_thresholds.sql)
- Resolution engine: [`src/features/governance/services/proposalResultEngine.ts`](../src/features/governance/services/proposalResultEngine.ts)
- Config service: [`src/features/pods/services/podGovernanceConfigService.ts`](../src/features/pods/services/podGovernanceConfigService.ts)
- Settings UI: [`src/features/pods/components/GovernanceSettingsCard.tsx`](../src/features/pods/components/GovernanceSettingsCard.tsx)
- Aggregation: [`src/services/ipfsAggregationService.ts`](../src/services/ipfsAggregationService.ts)
- Proposal creation: [`src/features/governance/services/governanceService.ts`](../src/features/governance/services/governanceService.ts) (`createPodLevelProposal`)
- Roadmap: [`roadmap-action-items-2026-05.md`](roadmap-action-items-2026-05.md)

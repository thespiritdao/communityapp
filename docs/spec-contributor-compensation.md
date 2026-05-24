# Contributor Compensation Roles — Feature Spec

**Date:** 2026-04-23
**App:** SpiritDAO Community App (commapp)
**Author:** Engineering
**Status:** Future spec (not yet scheduled)

---

## 1. Overview

Contributor compensation roles introduce structured, ongoing contributor payments — distinct from bounties (one-time project work). A role assignment is a time-limited, pod-governed commitment: "You hold this role for N months, you earn X $SELF/month, renewable by pod vote."

**Why this matters:**
- Bounties work for discrete tasks but don't support ongoing contributors
- Active pod contributors need predictable compensation for sustained work
- Time-limited roles prevent permanent entitlements while rewarding consistency
- $SELF distribution through roles reinforces the participation economy

**What this does NOT do:**
- Create employment relationships (these are DAO contributor roles, not jobs)
- Require new smart contracts in Phase 1 (DB + off-chain distribution first)
- Change the bounty system (bounties remain for one-time work)
- Introduce salary in fiat — compensation is in $SELF tokens only

---

## 2. Current State

### Compensation Mechanisms Today

| Mechanism | Token | Duration | Governed By |
|-----------|-------|----------|-------------|
| Bounties | $SELF or $SYSTEM | One-time (milestone-based) | Pod managers approve |
| Event completion | $SELF (indirect, via NFT) | One-time | Event host |
| Token faucet | $SELF | Ad-hoc distribution | Admin/pod treasury |
| Donations | $SYSTEM | One-time | Exec approval |

**Gap:** No structured, recurring compensation for ongoing contributors (designers, moderators, developers, community managers).

---

## 3. Design

### 3.1 Core Concepts

**Role Archetype** — A template describing a type of contribution. Created by pod leads. Persists as a reusable pattern.

```
RoleArchetype {
  id: UUID
  pod_id: UUID
  title: string              // e.g., "Community Moderator"
  description: string        // responsibilities, expectations
  compensation_self: number  // $SELF per period
  period: 'weekly' | 'monthly'
  max_assignments: number    // how many people can hold this role simultaneously
  created_by: wallet_address
}
```

**Role Assignment** — A specific person holding a role for a defined term.

```
RoleAssignment {
  id: UUID
  archetype_id: UUID
  pod_id: UUID
  assignee: wallet_address
  status: 'proposed' | 'active' | 'completed' | 'terminated'
  start_date: timestamp
  end_date: timestamp        // max 3 months from start
  renewal_count: number      // how many times this has been renewed
  approved_via: UUID         // pod_level_proposal ID
}
```

### 3.2 Lifecycle

```
Pod lead creates Role Archetype (template)
         ↓
Pod lead nominates contributor for assignment
         ↓
Pod members vote (existing pod governance, proposal type: 'role_assignment')
         ↓
If approved → assignment begins, $SELF distribution scheduled
         ↓
At end_date → assignment expires
         ↓
Pod lead can propose renewal (new vote, new 3-month term)
         OR
Contributor or pod lead can propose early termination (governance vote)
```

### 3.3 Compensation Distribution

Two implementation options (Phase 1 vs Phase 2):

**Phase 1 — Manual/Cron Distribution:**
- A scheduled job (weekly or monthly) queries active assignments
- Generates pending $SELF distributions
- Pod treasury lead approves batch distribution
- Uses existing TokenFaucet or direct transfer

**Phase 2 — Contract-Based Distribution:**
- New `ContributorPayroll.sol` contract
- Pod treasury deposits $SELF for the term
- Contract releases $SELF to assignee on schedule
- Early termination returns remaining balance to treasury

### 3.4 Relationship to Bounties

| Dimension | Bounty | Role Assignment |
|-----------|--------|-----------------|
| **Duration** | One-time deliverable | Time-limited (1-3 months, renewable) |
| **Scope** | Specific task with milestones | Ongoing responsibilities |
| **Payment** | On completion/milestone | Periodic (weekly/monthly) |
| **Governance** | Pod manager assigns | Pod members vote |
| **Token** | $SELF or $SYSTEM | $SELF only |
| **Examples** | "Build landing page" | "Community Moderator, 3 months" |

They are complementary: a pod might have a "Designer" role assignment AND create bounties for specific design deliverables.

### 3.5 Deferred Compensation Multiplier (Future)

Inspired by Hypha's model — contributors could opt to defer a % of their $SELF earnings for a multiplier:
- Take 100% now: receive base amount
- Defer 25%: receive 1.25x on the deferred portion after term completes
- Defer 50%: receive 1.5x on the deferred portion after term completes

This incentivizes long-term alignment. **Defer to Phase 3 — requires contract support.**

---

## 4. Database Schema

### New Tables

```sql
CREATE TABLE role_archetypes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID NOT NULL REFERENCES pods(id),
  title TEXT NOT NULL,
  description TEXT,
  compensation_self NUMERIC NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'monthly',  -- 'weekly' | 'monthly'
  max_assignments INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'archived'
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archetype_id UUID NOT NULL REFERENCES role_archetypes(id),
  pod_id UUID NOT NULL REFERENCES pods(id),
  assignee TEXT NOT NULL,                  -- wallet address
  status TEXT NOT NULL DEFAULT 'proposed', -- proposed | active | completed | terminated
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  renewal_count INTEGER NOT NULL DEFAULT 0,
  approved_via UUID REFERENCES pod_level_proposals(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT max_term CHECK (end_date <= start_date + INTERVAL '3 months')
);

CREATE TABLE role_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES role_assignments(id),
  amount NUMERIC NOT NULL,
  token TEXT NOT NULL DEFAULT 'SELF',
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | distributed | failed
  tx_hash TEXT,
  distributed_at TIMESTAMPTZ
);
```

---

## 5. Implementation Phases

### Phase 1 — Role Archetypes + Assignments (DB + UI)

| Step | Work | Files |
|------|------|-------|
| 1 | Migration for new tables | `supabase/migrations/xxx_role_compensation.sql` |
| 2 | API routes: CRUD archetypes, propose/approve assignments | `src/app/api/pods/roles/route.ts` |
| 3 | "Roles" tab on pod detail page | `src/features/pods/components/PodRolesTab.tsx` |
| 4 | Create archetype form (pod leads only) | `src/features/pods/components/CreateRoleArchetypeForm.tsx` |
| 5 | Nominate contributor flow → pod governance vote | Hook into `governanceService.ts` with type `role_assignment` |
| 6 | Assignment status management (active, completed, terminated) | `src/features/pods/services/roleAssignmentService.ts` |

### Phase 2 — Distribution Engine

| Step | Work | Files |
|------|------|-------|
| 1 | Cron job: query active assignments, generate pending distributions | `src/app/api/cron/distribute-roles/route.ts` |
| 2 | Distribution approval UI for pod treasury leads | `src/features/pods/components/RoleDistributionApproval.tsx` |
| 3 | Execute distribution via existing token transfer flow | Integrate with TokenFaucet or direct transfer |
| 4 | Distribution history view | `src/features/pods/components/DistributionHistory.tsx` |

### Phase 3 — On-Chain + Deferred Compensation (Future)

| Step | Work |
|------|------|
| 1 | `ContributorPayroll.sol` — periodic release from pod treasury |
| 2 | Deferred compensation multiplier logic in contract |
| 3 | Staking integration for $SELF governance weight |

---

## 6. Integration Points

| System | Integration |
|--------|------------|
| **Pod Governance** | Assignment proposals use existing `pod_level_proposals` with type `role_assignment` |
| **Pod Treasury** | Distributions draw from pod treasury balance |
| **Notifications** | Assignee notified of nomination, vote result, distribution |
| **Pulse Feed** | Role assignments and distributions surfaced in activity feed |
| **Identity/Profile** | Active roles shown on user profile (similar to hat badges) |

---

## 7. Open Questions

- [ ] Should role archetypes be shareable across pods (templates)?
- [ ] Should there be a probationary period before full compensation starts?
- [ ] What happens to pending distributions if a pod treasury is empty?
- [ ] Should role assignments affect governance weight within the pod?
- [ ] Maximum renewal count? (Prevent indefinite role-holding without re-election)

---

## 8. Verification Checklist

- [ ] Pod leads can create role archetypes with compensation amounts
- [ ] Pod leads can nominate contributors for role assignments
- [ ] Pod members can vote on role assignment proposals
- [ ] Approved assignments show as active with start/end dates
- [ ] Assignments auto-expire at end_date
- [ ] Distribution engine generates correct periodic payouts
- [ ] Pod treasury leads can approve/deny distribution batches
- [ ] Assignment history visible on pod detail and user profile
- [ ] 3-month max term enforced at DB level
- [ ] Renewal flow creates new assignment linked to same archetype

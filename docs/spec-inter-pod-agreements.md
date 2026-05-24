# Inter-Pod Agreements — Feature Spec

**Date:** 2026-04-23
**App:** SpiritDAO Community App (commapp)
**Author:** Engineering
**Status:** Future spec (not yet scheduled)

---

## 1. Overview

Inter-pod agreements enable two or more pods to create formal, trackable agreements with each other — resource sharing, joint projects, cross-pod proposals, or service-level commitments. This builds toward federation capabilities without requiring nested pod hierarchy.

**Why this matters:**
- As the number of pods grows, pods will naturally need to coordinate
- Currently, cross-pod work happens informally (chat, forum mentions) with no structured tracking
- Agreements create accountability between pods without centralizing authority
- Enables the "community of communities" vision described on spiritdao.org

**What this does NOT do:**
- Require changes to Hats Protocol or hat hierarchy
- Create nested pods (pods remain flat with token-gating for access)
- Introduce new smart contracts in Phase 1 (DB-first approach)
- Change any existing governance flows

---

## 2. Current State

### Cross-Pod Coordination Today

| Mechanism | Where | Limitation |
|-----------|-------|------------|
| Forum threads | `/forum` | Informal, no binding commitment |
| Chat messages | `/chat` | Ephemeral, no tracking |
| Pod-level proposals | `/governance` | Scoped to single pod, can't reference another pod |
| Bounties | `/bounty` | One pod creates, individuals bid — no pod-to-pod work |

There is no structured way for Pod A to say "We agree to provide X to Pod B in exchange for Y" and track that commitment.

---

## 3. Design

### 3.1 Agreement Model

An agreement is a mutual commitment between two or more pods, proposed by one pod and accepted by the other(s).

```
Agreement {
  id: UUID
  title: string
  description: string (rich text, TipTap markdown)
  type: 'resource_sharing' | 'joint_project' | 'service_commitment' | 'custom'
  status: 'proposed' | 'active' | 'completed' | 'expired' | 'cancelled'

  initiating_pod_id: UUID
  participating_pod_ids: UUID[]      // pods that must accept
  accepted_pod_ids: UUID[]           // pods that have accepted so far

  terms: string                      // plain-language terms
  start_date: timestamp | null       // optional effective date
  end_date: timestamp | null         // optional expiration

  created_by: wallet_address
  created_at: timestamp
  updated_at: timestamp
}
```

### 3.2 Lifecycle

```
Pod A proposes agreement → Pod B reviews
                              ↓
                    Pod B's members vote (pod-level governance)
                              ↓
                    If approved → status = 'active'
                    If rejected → status = 'cancelled'
                              ↓
                    Either pod can propose completion/cancellation
                              ↓
                    Other pod confirms → status = 'completed' or 'cancelled'
```

### 3.3 Approval Mechanism

Agreements use the existing pod-level governance flow:
- Initiating pod's lead creates the agreement proposal
- Target pod receives a governance proposal of type `pod_agreement`
- Target pod's members vote using existing EnhancedVoteButton
- Acceptance threshold follows the target pod's existing voting rules

This avoids building any new voting infrastructure.

### 3.4 Visibility

- Agreements are visible to members of all participating pods
- A new "Agreements" tab on the pod detail page (`/pods/[id]`) shows active/past agreements
- Cross-pod proposal feed shows agreement proposals alongside other pod proposals

---

## 4. Database Schema

### New Table: `pod_agreements`

```sql
CREATE TABLE pod_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  agreement_type TEXT NOT NULL DEFAULT 'custom',
  status TEXT NOT NULL DEFAULT 'proposed',
  terms TEXT,

  initiating_pod_id UUID NOT NULL REFERENCES pods(id),
  created_by TEXT NOT NULL,

  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pod_agreement_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES pod_agreements(id) ON DELETE CASCADE,
  pod_id UUID NOT NULL REFERENCES pods(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, rejected
  responded_by TEXT,
  responded_at TIMESTAMPTZ,
  proposal_id UUID REFERENCES pod_level_proposals(id)  -- links to governance vote
);
```

### RLS Policies

```sql
-- Members of any participating pod can view
CREATE POLICY "pod_agreements_select" ON pod_agreements FOR SELECT USING (
  initiating_pod_id IN (SELECT pod_id FROM pod_members WHERE user_address = auth.uid())
  OR id IN (
    SELECT agreement_id FROM pod_agreement_participants
    WHERE pod_id IN (SELECT pod_id FROM pod_members WHERE user_address = auth.uid())
  )
);

-- Only initiating pod leads can create
CREATE POLICY "pod_agreements_insert" ON pod_agreements FOR INSERT WITH CHECK (
  initiating_pod_id IN (
    SELECT pod_id FROM pod_members
    WHERE user_address = auth.uid() AND roles @> '["manager"]'
  )
);
```

---

## 5. Implementation Phases

### Phase 1 — DB + UI (no contracts)

| Step | Work | Files |
|------|------|-------|
| 1 | Create migration for `pod_agreements` + `pod_agreement_participants` | `supabase/migrations/xxx_pod_agreements.sql` |
| 2 | Add API routes: create, list, respond | `src/app/api/pods/agreements/route.ts` |
| 3 | Add "Agreements" tab to pod detail page | `src/features/pods/components/PodAgreementsTab.tsx` |
| 4 | Create agreement form (select target pod, terms, type) | `src/features/pods/components/CreateAgreementForm.tsx` |
| 5 | Hook into pod governance for acceptance voting | `src/features/governance/services/governanceService.ts` (add `pod_agreement` proposal type) |
| 6 | Add notification for incoming agreement proposals | `src/features/notifications/` |

### Phase 2 — On-Chain Recording (future)

- Record finalized agreements on-chain via a simple registry contract
- Immutable record of inter-pod commitments
- Optional: attach token escrow for resource-sharing agreements

---

## 6. Integration Points

| System | Integration |
|--------|------------|
| **Pod Governance** | Agreement acceptance creates a `pod_level_proposal` with type `pod_agreement` |
| **Notifications** | Target pod leads notified of incoming agreement |
| **Forum** | Optional: auto-create forum thread for agreement discussion |
| **Pulse Feed** | Agreement creation/acceptance surfaced in activity feed |

---

## 7. Open Questions

- [ ] Should agreements require a minimum discussion period before voting? (Consistent with current governance flow)
- [ ] Should expired agreements auto-archive or require manual closure?
- [ ] Should there be a limit on active agreements per pod?
- [ ] Should agreements support attached files (PDFs, scope documents)?

---

## 8. Verification Checklist

- [ ] Pod leads can create agreement proposals targeting another pod
- [ ] Target pod receives governance proposal for acceptance vote
- [ ] Accepted agreements appear on both pods' Agreements tabs
- [ ] Agreement status transitions work correctly (proposed → active → completed/cancelled)
- [ ] RLS policies restrict visibility to participating pod members only
- [ ] Notifications fire for incoming agreements
- [ ] Pulse feed shows agreement events

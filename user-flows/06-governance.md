# Flow 06 — Governance & Voting

## Who This Is For
All community members participating in collective decision-making.

---

## Three Types of Proposals

```
┌─────────────────────────────────────────────────────────────────┐
│                  GOVERNANCE TIERS                               │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  🌐 DAO-WIDE                                              │ │
│  │  Big decisions that affect all of SpiritDAO               │ │
│  │  Example: Change to the DAO constitution, treasury spend  │ │
│  │  Voting: On-chain, all members vote                       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  🏛 POD-LEVEL                                             │ │
│  │  Important decisions within a specific pod                │ │
│  │  Example: Approve treasury spend, major pod changes       │ │
│  │  Voting: DB-based, pod members vote → executes if passed  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  ⚙️ OPERATIONAL                                           │ │
│  │  Day-to-day coordination within a pod                     │ │
│  │  Example: Role approvals, task assignments, scheduling    │ │
│  │  Voting: Simple DB vote, no on-chain execution needed     │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Voting on a Proposal

```
USER TAPS "Govern" in bottom nav
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GOVERNANCE PAGE                              │
│                                                                 │
│  [ All ]  [ DAO-Wide ]  [ Pod Level ]  [ Operational ]          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🟢 ACTIVE — Closes in 2 days                            │  │
│  │  "Allocate 1,000 $SYSTEM to community events fund"       │  │
│  │  DAO-Wide · 45 votes so far                              │  │
│  │  [ View & Vote ]                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🟢 ACTIVE — Closes in 5 days                            │  │
│  │  "Approve new moderator for Nature Pod forum"            │  │
│  │  Pod Level (Nature Pod) · 8 votes so far                 │  │
│  │  [ View & Vote ]                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ✅ PASSED — Mar 8                                       │  │
│  │  "Approve new podcast series for TN Pod"                 │  │
│  │  Operational (TN Pod) · 12 votes                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Casting a Vote

```
USER TAPS [ View & Vote ] on a proposal
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROPOSAL DETAIL                              │
│                                                                 │
│  "Allocate 1,000 $SYSTEM to community events fund"              │
│                                                                 │
│  Proposed by: @alex · Mar 5, 2026                               │
│  Type: DAO-Wide · Closes: Mar 13, 2026                          │
│                                                                 │
│  Description:                                                   │
│  "This proposal would allocate 1,000 $SYSTEM tokens from        │
│   the DAO treasury to fund community events for Q2..."          │
│                                                                 │
│  Current Results:                                               │
│  FOR     ████████████░░░░░  72%  (32 votes)                     │
│  AGAINST ████░░░░░░░░░░░░░  28%  (13 votes)                     │
│                                                                 │
│  Your vote:                                                     │
│  ┌──────────────┐     ┌──────────────┐                         │
│  │  ✅ Vote FOR │     │ ❌ Vote AGAINST│                        │
│  └──────────────┘     └──────────────┘                         │
└──────────────────────────────────────────────────────────────── ┘
                            │
                 USER taps [ Vote FOR ]
                            │
                            ▼
                  For DAO-Wide proposals:
                  Sign transaction (gasless)
                  Vote recorded on-chain
                            │
                  For Pod-Level proposals:
                  Vote saved in database
                  No transaction needed
                            │
                            ▼
              ┌─────────────────────────────┐
              │  ✅ Vote recorded!           │
              │  Thank you for participating │
              └─────────────────────────────┘
```

---

## Creating a Proposal

```
USER TAPS [ + New Proposal ]
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1 — TYPE                                                  │
│                                                                 │
│  What kind of proposal is this?                                 │
│  ○ DAO-Wide (affects entire community)                          │
│  ○ Pod-Level (specific to my pod, may execute on-chain)         │
│  ○ Operational (pod coordination, no on-chain execution)        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2 — DETAILS                                               │
│                                                                 │
│  Title:         [ _________________________________ ]           │
│  Description:   [ _________________________________ ]           │
│  Forum link:    [ Link to discussion (optional) ____ ]          │
│  Voting period: [ 3 days / 5 days / 7 days ]                   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3 — SUBMIT                                                │
│                                                                 │
│  [ Preview Proposal ]                                           │
│  [ Submit → ]  (sign transaction for on-chain proposals)        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
               Proposal is LIVE — members vote
```

---

## Proposal Lifecycle

```
CREATED
    │
    ▼
ACTIVE (voting open)
    │
    ├── Voting period ends
    │
    ▼
PASSED? ──YES──→ EXECUTED (on-chain) or APPROVED (DB)
    │
    NO
    │
    ▼
REJECTED (archived, visible in history)
```

---

## Demo Highlights

- **3 tiers** — right-sized governance for every decision
- **Transparent** — see live vote tallies, who voted
- **Gasless voting** — signing a vote costs users nothing
- **History** — all past proposals and outcomes are preserved

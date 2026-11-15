# $SELF System — Operations Guide

*How the $SELF participation system works end-to-end, and the recurring
operational tasks. Companion to the design specs
(`spec-self-soulbound-redesign.md`) and the deploy/runbook docs.*

> **$SELF in one line:** verified human time, recorded where it was spent, that
> fades unless renewed — and it never becomes money.

---

## Mental model (read this first)

Three ideas that are easy to conflate:

1. **Epoch** = the global "season" counter (a calendar quarter). It lives
   **on-chain** and **auto-increments** when an Executive advances it. You never
   label epochs 1/2/3 by hand — the contract owns the number; the UI reads it.

2. **Budget** = a per-pod **spending cap** for a given epoch. Setting a budget
   does NOT release tokens — it's a ceiling ("this pod may mint up to N hours
   this season"). $SELF is minted *during* the epoch as members earn, drawing
   the budget down.

3. **Advancing the epoch** is a **boundary** event, not a release trigger. It
   closes the season, moves the clock forward, and **ages** every holding by one
   step — each token loses `1/H` of its value (linear decay over `H` epochs,
   default 8). It does NOT distribute anything.

So the common misconception — "set budgets, then advance to release them" — is
backwards. Budgets are caps consumed *within* an epoch; advancing *ends* one.

---

## The lifecycle (per epoch)

```
[set budget]  ──►  members earn (vote/event/bounty/role)  ──►  mint-batch
   (Exec)            (queues pending rows in the ledger)       (mints on-chain,
                                                                draws down budget)
                                       │
                                       ▼
                          (end of quarter) advance epoch
                          (Exec) → clock +1, all $SELF decays 1/H
                                       │
                                       ▼
                          set budgets for the new epoch …
```

### 1. Earning (mostly automatic)
- **Vote** — casting a pod vote auto-credits a trace amount (~2 min, capped
  1h/epoch). Fire-and-forget; never blocks voting.
- **Bounty** — approving a work submission credits the completer the bounty's
  `estimated_hours`.
- **Event** — after close-out, attendees with a check-in are credited
  `min(scheduled duration, 8h/day)`.
- **Role service** — an epoch stipend swept by Exec for active role-holders
  (`scripts/ops/role-service-stipend.mjs`).

All earning writes a `pending` row to the mint ledger (`self_mint_queue`), with
hour-anchoring + per-member diminishing returns + the pod budget cap applied. A
high-value or anomalous earning is routed to `exec_review` instead.

### 2. Minting (drain the queue → chain)
`POST /api/self/mint-batch { podId, epoch }` (Bearer `CRON_SECRET`) mints all
`pending`/`approved` rows for that pod/epoch in one **gasless sponsored** batch,
flips them to `minted`, and increments the pod's `minted_hours`.

### 3. Reviewing flagged earnings
The **$SELF Epochs → Review** tab (Exec) lists `exec_review` rows. Approve →
becomes mintable; reject → discarded. (Empty queue = everything cleared the
automatic checks.)

### 4. Advancing the epoch (quarterly)
**$SELF Epochs → Epoch tab → Advance** (Exec, gasless, irreversible). Closes the
season; every holding ages one step, losing `1/H` of its value (and anything
now `H` epochs old reaches zero value). See `runbook-self-epoch-advance.md` and
`self-epochs-reference.md` §3 for the decay math.

---

## Recurring operational tasks

| Task | Cadence | How | Automatable? |
|---|---|---|---|
| Set pod budgets | per epoch | $SELF Epochs → Budgets (Exec) | Yes, later — Phase 4 algorithmic baseline (`base + α·members + β·last-epoch-hours`). Manual now by design. |
| Run mint-batch | periodic (e.g. weekly) | `POST /api/self/mint-batch` | Yes — could be a cron; Exec-run in Phase 1 to watch first mints |
| Role-service stipend | per epoch close | `scripts/ops/role-service-stipend.mjs` | Partially — sweep script; rate is an Exec input |
| Review flagged mints | as they appear | $SELF Epochs → Review (Exec) | No — human judgment |
| Advance epoch | quarterly | $SELF Epochs → Epoch (Exec) | Deliberately manual (irreversible) |
| Vote credit | automatic | on every vote | Already automatic |
| Bounty credit | automatic | on every approval | Already automatic |

---

## Where things show in the UI

- **Members** see their standing on their **identity page → Tenure** (the
  Curious→Elder band + details modal). $SELF is shown as a participation record,
  never a spendable wallet balance.
- **Treasury tab → Overview → "$SELF Participation"** card: per-epoch budget
  allocated vs distributed, remaining, recipient count + scrollable history.
  ($SELF is NOT a held treasury asset — pods don't hold it; this is the
  participation/budget view.) Appears once a budget exists for the pod.
- **Exec → pod manage → modules → $SELF Epochs** card: Budgets / Review / Epoch.

---

## Tenure bands (ecosystem-wide, by lifetime $SELF earned)

| Band | Lifetime hours | Identity |
|---|---|---|
| Curious | 0–10 | Holds Proof of Curiosity; onboarding → first contributions |
| Resident | 10–50 | Now dwells in the ecosystem |
| Mainstay | 50–250 | Reliable, load-bearing presence |
| Pillar | 250–600 | Sustained, structural contributor |
| Elder | 600+ | Longest-tenured, multi-year |

Tenure counts ALL $SELF ever earned (spending doesn't lower it) and only ever
rises. Band names are display-only; the chain stores the tier number + lifetime
hours.

---

## Key invariants
- **Soulbound:** $SELF can be minted (earned) and burned (redeemed), never
  transferred. Value also fades over time via linear decay (it is not destroyed
  — only its spendable value drops). No resale market → faked issuance has no value.
- **Pods never hold $SELF** — they have a mint *budget* (capacity), not a balance.
- **The app never uses the web admin wallet** (`0xd481…`). All on-chain writes
  go through POD_ADMIN's sponsored smart wallet (`0x05c06…`), gaslessly.
- **Cross-community = recognition, not exchange** — provenance-weighted, never
  swapped.

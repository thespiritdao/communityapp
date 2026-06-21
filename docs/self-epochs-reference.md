# $SELF Epochs — Canonical Reference

*The single source of truth for how epochs work in the $SELF system: the
on-chain mechanics, expiry, the budget relationship, and operations. Other docs
(`self-system-operations-guide.md`, `runbook-self-epoch-advance.md`,
`spec-self-soulbound-redesign.md`) reference this for epoch specifics.*

---

## 1. What an epoch is

An **epoch** is the global "season" counter for the entire $SELF ecosystem. It
is a single integer that increments over time, used to:
- **stamp** every $SELF token with the season it was earned in, and
- **drive expiry** — old $SELF fades as the epoch advances.

Epochs are **global**, not per-community: there is one clock for everyone. (A
token also carries its *community* provenance separately — see §6.)

**Cadence:** one epoch ≈ one **calendar quarter** (the intended operating
rhythm). Nothing in the contract enforces "quarter" — the epoch only advances
when an Executive deliberately advances it (§4), so "quarterly" is an
operational convention, not an on-chain timer.

---

## 2. On-chain mechanics (the source of truth)

The epoch lives in the **`SelfEpochs`** contract
(`0xe9e9d5E3ACd9F738B58ffe82f974abd34766a7Bb`):

| On-chain value | Meaning |
|---|---|
| `currentEpoch` (uint32) | The live season number. **Auto-incremented** by the contract. |
| `lifetimeEpochs` (uint32) | **K** — how many epochs a $SELF token stays live before expiring. Default **2**. |
| `advanceEpoch()` | `EPOCH_ADMIN_ROLE` only. Does `currentEpoch += 1`. The ONLY way the number changes. |
| `setLifetimeEpochs(k)` | `EPOCH_ADMIN_ROLE` only. Changes K going forward. |

**You never assign epoch numbers by hand.** The contract owns the counter; every
UI and script *reads* `currentEpoch`. When you set a budget you type the epoch
that is *already current* (shown in the Epoch tab) — you are not labeling or
inventing it. Continuity is automatic because the chain is the single source of
truth.

A $SELF token's id encodes `(communityId, epoch)`:
`id = (communityId << 32) | epoch`. So the epoch a token was earned in is
permanently baked into the token itself.

---

## 3. Expiry — how $SELF "fades"

A token earned in epoch `E` is **live** while:

```
currentEpoch - E < lifetimeEpochs   (i.e. < K)
```

With **K = 2** and the current epoch at `N`:
- $SELF earned in epoch `N` → live (this season)
- $SELF earned in epoch `N-1` → live (last season)
- $SELF earned in epoch `N-2` or earlier → **expired**

Expiry is **computed at read time** — balance/spend checks simply ignore expired
ids. Nothing needs to "run" for a token to be considered expired; advancing the
epoch is what shifts the live window forward.

**Key consequence:** spendable $SELF is time-bound and reflects *recent*
participation. It is the **Tenure** record (permanent, ecosystem-wide lifetime
hours in `SelfPrestige`) that never expires — see
`spec-self-soulbound-redesign.md` D-19b.

---

## 4. Advancing the epoch (the boundary event)

Advancing is **how a season ends**. It is:
- **In-app, gasless, Executive-only.** $SELF Epochs card → Epoch tab → Advance.
  Signed via the backend smart wallet `0x05c06…` (POD_ADMIN's sponsored
  account) — the web admin wallet key is never used by the app.
- **Irreversible.** `advanceEpoch()` only goes up. There is no un-advance.
  Advancing from `N` to `N+1` immediately expires $SELF earned in epoch
  `(N+1) - K` and earlier.

**Full operational procedure + cautions + break-glass:**
`runbook-self-epoch-advance.md`.

### What advancing does NOT do
Advancing does **not** release budgets, distribute tokens, or mint anything. It
only moves the clock and shifts the expiry window. (This is the most common
point of confusion — see §5.)

---

## 5. Epochs vs. Budgets (the relationship)

These are independent and often conflated:

| | Epoch | Budget |
|---|---|---|
| What | Global season counter (on-chain) | Per-pod mint **cap** for a given epoch (off-chain ledger) |
| Set by | Auto-increments via `advanceEpoch()` | Exec sets per pod, per epoch ($SELF Epochs → Budgets) |
| Effect | Stamps tokens + drives expiry | Limits how much a pod can mint that epoch |

**The flow within one epoch:**
```
set budget for epoch N  →  members earn (draws pending rows)
   →  mint-batch mints them (draws DOWN the budget)  →  ... all during epoch N
```
Then at quarter close: **advance to N+1** (ends the season, expires old $SELF) →
set budgets for N+1.

A budget is a **ceiling consumed during the epoch**, NOT a pot released when the
epoch advances. Setting a budget does not mint; advancing does not release.

**"Held / distributed" per epoch** is visible in the treasury Overview →
"$SELF Participation" card: allocated (cap) vs distributed (minted) vs remaining,
with scrollable per-season history.

---

## 6. Community provenance (separate from epoch)

The epoch is global, but each token also records **which community** it was
earned in (`communityId`, derived deterministically from the pod UUID —
`src/features/self/lib/communityId.ts`). This is what powers provenance-weighted
recognition in the marketplace/gating (cross-community = recognition, not
exchange). The epoch handles *when*; the communityId handles *where*. They are
orthogonal dimensions of the same token id.

---

## 7. Operations summary

| Task | Who | Cadence | Tool |
|---|---|---|---|
| Read current epoch / K | anyone (Exec UI) | — | $SELF Epochs → Epoch tab |
| Set pod budget for an epoch | Exec | per epoch | $SELF Epochs → Budgets |
| Advance the epoch | Exec | quarterly | $SELF Epochs → Epoch → Advance (see runbook) |
| Change K (lifetime) | Exec | rare | `setLifetimeEpochs` (no UI yet — contract call) |

**Automation status:** epoch advance is deliberately manual (irreversible).
Budget-setting is manual now but designed to become algorithmic (Phase 4:
`base + α·members + β·last-epoch-hours`). See `self-system-operations-guide.md`.

---

## 8. Quick-reference values

- `SelfEpochs`: `0xe9e9d5E3ACd9F738B58ffe82f974abd34766a7Bb`
- `EPOCH_ADMIN_ROLE`: `0xa8254feae331b360dda9558bd798ab27bf43a131cb76e076a396102d8769e0ac`
  (held by `0xd481…` backup + `0x05c06…` smart wallet for in-app advance)
- K (lifetimeEpochs): **2** quarters
- 1 $SELF = 1 hour = `1e18` wei; minted rounded to the minute
- Token id: `(communityId << 32) | epoch`

# $SELF Decay — Calibration & Rationale (Phase 1.5)

*Drafted 2026-06-23. The concrete numbers behind `SelfEpochsV2`, why they were
chosen, the simulated behavior, and how to retune. Companion to
`spec-self-decay-redesign.md` (the design) and
`self-epochs-reference.md` (epoch mechanics).*

---

## The chosen model (LOCKED for launch)

- **Curve:** Linear decay.
- **Horizon `T` = 8 epochs (quarters) = 2 years.** A $SELF holding is worth full
  value at the epoch it's minted, then fades **evenly** to zero over 8 quarters.
- **Formula (epoch-granular):** for a holding minted in epoch `E`, at current
  epoch `C`:
  ```
  age    = C - E
  factor = max(0, 1 - age / T)        // fraction of value remaining
  value  = rawAmount × factor
  ```
- **Tenure (SelfPrestige) does NOT decay** — lifetime hours are permanent. Decay
  applies ONLY to spendable $SELF (SelfEpochsV2).

### Why linear (not exponential / half-life)
Legibility. "Your $SELF fades evenly and is gone after 2 years if you stop
earning" is understandable by any member. Half-life ("halves every N months,
with a forever tail") is mathematically smoother but harder to communicate, and
for a community currency, clarity beats elegance.

### Why T = 8 quarters
It sets the **accumulation ceiling**. With linear decay, a member earning a
steady `R` hours/quarter plateaus around `R × (T+1) / 2` (the sum of the decaying
chunks). T=8 is the balanced middle: long enough to accumulate toward premium
rewards, short enough that going inactive visibly erodes your balance within ~a
year. (T=4 → punchier/use-it-or-lose-it; T=12 → gentler/more hoardable.)

---

## Calibration anchor: the earn rate

Everything is priced relative to how much a real member earns. Estimated rates
from the built triggers (events ~1–3h each, bounties ~5–15h, votes trace/capped,
role stipends):

| Member type | ~Earn rate (R) |
|---|---|
| Casual | ~5 h/quarter |
| **Active (baseline)** | **~20 h/quarter** |
| Power contributor | ~40 h/quarter |

**Accumulation plateau** (steady earner, T=8):

| R | plateau (≈ spendable at steady state) |
|---|---|
| 5 h/q | ~22 h |
| **20 h/q** | **~90 h** |
| 40 h/q | ~180 h |

---

## Simulated behavior (verified against the contract math)

Steady **20 h/quarter** earner, T=8, who **stops at Q8**:

| Qtr | Earned | Spendable (decayed) | Affords 60h retreat? |
|---|---|---|---|
| 0 | 20 | 20.0 | no |
| 1 | 20 | 37.5 | no |
| 2 | 20 | 52.5 | no |
| **3** | 20 | **65.0** | **YES (~9 months in)** |
| 4–7 | 20 | 75 → 90 | yes |
| 8 | 20 | 90.0 (plateau) | yes — *stops earning* |
| 9 | 0 | 70.0 | yes |
| **10** | 0 | **52.5** | **no — lost it ~6mo after going inactive** |
| 11 | 0 | 37.5 | no |
| 12 | 0 | 25.0 | no |

This is the intended design working: **sustained contribution reaches premium
rewards; inactivity erodes below them.** Even a former power-contributor (Elder)
must keep earning to keep big-ticket access.

---

## Recommended price points (relative to the ~90h active plateau)

| Item | Price ($SELF hours) | Who can afford |
|---|---|---|
| Sticker pack | 2 h | anyone after one event |
| Event ticket | 3–5 h | active within a quarter |
| Limited merch (hoodie) | 15–20 h | active member, ~1 quarter |
| **Premium retreat booking** | **~60 h** | sustained-active only (~3+ quarters), erodes for inactive |

Prices are **per-listing and tunable** — set them against the current plateau and
adjust as real earn rates emerge.

---

## How decay is felt at spend time

`SelfPayment` (v2) charges against **decayed** value: to pay a price of P hours,
it burns enough *raw* tokens such that the *decayed* sum equals P. So as a
holding ages, it takes more raw $SELF to pay the same price — the decay bites
exactly when you spend, FIFO oldest-first (most-decayed spent first). Tenure is
unaffected (earning already recorded permanent lifetime hours at mint time).

---

## How to retune later (nothing here is irreversible)

- **Decay speed:** `SelfEpochsV2.setDecayHorizon(newT)` (EPOCH_ADMIN). Raising T
  slows everyone's decay / raises the plateau; lowering speeds it. Applies at
  read-time to all holdings (not stamped per token).
- **Item prices:** per-listing, anytime.
- **Earn rates:** the per-source hour values in `selfEarnService.ts`
  (event cap, bounty estimate, vote credit, role stipend) — server constants, no
  redeploy.

**Plan:** launch with T=8 + the prices above, watch real earn rates for 1–2
quarters, then adjust T and/or prices. The relationship (earn rate ↔ plateau ↔
price) is the thing to keep balanced.

---

## Contract status

- `src/contracts/SelfEpochsV2.sol` — written, compiles clean (solc 0.8.26,
  0 warnings, ~10.8KB). Linear decay via `decayFactorBps(id)` +
  `decayedBalanceOf(holder,id)`. All else (soulbound, roles, locking, mint/burn)
  identical to v1.
- **NOT YET DEPLOYED.** Deploy = redeploy SelfEpochsV2 + re-wire roles + repoint
  SelfMinter/SelfPayment + update paymaster + env `NEXT_PUBLIC_SELF_EPOCHS`.
  Constructor: `(admin, uri_="", initialEpoch=0, initialHorizon=8)`.
- SelfPayment must be updated to read `decayedBalanceOf` when computing burns
  (the one code change beyond the contract swap).
- Earn-loop / triggers / Tenure / budgets UNAFFECTED.

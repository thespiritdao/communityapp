# Spec — $SELF Slow-Decay Redesign (Phase 1.5)

*Drafted 2026-06-23. Supersedes the cliff-expiry model (D-17/D-18 expiry
mechanics) for SPENDABLE $SELF. Tenure (SelfPrestige) is unaffected — it remains
permanent and never decays.*

---

## Why this exists

The deployed `SelfEpochs` uses **cliff-expiry**: $SELF is fully spendable for K
epochs, then expires all at once. Ron's intent was always **slow decay**. The two
diverge sharply, and the difference matters for the core use-case:

> **The retreat-center test (Ron):** SpiritDAO (501c3) acquires a retreat center;
> communities book time, priced in $SELF, possibly at a premium that takes longer
> than one epoch (~quarter) to afford. Members must be able to work toward it over
> time — but it must require *active recent* contribution, so an Elder can't coast
> on legacy to claim it.

Cliff-expiry breaks this (you'd lose everything every ~6 months). Naive decay
*also* seems to break it ("leaky bucket"). The resolution: **slow decay where an
active member's earning rate outpaces the decay rate**, so:
- Active contributors *can* accumulate toward a premium reward.
- A member who stops contributing sees their spendable balance erode and
  eventually can't afford big-ticket items — exactly the desired pressure.
- $SELF stays genuinely spendable (its value as an intercommunity currency).

Tenure (permanent lifetime hours) remains the legacy record; decay applies only
to the **spendable** layer.

---

## Design principles (the constraints the curve must satisfy)

1. **Spendable.** $SELF is burned for goods/tickets/retreat. Value must be real.
2. **Recent-weighted.** Old $SELF is worth less than new $SELF (decay), so the
   balance reflects *current* participation.
3. **Accumulable by the active.** For a member contributing at a steady rate R
   (hours/period), the steady-state spendable balance must be **high enough to
   reach premium price points** — i.e. earning must outrun decay for the active.
4. **Erodes for the inactive.** Stop contributing → balance trends toward ~0
   over a bounded, predictable horizon.
5. **No cliffs.** Value changes smoothly; no "lose it all on a date."
6. **Cheap to compute at read-time.** Soulbound 1155 has no per-token cron; the
   balance must be derivable from (mintedAmount, ageInTime, decayParams) in a
   `view`. No unbounded loops.

---

## Candidate decay curves

Let `a` = age of a minted chunk (in seconds/days since mint), value = minted ×
f(a). Each chunk decays independently; spendable balance = Σ over live chunks.

### Option 1 — Linear decay to zero over horizon T
`f(a) = max(0, 1 - a/T)`. e.g. T = 365 days → a chunk loses 1/365 of its value
per day, hits 0 at one year.
- ✅ Dead simple, intuitive ("your $SELF lasts a year, fading evenly").
- ✅ Trivial read-time math.
- ⚠️ Still a (soft) endpoint at T; but no cliff.
- **Accumulation:** steady earner reaches a finite plateau ≈ R × T / 2 (triangle
  area). Tune T up to raise the ceiling.

### Option 2 — Exponential decay (half-life H)
`f(a) = 0.5^(a/H)`. e.g. H = 180 days → value halves every 6 months, never
exactly 0.
- ✅ Smoothest; classic "demurrage." No endpoint.
- ✅ Cheap read-time (one pow/exp — approximate with fixed-point).
- ⚠️ Long tail: tiny dust persists forever (cosmetic).
- **Accumulation:** steady earner plateaus at ≈ R × H / ln(2). Tune H.

### Option 3 — Linear with a floor / grace period
`f(a) = 1` for a < G (grace, no decay), then linear/exp after. e.g. full value
for the first quarter, then decay.
- ✅ Rewards recent earning fully; only older $SELF decays.
- ⚠️ Slightly more params.

**Lean:** Option 1 (linear-to-T) for explainability, OR Option 2 (half-life) for
smoothness. Both satisfy the principles; the choice is UX/feel + how we want the
accumulation ceiling to behave. Decision needed (see Open Questions).

---

## The accumulation math (the retreat tension, quantified)

For a member earning R hours per epoch (quarter) at steady state:
- **Linear, horizon T quarters:** plateau ≈ R × T / 2.
  e.g. R = 20h/quarter, T = 8 quarters (2 yr) → plateau ≈ 80h spendable.
- **Exponential, half-life H quarters:** plateau ≈ R × H / 0.69.
  e.g. R = 20h/quarter, H = 4 quarters → plateau ≈ 116h spendable.

**So the retreat price should be set relative to this plateau.** If a premium
retreat costs ~60h, a steady 20h/quarter contributor reaches it in ~1.5–2 years
of sustained activity, and an Elder who quits drops below it within a year. That
is exactly the "active contribution required" pressure Ron wants — and it's a
*tunable* relationship between (earn rate, decay horizon, price).

> Key insight: decay doesn't prevent big-ticket saving — it sets a **ceiling
> proportional to your activity level**, and prices the premium item near that
> ceiling so only the sustainedly-active can reach it.

---

## Contract changes (blast radius)

**Redeploy `SelfEpochs` v2** with decay (soulbound 1155 is immutable — no
in-place upgrade). The id still encodes (community, epoch) for provenance, but
the *value* of a holding becomes time-dependent.

Two implementation approaches:
- **(A) Per-mint-timestamp decay:** store each mint's timestamp; `liveBalanceOf`
  computes Σ minted_i × f(now - t_i). Most accurate, but ERC-1155 fungible ids
  don't track per-mint timestamps natively — would need a parallel structure
  (mapping of (holder, id) → list of {amount, ts}), which risks unbounded loops.
  ❌ gas/complexity concern.
- **(B) Epoch-granular decay (RECOMMENDED):** decay by **epoch age**, not exact
  timestamp. A holding of id (community, E) decays as a function of
  (currentEpoch - E). Since id already encodes epoch, `balanceOf(holder, id)` ×
  decayFactor(currentEpoch - E) is a clean read — no per-mint tracking, no loops.
  Granularity = one epoch (quarter), which is plenty for "slow" decay.
  ✅ This reuses the existing id structure; decay replaces the binary
  isLive() with a fractional decayFactor().

**With (B), the change is surgical:** `isLive()` (boolean) → `decayFactor(id)`
(fraction, e.g. fixed-point bps). `liveBalanceOf` and `SelfPayment`'s burn
selection multiply by it. Everything else (mint, provenance, Tenure) unchanged.

**Re-wire after redeploy** (the Phase-0 dance for this one contract): grant
MINTER→SelfMinter, BURNER→SelfPayment, EPOCH_ADMIN→0xd481+smart wallet; repoint
SelfMinter/SelfPayment to the new SelfEpochs; update paymaster; update env
`NEXT_PUBLIC_SELF_EPOCHS`. Test tokens abandoned (test data).

**Unaffected (no retest):** earn-loop (all 3 triggers proven), SelfMinter,
SelfPrestige/Tenure, budgets, ledger, Exec UI, paymaster policy shape.

---

## SelfPayment interaction (important)

Burn-to-pay must charge against **decayed** value:
- When a user pays P hours, SelfPayment computes each candidate id's *decayed*
  value, and burns enough *raw* tokens such that the *decayed* sum = P.
- FIFO by oldest epoch still applies (spend most-decayed first = natural).
- This means a user needs *more raw $SELF* to pay as their holdings age — the
  decay is felt exactly at spend time. Correct and intuitive.

---

## Open questions (decide before building)

1. **Curve:** linear-to-horizon (Option 1) vs. half-life (Option 2) vs.
   grace+decay (Option 3)? Affects feel + the accumulation plateau formula.
2. **Rate:** the horizon T or half-life H — in epochs. (Drives the plateau, and
   thus how the retreat is priced.) Needs a rough target: "a steady X h/quarter
   member should be able to afford a ~Y h premium item after Z quarters."
3. **Granularity:** confirm epoch-granular decay (B) is acceptable (decay steps
   once per quarter, not continuously). Recommended for clean on-chain reads.
4. **Floor:** does decay hit exactly 0 (linear) or asymptote (exponential)? Any
   minimum?
5. **Retreat/premium pricing model:** is it priced in raw $SELF (so decay makes
   it cost more as you wait) — yes, per §SelfPayment. Confirm.
6. **Display:** members see *decayed* (current) spendable value, with maybe a
   hint of decay ("your $SELF fades ~X%/quarter"). UX copy needed.

---

## Recommendation

**Epoch-granular (B) + a chosen curve, tuned so a steady contributor's plateau
sits comfortably above near-term perk prices but reaching a *premium* (retreat)
requires sustained multi-quarter activity.** Linear-to-T is the most
explainable; half-life is the smoothest. I lean **linear-to-T (Option 1)** for
launch — easiest to communicate ("$SELF fades evenly over T; keep earning to
keep it up") — with T chosen against a concrete retreat-price target.

Next step: Ron sets the target relationship (earn rate ↔ premium price ↔ time),
which fixes the curve params; then build `SelfEpochs` v2.

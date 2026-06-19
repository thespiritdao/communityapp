—>  My comments follow ‘—>’

# Spec — $SELF Soulbound Redesign (SelfEpochs)

*Drafted 2026-06-14. Status: implementation spec. Supersedes the ERC-20 $SELF
model. Companions: `ideation-self-tokenomics.md`, `self-tokenomics-followup-answers.md`.*

> **One-line product framing (for later newsletter):** $SELF is verified human
> time, recorded where it was spent, that fades unless renewed — and it never
> becomes money.

---

## 0. Decision record (what's settled)

These are confirmed by Ron and are no longer open:

| # | Decision |
|---|---|
| D-1 | $SELF becomes **soulbound** (non-transferable). Only mint (→ earner) and burn (redeem/expire) exist. |
| D-2 | **Pods never hold $SELF.** "Issuance" = a pod's mint **budget** (capacity), not a token balance. The treasury/distributor model for $SELF is removed. |
—> need ux infra for this as well as the actual infra
| D-3 | Go **straight to the on-chain ideal (D2)** — deploy a soulbound `SelfEpochs` **ERC-1155**, retire the ERC-20 `SelfToken`. No D1 ledger-mirror interim (no live communities to protect). |
—> ux needed, for exec pod only?
| D-4 | Issuance is **hour-anchored**: 1 $SELF ≈ 1 verified participation-hour. |
| D-5 | Token ids encode **(community, epoch)** → provenance + expiry for free. |
| D-6 | Marketplace payment default = **open-sink with provenance discount** (foreign $SELF accepted at the community's recognition weight). Hardcore-exclusive is per-listing opt-in. |
| D-7 | Precision: **store full 18-decimals; mint/round to the minute** (1/60 h). Minute is the display/credit unit, not the storage unit. |
| D-8 | High-value / anomalous mints route to an **Exec Pod review queue** with an **Exec-only management UI**. |
| D-9 | **All transactions sponsored via Coinbase Paymaster.** New contracts + their function signatures must be registered in the paymaster allowlist (CSV, no spaces, incl. `()`). |
| D-10 | Cross-community = **recognition, not exchange.** No swaps. Provenance + per-community recognition weights. |
| D-11 | **Vote earning = trace-level, kept.** Tiny accrual (~1–2 min/vote, low epoch cap), explicitly NOT income — accumulates toward a full $SELF only over long sustained participation. Anti-apathy nudge, not pay-to-vote. |
| D-12 | **`SelfPayment` is ONE shared burn-to-pay+receipt primitive** reused across marketplace, event ticketing, and access-gated bounties. No surface-specific burn code. |
| D-13 | **Event ticketing can burn $SELF** (events priced in $SELF; ticket purchase burns via `SelfPayment`), in addition to door-check on the receipt. Events are a first-class $SELF sink. |
| D-14 | **Bounty burn-to-claim = access-gate flavor ONLY**, via `SelfPayment`. NO refundable commitment-stake (irreconcilable with soulbound), NO pure-cost tax on labor. |
| D-15 | **Governance-staking seam designed now, built later.** `SelfEpochs` + ledger must not PRECLUDE future lock-for-voice (e.g. a per-id/per-holding lock flag that exempts locked epochs from expiry + spend), but no staking logic in Phase 0–3. |

### Deliverables beyond code (Ron's notes)
Each major component ships with a **training trio**: a text guide, a visual
flow-of-happenings map, and a short video script. Applies at minimum to: id
encoding / provenance model (§2.1), burn-to-pay (§4), the pod participation-
budget + recognition UX (§8, §5). The recognition UX is a **pod tab** built on
the modular architecture so leaders assign permissions clearly (§5).

---

## 1. Current-state ground truth (from audit, 2026-06-14)

What exists today that this redesign changes:

- **`SelfToken.sol`** — vanilla ERC-20: `ERC20 + ERC20Burnable + AccessControl`,
  `MINTER_ROLE` gated `mint`, **no** pause, **no** transfer hook, **not**
  upgradeable. Deployed `0x2d9e8A4DdED7438C2D4C8050Ed58B9F4Bc0c8298`.
- **Pods hold $SELF today**: `PodTreasuryV3.sol` holds it;
  `PodTreasuryService.getTokenBalances()` queries `[SYSTEM, SELF]`;
  `treasury_transactions` records $SELF flows. → **must be removed for $SELF.**
- **`PodSELFDistributor.sol`** exists but is **NOT deployed** (no env var). It
  embodies the pod-distributes-$SELF model D-2 kills. → **do not deploy.**
- **Marketplace accepts $SELF** as ERC-20 payment via `tokenConfig.ts` →
  `transactionService` (approve + transferFrom) → `PurchaseRouter` /
  `PurchaseBurn` / `PurchaseRouterDecentralized`.
—> Marketplace still must accept SELF, or burn it, because its a central burning mechanisms and allows the custom goods, etc. 
- **`PurchaseRouter`** routes $SELF proceeds to `BURN | WALLET | POD_TREASURY`.
  → soulbound $SELF can only ever **BURN**; WALLET/POD_TREASURY destinations
  are impossible for $SELF (a soulbound token can't be routed anywhere).
- **`PurchaseBurn.sol`** already **burns** $SELF on purchase — conceptually
  the closest existing primitive to "burn-to-pay."
- **Events**: rich check-in stack already exists (`EventCheckInSystem`,
  `EnhancedAttendeeCheckIn`, `QRCodeService`, attendance records). → the mint
  trigger plugs in here; no new attendance primitive needed.
—> auto minting of self in relation to the event being closed out?  
- **Eligibility framework**: generic registered-ERC-20 gating already built
  (the TreeGens/$TGN work); `EligibilityService.evaluateRegisteredErc20Balance`
  reads a token registry + on-chain balance. → provenance gating extends this
  with an epoch-aware balance resolver.

### Contracts depending on the $SELF address (redeploy impact)

| Contract | Dep type | Action under redesign |
|---|---|---|
| `PurchaseRouter` (`0x4e12…`) | immutable selfToken | **Redeploy** (and interface change: burn-only) |
| `PurchaseRouterDecentralized` (`0x2A2A…`) | immutable | **Redeploy** (burn-only) |
| `EventEscrow` (`0x81D5…`) | immutable | **Redeploy** (burn-to-pay) |
| `PurchaseBurn` (`0x61cF…`) | immutable | **Redeploy** against 1155 burn iface |
| `TokenFaucet` (`0x189a…`) | immutable | **Retire** — a faucet for an *earned soulbound* token is nonsensical |
| `BountyManagerV4` (`0x7b3d…`) | setter exists | **Redeploy** (ERC-20→1155 iface change forces it) |
| `EventManager` (`0x741d…`) | setter exists | **Redeploy** (iface change) |
| `PodSELFDistributor` | not deployed | **Do not deploy** (replaced by budget-ledger mint) |
| `PodTreasuryV3` | generic token | **Remove $SELF** from its supported-token set; keep for $SYSTEM |

> The hard part is **not** the address swap — it's that a soulbound 1155 has
> **no `transferFrom`**. Every "pay with $SELF" path (`transferFrom` → route)
> becomes "**burn epochs (FIFO) + mint a redemption receipt**." That is a
> different contract shape, specced in §4.

---

## 2. Token model — `SelfEpochs` (soulbound ERC-1155)

### 2.1 Id encoding
→ We’re going to need to create a separate guide for this, both a text doc, a visual flow of how the process works, and a script that i can share in a recorded video.

A token id encodes `(communityId, epoch)`:

```
id = (uint256(communityId) << 32) | uint256(epoch)
```

- `communityId` — a stable uint per community (pod). Mapping kept on-chain
  (`communityId ↔ pod`) and mirrored in DB for display.
- `epoch` — monotonically increasing season counter (uint32). Global epochs
  (same clock for all communities) keep expiry math uniform; community is
  carried separately in the id, so "TreeGens Season 4" is `(tgnId, 4)`.
- A wallet's **live balance** = Σ `balanceOf(wallet, id)` over non-expired ids.
- **Provenance** of any holding is read directly from the id. No off-chain
  lookup needed to answer "how much $SELF did you earn in community X, season Y."

### 2.2 Soulbinding

Override `_update` (OZ v5 ERC-1155 hook) to revert on any movement where both
`from != address(0)` and `to != address(0)`:

```solidity
function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
    internal override
{
    require(from == address(0) || to == address(0), "SELF: soulbound");
    super._update(from, to, ids, values);
}
```

Allows mint (`from==0`) and burn (`to==0`); forbids all transfers including
`safeBatchTransferFrom`. No approvals usable for transfer.

### 2.3 Roles & control

- `AccessControl` with:
  - `MINTER_ROLE` → the **SelfMinter** contract only (§3), never an EOA.
  - `BURNER_ROLE` → the **redemption/payment** contracts (§4), never an EOA.
  - `EPOCH_ADMIN_ROLE` → Exec, advances epochs and sets expiry K.
  - `DEFAULT_ADMIN_ROLE` → Exec multisig / governance timelock.
- **Clawback**: `BURNER_ROLE` can burn a specific `(wallet, id, amount)` during
  the dispute window (fraud reversal). Soulbound makes this clean — no innocent
  third-party holders ever exist.

### 2.4 Expiry

- Each id's epoch implies an expiry: live iff `currentEpoch - epoch < K`
  (K = lifetime in epochs, e.g. 2 seasons). `K` is `EPOCH_ADMIN_ROLE`-settable.
- Expiry is **computed at read time** (no per-token sweep needed for
  correctness): balance resolvers ignore expired ids. An optional janitor job
  may `burn` expired ids to keep `totalSupply` honest and emit Pulse events,
  but gating/payment never depend on the sweep having run.
- **Prestige conversion**: when an id expires, a janitor mints a non-spendable
  **prestige credential** (separate soulbound contract or a reserved id range)
  recording "Community X · Season N contributor · tier". Prestige is itself a
  gating signal ("≥3 seasons") but never spendable.



### 2.5 Precision (D-7)

- 18 decimals stored (1155 `value` is uint256; treat as 1e18 = 1 hour).
- The **SelfMinter** rounds credited amounts to the nearest minute
  (`1e18 / 60`) before minting, so balances render cleanly as `Hh Mm`.
- Recognition-weight multiplications (§5) happen at **read time** on full
  precision, rounded only for display — never lossily stored.

---

## 3. Issuance — `SelfMinter` + budget ledger

### 3.1 Principle

Communities never mint. The **protocol** mints against **attested platform
actions**, bounded by the community's **budget** and the **hour anchor**.

### 3.2 On-chain: `SelfMinter`

- Holds `MINTER_ROLE` on `SelfEpochs`. Sponsored via Paymaster (D-9).
- Exposes `batchMint(BatchMintItem[] items)` callable only by a backend
  **attestation signer** (role-gated) — the server computes who earned what
  from attested DB state and submits batches (weekly / post-event).
- Each item: `(wallet, communityId, epoch, amount, sourceRef)`. `sourceRef`
  ties the mint to its attestation (event id, bounty id, proposal id) for the
  audit trail / Pulse.
- Enforces nothing about *fairness* on-chain (that's the server's job against
  the ledger); on-chain it only enforces soulbound + role. **Budgets and caps
  live in the server ledger**, not the contract, so policy can evolve without
  redeploys. (Contract is the truth of *balances*; ledger is the truth of
  *entitlement*.)

### 3.3 Off-chain: budget + attestation ledger (Supabase)

New tables:

- `pod_self_budgets (pod_id, epoch, allocated_hours, minted_hours, source)` —
  one row per pod per epoch. `source` ∈ {algorithmic, exec_petition, multiplier}.
- `self_mint_queue (id, wallet, pod_id, epoch, hours, source_type, source_ref,
  status, anomaly_flags, created_at)` — pending mints awaiting batch/Exec.
  `status` ∈ {pending, approved, exec_review, rejected, minted, clawed_back}.
- `self_member_epoch_earned (wallet, pod_id, epoch, hours)` — running total for
  the per-member diminishing-returns curve.
→ Provide sql, i will add myself to supabase

### 3.4 Mint sources (all from existing primitives)

| Source | Trigger (exists) | Hours |
|---|---|---|
| Event attendance | check-in record + organizer confirm (dual attest) | `min(scheduled_duration, 8h/day)` |
| Bounty completion | approval in existing review flow | poster's estimated-hours field (new field on bounty) |
| Governance vote | vote record | flat 0.25h, capped 1h/epoch (§6) |
| Verification work | review/approval records (e.g. TreeGens verifiers) | per-task rate |
| Role service | hat held + epoch served | epoch stipend |

### 3.5 Budget models (layered, D-2/Ron)

1. **Algorithmic baseline** (default, no petition): per epoch,
   `allocated = base + α·verified_active_members + β·attended_hours_last_epoch`.
   New communities get a small probationary base.
2. **Exec petition** (exception): one-time boost for a planned festival/launch;
   unspent expires; recorded as a `pod_self_budgets` row with `source=exec_petition`.
3. **Skin-in-the-game multiplier** (optional): locking $SYSTEM in the pod
   treasury raises the budget *ceiling* (capacity multiplier — never a purchase
   of $SELF; the two tokens never exchange).

Budgets cap **minting capacity**; unspent does not roll over (or rolls at 50%)
so allocation isn't farmed.

### 3.6 Anti-abuse stack

1. Attestation-gated mint (dual attest for events).
2. Hour anchor → physics ceiling (event ≤ attendees × duration).
3. Per-member diminishing returns within an epoch (first ~10h full, tapering).
4. Per-community budget caps (worst case: a community wastes its own capped
   budget, visibly).
5. Radical transparency — every mint → Pulse feed (amount, source, attestors).
6. Dispute window + clawback (BURNER_ROLE), clean because soulbound.
7. Exec review queue for high-value/anomalous mints (§7).
8. Identity layer (existing roadmap) for sybil resistance at account level.

---

## 4. Spend — burn-to-pay + receipts

### 4.1 The shape change
→ similar request ot as above, as we build we need multiple training docs created, text, flow of happenings map, script for video tutorial

ERC-20 path (today): `approve` → `transferFrom` → route (BURN/WALLET/TREASURY).
1155 soulbound path (new): `SelfPayment.payWithSelf(...)`:

1. Compute required hours for the listing, applying provenance/recognition
   weight per-id (§5).
2. **Burn** the buyer's eligible epoch ids **FIFO (oldest epoch first)** up to
   the required amount (`BURNER_ROLE` on `SelfEpochs`).
3. Mint a **soulbound redemption receipt** (separate id range or receipt
   contract) to the buyer: `(productId, hoursPaid, provenanceBreakdown, ts)`.
4. Emit `PurchasePaidWithSelf` (Pulse).

No proceeds go anywhere — soulbound $SELF can only burn. `PurchaseRouter`'s
`WALLET` / `POD_TREASURY` destinations are **not applicable to $SELF** (they
remain valid for $SYSTEM, which stays a normal transferable ERC-20). Mixed
carts: $SYSTEM portion routes as today; $SELF portion burns.
→ The following needs to incorporate SELF burn:  /market/ (artifacts), events, bounty (is it possible to say you must burn X self to complete this bounty, is it desirable?), 


### 4.2 Receipts → fulfillment

- Redemption receipt is itself soulbound until fulfilled.
- **Physical merch**: receipt + verified delivery details on the **same**
  account; per-identity quantity limits. (Solves the misdirected-merch fear:
  can't acquire someone else's receipt; can't ship to a different identity.)
- **Event perks**: receipt checked at the door via existing wallet-signed QR
  Check-in.
→ should go beyond event perks, some events might be self gated only, your ticket purchase burns the self
→ should we also exploring staking self for greater governance weights in the future, or at least making sure that the foundation is there 

### 4.3 Contracts to (re)build

- `SelfPayment` (new) — burn-to-pay + receipt mint. Replaces $SELF logic in
  `PurchaseBurn`/`PurchaseRouter` for the $SELF leg.
- `PurchaseRouter` / `PurchaseRouterDecentralized` — redeploy; $SELF leg
  delegates to `SelfPayment` (burn-only), $SYSTEM leg unchanged.
- `EventEscrow` / `EventManager` / `BountyManagerV4` — redeploy against the
  1155 burn interface for any $SELF-denominated flows.
- `TokenFaucet` — retire.

---

## 5. Cross-community — recognition (D-10)

- Default: external-provenance $SELF counts at weight **0** for a community's
  gates/listings (community-scoped by default, mirroring `$TGN owner_pod_id`).
- Per-listing / per-gate **recognition weights**: `(fromCommunity → weight)`,
  e.g. TreeGens $SELF at 0.5× in our event gate or marketplace pricing.
- **Exec default trust list**: communities in good standing get a baseline
  mutual recognition (e.g. 0.25×) for ecosystem-wide perks; pods may raise or
  zero it per relationship.
- Mechanism is **policy applied at evaluation/pricing time** over the id's
  provenance — never a conversion. Same machinery serves gating (who qualifies)
  and pricing (how much foreign $SELF a listing costs).
- Vehicle for formal cross-pod recognition: `spec-inter-pod-agreements.md`.
→ UX must be built into pods, may be a new tab?  Be sure into incorporate our modular architectural approach  - users should be able to clearly assign permissions 

---

## 6. Governance vote earning — UX (Ron's note)

- Voting flow **unchanged**; never gated or delayed by earning.
- Confirmation toast shows a subtle credit: "Vote recorded · +15m participation."
- Quiet cap indicator on the governance page: "Participation credit this season:
  45m / 1h."
- Credit accrues to `self_mint_queue` (pending), settled in the weekly batch —
  user never waits on a tx.
- Small + capped on purpose: an anti-apathy nudge, not income; the cap blocks
  vote-spam farming.
→ are you suggesting we provide SELF for voting?  I dont like this, and dont think it should be incorporated.  
→ your logic is anti apathy?  
→ if we were to note this i would want it to be minimal, very low distribution, the idea being that over time it will accumulate into a full self but it takes time…

---

## 7. Exec review & high-value flagging (D-8, Ron's note)

- **Auto-flag rules** (server, at queue time): single mint > threshold (e.g.
  >20h to one member); a batch that pushes a pod's `minted ÷ attended-hours`
  outside a healthy band (≈1.0–1.3); novel/unverified source. Flagged items →
  `status=exec_review` instead of `approved`.
- **Exec-only panel** (gated by the Executive hat, same pattern as
  `ExecPodReviewPanel` / the token-registration panel): pending high-value
  mints, anomaly flags, attestation trail, approve / reject / clawback.
- This is the human judgment layer atop the algorithmic physics layer: the
  anchor catches *impossible*; Exec catches *suspicious-but-possible*.
- Fits the platform's authorize → review → execute architecture.

---

## 8. Pod UX revision (Ron's note)

Remove every surface implying a pod **holds/distributes** $SELF; replace with
**capacity** language.

- **Treasury card**: drop $SELF from pod treasury balances (keep $SYSTEM).
  Where $SELF appeared as a treasury asset, show nothing.
- **New "Participation budget" surface** (pod manage): this epoch's
  `allocated / minted` hours, source (algorithmic vs petition), and a
  "Petition Exec for more" action.
- **Member view**: a member's $SELF as a provenance-broken-down,
  expiry-aware participation record ("This season: 12h 30m · Expires end of
  Season 5 · 3 prior seasons"), not a spendable wallet balance with send.
- **Remove** any "distribute $SELF to members" pod-admin action (the
  `PodSELFDistributor` UX). Earning is automatic via attestation.
- **Marketplace listing editor**: add the payment-policy dial (hardcore-
  exclusive / open-sink / provenance-discount, default provenance-discount)
  and optional scarcity reservation.

---

## 9. Paymaster (D-9)

- New contracts (`SelfEpochs`, `SelfMinter`, `SelfPayment`, prestige/receipt
  contract) + their function signatures registered in the Coinbase Paymaster
  allowlist at deploy (CSV, no spaces, incl. `()`), so all mints/burns/payments
  are sponsored like every other call.
- **Future task (not now):** schedule a paymaster-allowlist review to confirm
  coverage remains ideal as contracts evolve.

---

## 10. Phasing / build order

> Expiry is deliberately late: turning on expiry before spend sinks exist just
> punishes early earners.

**Phase 0 — Contracts & retirement (foundation)**
- Write `SelfEpochs` (soulbound 1155, id encoding, expiry-at-read, clawback).
- Write `SelfMinter` (batch mint, attestation-signer role).
- Write `SelfPayment` (burn-to-pay FIFO + receipt).
- Redeploy dependents (§1 table); retire `TokenFaucet`; remove $SELF from
  `PodTreasuryV3` supported set; **do not** deploy `PodSELFDistributor`.
- Register all new contracts + sigs in Paymaster.
- Retire ERC-20 `SelfToken` (no migration — no live balances to carry; confirm
  testnet supply is disposable before mainnet cutover).

**Phase 1 — Earn loop (one community, no expiry yet)**
- Budget + queue tables; algorithmic baseline (manual Exec budget acceptable at
  N≤3 communities).
- Event-attendance mint (dual attest) + bounty mint (estimated-hours field) +
  vote micro-mint.
- Pulse entries per mint; member participation-record UX (§8).

**Phase 2 — Spend loop**
- `SelfPayment` burn-to-pay wired into marketplace + event perks.
- Provenance-aware gating via the eligibility framework (epoch-aware balance
  resolver extending `evaluateRegisteredErc20Balance`).
- Receipt → fulfillment (merch delivery binding, event QR).
- Marketplace payment-policy dial (§8); listing default = provenance-discount.

**Phase 3 — Time binds**
- Turn on epoch expiry (K) + prestige conversion janitor.
- Optional `totalSupply` sweep job.

**Phase 4 — Federation**
- Recognition weights + Exec trust list + algorithmic budgets replacing routine
  petitions.
- Exec review/flagging panel (can land earlier if high-value mints appear in
  Phase 1).

---

## 11. Resolved parameters (2026-06-15)

- **D-16 Epoch length = calendar quarter.** Matches "season" framing, humane
  expiry pace, quarterly ops ceremony, seasonal budget rhythm.
- **D-17 `K` (lifetime) = 2 quarters, configurable, global, Exec-only.** Earned
  $SELF is spendable for its epoch + the next 2 (~6 months). K is an
  `EPOCH_ADMIN_ROLE` global setting (NOT per-pod). K-changes apply to FUTURE
  epochs only — never retroactively shorten already-earned $SELF. Users never
  set or see K directly; they experience "spend within ~6 months" via the
  expiry-aware balance display (§8) + a pre-expiry nudge (~3 weeks out:
  "redeem or it converts to a Season badge").
- **D-18 Three soulbound credential contracts, separated by lifecycle:**
  1. `SelfEpochs` — spendable, expiring, (community,epoch) ids. The currency-ish layer.
  2. `SelfReceipt` (new) — redemption receipts (proof you burned $SELF for a
     good/ticket). Drives fulfillment (shipping, door scan). Never expires,
     never spendable, not tiered. Plumbing.
  3. `SelfPrestige` (new) — permanent legacy badges. When unspent $SELF expires
     at epoch rollover, the janitor mints/upgrades the wallet's prestige badge
     recording cumulative lifetime contributed-hours + a derived tier. Badges
     only level UP (cumulative); never regress as $SELF expires. Itself a gating
     signal ("≥3 seasons", "Steward+") but NEVER spendable.
  Separation keeps `SelfEpochs`' "live balance = Σ non-expired ids" math clean,
  prevents marketplace/governance code from ever counting a badge as money, and
  keeps the staking seam (D-15) scoped to `SelfEpochs` only.
- **D-19 (SUPERSEDED — see D-19b).** ~~Prestige tiers — naturalist voice, 4
  tiers, per-community (Seedling→Old-Growth).~~

- **D-19b (2026-06-16, supersedes D-19) — "Tenure": 5 tiers, ECOSYSTEM-WIDE,
  Option-B (all earned $SELF), membership-floor tier 1.**
  - Reframed from per-community naturalist badges to a single ecosystem-wide
    **Tenure** identity standing (one band per member, summed across ALL
    participation). Per-community prestige dropped — the contract's `community`
    dimension collapses to one ecosystem id.
  - **Option B (changed from D-18's Option A):** prestige counts ALL $SELF ever
    earned, NOT only expired-unspent. Spending $SELF does not reduce Tenure.
    ⇒ the prestige-recording call wires into the EARN path (every mint also
    records lifetime hours), not the expiry/janitor path.
  - **5 bands** (lifetime $SELF hours):
    | Band | Hours | Identity |
    |---|---|---|
    | Curious | 0–10 | Holds Proof of Curiosity; onboarding→first contributions |
    | Resident | 10–50 | Now dwells in the ecosystem |
    | Mainstay | 50–250 | Reliable, load-bearing presence |
    | Pillar | 250–600 | Sustained, structural contributor |
    | Elder | 600+ | Longest-tenured, multi-year |
  - **Tier 1 = membership floor:** any Proof-of-Curiosity holder IS "Curious"
    immediately (0 hrs). Tiers 2–5 are hours thresholds.
  - Names are frontend-only (NOT in contract). Thresholds set at deploy +
    adjustable via setter.
  - Images: `public/images/members/` — curioussquare500x.jpg,
    residentsquare500x.jpg, mainstaysquare500x.jpg, pillarsquare500x.jpg,
    eldersquare500.jpg (note: elder lacks the 'x').

- **D-21 (2026-06-16) — Identity UI restructure.** Rename "Membership" section →
  **"Tenure"** (the 5-band lifetime standing). Move **Advocate** out of
  Tenure into a new **"Accreditations"** grouping (Advocate is a granted
  credential, not a tenure band). Replace the donation-gifted Advocate image
  treatment per the new members/ image set. Add a band-details modal describing
  each Tenure band.
- **D-20 ERC-20 `SelfToken` retirement = retire-by-replacement, NO migration.**
  Current balances confirmed disposable (mainnet but never used). Deploy
  `SelfEpochs` fresh, repoint dependents, abandon the old ERC-20. No balance
  carry, no snapshot, no airdrop, no holder communication.

### Still-open (NON-blocking — server-tunable post-deploy)
- Diminishing-returns curve shape/params (lives in server ledger).
- Anomaly thresholds for Exec flagging (server ledger).
- $SYSTEM-lock budget multiplier — Phase 4 or deferred.
- Prestige scope confirmation: per-community (recommended/assumed) vs
  ecosystem-wide cumulative — Ron to confirm.



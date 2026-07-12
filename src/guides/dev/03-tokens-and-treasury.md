# SpiritDAO: Tokens & Treasury (Developer Documentation)

> **Audience:** developers, integrators, and technical evaluators. This document
> covers the SpiritDAO token economy and treasury system.
>
> **Scope note:** This is public-safe documentation. Contract addresses below are
> already public on Base. It describes only **shipped** behavior; anything not yet
> built is marked **Planned**. It deliberately omits security-sensitive internals
> (row-level-security policies, admin-only flows, exact authorization-gate logic,
> and the backend attestation signer).

---

## Two tokens, two purposes

The economy has exactly two tokens. They are deliberately different shapes:

| | **$SYSTEM** | **$SELF** |
|---|---|---|
| Standard | ERC-20 | ERC-1155 (epoch ids) |
| Transferable? | **Yes** | **No (soulbound)** |
| Backed by | Capital held by the nonprofit (~1:1 USD) | Verified participation-hours |
| Created by | Stripe donation pipeline | Attested platform actions |
| "Spending" means | Transfer | **Burn** |
| Decays? | No | Yes (expires) |

The guiding idea (see `00-architecture-overview.md`, "Soulbound-by-default"):
**$SYSTEM is money; $SELF is earned standing.** You cannot buy $SELF, sell it, or
gift it: you participate to earn it, and you burn it to use it.

---

## $SYSTEM: the capital-backed utility token

A transferable ERC-20, backed roughly **1:1 by capital** held by the SpiritDAO
nonprofit (1 $SYSTEM ≈ $1 USD).

- **Contract:** `SystemToken`, `NEXT_PUBLIC_SYSTEM_TOKEN` (`0x00f757...`)
- **Minted** via the Stripe donation pipeline (a fiat donation mints $SYSTEM to
  the donor, see Treasury below).
- **Used for:** events, bounties, the marketplace, gifting, and pod treasuries.
- **Burnable for fiat** via Claims: a holder can redeem $SYSTEM back to USD,
  because the nonprofit holds matching capital.

Because $SYSTEM is freely transferable, it is the unit of account everywhere a
real-money price is needed.

---

## $SELF: the soulbound participation token

$SELF was **redesigned in 2026** from a retired transferable ERC-20 into a
**soulbound ERC-1155**. This is the most distinctive piece of the economy, so it
is worth understanding in full.

- **Contract:** `SelfEpochs` / `SelfEpochsV2`, `NEXT_PUBLIC_SELF_EPOCHS`
  (`0x169760...`)
- **Source:** `src/contracts/SelfEpochsV2.sol`

### Soulbound: mint and burn only

There are only two operations: **mint** and **burn**. There is no transfer. The
contract overrides the ERC-1155 `_update` hook to **revert** any transfer
between wallets. You earn it, you hold it, you burn it: it never moves sideways.

### Token id encodes provenance

A $SELF token id packs `(communityId, epoch)`:

```
id = (communityId << 32) | epoch
```

This means **provenance and age are read directly off the id** (no extra lookup
table). A wallet's **live balance** is the sum of `balanceOf` over all of its
**non-expired** ids.

### Hour-anchored amounts

$SELF is denominated in **verified participation-hours**:

- `1e18` = **1 hour** of verified participation.
- Amounts are minted **rounded to the minute** (i.e. in units of `1e18 / 60`).

### Decay / expiry

$SELF is **time-bound**. It is meant to reflect *recent* participation, so it
fades:

- An **epoch** is a calendar **quarter**.
- Lifetime **K = 2 quarters** (configurable, global, **Exec-only**), so a given
  $SELF grant is spendable for **~6 months**, then expires.
- **V2 uses LINEAR decay** (value fades smoothly across its lifetime), replacing
  V1's hard **cliff** (which dropped to zero all at once).
- **Expiry is computed at read time** from the epoch in the id. Expired ids drop
  out of the live balance automatically; nothing has to be "swept."

### Minting: attested, budget-bounded

Minting is performed by the **SelfMinter** contract:

- **Contract:** `SelfMinter`, `NEXT_PUBLIC_SELF_MINTER` (`0xDcD71c...`),
  holds `MINTER_ROLE`.
- It **batch-mints** against **attested platform actions** (event attendance
  with dual-attest, bounty completion, and similar), submitted by a backend
  attestation signer.
- **Budgets and caps live in a SERVER ledger, not on-chain.** Supabase tables:
  `pod_self_budgets`, `self_mint_queue`, `self_member_epoch_earned`.
- **API surface:** `POST /api/self/mint-batch`, `GET /api/self/holdings`,
  `/api/admin/self`.

> **Pods do NOT hold $SELF.** A pod has a minting **budget** (capacity to award),
> not a balance. This is a direct consequence of soulbound: a token that cannot
> be transferred cannot be held-and-then-paid-out by a treasury.

### Spending: burn-to-pay

"Paying" with $SELF means **burning** it. This is handled by a single shared
primitive:

- **Contract:** `SelfPayment`, `NEXT_PUBLIC_SELF_PAYMENT` (`0x3eac92...`),
  holds `BURNER_ROLE`.
- **Source:** `src/contracts/SelfPaymentV2.sol`,
  `src/features/shopping-cart/services/transaction/selfPayment.ts`.
- It burns the buyer's eligible epoch ids **FIFO (oldest first)**, so the
  soon-to-expire $SELF is spent first.
- It mints a soulbound **SelfReceipt** as proof of the spend:
  `NEXT_PUBLIC_SELF_RECEIPT` (`0x2aeB8C...`), source `src/contracts/SelfReceipt.sol`.
- **No proceeds flow anywhere.** Because $SELF is soulbound, a burn is terminal:
  there is no destination wallet, no treasury inflow. The value simply leaves
  circulation.

This **one burn-to-pay primitive is reused** across the marketplace, event
ticketing, and access-gated bounties.

### Tenure: permanent standing

Where $SELF decays (fading to zero roughly 6 months after each grant), **Tenure**
is the permanent record of having earned it:

- **Contract:** `SelfPrestige`, `NEXT_PUBLIC_SELF_PRESTIGE` (`0x133dB7...`),
  source `src/contracts/SelfPrestige.sol`.
- Tenure reflects **TOTAL $SELF ever earned**, ecosystem-wide. It **never
  decreases**: it wires into the **earn** path, not the burn path.
- The contract stores only a **tier (0–5)** plus **lifetime hours**. Band names
  and images are **frontend-only**, in
  `src/features/identity/config/tenureBands.ts`.

The five bands:

| Tier | Band | Lifetime hours |
|------|------|----------------|
| 0 | **Curious** | 0–10h (membership floor) |
| 1 | **Resident** | 10–50h |
| 2 | **Mainstay** | 50–250h |
| 3 | **Pillar** | 250–600h |
| 4/5 | **Elder** | 600h+ |

### Planned (not shipped)

These are designed but **not yet built**; do not assume them in integrations:

- **Cross-community recognition weights / federation:** Tenure influencing
  standing across communities.
- **Governance staking of $SELF:** a **lock seam is designed** in the contracts
  but is not wired up.

### Key files

```
src/contracts/SelfEpochsV2.sol
src/contracts/SelfPaymentV2.sol
src/contracts/SelfPrestige.sol
src/contracts/SelfReceipt.sol
src/features/self/services/selfEarnService.ts
src/features/shopping-cart/services/transaction/selfPayment.ts
```

---

## Treasury

### Pod treasuries: PodTreasuryV3

Each pod can hold $SYSTEM in a **multi-sig, hat-gated** treasury.

- **Contract:** `PodTreasuryV3`, source `src/contracts/PodTreasuryV3.sol`,
  deploy tooling under `src/contracts/treasury-deploy/`.
- **Hat-gated:** signers are determined by hat ownership (see
  `04-governance-and-pods.md`), not a hardcoded address list.
- **Configurable approval threshold**, expressed in **basis points**, with a hard
  **floor of 50.01%**: a treasury can require more than a simple majority, but
  never less.

### Where marketplace money goes

Marketplace **$SYSTEM proceeds** are routed by the **PurchaseRouter** to one of
three destinations per listing:

```
BURN  |  WALLET  |  POD_TREASURY
```

**$SELF always burns** (see burn-to-pay above); it has no routable proceeds.

### Stripe donations → $SYSTEM

The fiat on-ramp. A donation flows through Stripe and mints $SYSTEM:

- **Processor fees:** card **2.9% + $0.30**, ACH **0.8%**.
- **Donation on the fiat→$SYSTEM exchange: 8%**, split as:
  - **4% ops cash** (operational runway), and
  - **4% community pool**, minted as $SYSTEM to the **Exec Pod treasury**.
- **Tiered settlement delay** before funds are considered final.

- **Files:** `src/app/api/donations`, `src/app/api/webhooks/stripe`.

---

## Where to go next

- **`00-architecture-overview.md`**: the four cross-cutting patterns
- **`02-onchain-and-contracts.md`**: Base, Hats, contract registry, paymaster
- **`04-governance-and-pods.md`**: the 3-tier model, pod lifecycle, hat resolution

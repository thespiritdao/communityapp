# Runbook — Deploying EventManagerV2 (soulbound $SELF)

*Drafted 2026-06-25. Redeploy EventManager so $SELF event tickets are paid by
BURNING soulbound $SELF (via SelfPaymentV2 → SelfReceipt) instead of the old
ERC-20 transfer. $SYSTEM behavior is unchanged. Companion to
`runbook-self-decay-deploy.md` (same deploy patterns).*

> **Why:** the deployed EventManager (`0x741d6226…`) holds the dead ERC-20 $SELF
> (`selfToken = 0x2d9e8A4D…`, immutable — no setter) and does
> `selfToken.transferFrom` on registration, which REVERTS for soulbound $SELF.
> EventManagerV2 replaces the $SELF transfer with a SelfReceipt validation +
> consume. See `src/contracts/EventManagerV2.sol`.

---

## Model (what changed)

- **$SELF tickets are paid out-of-contract.** The attendee's wallet calls
  `SelfPaymentV2.payWithSelf(communityId, eventId, priceSelfHours, ids, amounts)`
  FIRST (burns their $SELF, mints a `SelfReceipt` with `productId == eventId`).
- `EventManagerV2.registerForEvent(eventId, selfReceiptId)` then verifies the
  receipt (redeemer == caller, productId == eventId, hoursPaid ≥ priceSelf, not
  yet fulfilled) and consumes it via `markFulfilled`.
- **$SELF is non-refundable** (burning is final) and **not routed to a pod**
  (burned tokens have no recipient). `$SYSTEM` still escrows + routes + refunds
  exactly as V1.

---

## Pre-deploy

- [ ] Deploy from the admin wallet (Remix → Injected Provider → Base 8453).
- [ ] Compiler **0.8.20+** (contract is `^0.8.20`), optimizer on / 200.
- [ ] Have these handy:
  - SelfReceipt (KEEP): `0x2aeB8C2C9b473DcFCD789c90E8502AD26FE37099`
  - SelfPaymentV2 (mints the receipts): `0x3eac92eA5eBC17Af9419cDb03961247EC9d31001`
  - Backend smart wallet: `0x05c06af9fe1a996144902D9571d1d2783866cF63`
  - Old EventManager (being replaced): `0x741d6226caf9d5198eCdf8098fAAD5b2B355Cf77`
- [ ] Accept that in-flight events on the OLD EventManager won't migrate (none
      are currently priced in $SELF — DB check showed 0 $SELF events, so this is
      low-risk; $SYSTEM events on the old contract keep working there until
      complete).

## Step 1 — Deploy `EventManagerV2`

Source: `src/contracts/EventManagerV2.sol`. Constructor args (verified against
the live old EventManager):
- `_hatsContract` = `0x3bc1a0ad72417f2d411118085256fc53cbddd137`
- `_eventManagementHatId` = `50280300945612082547355493676033906845670900593722134085653198951940096`
- `_systemToken` = `0x00f75717Ab019DE0e452605098cFDc4FccEbc701`
- `_selfReceipt` = `0x2aeB8C2C9b473DcFCD789c90E8502AD26FE37099`

→ Record the address as **EVENT_MANAGER_V2**.

## Step 2 — Grant FULFILLER_ROLE on SelfReceipt to EventManagerV2

EventManagerV2 must mark ticket receipts consumed. On **SelfReceipt**
(`0x2aeB…7099`), from the admin wallet:
- [ ] `grantRole(FULFILLER_ROLE, EVENT_MANAGER_V2)`
  - FULFILLER_ROLE hash = `keccak256("FULFILLER_ROLE")` =
    `0xb87c1e8b46b5d62b2c4bd7e10a3c83f55e3f1d3d... ` (compute in Remix:
    `keccak256(abi.encodePacked("FULFILLER_ROLE"))`, or read the public constant
    `FULFILLER_ROLE()` on the SelfReceipt contract).
  - NOTE: the backend smart wallet already holds FULFILLER_ROLE (for marketplace
    receipts) — leave it; this just adds EventManagerV2.

## Step 3 — Paymaster (Coinbase dashboard)

Whitelist is keyed by contract address. Add **EVENT_MANAGER_V2** with the
sponsored selectors:
- `createEvent`, `registerForEvent`, `completeEvent`, `cancelEvent`,
  `batchMintCertificates`, `mintCompletionCertificate`
- (Compute each selector or whitelist the whole contract if your dashboard
  allows address-level sponsorship.)
- SelfPaymentV2 (`0x3eac92…`) `payWithSelf` is ALREADY whitelisted (marketplace) —
  no change. The attendee's burn step reuses it.
- Remove the OLD EventManager (`0x741d…`) once cut over, or leave it for
  in-flight $SYSTEM events.

## Step 4 — App / env

- [ ] Update `.env` + **Vercel**: `NEXT_PUBLIC_EVENT_MANAGER` = **EVENT_MANAGER_V2**
- [ ] Update the proxy `STATIC_WHITELIST` in `src/app/api/paymaster/route.ts` if
      EventManager is listed there (it reads env, so the swap covers it — verify).
- [ ] Redeploy the app so the new address + client changes bake in.

## Step 5 — Verify

- [ ] `EventManagerV2.selfReceipt()` == `0x2aeB…7099`, `systemToken()` ==
      `0x00f757…`, `eventManagementHatId()` == the value above.
- [ ] `SelfReceipt.hasRole(FULFILLER_ROLE, EVENT_MANAGER_V2)` == true.
- [ ] Smoke test (testnet or a throwaway event): create a $SELF event → from a
      wallet holding $SELF, call `payWithSelf(productId=eventId)` → get receiptId
      → `registerForEvent(eventId, receiptId)` succeeds → receipt now
      `fulfilled=true` → a second register with the same receipt REVERTS
      ("Receipt already used").
- [ ] $SYSTEM event still works end-to-end (register escrows, complete routes to
      pod, cancel refunds).

## Rollback

The OLD EventManager still works for $SYSTEM. Revert `NEXT_PUBLIC_EVENT_MANAGER`
to `0x741d…` + redeploy → back to V1 ($SELF events stay broken, as before).
Decide before re-attempting.

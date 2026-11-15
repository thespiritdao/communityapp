# $SELF Phase 0 — Deploy & Wiring Plan

*Drafted 2026-06-15. Companion to `spec-self-soulbound-redesign.md`. Covers the
five new contracts, their cross-contract role wiring, the redeploy dependency
chain, Remix instructions, and paymaster registration.*

> **⚠️ Historical — superseded 2026-06-24 by the decay cutover (V2).** The
> SelfEpochs/SelfMinter/SelfPayment addresses below are the original cliff-expiry
> V1 set and have been retired. The wiring *pattern* here is still accurate, but
> the canonical contract addresses + the linear-decay model are in
> `runbook-self-decay-deploy.md` and `self-epochs-reference.md`. Current set:
> EpochsV2 `0x169760C0F633dd68D31973b5CFce1133833d28e5`, MinterV2
> `0xDcD71ceC0509aF355b4B85E71c9087fe54Bcff83`, PaymentV2
> `0x3eac92eA5eBC17Af9419cDb03961247EC9d31001` (Receipt/Prestige unchanged).

---

## TL;DR answers to Ron's questions

1. **Do you need to deploy the new contracts?** Yes — these are 5 brand-new
   contracts. Deploy via Remix exactly as you've done historically. Full
   step-by-step below.

2. **Do redeploys interact with other contracts?** Yes, but in a contained way.
   The 5 NEW contracts wire to EACH OTHER (role grants). Separately, the
   EXISTING $SELF-dependent contracts (PurchaseRouter, EventManager, etc.) hold
   the OLD ERC-20 $SELF address and will eventually need attention — BUT see the
   timing recommendation: most of that is Phase 2 work, not Phase 0.

3. **Deploy now or wait for the whole job?** **Recommendation: WAIT.** Deploy
   the full Phase 0 contract set together once `SelfPrestige` (done) and a quick
   test pass are complete — but do NOT touch the existing marketplace/event
   contracts until Phase 2, when burn-to-pay is actually wired in. Deploying
   SelfEpochs+Minter+Payment+Receipt+Prestige now is safe and self-contained
   (they don't break anything live — nothing references them yet). The
   disruptive part (repointing PurchaseRouter/EventManager off the old ERC-20)
   should be batched with the Phase 2 app changes so the marketplace is never in
   a half-migrated state. See "Timing" at the bottom.

---

## The 5 new contracts (all written, all compile clean, solc 0.8.26, OZ 5.4.0)

| Contract | Size | Purpose |
|---|---|---|
| `SelfEpochs.sol` | ~10.5KB | Soulbound $SELF token (the ERC-20 replacement) |
| `SelfMinter.sol` | ~4KB | Sole minter; backend attestation signer calls it |
| `SelfReceipt.sol` | ~8.6KB | Soulbound redemption receipts (fulfillment) |
| `SelfPayment.sol` | ~5.4KB | Shared burn-to-pay engine (marketplace/events/bounty) |
| `SelfPrestige.sol` | ~10KB | Permanent legacy badges (Seedling→Old-Growth) |

All under the 24KB contract-size limit. None imports another by file — they
talk via minimal interfaces, so each can be deployed independently and wired by
address afterward.

---

## Deploy order & cross-contract wiring

Deploy in this order (later contracts take earlier addresses as constructor
args), then grant the cross-contract roles.

### Addresses to use (LOCKED 2026-06-16)

| Role in the $SELF system | Address | What it is |
|---|---|---|
| **`admin`** (DEFAULT_ADMIN + EPOCH_ADMIN, and the deploy wallet) | **`0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`** | The dedicated **platform admin/deployer** wallet (Exec-Pod-custodied; created solely for app contract ops, no other activity). Already the owner of nearly the entire deployed fleet — PodTreasuryFactory V2/V3, TreasuryProxy, PurchaseRouterDecentralized, etc. Using it here keeps $SELF consistent with the existing platform. **Deploy FROM this wallet** so deployer == admin and the Step 6 grantRole calls run directly in Remix. |
| **attestor / janitor / fulfiller** (backend automation) | **`0x617b20f744f9B3D36724BC46050c84A0f4ddEbAF`** | `POD_ADMIN_WALLET` — the server key (`POD_ADMIN_PRIVATE_KEY` in `.env`) the backend signs automated mints/records with. Used for SelfMinter's `attestor` arg + the SelfReceipt FULFILLER and SelfPrestige JANITOR role grants. |

> Rationale (from the on-chain ownership audit, `scripts/deploy/audit-contract-ownership.mjs`):
> the platform's established pattern is web-wallet ownership — `0xd481…` owns
> the bulk of the live fleet; there is NO multisig in use anywhere. Matching
> that pattern is the pragmatic, consistent choice. The wallet is intended for
> Exec Pod custody (shared control), not an individual's — it exists only to
> deploy/administer app contracts.
>
> **Future hardening (not a launch blocker):** `0xd481…` is now a single point of
> control for most of the platform; extending it to $SELF concentrates that
> further. Every contract here exposes `grantRole`/admin-transfer, so migrating
> `DEFAULT_ADMIN_ROLE` to a Safe later is a clean one-call-per-contract move when
> the Exec Pod is ready for multisig custody.

### Step 1 — Deploy `SelfEpochs`
Constructor args:
- `admin` — `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d` (gets DEFAULT_ADMIN + EPOCH_ADMIN)
- `uri_` — ERC-1155 metadata URI template. **COSMETIC ONLY** (controls wallet
  display, not function). There is NO $SELF metadata endpoint yet, and the
  contract has `setURI()` (admin) to set it later with zero redeploy cost.
  **Recommended: deploy with `""` (empty string)** — $SELF is soulbound +
  governance-only (not traded), so rich metadata is low-value, and an empty URI
  avoids pointing at a 404. If you later build a metadata endpoint, note the
  platform convention is `https://api.spiritdao.org/...` (NOT app.spiritdao.org;
  cf. EventCompletionNFTFactory's `https://api.spiritdao.org/events/completion/`).
- `initialEpoch` — starting quarter counter (e.g. `0`)
- `initialLifetime` — K, lifetime in epochs (e.g. `2`)

Record the deployed address → **SELF_EPOCHS**.

### Step 2 — Deploy `SelfReceipt`
Constructor args:
- `admin` — `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`
- `uri_` — cosmetic metadata URI; recommend `""` (has `setURI()` to set later).

Record → **SELF_RECEIPT**.

### Step 3 — Deploy `SelfPrestige`
Constructor args:
- `admin` — `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`
- `uri_` — cosmetic metadata URI; recommend `""` (has `setURI()` to set later).
  Prestige badges are the MOST likely to eventually want real metadata (nice
  tier imagery for "Old-Growth" etc.) — but still set later, not at deploy.
- `thresholds` — `uint256[4]` cumulative-hours thresholds for **tiers 2–5**
  (tier 1 "Curious" is the membership floor, no hours), in wei (1e18 = 1 hour).
  Per D-19b: **`[10000000000000000000, 50000000000000000000, 250000000000000000000, 600000000000000000000]`**
  = Resident@10h, Mainstay@50h, Pillar@250h, Elder@600h.

Record → **SELF_PRESTIGE**.

> Tenure bands (D-19b, ecosystem-wide, names are frontend-only):
> Curious 0–10 · Resident 10–50 · Mainstay 50–250 · Pillar 250–600 · Elder 600+.

### Step 4 — Deploy `SelfMinter`
Constructor args:
- `_selfEpochs` — **SELF_EPOCHS**
- `admin` — `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`
- `attestor` — `0x617b20f744f9B3D36724BC46050c84A0f4ddEbAF` (POD_ADMIN / backend
  signer; this is the address whose mint calls get paymaster-sponsored)

Record → **SELF_MINTER**.

### Step 5 — Deploy `SelfPayment`
Constructor args:
- `_selfEpochs` — **SELF_EPOCHS**
- `_selfReceipt` — **SELF_RECEIPT**
- `admin` — `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`

Record → **SELF_PAYMENT**.

### Step 6 — Grant cross-contract roles (CRITICAL — nothing works without these)

Role hashes (precompute with `keccak256` or read the public constants off each
contract in Remix):

On **SelfEpochs** (call `grantRole(role, account)` as admin):
- `MINTER_ROLE` → **SELF_MINTER**   (so the minter can mint)
- `BURNER_ROLE` → **SELF_PAYMENT**  (so payment can burn for redemption)
- (`LOCKER_ROLE` → leave unset until staking is built — D-15 seam)

On **SelfReceipt**:
- `MINTER_ROLE` → **SELF_PAYMENT**  (so payment can mint receipts)
- `FULFILLER_ROLE` → `0x617b20f744f9B3D36724BC46050c84A0f4ddEbAF` (POD_ADMIN backend)

On **SelfPrestige**:
- `JANITOR_ROLE` → `0x617b20f744f9B3D36724BC46050c84A0f4ddEbAF` (POD_ADMIN backend)

On **SelfMinter**:
- `ATTESTOR_ROLE` was set in the constructor; grant additional/rotate as needed.

> Verification after wiring: call `selfEpochs.hasRole(MINTER_ROLE, SELF_MINTER)`
> → true; `selfEpochs.hasRole(BURNER_ROLE, SELF_PAYMENT)` → true;
> `selfReceipt.hasRole(MINTER_ROLE, SELF_PAYMENT)` → true. If any is false, the
> earn/spend loop will revert.

---

## Remix deployment instructions (matches your historical workflow)

For EACH of the 5 contracts:

1. **Open Remix** (remix.ethereum.org). In the File Explorer, create the `.sol`
   file and paste the contract source from `src/contracts/<Name>.sol`.
   - The contracts import OpenZeppelin. In Remix, the imports
     `@openzeppelin/contracts/...` resolve automatically from npm — no manual
     copying needed. (If Remix complains, add OZ via the npm import or the
     "@openzeppelin/contracts@5.4.0" version pin.)

2. **Compiler tab**:
   - Compiler version: **0.8.26** (matches our toolchain; anything 0.8.20–0.8.26
     works since pragma is `^0.8.20`).
   - EVM version: **cancun**.
   - Enable **optimization**, runs **200** (matches how we compiled/verified).

3. **Deploy & Run tab**:
   - Environment: **Injected Provider** (your wallet, on **Base mainnet** —
     chainId 8453). Confirm the network before deploying.
   - Select the contract from the dropdown.
   - Expand the constructor inputs, fill the args per the step above.
   - Click **Deploy**, confirm in wallet. **Copy the deployed address** from the
     "Deployed Contracts" panel.

4. After all 5 are deployed, use the same panel's function buttons to call
   `grantRole(...)` for Step 6 (paste the role hash + target address).

> NOTE on the admin address: deploy from / set admin to the SAME controlled
> address you use for other platform admin ops, so role grants and future epoch
> advances are callable. If that's a multisig, you'll do the grantRole calls
> through the multisig UI rather than Remix's button.

> NOTE on gas: deploying from your EOA in Remix means YOU pay gas for the 5
> deploys + role grants (one-time, cents-to-a-few-dollars on Base). This is the
> deploy step only. RUNTIME mints/burns/payments by USERS must go through the
> Coinbase Paymaster (next section) — those are the sponsored calls.

---

## Paymaster registration (D-9)

After deployment, register the runtime entry points with the Coinbase Paymaster
allowlist (CSV, no spaces, including the function signature `()`), so user-facing
mints/burns/payments are sponsored:

- `SELF_MINTER` — `mintBatch((address,uint224,uint32,uint256,bytes32)[],bytes32)`,
  `mintOne(bytes32,address,uint224,uint32,uint256,bytes32)`
  (the attestor/backend submits these — sponsor the attestor's smart account)
- `SELF_PAYMENT` — `payWithSelf(uint224,string,uint256,uint256[],uint256[])`
  (end users call this — the primary sponsored user action)
- `SELF_PRESTIGE` — `addLifetimeHours(address,uint256)`,
  `batchAddLifetimeHours(address[],uint256[])` (janitor/backend; ecosystem-wide,
  no community param per D-19b)
- `SELF_RECEIPT` — `markFulfilled(uint256)`, `burnReceipt(uint256)` (backend)

> Confirm the exact selector formatting your paymaster config expects — match
> the style already used for the existing whitelisted contracts. Add these in
> the same CSV order/format.

### Actual paymaster entries (computed + entered 2026-06-17)

The Coinbase dashboard **rejects tuple signatures** (it could not save
`mintBatch(bytes32,(address,uint224,uint32,uint256,bytes32)[])`). Use **4-byte
selectors** — comma-separated, no spaces, one list per contract:

| Contract | Address | Selectors |
|---|---|---|
| SELF_MINTER | `0x265dd81EC19Ef936206d6e0f6B3E910877aE70B6` | `0x9642474c,0x601a2896` (mintBatch, mintOne) |
| SELF_PAYMENT | `0x438a8Ce7F03b6dCFf140bFFB5818323aCd7bC20e` | `0x5fad93d9` (payWithSelf) |
| SELF_PRESTIGE | `0x133dB72eB94dD5aF9E5bB148a9656752E57aa103` | `0x7c648618,0xa343862a` (addLifetimeHours, batchAddLifetimeHours) |
| SELF_RECEIPT | `0x2aeB8C2C9b473DcFCD789c90E8502AD26FE37099` | `0x2639f481,0x942c5875` (markFulfilled, burnReceipt) |
| SELF_EPOCHS | — | NONE (called only internally by Minter/Payment) |

Convention going forward (roadmap item #10): whitelist ALL contracts by
selector, never written signature — tuples are unrepresentable as signatures and
typos fail closed/silently.

---

## Redeploy dependency chain (the EXISTING contracts)

These hold the OLD ERC-20 $SELF address (`0x2d9e8A4D…`) and will need to point
at the new `SelfEpochs` / burn-to-pay model. **BUT — most are Phase 2, not now.**

| Existing contract | Dep on old $SELF | When |
|---|---|---|
| `PurchaseRouter` | immutable selfToken | **Phase 2** — redeploy; $SELF leg delegates to SelfPayment (burn). Address changes → update env. |
| `PurchaseRouterDecentralized` | immutable | **Phase 2** — same. |
| `EventEscrow` | immutable | **Phase 2** — burn-to-pay for $SELF ticketing (D-13). |
| `EventManager` | setter `updateTokenAddresses` | **Phase 2** — but ERC-20→1155 iface change forces redeploy, not just setter. |
| `BountyManagerV4` | setter `updatePrimaryTokens` | **Phase 2** — same iface caveat. |
| `PurchaseBurn` | immutable | **Phase 2** or retire (SelfPayment supersedes its $SELF burn). |
| `TokenFaucet` | immutable | **Retire** — faucet for earned soulbound token is nonsensical. Just stop using it. |
| `PodTreasuryV3` | generic supportedTokens | **Phase 1/2** — remove old $SELF from its supported set (config call, not redeploy). Keep for $SYSTEM. |
| `PodSELFDistributor` | not deployed | **Never deploy** — replaced by SelfMinter budget model. |

**Cascade note:** if a contract above is redeployed and its address is consumed
by ANOTHER contract as a constructor/immutable arg, that consumer also
redeploys. From the audit, the known consumers:
- `EventSystemFactory` → consumes `EventEscrow` (NOT deployed currently, so no
  cascade today; if you deploy it later, do so after EventEscrow).
- Treasury proxy/factory chain references treasury addresses, not $SELF, so the
  $SELF swap doesn't cascade into them.

The important point: **Phase 0 deployment (the 5 new contracts) does NOT touch
any of these existing contracts.** They keep running on the old ERC-20 until
Phase 2 deliberately migrates the spend paths. No half-migrated window.

---

## Timing — my recommendation

**Deploy Phase 0 (5 new contracts) as one batch when ready; defer existing-
contract redeploys to Phase 2.**

Why:
- The 5 new contracts are inert until the app calls them — deploying them early
  is zero-risk (nothing live references them) and lets you smoke-test the
  earn/spend loop on a test community before the migration.
- The existing marketplace/event contracts are LIVE. Repointing them off the
  old ERC-20 is the disruptive step and must be batched with the Phase 2 app
  changes (provenance-aware gating, burn-to-pay UI, listing payment-policy dial)
  so the marketplace is never half-migrated.
- Retiring the old ERC-20 $SELF (D-20) happens at the Phase 2 cutover, not now.

So: there's no need to redeploy anything else *for Phase 0*. The only
"interacts with other contracts" concern within Phase 0 is the 5 new contracts'
role wiring to each other (Step 6), which Remix handles in the same session.

### Suggested concrete sequence
1. (Now/next) Quick test pass on the 5 contracts (local hardhat or Remix unit
   checks) — earn → live balance → pay → receipt → expire → prestige.
2. Deploy the 5 via Remix (Steps 1–5), wire roles (Step 6), register paymaster.
3. Add the new addresses to `.env` (`NEXT_PUBLIC_SELF_EPOCHS`, `_MINTER`,
   `_PAYMENT`, `_RECEIPT`, `_PRESTIGE`).
4. Build Phase 1 backend (budget ledger + attestation mint) against SELF_MINTER.
5. Phase 2: migrate marketplace/event/bounty spend paths + redeploy the
   dependent contracts together; retire old ERC-20.

---

## Open items before deploy
- ✅ **Admin address** — `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d` (platform
  admin/deployer wallet, Exec-Pod-custodied). EOA, so Step 6 grants run in Remix.
- ✅ **Backend signer** — `0x617b20f744f9B3D36724BC46050c84A0f4ddEbAF`
  (POD_ADMIN) for attestor / fulfiller / janitor.
- ⬜ Final tier thresholds for `SelfPrestige` (placeholder `[20,80,200,500]`h —
  Ron to confirm or adjust).
- ⬜ Confirm initialEpoch (`0`) / K (`2`) for the launch quarter.
- ⬜ Decide whether to verify-source on Basescan (recommended for the 501(c)(3)
  "governance-only / soulbound" transparency posture).

# Runbook — Deploying the $SELF Decay Cutover (V2)

*Drafted 2026-06-23. Step-by-step to migrate from cliff-expiry to slow decay.
Companion to `self-decay-calibration.md` (the numbers) and
`spec-self-phase0-deploy.md` (the original deploy patterns).*

> **Scope:** redeploy **3 contracts** — `SelfEpochsV2`, `SelfMinter`,
> `SelfPaymentV2` — and re-wire. `SelfReceipt` and `SelfPrestige` are NOT
> redeployed (they don't reference SelfEpochs). The earn-loop, triggers,
> Tenure, budgets, and ledger are UNAFFECTED.

---

## Why 3 contracts (the immutability finding)

Both `SelfMinter` and `SelfPayment` store the SelfEpochs address as `immutable`
(no setter). So when SelfEpochs' address changes, **both must be redeployed**:
- `SelfMinter` → redeploy pointing at the new SelfEpochsV2 (mint logic identical).
- `SelfPaymentV2` → already rewritten for decay (reads `decayFactorBps` instead
  of the removed `isLive`, charges against decayed value).

`SelfReceipt` / `SelfPrestige` hold no SelfEpochs reference → keep as-is.

---

## Pre-deploy

- [ ] Confirm you're deploying from the admin wallet **`0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`** (Remix → Injected Provider → Base mainnet 8453).
- [ ] Compiler: **0.8.26**, EVM **cancun**, optimizer **on / 200** (matches verified build).
- [ ] Have the existing addresses handy:
  - SelfReceipt (KEEP): `0x2aeB8C2C9b473DcFCD789c90E8502AD26FE37099`
  - SelfPrestige (KEEP): `0x133dB72eB94dD5aF9E5bB148a9656752E57aa103`
  - Backend smart wallet: `0x05c06af9fe1a996144902D9571d1d2783866cF63`
  - POD_ADMIN: `0x617b20f744f9B3D36724BC46050c84A0f4ddEbAF`
- [ ] Accept that the existing test $SELF tokens (on the old SelfEpochs) are
      abandoned — they won't carry over. (Test data; fine.)

---

## Step 1 — Deploy `SelfEpochsV2`

Source: `src/contracts/SelfEpochsV2.sol`. Constructor args:
- `admin` = `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`
- `uri_` = `""`
- `initialEpoch` = **`0`**
- `initialHorizon` = **`8`**  (linear decay over 8 quarters)

→ Record the address as **SELF_EPOCHS_V2**.

## Step 2 — Deploy `SelfMinter` (fresh, pointing at V2)

Source: `src/contracts/SelfMinter.sol` (unchanged). Constructor args:
- `_selfEpochs` = **SELF_EPOCHS_V2**
- `admin` = `0xd481…C533d`
- `attestor` = `0x617b…DebAF` (POD_ADMIN)

→ Record as **SELF_MINTER_V2**.

## Step 3 — Deploy `SelfPaymentV2`

Source: `src/contracts/SelfPaymentV2.sol`. Constructor args:
- `_selfEpochs` = **SELF_EPOCHS_V2**
- `_selfReceipt` = `0x2aeB…7099` (existing SelfReceipt — KEEP)
- `admin` = `0xd481…C533d`

→ Record as **SELF_PAYMENT_V2**.

---

## Step 4 — Grant roles (from `0xd481…`, in Remix)

Role hashes (paste raw, no quotes):
- MINTER_ROLE  `0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6`
- BURNER_ROLE  `0x3c11d16cbaffd01df69ce1c404f6340ee057498f5f00246190ea54220576a848`
- EPOCH_ADMIN_ROLE  `0xa8254feae331b360dda9558bd798ab27bf43a131cb76e076a396102d8769e0ac`

**On SELF_EPOCHS_V2:**
- [ ] `grantRole(MINTER_ROLE, SELF_MINTER_V2)`
- [ ] `grantRole(BURNER_ROLE, SELF_PAYMENT_V2)`
- [ ] `grantRole(EPOCH_ADMIN_ROLE, 0x05c06af9fe1a996144902D9571d1d2783866cF63)` (in-app advance)
- [ ] (0xd481 already has EPOCH_ADMIN + DEFAULT_ADMIN from the constructor — backup)

**On SELF_MINTER_V2:** ATTESTOR_ROLE was set to POD_ADMIN (0x617b) in the
constructor. BUT the on-chain caller for sponsored mints is the SMART WALLET, so:
- [ ] `grantRole(ATTESTOR_ROLE, 0x05c06af9fe1a996144902D9571d1d2783866cF63)`
  - ATTESTOR_ROLE hash: `0xa7e0cd0f2772b23ee4c329892293a6bd99d48c306b094d6d008c9a8bb8b731e4`

**On existing SelfReceipt (`0x2aeB…7099`):**
- [ ] `grantRole(MINTER_ROLE, SELF_PAYMENT_V2)` (so the new payment can mint receipts)
- [ ] (optional cleanup) `revokeRole(MINTER_ROLE, <old SelfPayment 0x438a…>)`

**On existing SelfPrestige (`0x133d…a103`):** no change — the SMART WALLET still
holds JANITOR_ROLE; SelfMinter_V2 records prestige via the mint-batch route, not
a contract-to-contract grant. (Prestige recording is a separate call in the
mint-batch user op, see app changes below.)

---

## Step 5 — App / env changes

- [ ] Update `.env` + Vercel:
  - `NEXT_PUBLIC_SELF_EPOCHS` = **SELF_EPOCHS_V2**
  - `NEXT_PUBLIC_SELF_MINTER` = **SELF_MINTER_V2**
  - `NEXT_PUBLIC_SELF_PAYMENT` = **SELF_PAYMENT_V2**
  - (SELF_RECEIPT, SELF_PRESTIGE unchanged)
- [ ] **Code:** the mint-batch route + earn service reference contracts by env,
      so no code change needed for the address swap. The only code that named the
      OLD interface was SelfPayment (now V2, redeployed) — the app calls
      SelfPayment by address via env, so it's covered. ✅
- [ ] **Paymaster (Coinbase dashboard):** the whitelist is keyed by CONTRACT
      ADDRESS, so add the 3 new addresses with their selectors:
  - SELF_EPOCHS_V2: none (called only internally)
  - SELF_MINTER_V2: `0x9642474c,0x601a2896` (mintBatch, mintOne)
  - SELF_PAYMENT_V2: `0x5fad93d9` (payWithSelf — same selector, unchanged sig)
  - SelfPrestige (already whitelisted): `0x7c648618,0xa343862a` — no change
  - Remove the OLD SelfEpochs/Minter/Payment entries.
- [ ] **Proxy STATIC_WHITELIST** (`src/app/api/paymaster/route.ts`) reads the
      env vars, so updating env covers it — redeploy the app to pick up new env.

---

## Step 6 — Verify

- [x] Run `node scripts/verify-self-roles-v2.mjs` (env-driven; reads the V2
      addresses from `.env`) → all green (MINTER/BURNER on EpochsV2, ATTESTOR on
      MinterV2→smart wallet, EPOCH_ADMIN on EpochsV2→0xd481 + 0x05c06, MINTER on
      Receipt→PaymentV2, immutable pointers → EpochsV2, decayHorizon=8). The old
      `verify-self-roles.mjs` (hardcoded V1 set) was removed. ✅ 18/18 pass.
- [ ] Redeploy the app (Vercel) so env vars bake in.
- [ ] Smoke test: seed a budget → mint a test earning → confirm on-chain
      `decayedBalanceOf` = full at current epoch; advance a (test) epoch and
      confirm the value drops by 1/8. Then abandon test data.

---

## Rollback

If something's wrong, the OLD contracts still exist and work (cliff-expiry).
Revert the env vars to the old addresses + redeploy the app → back to v1
behavior. No data loss (old tokens untouched). Decide before re-attempting.

---

## Post-deploy note
Once V2 is live, update `self-epochs-reference.md` and
`self-system-operations-guide.md` to replace cliff-expiry language with the decay
model (link `self-decay-calibration.md`). The canonical role-check script is now
`verify-self-roles-v2.mjs` (env-driven — no hardcoded addresses to maintain).

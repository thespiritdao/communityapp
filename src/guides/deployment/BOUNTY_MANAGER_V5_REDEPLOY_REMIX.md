# BountyManagerV5 Redeploy — Remix Guide

**Date:** 2026-08-02
**Status:** ✅ EXECUTED 2026-08-02 via `scripts/deploy-treasury-contracts.mjs`
(script path, not Remix). Deployed and verified:

| Contract | Address |
|---|---|
| BountyManagerV5 (live) | `0x01906d30f5cc34b5c445e0dcbf2934f4b9407048` |
| Exec Pod treasury (live) | `0xE2c064379d14BAc8371F5CdD7938F9472dC739aA` |
| Temporal Naturalism treasury (live) | `0xe75b458a281634FF517fbb873dad5fa0d2F21553` |
| Treegens DAO treasury (live) | `0xe1691F0F43FB78B9718A3F9f9C13B09712BBBa3a` |

Admin of the new manager is the backend key `0x617b20f744f9B3D36724BC46050c84A0f4ddEbAF`
(`POD_ADMIN_PRIVATE_KEY`). All three pods registered with their new treasuries;
all six token allowances (SYSTEM + SELF per treasury) verified unlimited.
Remaining manual steps: Vercel env update + app redeploy, Exec Pod fund move
(Step 5). The Remix instructions below are retained for reference.

## Background — why this redeploy is needed

The BountyManagerV5 at `0xFE0007CbEe68ea201A238B23EF9Da13f4e918857` is permanently
broken for treasury-funded bounties. All three pods were registered on it on
**2026-07-22 (within 40 seconds of each other — a batch migration run)**, the day
after audit finding BM-001 (2026-07-21) prompted the V4→V5 redeploy. The
registrations pointed at the pods' **old treasury addresses**, whose token
approvals are immutably bound to the old V4 manager
(`0x7b3d752748feA88C65dE57Ae6FC32Fc22a457aC8`). Pod metadata in V5 is
write-once (no update/unregister function), so this cannot be repaired in place.

### How it was overlooked

1. **Registration can't fail for this reason.** `registerPodMetadata` only writes
   metadata — it doesn't verify the treasury has approved the new manager. The
   migration used the treasury addresses already in the database (the old
   treasuries), it succeeded, and everything looked done. The contract would have
   caught this if registration required `allowance(treasury, manager) > 0` — it
   doesn't, so the mistake was silent.
2. **The approval direction is invisible.** Treasury→manager approvals were
   granted inside each treasury's *constructor*, long before the migration.
   Nothing in the app, DB, or deploy process surfaces them; they're only visible
   by querying token allowances directly.
3. **The failure only appears on the first treasury-funded bounty — which nobody
   ran.** The single bounty ever created was wallet-funded (0.01 SELF "Spread
   the Word!"). Wallet funding doesn't touch treasuries, so post-migration
   testing passed. The "Not authorized to cancel" error was the first symptom —
   itself a different symptom of the same migration (a bounty stranded on V4).

Under V4's model this migration pattern would have half-worked (V4 took
caller-supplied treasury addresses against standing approvals). V5's
registered-treasury binding changed the rules, and the write-once metadata
sealed it.

## Script vs. Remix

Either works. `scripts/deploy-treasury-contracts.mjs` does everything in one
command (deploy manager + 3 treasuries + registrations + Supabase update);
Remix does the same via manual clicks, minus the Supabase update.

**One thing decides it: whoever deploys BountyManagerV5 becomes `admin` —
permanently.** `admin` is `immutable` with no transfer function. Admin unlocks
`registerPodMetadataFor` (registering pods without wearing their leader hats).
The script would make the backend key (`0x617b20f744f9B3D36724BC46050c84A0f4ddEbAF`)
admin; Remix makes the MetaMask deployer wallet admin. Pick whichever wallet
should hold that power long-term. The steps below assume Remix.

Note: the registrations are direct contract calls — the app only has the
*leader self-registration* path (`registerPodCall` in `useBountyV2`, used during
bounty creation); the admin bypass isn't wired into the app anywhere.

---

## Remix redeploy — step by step

**Setup:** MetaMask on **Base mainnet (chain 8453)**, using the wallet you want
as permanent admin. In Remix: compiler **0.8.26**, **optimizer ON, 200 runs**,
EVM version **cancun**. Environment: *Injected Provider*. Deploy everything
below from this one wallet.

### Step 1 — Deploy BountyManagerV5

Create `BountyManagerV5.sol` in Remix, paste the contents of
`src/contracts/BountyManagerV5.sol` (Remix auto-resolves the
`@openzeppelin/contracts` imports). Compile, then deploy with:

| Constructor field | Value |
|---|---|
| `_hatsProtocol` | `0x3bc1a0ad72417f2d411118085256fc53cbddd137` |
| `_systemToken` | `0x00f75717Ab019DE0e452605098cFDc4FccEbc701` |
| `_selfToken` | `0x2d9e8A4DdED7438C2D4C8050Ed58B9F4Bc0c8298` |

📋 **Save the deployed address — call it `NEW_BM`.** Every remaining step uses it.

### Step 2 — Deploy PodTreasuryV3, three times

Create `PodTreasuryV3.sol`, paste from
`src/contracts/treasury-deploy/PodTreasuryV3.sol`, compile. Deploy once per pod.

Shared fields for all three:

| Field | Value |
|---|---|
| `_hatsContract` | `0x3bc1a0ad72417f2d411118085256fc53cbddd137` |
| `_supportedTokens` | `["0x00f75717Ab019DE0e452605098cFDc4FccEbc701","0x2d9e8A4DdED7438C2D4C8050Ed58B9F4Bc0c8298"]` |
| `_authorizedProxy` | `0x02110b4bBFA3BeeDbBd854b01683F9D9DB3aDeae` |
| `_bountyManager` | **`NEW_BM`** (from Step 1 — this bakes in the approval) |
| `_initialThresholdBps` | `5001` |

Per-pod fields:

**Executive Pod**
- `_managementHatId`: `50280300945612082547355493676033906845670900593722134085653198951940096`
- `_podId`: `e35c9e25-d29f-4988-b1e8-2902e960b94c`

**Temporal Naturalism**
- `_managementHatId`: `50280301356994498979392390895540038274431734505822202849492628823605248`
- `_podId`: `f2bc166d-33d5-47dc-8409-ea8d445d3fc0`

**Treegens DAO**
- `_managementHatId`: `50280301357069824200217031064706067747510226502815431114826197237760000`
- `_podId`: `a4f2eb44-c2d5-4c49-8629-f6f818960f98`

📋 Save all three treasury addresses.

### Step 3 — Register each pod on NEW_BM

In Remix's *Deployed Contracts*, expand the `NEW_BM` instance (same wallet —
only the deployer/admin can call this). Call `registerPodMetadataFor` three
times:

| Call | `podId` | `leaderHatId` | `treasuryAddress` |
|---|---|---|---|
| 1 | `e35c9e25-d29f-4988-b1e8-2902e960b94c` | `50280300945612082547355493676033906845670900593722134085653198951940096` | *new Exec treasury from Step 2* |
| 2 | `f2bc166d-33d5-47dc-8409-ea8d445d3fc0` | `50280301356994498979392390895540038274431734505822202849492628823605248` | *new TN treasury from Step 2* |
| 3 | `a4f2eb44-c2d5-4c49-8629-f6f818960f98` | `50280301357069824200217031064706067747510226502815431114826197237760000` | *new Treegens treasury from Step 2* |

> ⚠️ **This is the step that went wrong last time, and it's write-once.** Use the
> *new* treasury addresses from Step 2 — not the DB values, not the old
> treasuries. Triple-check before submitting; a wrong address here means
> redeploying the manager again.

### Step 4 — Post-deploy wiring

With `NEW_BM` + the three treasury addresses:

1. Update `pods.treasury_contract_address` (+ `treasury_deployed_at`) in
   Supabase for all three pods.
2. Set `NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS=<NEW_BM>` in `.env` **and Vercel**.
3. Update the hardcoded fallbacks (currently `0xFE0007Cb...`) in:
   - `src/features/bounty/hooks/useBountyV2.ts`
   - `src/features/bounty/components/BountyFormV2.tsx` (2 places)
   - `src/app/api/cron/update-pending-bounties{,-v2,-v3}/route.ts`
   - `src/app/api/cron/update-pending-bids/route.ts`
4. Redeploy the app on Vercel.

### Step 5 — Move Executive Pod's funds (only role-gated step)

The old Exec treasury (`0x6cd35eb6281C49d58DBEfaB20E67E9e141Baf8Af`) holds
~0.93 SYSTEM + 0.88 SELF. Its management-hat wearers must run its multisig
proposal flow to send those to the new Exec treasury. The Treegens
(`0x3a841B82baBaF674daBBd07303E5Fcb5301b99F2`) and TN
(`0xF0DbcDA5750eCa93236EfCc4d217c440A7deabC7`) old treasuries are empty — just
abandon them.

### Verification checklist

- [ ] Verify `NEW_BM` source on Basescan (0.8.26, optimizer 200, cancun).
- [ ] `NEW_BM.getPodTreasuryAddress("a4f2eb44-c2d5-4c49-8629-f6f818960f98")`
      returns the **new** Treegens treasury (repeat for the other two pod IDs).
- [ ] `SYSTEM.allowance(newTreasury, NEW_BM)` and
      `SELF.allowance(newTreasury, NEW_BM)` are max-uint for all three
      treasuries.
- [ ] Create a small treasury-funded test bounty end-to-end, then cancel it
      (exercises the exact paths that failed before).

## Addendum 2026-08-03 — fund move done; factory registry fix needed
> ✅ RESOLVED 2026-08-03: all three factory calls executed by the owner wallet,
> registry verified pointing at the new treasuries, and the Exec treasury
> ledger synced via `proxySyncTokenBalance` (all six internal ledgers now match
> actual balances). Migration fully complete. Details below kept for the record.

Old Exec treasury drained via `emergencyWithdraw` (single-manager direct path on
V2WithVoting; no multisig needed): 0.92784 SYSTEM + 0.88 SELF now in the new
Exec treasury. All old treasuries hold 0.

**Remaining issue:** the TreasuryProxy (`0x02110b4b...`) resolves treasuries via
the PodTreasuryFactory at `0x3d68d59D...` (NOT the database). That registry
still maps Exec/TN to the OLD treasuries and has no Treegens entry. In-app
treasury deposits (`FundingModal` → `proxyReceiveTokens`) and distribution
proposals (`useTreasuryProposals` → `proxyProposeDistribution`) use this
registry, so they are misdirected/broken until fixed.

Fix = three owner-only calls on the factory `0x3d68d59Dc78C45022bA37276FD1b03354F72B3b1`
from its owner wallet `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`
(all three simulated successfully as owner on 2026-08-03):

1. `updateTreasury("e35c9e25-d29f-4988-b1e8-2902e960b94c", 0xE2c064379d14BAc8371F5CdD7938F9472dC739aA)`
2. `updateTreasury("f2bc166d-33d5-47dc-8409-ea8d445d3fc0", 0xe75b458a281634FF517fbb873dad5fa0d2F21553)`
3. `registerExistingTreasury("a4f2eb44-c2d5-4c49-8629-f6f818960f98", 0xe1691F0F43FB78B9718A3F9f9C13B09712BBBa3a, 50280301357069824200217031064706067747510226502815431114826197237760000)`

Optionally afterward, sync the new treasuries' internal ledgers (cosmetic) by
calling `proxySyncTokenBalance(podId, token)` on the TreasuryProxy for each
pod/token — callable by anyone once the registry points at the new treasuries.

## Reference — address map

| Contract | Address | Status |
|---|---|---|
| BountyManagerV4 | `0x7b3d752748feA88C65dE57Ae6FC32Fc22a457aC8` | old; holds stranded bounty #1 (0.01 SELF escrow) |
| BountyManagerV5 (broken registration) | `0xFE0007CbEe68ea201A238B23EF9Da13f4e918857` | abandon |
| BountyManagerV5 (fallback in very old code) | `0x8Af29E57A962216C4661c36737CbF33510356DAD` | dead, unused |
| Old Exec treasury | `0x6cd35eb6281C49d58DBEfaB20E67E9e141Baf8Af` | drain via multisig, then abandon |
| Old TN treasury | `0xF0DbcDA5750eCa93236EfCc4d217c440A7deabC7` | empty, abandon |
| Old Treegens treasury | `0x3a841B82baBaF674daBBd07303E5Fcb5301b99F2` | empty, abandon |
| Hats Protocol | `0x3bc1a0ad72417f2d411118085256fc53cbddd137` | shared |
| SYSTEM token | `0x00f75717Ab019DE0e452605098cFDc4FccEbc701` | shared |
| SELF token | `0x2d9e8A4DdED7438C2D4C8050Ed58B9F4Bc0c8298` | shared |
| Treasury proxy | `0x02110b4bBFA3BeeDbBd854b01683F9D9DB3aDeae` | shared |

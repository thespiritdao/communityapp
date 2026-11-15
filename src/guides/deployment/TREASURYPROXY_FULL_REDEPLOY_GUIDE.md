# TreasuryProxy — FULL Redeploy Guide (step by step)

**Date:** 2026-08-06
**Supersedes ambiguity in:** `TREASURYPROXY_FIX_DEPLOY_RUNBOOK.md` (kept for
context; THIS is the execution guide).

---

## Direct answers first

**Q: Am I redeploying TreasuryProxy directly?**
**A: Yes.** You deploy ONE new contract: the fixed `TreasuryProxy` (from
`src/contracts/TreasuryProxy.sol`, now hat-gated). That's the only deployment.

**Q: What about the adjacent contracts?**
**A: None of them redeploy.** Everything adjacent is a *re-point* (config
change), not a redeploy:

| Contract | Redeploy? | What actually happens |
|---|---|---|
| TreasuryProxy | ✅ YES — the only one | New contract with the hat check |
| PodTreasuryV3 ×3 (Exec/TN/Treegens) | ❌ No | Each votes a `SetProxy` proposal to trust the new proxy |
| PodTreasuryFactory (`0x3d68…`) | ❌ No | Optional 1-call housekeeping (see Step 5) |
| BountyManagerV5, tokens, Hats, governance, EventManager | ❌ No | Untouched — the proxy doesn't participate in those systems |
| App / env / paymaster | ❌ No code changes | Point `NEXT_PUBLIC_TREASURY_PROXY` + paymaster policy at the new address |

No funds move at any point. Fully reversible (treasuries can vote back to the
old proxy).

---

## Before you start — the one people-check

Each treasury re-point needs management-hat wearers to approve. Verified
on-chain today:

| Pod | Hat wearers | Approvals needed for SetProxy |
|---|---|---|
| Executive | 3 (incl. backend EOA `0x617b…` and your smart account `0xcdf3…`) | **2** — proposer auto-counts, so proposer + 1 more |
| Temporal Naturalism | 2 | **2** — proposer + 1 more (BOTH wearers must act) |
| Treegens | 1 | **1** — auto-executes the moment the wearer proposes |

⚠️ `proposeSetProxy` / `approveProposal` are `onlyPodManagers` and must be
called **directly on each treasury** by a hat-wearing wallet (NOT via the
proxy — the proxy route fails the manager check by design on V3). Identify who
holds each hat before starting; Treegens needs its one leader, TN needs both
wearers.

Backend EOA `0x617b…` wears the **Exec** hat, so I can script the Exec
propose (1 of 2) server-side; the 2nd Exec approval comes from another wearer.

---

## Step 1 — Deploy the new TreasuryProxy (Remix, wallet `0xd481…533d`)

1. Remix → new file `TreasuryProxy.sol` → paste the full contents of
   `src/contracts/TreasuryProxy.sol` (the fixed version — includes the
   `onlyPodManager` modifier). OpenZeppelin imports auto-resolve.
2. Compiler: **0.8.26**, optimizer **ON / 200 runs**, EVM **cancun**.
3. Environment: Injected Provider — MetaMask on **Base (8453)**, using
   `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d` (current proxy/factory owner —
   keeps ownership consistent).
4. Deploy with constructor args:

| Field | Value |
|---|---|
| `_treasuryFactory` | `0x3d68d59Dc78C45022bA37276FD1b03354F72B3b1` (the ORIGINAL factory — the one the live proxy reads; confirmed on-chain) |
| `_owner` | `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d` |

📋 **Save the address → `NEW_PROXY`.** (Optional: verify source on Basescan,
same compiler settings.)

## Step 2 — Re-point each treasury (multi-sig SetProxy proposals)

For each treasury, a hat-wearing manager calls **directly on the treasury
contract** (Remix "At Address" with the PodTreasuryV3 ABI, or Basescan Write):

1. `proposeSetProxy(NEW_PROXY)` → note the returned/emitted `proposalId`
2. Other wearer(s) call `approveProposal(proposalId)` until threshold →
   executes automatically; `authorizedProxy` flips to `NEW_PROXY`

| Treasury | Address | Who acts |
|---|---|---|
| Executive | `0xE2c064379d14BAc8371F5CdD7938F9472dC739aA` | I can script the propose with backend EOA; 1 more wearer approves |
| Temporal Naturalism | `0xe75b458a281634FF517fbb873dad5fa0d2F21553` | one wearer proposes, the other approves |
| Treegens | `0xe1691F0F43FB78B9718A3F9f9C13B09712BBBa3a` | its single wearer proposes → done instantly |

Until a treasury executes SetProxy it still trusts the OLD proxy — which
remains safe to leave running short-term (the old proxy now only endangers
treasuries still pointed at it; balances are small). Don't decommission
anything until all three have flipped.

## Step 3 — Paymaster (CDP dashboard)

Add `NEW_PROXY` to the sponsorship allowlist with the same function set the old
proxy had. Full state-changing signature list of the new contract:

```
proxyReceiveTokens(string,address,uint256)
proxyProposeDistribution(string,address,address[],uint256[],string)
proxyApproveProposal(string,uint256)
proxyCancelProposal(string,uint256)
proxyDistributeTokens(string,address,address[],uint256[],string)
proxyDistributeTokensEvenly(string,address,address[],uint256,string)
proxyDistributeSingle(string,address,address,uint256,string)
proxyEmergencyWithdraw(string,address,address,uint256)
proxyAddSupportedToken(string,address)
proxySyncTokenBalance(string,address)
proxySetAuthorizedProxy(string,address)
```
(`emergencyRecoverTokens` / ownership / `updateTreasuryFactory` are owner-only —
no need to sponsor.)

Keep the OLD proxy's entry until Step 6 verification passes, then remove it.

## Step 4 — Env + app

- `.env`: `NEXT_PUBLIC_TREASURY_PROXY=NEW_PROXY`
- Vercel: same variable, same value → redeploy the app
- `scripts/deploy/deploy-bounty-system.mjs`: update its `PROXY` constant so future
  treasury deploys bake in the new proxy (I'll do this when you give me the
  address)

## Step 5 — Factory housekeeping (1 call, optional but recommended)

The factory stores an `authorizedProxy` used only when IT deploys future
treasuries. Update it so future pods are born pointing at the new proxy:
on factory `0x3d68d59D…`, owner (`0xd481…`) calls
`updateAuthorizedProxy(NEW_PROXY)`. (Existing treasuries are unaffected either
way.)

## Step 6 — Verify (I'll run these once you give me NEW_PROXY)

- [ ] `authorizedProxy()` on all 3 treasuries == `NEW_PROXY`
- [ ] Simulated `proxyDistributeTokens` from a RANDOM (non-manager) address →
      reverts `Not a pod manager` ← the drain vector is closed
- [ ] Simulated `proxyDistributeTokens` from a manager smart account → passes
- [ ] A real (tiny) distribution through the app UI succeeds, gasless
- [ ] Then: remove OLD proxy from paymaster policy

## Rollback

Any treasury can vote `proposeSetProxy(OLD_PROXY)` to revert.
Old proxy: `0x02110b4bBFA3BeeDbBd854b01683F9D9DB3aDeae`.

---

## Who does what (summary)

| Actor | Steps |
|---|---|
| **You (Remix, `0xd481` wallet)** | Step 1 deploy · Step 3 paymaster · Step 4 Vercel env · Step 5 factory call |
| **Pod managers (hat wearers)** | Step 2 propose/approve on their treasuries (Treegens = 1 person, 1 tx) |
| **Me (scripted)** | Exec propose via backend EOA · Step 4 .env + script constant · Step 6 full verification |

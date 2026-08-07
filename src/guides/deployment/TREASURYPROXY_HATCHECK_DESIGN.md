# TreasuryProxy Hat-Check Fix — Design

**Date:** 2026-08-06
**Status:** DESIGN for review. No contract changes made.
**Prereq read:** `TREASURYPROXY_REMEDIATION_PLAN.md` (the why).

---

## Audit result: which proxy paths are used (so we can't just delete)

Every `proxy*` function traced to its app call site:

| Function | App usage | Risk | Decision |
|---|---|---|---|
| `proxyReceiveTokens` | `FundingModal`, `PodTreasuryService:1127` | deposit (safe) | keep as-is |
| `proxyProposeDistribution` | `useTreasuryProposals:81` | via multi-sig | keep as-is |
| `proxyApproveProposal` | `useTreasuryProposals:109` | via multi-sig | keep as-is |
| `proxyDistributeTokens` | `PodTreasuryService:988` | **direct drain** | **add hat check** |
| `proxyDistributeTokensEvenly` | `PodTreasuryService:1030` | **direct drain** | **add hat check** |
| `proxyEmergencyWithdraw` | `PodTreasuryService:826,1057` | **direct drain** | **add hat check** |
| `proxySetAuthorizedProxy` | `setupProxyAllowance` | config | **add hat check** (or admin-gate) |

The three direct-drain paths ARE used by the app → deletion is off the table.
Fix = enforce, on-chain, the same authorization the app already checks in the DB
before calling them (pod-manager hat ownership).

## The fix

Add a caller check to the vulnerable proxy functions: the ORIGINAL caller
(`msg.sender` at the proxy) must wear the pod's management hat.

The proxy can obtain everything it needs on-chain:
- `treasury = treasuryFactory.getTreasuryForPod(podId)` (already done)
- `managementHatId = IPodTreasury(treasury).managementHatId()` (public on V3)
- `hats.balanceOf(msg.sender, managementHatId) > 0` (Hats protocol)

### New proxy modifier (pseudocode)

```solidity
IHats public immutable hats;   // set in constructor to the Hats protocol addr

modifier onlyPodManager(string memory podId) {
    address treasury = treasuryFactory.getTreasuryForPod(podId);
    require(treasury != address(0), "Treasury not found for pod");
    uint256 hatId = IPodTreasury(treasury).managementHatId();
    require(hats.balanceOf(msg.sender, hatId) > 0, "Not a pod manager");
    _;
}
```

Apply `onlyPodManager(podId)` to `proxyDistributeTokens`,
`proxyDistributeTokensEvenly`, `proxyEmergencyWithdraw`, and
`proxySetAuthorizedProxy`. Leave deposit/proposal paths unchanged (proposals
already enforce hat + threshold inside the treasury).

### Interface addition

`IPodTreasury` in the proxy must expose `managementHatId() returns (uint256)`
(PodTreasuryV3 already has it as a public immutable — just add to the interface).

## Why this doesn't break the app

`PodTreasuryService` is only invoked by app flows that already gate on the
manager hat (DB check). Those callers wear the hat, so the new on-chain check
passes for them. It only blocks a hand-crafted call from a non-manager EOA —
exactly the exploit.

## Compatibility caveat — the sponsored/paymaster flow

If any of these direct-distribution calls are meant to run **gaslessly via the
backend smart wallet** (sponsored), then `msg.sender` at the proxy would be the
backend wallet, not the pod manager — and the hat check would fail. BEFORE
implementing, confirm how `PodTreasuryService`'s distribute calls are actually
submitted:
- If submitted by the **manager's own wallet/smart account** → hat check works.
- If submitted by a **shared backend wallet** → we need the backend wallet to
  hold a delegated hat, OR pass+verify the manager's signature, OR route these
  through the proposal flow instead. **This is the one open question to resolve
  before writing the contract.**

## Deployment sequence (same shape as the bounty migration)

1. Resolve the sponsored-flow question above.
2. Write + compile + verify the new TreasuryProxy (add `hats` immutable +
   `onlyPodManager`).
3. Deploy the new proxy.
4. Re-point each treasury to the new proxy via its `SetProxy` **multi-sig
   proposal** (management-hat wearers approve). Only step needing pod leaders.
5. Update `NEXT_PUBLIC_TREASURY_PROXY` in `.env` + Vercel; update the factory
   registry if it references the proxy; redeploy app.
6. Verify: a direct `proxyDistributeTokens` from a non-manager EOA reverts
   ("Not a pod manager"); a real manager distribution still succeeds.

## Risk / effort

- Contract change is small and well-scoped.
- Main risk is the sponsored-flow caveat (step 1) — get that wrong and legit
  distributions break. Resolve it first.
- Treasuries hold small balances now (Exec ~0.93 SYSTEM / 0.88 SELF; others
  empty), so blast radius is currently low — no need to rush the redeploy, but
  keep balances low until it ships.

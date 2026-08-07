# TreasuryProxy Fix — Deploy Runbook

**Date:** 2026-08-06
**Status:** Contract fix WRITTEN, compiled, and validated against live state.
Ready to deploy on your go. No on-chain action taken yet.

---

## What the fix does

Adds an `onlyPodManager(podId)` modifier to the TreasuryProxy and applies it to
every value-moving / config forwarding function:
`proxyDistributeTokens`, `proxyDistributeTokensEvenly`, `proxyDistributeSingle`,
`proxyEmergencyWithdraw`, `proxySetAuthorizedProxy`.

The modifier reads the pod's `managementHatId` and `hatsContract` **from the
treasury itself** (live, no config drift) and requires the ORIGINAL caller
(`msg.sender`) to wear that hat. This closes the drain vector: previously the
proxy forwarded these calls from anyone; now only a management-hat wearer can.

Deposit (`proxyReceiveTokens`) and proposal paths
(`proxyProposeDistribution`/`proxyApproveProposal`) are intentionally left
ungated — deposits are harmless, proposals already enforce hat + threshold
inside the treasury.

## Why it's confirmed safe (validated 2026-08-06)

- **Compiles clean** (solc 0.8.26, optimizer 200, cancun; 0 warnings; 11,910 B).
- **Live treasuries expose the functions the modifier calls** — verified on
  Base: all 3 return the Hats contract `0x3bc1A0Ad…` and a valid management hat.
- **Legit callers pass:** the app signs distributions with the manager's CDP
  **smart account** (`TreasuryManagement.tsx` → `sendUserOperation({
  evmSmartAccount, useCdpPaymaster:true })`), and that smart account wears the
  management hat (verified: Exec lead `0xcdf3…6f48` wears it). So the manager's
  own transactions pass; a random EOA's raw call reverts "Not a pod manager".

## Pre-deploy check (do once)

Confirm each pod's real managers wear the management hat on the wallet they SIGN
with (their smart account). We verified the Exec lead; do the same spot-check for
TN and Treegens managers if they'll distribute funds. If any manager's hat sits
on their EOA instead of their smart account, mint/transfer it to the smart
account first — otherwise their distributions would revert after the swap.

## Deploy sequence

Deployer = the current proxy owner / factory owner wallet
(`0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`), via Remix or a script.

1. **Deploy new TreasuryProxy** with the SAME constructor args as the current
   one:
   - `_treasuryFactory` = `0x3d68d59Dc78C45022bA37276FD1b03354F72B3b1`
     (the ORIGINAL factory the proxy reads from — confirmed in prior work)
   - `_owner` = `0xd481e0bbF2E1D05ad3A06Ae3345ED3d4294C533d`
   Source/artifact: `artifacts/src/contracts/TreasuryProxy.sol/TreasuryProxy.json`
   (or compile `src/contracts/TreasuryProxy.sol` in Remix: 0.8.26, optimizer
   200, cancun). Save the new address → `NEW_PROXY`.

2. **Re-point each treasury** to `NEW_PROXY`. PodTreasuryV3 changes its proxy
   only via a multi-sig proposal:
   - A manager calls `proposeSetProxy(NEW_PROXY)` (or the SetProxy proposal
     path) on each treasury (`0xE2c0…` Exec, `0xe75b…` TN, `0xe169…` Treegens).
   - Managers approve until threshold; on execution `authorizedProxy` flips to
     `NEW_PROXY`.
   - NOTE: this is the one step needing pod leaders. Until a treasury is
     re-pointed, it still trusts the OLD proxy — so do NOT decommission the old
     proxy until all three are moved.
   - ⚠️ Do the re-point via the treasury's own proposal flow, NOT via the old
     proxy's `proxySetAuthorizedProxy` (that path is now hat-gated on the OLD
     proxy too, which is fine, but the proposal flow is the clean route).

3. **Update the factory registry** if it stores the proxy address (it may not —
   the factory maps pods→treasuries, not the proxy; confirm and skip if N/A).

4. **Update env + app:**
   - `.env` and Vercel: `NEXT_PUBLIC_TREASURY_PROXY = NEW_PROXY`
   - Redeploy the app.
   - Re-whitelist `NEW_PROXY`'s functions in the CDP paymaster policy (the old
     proxy address was whitelisted; the new one must be too, or sponsored
     distributions won't be gasless).

5. **Verify:**
   - From a NON-manager EOA, a direct `proxyDistributeTokens` call reverts
     "Not a pod manager".
   - A real manager distribution (through the app) still succeeds.
   - `treasury.authorizedProxy()` == `NEW_PROXY` for all three.

## Rollback

If anything misbehaves, treasuries can be re-pointed back to the OLD proxy via
the same proposal flow. Keep the old proxy address recorded:
`0x02110b4bBFA3BeeDbBd854b01683F9D9DB3aDeae`.

## What does NOT change

No fund movement. No treasury/token/bounty-manager/governance redeploys. No pod
re-registration. Only: 1 new proxy contract + 3 treasury re-point proposals +
env/paymaster rewiring. Light lift, reversible.

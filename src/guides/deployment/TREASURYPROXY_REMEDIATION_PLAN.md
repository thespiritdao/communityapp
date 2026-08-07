# TreasuryProxy Drain — Remediation Plan (P0 #1)

**Date:** 2026-08-06
**Status:** PLAN ONLY — no contract changes made. For review before any deploy.

---

## The vulnerability (verified on-chain)

The live TreasuryProxy `0x02110b4bBFA3BeeDbBd854b01683F9D9DB3aDeae` exposes
`proxyDistributeTokens`, `proxyDistributeTokensEvenly`, and
`proxyEmergencyWithdraw`. Each forwards to a pod's PodTreasuryV3, whose matching
functions are gated by `onlyAuthorizedProxy` — i.e. "is msg.sender the
authorized proxy?".

All three live treasuries have `authorizedProxy` = the shared proxy (confirmed
on-chain). The proxy performs **no check on who called it** — only that the
treasury exists (`validPodTreasury`). So the trust is circular:

```
AnyEOA → proxy.proxyDistributeTokens("victim-pod", TOKEN, [attacker], [bal], "")
       → proxy calls treasury.distributeTokens(...)   (msg.sender = proxy ✓)
       → treasury sends the pod's balance to attacker
```

**Real severity:** exploitable, but only by a hand-crafted on-chain call that
bypasses the app. App users cannot trigger it (the UI checks pod-manager hats in
the DB first). So it is P0 (unauthenticated on-chain drain path) but **not
actively on fire** — there is time to fix it deliberately.

**Why prior audits didn't catch it:** the recent fixes hardened *different*
drain paths — BM-001 (bounty manager pulling from caller-supplied treasury) and
the V2→V3 treasury migration (multi-sig proposal flow). This proxy path was
designed as the "sponsored server flow" shortcut, with authorization delegated
to the app layer by intent. It is a third door the earlier work didn't touch.

---

## Fix options

### Option 1 — Proxy verifies the caller wears the pod's management hat (recommended)
The treasury stores `managementHatId`. Add a check in the proxy: before
forwarding a value-moving call, require that `msg.sender` (the original caller)
wears the pod's management hat on the Hats protocol.

- ✅ Moves the authorization on-chain, matching the app's DB model.
- ✅ No treasury redeploy needed IF the proxy can read `managementHatId` from
  the treasury (it can — it's public) and the Hats contract.
- ⚠️ Requires the proxy to be redeployed and each treasury re-pointed to the new
  proxy via its `SetProxy` proposal flow (multi-sig).

### Option 2 — Remove the direct proxy distribution paths entirely
If treasury value movement should ALWAYS go through the multi-sig proposal flow
(`proposeDistribution` / `approveProposal`), then `proxyDistributeTokens` &
`proxyEmergencyWithdraw` are unnecessary attack surface.

- ✅ Simplest, smallest attack surface — proposals already enforce hat + threshold.
- ⚠️ Confirm no live app feature depends on the direct proxy path. The
  `proxyReceiveTokens` (deposits) and `proxyProposeDistribution` /
  `proxyApproveProposal` paths are the ones the app actually uses; the direct
  `proxyDistributeTokens` may be legacy. **AUDIT FIRST.**

### Option 3 — Access-control the proxy itself
Add an owner/role gate on the direct distribution functions so only the backend
admin wallet can call them (the sponsored-server-flow intent).

- ✅ Small change; preserves the server flow.
- ⚠️ Centralizes trust in the backend key; less aligned with the hat model.

---

## Recommended path

1. **AUDIT the app's real usage** of each `proxy*` function (grep the app for
   `proxyDistributeTokens`, `proxyEmergencyWithdraw`, `proxyDistributeTokensEvenly`,
   `proxyReceiveTokens`, `proxyProposeDistribution`, `proxyApproveProposal`).
   - If the direct-distribution paths are unused → **Option 2** (delete them).
   - If they're used by a sponsored server flow → **Option 1** (hat check).
2. Write the new proxy contract; compile + verify.
3. Deploy new proxy.
4. Re-point each treasury via its `SetProxy` multi-sig proposal (management-hat
   wearers approve). This is the only step needing the pod leaders.
5. Update `NEXT_PUBLIC_TREASURY_PROXY` in `.env` + Vercel; update the factory
   registry if it references the proxy; redeploy the app.
6. Verify: attempt a direct `proxyDistributeTokens` from a non-manager EOA on a
   testnet fork (or a tiny mainnet amount) → must revert.

This is the same careful shape as the bounty-manager migration: deploy →
re-point via governance → re-wire env/registry → verify. Do NOT rush a redeploy
of contracts holding real treasury funds.

---

## Interim mitigation (optional, until the fix ships)

The exploit needs a raw on-chain call — no app change makes it easier or harder.
If desired before the fix: the treasuries currently hold small balances (Exec
~0.93 SYSTEM / 0.88 SELF; TN & Treegens empty). Keeping treasury balances low
until the proxy is fixed caps the blast radius.

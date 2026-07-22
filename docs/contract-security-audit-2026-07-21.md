# Smart Contract Security Audit — 2026-07-21

**Method:** Multi-agent audit (Fable) of `src/contracts/` tied to live app callsites, every High/Critical adversarially verified by an independent skeptic, plus a dependency/redeploy-scoping pass.
**Chain:** Base mainnet (8453). **Scope:** all 51 unique Solidity contracts + their app integration.
**Supersedes:** `docs/archive/audits/contract-security-audit-2026-05.md` (that doc's SystemToken address `0x1317Ae…` is a STALE prior deployment — live is `0x00f757…`; several of its findings are re-verified below and re-graded).

---

## TL;DR — what actually matters

The adversarial pass earned its keep: **6 of 7 "High/Critical" findings the finders raised were downgraded** to Low/Info once traced to real reachability. What remained is **one genuine Critical** and a tight set of real Mediums.

- **🔴 ONE CRITICAL, ACT NOW: `BM-001` — any wallet can drain every pod treasury.** Unauthenticated. This is the headline of the entire audit. It must be fixed before onboarding a second community, and arguably before the second community's treasury holds any funds.
- The recurring "permissionless governance / tx.origin / immutable admin" scares from the prior audit are all **not exploitable** in the current architecture (dead code, owner-gated, or Supabase-authoritative). They're hardening items, not holes.
- The real second-tier work is the **max-approval + permissionless-bounty compound** (same root as BM-001) and a cluster of **caller-supplied-parameter-not-bound-to-context** Mediums that the app currently mitigates but the contracts don't.

---

## Severity ledger (post-verification)

| Severity | Count | IDs |
|----------|-------|-----|
| **Critical** | 1 | BM-001 |
| High | 0 | (all raised Highs were downgraded on verification) |
| Medium | ~13 | TREASURY-V3-002/M10 (approval cap), TREASURY-V2VOTING-001, PODAUTH-FACTORY-001, M4/PRDR (product redirect), SELF-V2-002 (decay drift), SELF-V2-003 (receipt), BM-004/005/007, PBS-001, GOV-3/4, POD-2/3/4, TC-001, TF-001, M3/PUR (residual approval — see note) |
| Low / Info | many | tx.origin (SELF-V2-001), permissionless aggregate/finalize (GOV-1/2/H4), BOUNTY immutable admin (H6/BM-006), finalizeIfVetoWindowPassed (POD-1), release-payment paths (BM-002/003), residual approvals (PUR-001/002 — refuted), NFT mint races |

---

## 🔴 CRITICAL — fix immediately

### BM-001 — Unauthenticated drain of every pod treasury via `createBounty`
**Contract:** `BountyManagerV4.sol:191–253` (transfer at line 230). **Live:** `0x7b3d…aC8`. **Verdict: CONFIRMED Critical.**

**The flaw.** `createBounty(value, token, …, treasuryAddress, useTreasuryFunding)` is `external` and **permissionless** — no Hats check, no `whenNotPaused`. When `useTreasuryFunding=true` it executes:
```
IERC20(token).safeTransferFrom(treasuryAddress, address(this), value)   // line 230
```
using the **caller-supplied `treasuryAddress` parameter**. And every `PodTreasuryV3` grants this exact BountyManager address `type(uint256).max` approval on all its supported tokens in its constructor (`PodTreasuryV3.sol:156–162`).

**The exploit (fully self-service, no victim interaction):**
1. Attacker calls `createBounty(balance, $SYSTEM, …, treasuryAddress = ANY_REAL_POD_TREASURY, useTreasuryFunding = true)`. The max-approval means the `safeTransferFrom` succeeds, pulling the treasury's full balance into the bounty escrow.
2. Attacker `placeBid` on their own bounty.
3. Attacker `assignBounty` (creator-gated — they are the creator) to themselves.
4. Attacker `releasePayment` (creator/reviewer/approver-gated — they are the creator) → funds `safeTransfer` to attacker.

**Why the app doesn't save you:** the contract is directly callable on-chain. `BidApprovalFlow.tsx` / `useBountyContractEnhanced.ts` and the Paymaster whitelist are UX, not security boundaries — an attacker calls the contract directly and pays their own gas.

**Verifier's correction to the finder:** the finder claimed the danger was "poisoning" the *stored* `podMetadata.treasuryAddress`. That's false — line 230 reads the **function parameter**, never the stored value, so no poisoning is needed. The real bug is simpler and worse: the transfer target is an unauthenticated caller-supplied address backed by a standing max-approval.

**Fix (contract redeploy required — see redeploy map):**
- In the `useTreasuryFunding` path, **ignore the caller-supplied `treasuryAddress`**; force `treasuryAddress == podMetadata[podId].treasuryAddress`.
- Require `hatsProtocol.balanceOf(msg.sender, podMetadata[podId].leaderHatId) > 0` (bind bounty creation to actual pod leadership) — this also closes BM-007 auto-registration.
- Root-cause hardening: treasuries should **not** grant blanket `type(uint256).max` to a permissionless bounty contract (see TREASURY-V3-002). Move to per-bounty escrow or a capped, pull-on-demand approval.

**Interim mitigation before redeploy (do at least one, today):**
- If BountyManagerV4's admin can `pause()` — it **cannot meaningfully** (BM-005: `whenNotPaused` is on no function). So pausing is not an option; this is itself why redeploy is urgent.
- Operationally: **keep pod treasury balances near zero** until fixed (sweep to a Safe not approved to BountyManager), and/or revoke the max-approval on existing treasuries via `PodTreasuryV3.proposeRevokeBountyApproval()` (exists, needs majority pod-leader approval) for any pod holding funds. This neutralizes BM-001 without a redeploy at the cost of disabling treasury-funded bounties until the new contract ships.

---

## 🟠 MEDIUM — real, worth fixing (contract changes)

These are genuine gaps. Most are currently **mitigated by the app layer** but not by the contract — meaning a direct on-chain caller, a future app change, or a compromised backend re-opens them. For a security-hardening pass ahead of multi-community, closing them at the contract level is the right call.

### Treasury / approval
- **TREASURY-V3-002 / M10-BOUNTY-002 (same issue):** every `PodTreasuryV3` grants `type(uint256).max` to BountyManager (`:156–162`). This is the amplifier that turns BM-001 from "drain one bounty's funding" into "drain the whole treasury." Fix with a capped approval (`_maxBountyApprovalPerToken` constructor arg) or per-bounty escrow. **Redeploy PodTreasuryV3 + FactoryV3.**
- **TREASURY-V2VOTING-001:** `PodTreasuryV2WithVoting.distributeTokens` accepts either pod-manager OR proxy; `setAuthorizedProxy` isn't proposal-gated, so one compromised manager can point the proxy at attacker code and bypass multisig. **V2 is legacy** (app uses V3) — lower priority; migrate remaining V2 pods to V3 rather than patch.
- **PODAUTH-FACTORY-001:** `*ViaFactory` functions trust a caller-supplied `actualUser` not bound to `msg.sender`. Currently **no live app callsites** and gated by an on-chain Hats check (attacker must already wear the hat), so impact is limited — but deprecate the `actualUser` pattern in favor of `msg.sender` on next redeploy.

### $SELF V2 (new stack, first audit)
- **SELF-V2-003 (receipt double-register):** `EventManagerV2.registerForEvent` marks the `SelfReceipt` fulfilled inline and is `nonReentrant`, so a single-tx race is blocked. Residual risk is only if the backend fails to call `markFulfilled`. Add a defensive re-check of `!fulfilled` after `markFulfilled`. Low practical risk given current controls.
- **SELF-V2-002 (decay drift underpayment):** if an epoch advances between off-chain id-selection and on-chain burn, a payment can revert as underpaid. The 1% `SELECTION_MARGIN_BPS` + weekly cron-driven epoch advances make this a **UX/DoS edge, not fund loss**. Fix operationally (advance epochs off-peak) or add an optional `minDecayFactorBps` guard. No redeploy needed if accepted.

### Bounty (beyond BM-001)
- **BM-005:** `pause()`/`unpause()` exist but **no function uses `whenNotPaused`** — the emergency brake is a no-op. Add the modifier to `createBounty`/`releasePayment`/`cancelBounty`/`assignBounty`/`placeBid`. (Folds into the BM-001 redeploy.)
- **BM-004 / BM-007:** cancel-refund routes to `fundingSource` without re-validating it's the real treasury; `registerPodMetadata` doesn't validate the treasury address. Both fold into the BM-001 leader-hat + forced-treasury fix.
- **PBS-001:** `PodBountyService` authorized-updater list has no timelock/audit-trail; a compromised owner can grant themselves roles instantly. Move owner to a Safe; add a removal timelock.

### Purchase routing
- **PRDR-001 / M4:** `setProductDestination` checks the caller holds *a* pod's hat but never binds the product to that pod — a Pod A manager can redirect another product's stored destination to Pod A's treasury. **Verified real but downgraded to Low**: the live app uses `purchaseWithExplicitDestination` (derives routing per-purchase from the DB), which never reads the corrupted mapping; funds can only go to a real DAO treasury, never an attacker EOA. Fix the binding on next router redeploy; not urgent.
- **M3 / PUR-001 / PUR-002 (residual approval):** **REFUTED.** `receiveTokens` pulls exactly the approved amount, consuming the allowance to zero in the same tx; the router holds no standing balance. Not exploitable. Optional `approve(0)` hygiene only.

### Governance / pods / eligibility (contract-side defense-in-depth; app mitigates today)
- **GOV-3:** `PodApplicationVoting.castVote` accepts a caller-supplied `podLeaderHatId` not bound to the application's pod — a leader of pod X could vote on pod Y's applications. App hardcodes the correct hat; contract should store required hat per application.
- **GOV-4:** `PodGovernanceV3.recordVote` has no voting-period check — votes can be recorded after close. App gates on `voting_deadline`; add an on-chain deadline for defense-in-depth.
- **POD-2 / POD-3:** `createPodProposal` / `activateSubPod` don't validate the parent-hat relationship on-chain (caller-supplied hat, only "do you wear it" checked). App resolves the correct parent from DB. Bind on-chain.
- **POD-4:** `MultiCriteriaEligibilityModule.setHatAdmin` is permissionless (first-come claims admin of a hat's eligibility). No live callsite found; gate it with `HATS.isAdminOfHat(msg.sender, hatId)`.
- **TC-001:** `TokenClaim.burnForClaim` burns to `0xdead` with no pause/rate-limit — a frontend compromise or phish causes irreversible loss. Add `Pausable` + per-user cap.
- **TF-001:** `TokenFaucet` has per-address cooldown but no global drain cap — Sybil-drainable. Add an aggregate daily limit. (Faucet — testnet-tier value, low urgency.)

---

## 🟡 LOW / INFO — hardening, not holes (verified NOT exploitable)

Kept for the record; each was raised as High and **refuted or downgraded** by the adversarial pass:

- **GOV-1/2, H4, POD-7 — permissionless `aggregateVotes`/`finalizeProposal`:** pure event emitters, **zero state writes**, and **nothing in the codebase reads those events** (the close-proposals cron reads Supabase; the only chain event indexer watches the DAO Governor `VoteCast`). Add `onlyOwner` before ever wiring them up — hygiene, not a hole.
- **SELF-V2-001 / H-1 — `tx.origin` in PodSELFDistributor:** `tx.origin` can't be spoofed by a contract; the distribute functions have **no app callsites**, aren't on the paymaster whitelist, and live issuance runs through `SelfMinter.mintBatch` instead. Dormant.
- **BM-006 / H-6 — immutable BountyManager admin:** admin **cannot touch escrowed funds** (creator/reviewer/approver-gated); `pause` and the fee vars are inert dead code. Compromise = griefing (junk-token whitelist, no-op pause), not theft. Operational key-management item.
- **BM-002 / BM-003 — release-payment paths & reentrancy:** roles are per-bounty (not global), `releasePayment` moves only that bounty's own escrow to the fixed assigned bidder via `safeTransfer` (no `transferFrom`, can't reach a treasury), and `nonReentrant` is present. Not exploitable; reorder to CEI for defense-in-depth.
- **POD-1 — permissionless `finalizeIfVetoWindowPassed`:** reachable, but it's **documented opt-out-veto design**; the minted hat is scoped to the attacker's own sandbox pod (no treasury attached, capped at 5/creator, exec can veto/deactivate). Governance-hygiene, not fund/privilege.
- **ADVOCATE-001 / POC-001 — NFT mint races:** on-chain `AlreadyHoldsToken` guard prevents duplicates; app races are serialized by the smart-wallet provider. Worst case: a duplicate soulbound membership NFT. Low.
- **EVT-001/002/003/005 — event system:** refuted/downgraded (EventEscrow is largely a `$SYSTEM`-only relic; the live path is EventManagerV2).

---

## Contract dependency graph (what forces what to redeploy)

**Treasury / bounty chain (the critical cluster):**
```
PodTreasuryFactoryV3 ──deploys──> PodTreasuryV3 (per pod)
        │                              │  immutable: hatsContract, managementHatId, bountyManager
        │                              │  constructor: approve(bountyManager, MAX) on every supported token
        └──holds addr of──> bountyManager (BountyManagerV4, immutable admin EOA)
TreasuryProxy ──routes to──> PodTreasuryV3 (owner = POD_ADMIN_WALLET EOA)
```
- Redeploy **BountyManagerV4** ⇒ update `NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS`; **every existing PodTreasuryV3 references the OLD bounty manager immutably** in its constructor approval. New treasuries pick up the new address via the factory; **existing treasuries keep approving the old one** → you must either (a) redeploy the factory pointing at the new manager AND migrate pods to fresh treasuries, or (b) accept that old treasuries approve a now-dead manager (safe) while the app points at the new one. For BM-001 specifically, the cleanest fix is a new BountyManager that ignores caller-supplied treasury + checks leader hat — old treasuries' stale approval to the old manager is then harmless because the old manager is de-referenced by the app and holds no new funds.
- Redeploy **PodTreasuryV3 + FactoryV3** (for the approval cap) ⇒ update `NEXT_PUBLIC_POD_TREASURY_FACTORY_V3`; existing pods keep old treasuries (migration is per-pod, opt-in via the deployer flow). New pods get capped approvals.

**$SELF cluster:**
```
SelfEpochsV2 <──burns from── SelfPaymentV2 ──mints──> SelfReceipt
SelfMinter ──mints──> SelfEpochsV2         EventManagerV2 ──consumes(FULFILLER_ROLE)──> SelfReceipt
SelfPrestige (standalone, records tenure at mint)
```
- Redeploy **EventManagerV2** ⇒ update `NEXT_PUBLIC_EVENT_MANAGER` AND re-grant `FULFILLER_ROLE` on SelfReceipt to the new EventManagerV2 (and revoke from the old). No other contract references it.
- Redeploy **SelfPaymentV2** ⇒ re-grant burn/mint roles on SelfEpochsV2 + SelfReceipt; update `NEXT_PUBLIC_SELF_PAYMENT`; EventManagerV2 references SelfReceipt (not SelfPayment) so it's unaffected.

**Pod creation / hats:**
```
PodCreationManagerV2 ──createHat via──> Hats Protocol (holds COMMUNITY_PODS_PARENT hat)
        └──> eligibility/toggle modules (currently address(1) placeholder — POD-6)
HatMinter (holds parent hats for member/leader mint)
```
- Redeploy **PodCreationManagerV2** ⇒ update `NEXT_PUBLIC_POD_CREATION_MANAGER`, **re-mint COMMUNITY_PODS_PARENT hat to the new address** (it must wear the parent to create children), re-whitelist with Coinbase Paymaster. High-friction; batch with other pod-creation fixes.

**Governance / routers (standalone, low coupling):**
- PodGovernanceV3, PodApplicationVoting, PurchaseRouter(s), TokenClaim, TokenFaucet each redeploy independently → update their single env var; no cross-contract references to fix.

---

## Redeploy field-replacement map (High/Critical fixes only)

| Contract | Why | Constructor/code change | Env var | Post-deploy on-chain steps |
|----------|-----|-------------------------|---------|----------------------------|
| **BountyManagerV4** (BM-001, BM-005, BM-007) | Critical drain | `createBounty`: force `treasuryAddress = podMetadata[podId].treasuryAddress`; require `balanceOf(msg.sender, leaderHatId)>0`; add `whenNotPaused` to value-moving fns | `NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS` | Re-`registerPodMetadata` for existing pods on new contract; point app at new addr; leave old treasuries' stale approval to old manager (harmless once de-referenced) |
| **PodTreasuryV3** + **PodTreasuryFactoryV3** (TREASURY-V3-002) | Approval amplifier | add `uint256 _maxBountyApprovalPerToken`; replace `approve(bountyManager, MAX)` with capped approve | `NEXT_PUBLIC_POD_TREASURY_FACTORY_V3` | New pods get capped approval; migrate funded pods to new treasuries via deployer; optionally `proposeRevokeBountyApproval` on old ones |
| **EventManagerV2** (SELF-V2-003, defensive) | Receipt re-check | re-check `!fulfilled` after `markFulfilled` | `NEXT_PUBLIC_EVENT_MANAGER` | Grant `FULFILLER_ROLE` on SelfReceipt to new EventManagerV2; revoke from old |

Everything else (GOV-3/4, POD-2/3/4, TC-001, TF-001, PODAUTH-FACTORY, router binding) is **defense-in-depth** — batch into the next scheduled redeploy of each contract rather than an emergency cycle.

---

## Recommended sequencing

1. **Now (pre-any-second-community-funds):** neutralize BM-001. Either ship the fixed BountyManagerV4 **or** revoke the max-approval / sweep balances on every funded treasury. Do not let a second community's treasury hold funds against the current BountyManagerV4.
2. **This hardening cycle:** redeploy BountyManagerV4 (leader-hat + forced-treasury + working pause) and PodTreasuryV3/FactoryV3 (capped approval). These two are the whole treasury-security story.
3. **Next scheduled redeploys (batch, non-urgent):** the caller-supplied-parameter bindings (GOV-3/4, POD-2/3/4, PODAUTH-FACTORY, router product binding), TC-001 pause, TF-001 cap.
4. **Operational, no redeploy:** move POD_ADMIN_WALLET / BountyManager admin / PodBountyService owner / TreasuryProxy owner to a Safe multisig (addresses the entire class of "single EOA can…" Low findings at once); schedule $SELF epoch advances off-peak.
5. **Before wiring on-chain governance:** add `onlyOwner` to PodGovernanceV3 `aggregateVotes`/`finalizeProposal`.

---

## Notes on process
- 2 workflow runs, 29 agents, ~1.6M tokens. 3 finders died on socket errors in run 1 (bounty, events, tokens-purchase) and were re-run in run 2 — those three carried the highest-stakes findings including BM-001, so the completeness mattered.
- Every High/Critical was independently verified. The verifier **confirmed 1** (BM-001, and corrected its mechanism to something worse), **downgraded/refuted the other 6+ raised Highs** with concrete reachability analysis. Treat the Low/Info section as "checked and cleared," not "unreviewed."
- On-chain confirmations still owed (the audit reads source, not chain state): (a) is BountyManager/POD_ADMIN admin an EOA or already a Safe? (b) which pods currently hold treasury balances (BM-001 blast radius)? (c) does `address(1)` eligibility placeholder (POD-6) actually work on live Hats or silently no-op?

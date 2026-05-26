# Smart Contract Security Audit — 2026-05-26

**Auditor:** Claude (AI-assisted, pre-professional audit)
**Scope:** All Solidity contracts in `src/contracts/` + app-layer integration
**Chain:** Base (chainId 8453)
**Compiler:** Solidity ^0.8.20
**OpenZeppelin:** v5.2.0
**Status:** Living document — update as items are remediated

---

## Executive Summary

30 findings across 28 contracts, plus 1 app-layer finding. All findings have been **context-audited against actual app operations** — each was evaluated not just at the contract level but through the lens of how the app actually calls the contract, what mitigations exist at the frontend/backend layer, and whether the contract is actively used.

| Severity | Count | Context Result |
|----------|-------|----------------|
| Critical | 0 | C-1 downgraded to M-11 after context audit |
| High | 6 | 2 confirmed active, 2 dormant, 2 operational context needed |
| Medium | 11 | 3 mitigated by app, 4 confirmed present, 2 dormant, 2 accepted |
| Low | 8 | All low-priority |
| Informational | 5 | No action needed |
| App-Layer | 1 | **APP-1 FIXED (2026-05-26)** |

---

## Severity Definitions

- **Critical:** Direct loss of funds or permanent privilege escalation exploitable by any external actor with no preconditions
- **High:** Significant security risk that could lead to loss of funds or unauthorized actions under specific conditions
- **Medium:** Logic flaws, access control gaps, or design issues that increase attack surface but require specific circumstances
- **Low:** Minor issues, best-practice violations, or edge cases with limited impact
- **Informational:** Code quality, gas optimization, or architectural observations

---

## APP-LAYER FIX (COMPLETED)

### APP-1: API Route Wallet Header Spoofing — FIXED

**File:** `src/features/pods/middleware/podAuthMiddleware.ts`
**Original status:** `getUserWallet()` extracted wallet from spoofable `x-wallet-address` header
**Fix applied:** 2026-05-26

**What changed:** Replaced header-based wallet extraction with Supabase JWT verification:
1. Extracts Bearer token from `Authorization` header
2. Creates Supabase client authenticated with that token
3. Calls `supabase.auth.getUser()` to cryptographically verify the JWT
4. Looks up the verified user's canonical wallet from `user_profiles` table

**Why this is secure:** The wallet address now comes from the database after JWT verification, not from a client-supplied header. This matches the proven pattern used by `chat-messages/route.ts`.

**Affected routes:** `/api/pods/invite` (POST), `/api/pods/[id]/permissions` (GET/PUT/POST)

**Frontend compatibility:** No changes needed — the frontend already sends `Authorization: Bearer ${supabaseToken}` to API routes. The `x-wallet-address` header was never set by any frontend code (confirmed by codebase search).

---

## Finding C-1 (RECLASSIFIED → M-11): PodAuthorizationFactory V3 `actualUser` Parameter

**Original severity:** Critical
**Revised severity:** Medium
**Contract:** `src/contracts/PodAuthorizationFactory.sol` (lines 269–600)
**Status:** [ ] Accept risk or fix on next update

### App-Level Mitigations Found

1. **On-chain Hats Protocol check (strong):** `IHats.isWearerOfHat(actualUser, managementHatId)` — `actualUser` must genuinely wear the hat.
2. **Coinbase Paymaster whitelisting (strong):** Only 9 `*ViaFactory` signatures sponsored.
3. **Frontend wallet binding (moderate):** App passes `actualUser` from `useEvmAddress()` (connected Coinbase Smart Wallet).

### Remaining Risk

A malicious actor knowing a pod manager's address could call `*ViaFactory` directly, passing the manager's address. The on-chain check passes because that address genuinely wears the hat. Impact limited: no financial benefit, actions visible on-chain, reversible by actual managers.

### Decision Required

- [ ] Accept risk (document as known ERC-4337 trade-off)
- [ ] Fix on next contract update

---

## HIGH SEVERITY FINDINGS

### H-1: `tx.origin` Authentication in PodSELFDistributor

**Contract:** `src/contracts/PodSELFDistributor.sol` (lines 101–110)
**Deployed:** `0x8a80eC4e958d73B8A19dFBa594882c598f14036c`
**Status:** [ ] Pending — dormant but deployed

**Context audit result:** The contract is deployed and actively configured (wired to V3 factory), but the **vulnerable proxy path is not currently triggered by the app**. The app routes SELF distribution through `TreasuryProxy → Treasury`, not through PodSELFDistributor's proxy path. The `DirectDistribution.tsx` component specifically avoids PodSELFDistributor with the comment: "This avoids the tx.origin issue with Smart Wallets."

**Risk status:** DORMANT. The `tx.origin` code path only activates when `msg.sender == authorizedProxy`, and no app code currently calls through that path. However, the code remains deployed and could become exploitable if future development activates the proxy mechanism.

**Already documented:** Roadmap item #8 already notes this as HIGH severity (line 280).

**Remediation:**
- [ ] Decide: fix the contract or formally deprecate the proxy path
- [ ] If fixing: replace `tx.origin` with `msg.sender` or `actualUser` pattern

---

### H-2: Unlimited Minting in SelfToken

**Contract:** `src/contracts/SelfToken.sol`
**Deployed:** `0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21`
**Status:** [ ] Pending — operational context needed

**Context audit result:** `MINTER_ROLE` is granted only in the constructor (no `grantMinter()` function). The only caller found is `PodSELFDistributor._executeSELFDistribution()` which mints to pod-designated recipients. No rate limiting exists at contract or app layer. SELFAllocationManager (roadmap #7) does not exist in the codebase yet.

**Risk status:** PRESENT but access-controlled. Minting is gated by `MINTER_ROLE` + Hats Protocol hat check. The unlimited amount per call is the concern.

**Remediation:**
- [ ] Confirm MINTER_ROLE holder(s) on-chain
- [ ] Decide if roadmap #7 (SELFAllocationManager) will add caps
- [ ] If no near-term plan: add per-call or per-epoch cap to contract

---

### H-3: Dual Unlimited Minting in SystemToken

**Contract:** `src/contracts/SystemToken.sol`
**Deployed:** `0x1317Ae277266D38C4E492558f8693F14143a6A65`
**Status:** [ ] Pending — operational context needed

**Context audit result:** The deprecated backend mint endpoint (`route.ts.DEPRECATED`) is no longer active. Current flow: executive approval (2-of-3 threshold in `/api/donations/approve`) marks donation as `pending_mint`, then frontend executes the mint via Smart Wallet. Hat-based authorization (`EXECUTIVE_POD_LEADER` hat) is verified on-chain. No rate limiting exists.

**Risk status:** PRESENT but operationally controlled. The 2-of-3 approval threshold is an app-layer control, not enforced on-chain.

**Remediation:**
- [ ] Confirm EXECUTIVE_ROLE holder(s) on-chain
- [ ] Consider adding on-chain minting cap matching the fiat backing model

---

### H-4: Permissionless PodGovernanceV3 Functions

**Contract:** `src/contracts/PodGovernanceV3.sol` (lines 106–138)
**Deployed:** `0xD19143da8c319484d4c093A709DC93624345b690`
**Status:** [ ] Pending — partially mitigated

**Context audit result:** PodGovernanceV3 is **actively used** for `POD_TREASURY_BINDING` tier votes. The `recordVote` function has proper access control (Advocate NFT balance check). However, `aggregateVotes` and `finalizeProposal` are permissionless and **not currently called** by the app (TODO comments in `ipfsAggregationService.ts:271`).

**Governance architecture is hybrid:**
- POD_OPERATIONAL votes: DB-only (Supabase)
- POD_TREASURY_BINDING votes: DB + on-chain via `recordVote`
- Aggregation/finalization: IPFS upload from DB, on-chain call is TODO

**Risk status:** MODERATE. The permissionless functions can emit fake events, which could mislead off-chain indexers. Since the app treats Supabase as authoritative (not these events), the practical impact is limited to event spoofing.

**Remediation:**
- [ ] Add `onlyOwner` or `onlyAuthorizedAggregator` to `aggregateVotes` and `finalizeProposal` before wiring them up
- [ ] PodGovernance V1 (`src/contracts/PodGovernance.sol`) is superseded — can be removed

---

### H-5: Multi-Sig Bypass in PodTreasuryV2WithVoting

**Contract:** `src/contracts/PodTreasuryV2WithVoting.sol` (lines 415–441)
**Status:** [ ] Pending — confirmed active

**Context audit result:** The bypass is **actively used**:
- `/api/bounty/treasury-distribute` calls `distributeTokens` directly using admin private key
- `DirectDistribution.tsx` enables UI users to call `distributeTokens` directly
- `TreasuryProxy` forwards to `distributeTokens`/`distributeTokensEvenly` (not proposals)

The proposal system (`proposeDistribution` → `approveProposal`) exists but is optional — hat-wearing managers can use the direct path anytime.

**Risk status:** CONFIRMED. A single pod manager can drain V2 treasury without multi-sig. This is by design (V2 trusts hat holders), but contradicts the multi-sig intent of the voting system.

**Remediation:**
- [ ] Inventory which pods use V2 treasuries and their balances
- [ ] V3 treasury properly gates direct distribution to `onlyAuthorizedProxy`
- [ ] Consider migrating V2 pods to V3

---

### H-6: Immutable Admin in BountyManagerV4

**Contract:** `src/contracts/BountyManagerV4.sol` (line 74)
**Deployed:** `0x7b3d752748feA88C65dE57Ae6FC32Fc22a457aC8`
**Status:** [ ] Pending

**Context audit result:** No admin functions (`setTokenAllowed`, `updatePlatformFee`, `pause`, etc.) are called from any app code. The admin address is unknown from the codebase — needs on-chain check. No BountyManagerV5 or replacement exists.

**Risk status:** PRESENT. If the admin key is an EOA that gets compromised, the contract cannot be recovered without full redeployment + bounty migration.

**Remediation:**
- [ ] Check admin address on-chain: `cast call 0x7b3d...aC8 "admin()(address)" --rpc-url https://mainnet.base.org`
- [ ] If EOA: plan migration to a version with transferable admin
- [ ] If multisig: document as acceptable

---

## MEDIUM SEVERITY FINDINGS

### M-1: Unbounded Loop in EventEscrow.batchRefund

**Contract:** `src/contracts/EventEscrow.sol` (lines 268–293)
**Status:** [ ] Low priority — contract unused

**Context audit result:** EventEscrow is deployed but **no frontend or API code calls `batchRefund`**. The event system feature appears incomplete/abandoned. Function is admin-only (`onlyOwner`).

**Risk status:** INACCESSIBLE. Vulnerability exists in deployed code but is not reachable from the app.

---

### M-2: Caller-Supplied Hat ID in PodApplicationVoting — MITIGATED

**Contract:** `src/contracts/PodApplicationVoting.sol` (lines 110–148)
**Status:** [x] Mitigated by app layer

**Context audit result:** The frontend (`VoteOnApplicationButton.tsx:121-130`) hardcodes the hat ID from `getClientHatId('EXECUTIVE_POD_LEADER')` — it is NOT user-supplied. The contract's `isWearerOfHat` check still validates ownership. A user calling the contract directly could supply a different hat ID, but they'd still need to actually wear that hat.

**Risk status:** MITIGATED. App provides correct hat ID from database lookup. Direct contract callers are limited by on-chain hat ownership check.

---

### M-3: Residual Token Approval in PurchaseRouter(s) — CONFIRMED

**Contracts:** `src/contracts/PurchaseRouter.sol`, `src/contracts/PurchaseRouterDecentralized.sol`
**Status:** [ ] Present

**Context audit result:** Both contracts are actively used via `purchaseRouter.ts`. Approval is only revoked on `receiveTokens` failure, not success. No app-level mitigation exists.

**Risk status:** PRESENT. Standing approval to treasury after successful purchase could be exploited if treasury contract is compromised.

---

### M-4: Missing Pod Management Check in PurchaseRouterDecentralized — CONFIRMED

**Contract:** `src/contracts/PurchaseRouterDecentralized.sol` (lines 224–274)
**Status:** [ ] Present

**Context audit result:** The app comment (`purchaseRouter.ts:151`) states "contract fixed - no buyer permission check" — this describes the **absence** of the check, not a fix. Anyone can route purchase funds to any pod treasury if they know the address. The treasury existence and address match checks are present, but pod management authorization is missing.

**Risk status:** PRESENT AND UNMITIGATED. Any caller can direct funds to any pod treasury.

---

### M-5: O(n) Linear Scan in AdvocateV2 / ProofOfCuriosityV2 — ACCEPTED

**Contracts:** `src/contracts/AdvocateV2.sol` (lines 151–156), `src/contracts/ProofOfCuriosityV2.sol` (lines 147–152)
**Status:** [x] Accepted risk

**Context audit result:** `tokenOfHolder` is only called by `revoke()` (admin-only). No frontend or API code calls it. The contract comment explicitly documents this as acceptable for one-per-address design. The iteration is bounded by total supply (one per address).

**Risk status:** ACCEPTABLE. Admin-only function, infrequent use, bounded by design constraint.

---

### M-6: Unvalidated Parent Hat in PodCreationManagerV2 — MITIGATED

**Contract:** `src/contracts/PodCreationManagerV2.sol` (lines 291–313)
**Status:** [x] Mitigated by app layer

**Context audit result:** The API route (`/api/pods/review`) resolves the correct parent hat from the database (`parentPod.management_hat_id`) and verifies the caller wears it on-chain before submitting the transaction. The contract doesn't independently validate the hat-to-pod relationship, but the API does.

**Risk status:** MITIGATED. App provides correct hat ID after server-side verification + on-chain balance check.

---

### M-7: TreasuryProxy Forwards Without Caller Validation — CONFIRMED

**Contract:** `src/contracts/TreasuryProxy.sol` (lines 141–214)
**Deployed:** `0x02110b4bBFA3BeeDbBd854b01683F9D9DB3aDeae`
**Status:** [ ] Present

**Context audit result:** TreasuryProxy forwards to treasury contracts that check `msg.sender == authorizedProxy`. Since the proxy IS the authorized proxy, the treasury's hat checks are bypassed — the treasury trusts the proxy without knowing who called the proxy.

Paymaster whitelisting provides some gating (only sponsored functions execute gaslessly), but non-sponsored EOA calls from anyone would pass through.

**Risk status:** PRESENT. Proxy delegates all authorization to the underlying treasury, which trusts the proxy unconditionally.

---

### M-8: setAuthorizedProxy Has No Multi-Sig in V2 Treasury — CONFIRMED

**Contract:** `src/contracts/PodTreasuryV2WithVoting.sol` (lines 397–400)
**Status:** [ ] Present

**Context audit result:** The `fix-proxy/page.tsx` admin page directly calls `setAuthorizedProxy()` on hardcoded treasury addresses with no multi-sig. `setupProxyAllowance.ts` also provides a direct call path. Any single hat-wearing manager can change the proxy.

**Risk status:** PRESENT. Single manager can redirect treasury operations through a malicious proxy. V3 treasury routes proxy changes through the proposal system.

---

### M-9: Unvalidated Pod Registration in BountyManagerV4 — CONFIRMED

**Contract:** `src/contracts/BountyManagerV4.sol` (lines 210–223)
**Status:** [ ] Present

**Context audit result:** `createBounty()` auto-registers pod metadata (leaderHatId, treasuryAddress) without verifying the hat-to-pod relationship. The app's `RegisterPodButton.tsx` provides a proper registration flow via `PodBountyService.registerPod()`, but `createBounty()` bypasses it entirely for unregistered pods.

**Risk status:** PRESENT. Caller can register arbitrary hat IDs and treasury addresses for unregistered pods.

---

### M-10: Max Approval to BountyManager in Treasury Constructors — CONFIRMED

**Contracts:** `src/contracts/PodTreasuryV2WithVoting.sol` (lines 162–164), `src/contracts/PodTreasuryV3.sol` (lines 160, 442)
**Status:** [ ] Present

**Context audit result:** Both V2 and V3 grant `type(uint256).max` approval to the same BountyManager address (`0x7b3d...aC8`). V3 also grants max approval when adding new supported tokens (`_executeAddTokenProposal`, line 442). If BountyManagerV4 has any vulnerability, it could drain all supported tokens from every treasury.

**Risk status:** PRESENT. BountyManagerV4's immutable admin (H-6) and unlimited approval create a single-point-of-failure chain.

---

### M-11: PodAuthorizationFactory V3 `actualUser` Spoofing (Reclassified from C-1)

See detailed analysis in the C-1 reclassification section above.

---

## LOW SEVERITY FINDINGS

### L-1: Missing Zero-Address Checks
**Contracts:** Multiple constructors. **Status:** [ ] Low priority

### L-2: Event Emission Inconsistency
**Contracts:** Multiple. **Status:** [ ] Low priority

### L-3: Refund Condition Logic in EventEscrow
**Contract:** `src/contracts/EventEscrow.sol` (line 231). **Status:** [ ] Low priority — contract unused

### L-4: Unverified Signature Parameter in PodGovernance V1
**Contract:** `src/contracts/PodGovernance.sol`. **Status:** [ ] Low priority — V1 superseded by V3

### L-5: No Reentrancy Guard on PurchaseBurn
**Contract:** `src/contracts/PurchaseBurn.sol`. **Status:** [ ] Low priority

### L-6: Placeholder Treasury Deployment in SimplePodRegistry
**Contract:** `src/contracts/SimplePodRegistry.sol`. **Status:** [ ] Low priority

### L-7: Potential Underflow in PodCreationManagerV2
**Contract:** `src/contracts/PodCreationManagerV2.sol` (line 280). **Status:** [ ] Low priority

### L-8: Thin Wrapper on DAOTimelock
**Contract:** `src/contracts/DAOTimelock.sol`. **Status:** [x] Informational — no action needed

---

## INFORMATIONAL FINDINGS

### I-1: Duplicate Role Management in PodBountyService
### I-2: Gas Optimization Opportunities
### I-3: Inconsistent Solidity Pragma (^0.8.19 vs ^0.8.20)
### I-4: Raw transferFrom in TokenFaucet.fundFaucet
### I-5: Hardcoded HATS_PROTOCOL Address in PodAuthProxy

---

## Remediation Priority Order (Updated with Context)

### Phase 1 — Before Community Onboarding

| # | Finding | Context Status | Action |
|---|---------|---------------|--------|
| 1 | ~~APP-1~~ | **FIXED** | JWT verification implemented in podAuthMiddleware |
| 2 | H-1 | Dormant (proxy path unused) | Decide: fix contract or formally deprecate proxy path |
| 3 | H-4 | Active but TODO functions unused | Add access control before wiring up aggregateVotes/finalizeProposal |
| 4 | M-11 | Mitigated by 3 app layers | Document as known ERC-4337 trade-off |
| 5 | H-5 | **Confirmed active bypass** | Inventory V2 pods with funds; consider V3 migration |

### Phase 2 — Near-Term Hardening

| # | Finding | Context Status | Action |
|---|---------|---------------|--------|
| 6 | H-2/H-3 | Active, no caps | Align with roadmap #7; check on-chain role holders |
| 7 | H-6 | Active, admin unknown | Check admin address on-chain; plan if EOA |
| 8 | M-10 | Active, max approval | Review BountyManagerV4 security (H-6 + M-10 compound risk) |
| 9 | M-7/M-8 | Active, proxy trusts unconditionally | Audit proxy authorization chain |
| 10 | M-9 | Active, bypasses registration | Validate pod metadata in createBounty |

### Phase 3 — Ongoing / Accepted

| # | Finding | Context Status | Action |
|---|---------|---------------|--------|
| 11 | M-2 | **Mitigated by app** | No action needed unless contract is called directly |
| 12 | M-3 | Present | Fix approval handling in PurchaseRouter(s) |
| 13 | M-4 | Present | Add pod management check or document as intentional |
| 14 | M-5 | **Accepted** | No action — one-per-address design, admin-only |
| 15 | M-6 | **Mitigated by app** | No action needed unless API is bypassed |
| 16 | M-1 | **Inaccessible** | Fix if event system is revived |
| 17 | L-1–L-8 | Low priority | Address opportunistically |

---

## Context Audit Summary

Each finding was searched against the entire codebase to determine:
1. Whether the contract is deployed and actively used
2. How the vulnerable function is called from frontend/backend
3. Whether app-level controls mitigate the on-chain issue
4. Whether the contract has been superseded

| Finding | Deployed | App Calls It | App Mitigates | Verdict |
|---------|----------|-------------|---------------|---------|
| M-11 | Yes | Yes | Yes (3 layers) | Downgraded C→M |
| H-1 | Yes | No (proxy path dormant) | N/A | Dormant risk |
| H-2 | Yes | Yes (via PodSELFDistributor) | No caps | Operational question |
| H-3 | Yes | Yes (frontend mint) | 2-of-3 approval (app-only) | Operational question |
| H-4 | Yes | Partially (recordVote only) | N/A (TODO functions) | Fix before wiring |
| H-5 | Yes | Yes (direct bypass active) | No | Confirmed |
| H-6 | Yes | Admin functions not called | N/A | Check admin on-chain |
| M-1 | Yes | No | N/A | Inaccessible |
| M-2 | Yes | Yes | Yes (hardcoded hat) | Mitigated |
| M-3 | Yes | Yes | No | Present |
| M-4 | Yes | Yes | No | Present |
| M-5 | Yes | No (admin only) | Yes (design) | Accepted |
| M-6 | Yes | Yes | Yes (API validates) | Mitigated |
| M-7 | Yes | Yes | No | Present |
| M-8 | Yes | Yes (fix-proxy page) | No | Present |
| M-9 | Yes | Yes (createBounty) | No | Present |
| M-10 | Yes | Constructor-only | No | Present |

---

## Key Deployed Addresses (Reference)

| Contract | Address |
|----------|---------|
| SelfToken | `0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21` |
| SystemToken | `0x1317Ae277266D38C4E492558f8693F14143a6A65` |
| PodSELFDistributor | `0x8a80eC4e958d73B8A19dFBa594882c598f14036c` |
| PodGovernanceV3 | `0xD19143da8c319484d4c093A709DC93624345b690` |
| BountyManagerV4 | `0x7b3d752748feA88C65dE57Ae6FC32Fc22a457aC8` |
| TreasuryProxy | `0x02110b4bBFA3BeeDbBd854b01683F9D9DB3aDeae` |
| PodTreasuryFactoryV3 | `0x6CeD549C1f08690e435007E661552f4F76229a9B` |
| PodTreasuryFactory (V2) | `0x3d68d59Dc78C45022bA37276FD1b03354F72B3b1` |
| PodAuthorizationFactory | `0x52122e732700568760e475FA8289a13A4568d886` |
| Hats Protocol | `0x3bc1A0Ad72417f2d411118085256fC53CBdDd137` |

---

## Revision Log

| Date | Change |
|------|--------|
| 2026-05-26 | Initial audit completed. 30 findings across 28 contracts. |
| 2026-05-26 | C-1 reclassified to M-11 after comparing to actual app operations. APP-1 added. |
| 2026-05-26 | Full context audit completed for all findings. APP-1 fixed (JWT verification). |
| 2026-05-26 | Severity adjustments: M-2 mitigated, M-5 accepted, M-6 mitigated, M-1 inaccessible. |

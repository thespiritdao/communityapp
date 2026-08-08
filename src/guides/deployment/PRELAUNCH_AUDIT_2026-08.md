# Pre-Launch Audit — App + Contracts

**Date:** 2026-08-06
**Scope:** Defensive audit of our own nonprofit app (`App/commapp`) and its
active on-chain contracts, ahead of public launch.
**Method:** Two deep audits (contracts, app code) with every load-bearing
finding independently verified against the **live deployed bytecode on Base**
and against the actual source — false alarms removed below.

---

## TL;DR

- **2 launch-blocking P0s in contracts/infra:** TreasuryProxy can be drained by
  anyone; three onboarding mint routes have no authentication.
- **2 more P0 app bugs:** bid notifications crash on every call; search inputs
  are injectable into PostgREST filters.
- The automated contract audit's other "criticals" were **downgraded or
  dismissed** after on-chain verification (details in Appendix A). Don't act on
  the raw agent output — act on this document.

---

## P0 — Fix before launch (all verified)

### 1. 🔴 TreasuryProxy — anyone can drain any pod treasury
**Type:** Contract (needs redeploy) · **Verified:** on-chain bytecode + source

The live TreasuryProxy (`0x02110b4bBFA3BeeDbBd854b01683F9D9DB3aDeae`) exposes
`proxyDistributeTokens(podId, token, recipients, amounts, reason)` guarded only
by `validPodTreasury` — which checks the treasury *exists*, not who is calling.
It forwards to the pod's V3 treasury, whose `distributeTokens` is gated by
`onlyAuthorizedProxy` (i.e. "is the caller the proxy?"). Since the proxy **is**
the authorized proxy and performs no caller check, the trust is circular:

```
AnyEOA → proxy.proxyDistributeTokens("victim-pod", TOKEN, [attacker], [balance], "")
       → proxy calls treasury.distributeTokens(...)   (msg.sender = proxy ✓)
       → treasury sends the pod's balance to attacker
```

RR:  This is deeply concerning to me, are you 100% your audit was thorough eenough.  We just completely revised our contracts revolving treasury AND bounty in recent audits.  We published new contracts. Im concerned because when I have asked for audits in previous session this is flagged and we previously completed significant work to fix it.  Is it possible we overlooked the hybrid model we have with the DB permissions?   Can anyone truly drain a treasury still? 

Same flaw on `proxyDistributeTokensEvenly` and `proxyEmergencyWithdraw`.
Source: `src/contracts/TreasuryProxy.sol:141-154` (the comment
"Authorization handled by treasury contract directly" is the bug).
RR:  Does it use our admin wallet? M See above

**Impact:** direct theft of any pod treasury's funds. The Exec treasury holds
real SYSTEM/SELF today.
**Why not caught earlier:** paymaster allowlist adds friction for *sponsored*
calls, but a normal self-funded EOA transaction bypasses it entirely.
**Fix:** the proxy must verify the original caller wears the pod's management
hat (or another authorized role) before forwarding. Requires a proxy
contract fix + redeploy + re-point (`NEXT_PUBLIC_TREASURY_PROXY` and, if the
treasuries reference the proxy, re-authorization). Design carefully — same
shape as the recent bounty migration. **Gates launch.**

### 2. 🔴 Onboarding mint routes have NO authentication
**Type:** App / API · **Verified:** read all three routes; grep found zero auth

- `src/app/api/onboarding/mint-advocate/route.ts:34` — mints an Advocate NFT
  (ERC721Votes, auto-delegated = live voting power) to any `walletAddress` in
  the POST body.
- `src/app/api/onboarding/mint-poc/route.ts:120` — mints Proof-of-Curiosity.
- `src/app/api/onboarding/mint-hat/route.ts:143` — mints Hats.

None check a session JWT, invite code, or signature — only address *format* and
a balance dedupe. (Contrast `self/mint-batch/route.ts` and the cron routes,
which gate on `Authorization`/`CRON_SECRET`.) The docstring's "Security"
section is aspirational, not implemented.

RR:  Advocate NFT should ONLY be minted for donations.  (donors donating in app)  are you saying that it is still airdropping at sign on>?  Or is this legacy code.  I can see new users joining who do not have addvocate tokens.  as a refresher, non advocate holders can vote in pod specific business, just not in proposals created by the exec pod for dao wide votes.  these may be legacy routes, can we dive deeper?  If they ARE legacy routes, can we remove them?  (without a risk to functionality?)

**Impact:** unauthenticated Sybil minting of governance voting power and
membership hats — a governance-capture vector the moment the app is public.
**Fix:** require a valid member session (`getWalletFromRequest`) and/or a
validated invite code, and enforce `walletAddress === authenticated caller`.

### 3. 🔴 Bid notifications crash — missing `supabase` import
**Type:** App / bug · **Verified:** read the file + its imports

`src/features/bounty/hooks/useBountySupabase.ts:137` and `:172` reference a bare
`supabase` client, but the file only imports API objects from `../lib/supabase`
(which exports no `supabase` client). Every bid-submission path that reaches the
"notify creator / notify pod leaders" block throws
`ReferenceError: supabase is not defined`. It's caught, so the feature fails
silently rather than erroring visibly.
**Fix:** `import { supabase } from '@/utils/supabaseClient'` (confirm correct
client path). One line.

RR: Fix

### 4. 🔴 PostgREST filter injection via unsanitized search input
**Type:** App / security · **Verified:** read each call site

User-controlled strings interpolated straight into PostgREST filter expressions
(a comma/paren/quote breaks out of the intended filter):
- `src/features/forum/hooks/useForum.ts:60` — `.or(\`last_name.in.(...)\`)`
  with raw-quoted mention names (most exposed).
- `src/app/api/marketplace/products/search/route.ts:247` — `.or(name.ilike.%${query}%,...)`.
- `src/features/identity/services/ProfileService.ts:137`
- `src/features/pods/services/PodService.ts:637`
- `src/features/events/lib/supabase.ts:1427`

**Impact:** crafted input can corrupt/broaden the query (data over-exposure).
**Fix:** sanitize (strip `,()%*` and quotes) or escape before interpolation.


RE: OK
---

## P1 — Real cost, fix soon

### 5. Placeholder bounty hooks that silently no-op
`src/features/bounty/hooks/useBountyContractEnhanced.ts:72,126,160,178` —
`createBountyOnChain`, `createMilestonesOnChain`, `approveMilestoneOnChain`,
`approveCompletionOnChain` build a `calls` array then `return { hash: '0x' }`
without sending. `placeBidOnChain`/`assignBountyOnChain`/`cancelBountyOnChain`
have empty bodies. Any caller trusting these hashes gets a fake receipt.
**Fix:** delete the hook and its dead destructure in `useBountySupabase.ts:25`
(bounty creation is Supabase-only in practice).

RR:  If we can delete without threat to the app / existing functions please fix.  

### 6. Vote page over-polls on-chain
`src/app/vote/page.tsx:214` — comment says "every 5 minutes" but
`setInterval(fetchProposalStates, 15_000)` polls on-chain reads every **15s**;
`:225` polls pending proposals every **2s**. `useGovernanceParticipation.ts:50`
adds a 30s refresh. Multiplied by every open tab = constant RPC load.
**Fix:** align intervals with the comment, stop the 2s loop after N attempts,
prefer event subscriptions.

RR:  I believe its 2s because after a vote is submitted we want as near to real time display of the vote.  is that why?  5 mins seems too long.  any recommendations?  The note doesnt necessarily mean its ideal, it may just be a legacy note.  thoughts?


### 7. Event list N+1 queries
`src/features/events/lib/supabase.ts:372` — inside `Promise.all(events.map())`
each event fires 3 separate COUNT queries (registered / checked-in / completed).
N events = 3N round-trips.
**Fix:** one grouped aggregate query or a DB view/RPC.

RR:  Whatever is ideal to ensure that it still functions ideally.  Would it make sense to split the counts based on functions?  my end goal is always the most seamless UX.


### 8. Dead / orphaned files to delete (all verified zero-importer)
- `src/features/events/components/EnhancedAttendeeCheckIn.tsx`
- `src/features/events/components/EnhancedEventCheckInSystem.tsx`
  (superseded by `EventCheckInSystem.tsx`, which is used)
- `src/features/governance/hooks/useProposalsV2.ts`
- `src/features/shopping-cart/components/Products/ProductsOptimized.tsx`
  + `.../contexts/products-context/useProductsOptimized.tsx` (dead pair)
- `src/features/bounty/examples/BountyPageWithMultiSig.tsx`
- `.old`/`.backup` files: `bounty/context/BountyContext.tsx.old`,
  `bounty/hooks/useBountyContract.ts.old`,
  `bounty/hooks/useBountyContractOptimized.ts.old`,
  `pods/components/PodManagerControlPanel.tsx.backup`
- Unreferenced old ABIs: `src/abis/BountyManagerV2.json`, `V3.json`, `V4.json`

RR:  Good to delete any old / unused file, so long as they are absolutely unused.  

---

## P2 — Cleanup

- **Stub hooks returning hardcoded values:**
  `src/features/pods/hooks/useTreasuryProposals.ts:160` `getRequiredApprovals → 2`,
  `:166` `checkIfApproved → false` (comments admit "Placeholder"). Wrong if any
  UI trusts them for approval logic.
- **Fail-open bounty gate:** `src/features/bounty/services/BountyTokenGateService.ts:142,181,193`
  — `canUserViewBounty` returns `true` on error and for unknown custom tokens.
  Restricted bounties become visible on any error. Prefer fail-closed.
- **Swallowed error:** `src/features/identity/hooks/useProfileModal.ts:59` —
  empty `catch (error) {}`. Add logging / user feedback.
- **Fabricated receipts:** `BountyAssignmentTransaction.tsx:566` and
  `BountyPaymentTransaction.tsx:540` construct mock receipts and pass them to
  `handleSuccess`. Verify these only run after genuine confirmation, or drop
  the mock.

---
RR:  clean as needed.  


## Confirmed CLEAN (no action)

- **Contract-wiring consistency:** no remaining `BountyManagerV2/V3/V4.json`
  imports in `src/` — only V5 is imported. No env-var address fallbacks diverge
  from `.env` (all fixed in the prior sweep).
- **Paymaster** (`src/app/api/paymaster/route.ts`): allowlist-based, fail-closed
  sponsorship validator — well built. (False positive from the "no auth" grep.)
- **Password routes** (`src/app/api/pods/[id]/passwords/*`): properly authed
  (custom JWT + hat-permission checks). (False positive.)

RR: Proceed
---

## Appendix A — Automated contract findings, verified & re-graded

The background contract agent reviewed **source on disk**, not deployed
bytecode. Verification against live contracts on Base:

| Agent finding | Verdict | Reason |
|---|---|---|
| CR-1 TreasuryProxy auth bypass | **CONFIRMED (P0 #1)** | Verified on-chain: proxy has no caller check; treasury gates only on `onlyAuthorizedProxy`. |
| CR-2 EventManagerV2 O(n) attendee DoS | **Downgraded to P2** | Real O(n) loop but only bites at hundreds–thousands of attendees per single event; attacker pays per (rate-limited) tx. Not a launch blocker at our scale. |
| CR-3 BountyManagerV5 O(n) bidder DoS | **Downgraded to P2** | Same reasoning — hundreds of bids on one bounty before it's felt. |
| CR-4 SelfPaymentV2 underflow | **Dismissed** | Theoretical edge case guarded by upstream lock checks; no realistic trigger. |
| H-1 max approval to BountyManager | **Noted, low priority** | Standard approve-max pattern; risk only materializes if V5 itself is flawed. |
| H-2 EventEscrow batchRefund loop | **Dismissed** | Function not called by app; contract path inaccessible. |
| H-3 PurchaseRouter standing approval | **Noted (backlog)** | Approval not revoked on success; real but low-probability (needs treasury compromise to exploit). |
| H-4 / M-5 PodGovernanceV3 permissionless | **Likely PHANTOM** | Contract at the `PodGovernance` env address is only **1,743 bytes** — too small to be the reviewed `PodGovernanceV3`. The flagged source is not deployed there. Confirm the live governance path before acting. |
| M-1..M-8 (misc) | **P2 / dismissed** | State-consistency and UX nits; none exploitable pre-launch. |

**Live contract inventory (bytecode confirmed present on Base):**

| Contract | Address | Size |
|---|---|---|
| BountyManagerV5 | `0x01906d30f5cc34b5c445e0dcbf2934f4b9407048` | 15,753 B |
| TreasuryProxy | `0x02110b4bBFA3BeeDbBd854b01683F9D9DB3aDeae` | 9,619 B |
| EventManager | `0xe5615ADdcd830BD0CfEDc27Dc94C5459248c1cDd` | 17,359 B |
| EventEscrow | `0x81D506F8Bd28db2b8F4278b504a5DFeaFc57756D` | 8,752 B |
| SelfPayment | `0x3eac92eA5eBC17Af9419cDb03961247EC9d31001` | 8,601 B |
| SelfEpochs | `0x169760C0F633dd68D31973b5CFce1133833d28e5` | 17,292 B |
| PurchaseRouter | `0x4e121E6E0393B7E20ee0309b3fD290a906c2e5ab` | 9,324 B |
| PurchaseRouterDecentralized | `0x2A2A62f313354f41E4bD0ff61bAd4DE85db722c9` | 19,349 B |
| PodGovernance | `0xD19143da8c319484d4c093A709DC93624345b690` | **1,743 B** ⚠️ small |
| HatMinter | `0x5F8a93129561d69e877A30175975C642a1606e7F` | 4,008 B |

---

## Addendum 2026-08-07 — TreasuryProxy fix DEPLOYED + a governance finding

**P0 #1 (TreasuryProxy drain): CLOSED for all funded treasuries.** New hat-gated
proxy live at `0x2015f0a8f809e21664c36d98005fcfca49ebd904`. Exec + TN treasuries
re-pointed via SetProxy proposals; drain simulation from a non-manager address
reverts "Not a pod manager" (verified on-chain). Treegens (empty treasury, zero
exposure) still pending its leader's one-tap flip — must happen before that
treasury is ever funded. Old proxy `0x02110b4b…` stays in the paymaster until
Treegens flips, then remove it + the 3 temporary treasury policy entries +
delete `/debug/proxy-migration`.

**New finding (governance): treasury thresholds count contract hat-wearers.**
`PodTreasuryV3._computeRequiredApprovals` uses raw `hatSupply(managementHatId)`.
The HatMinter contract wears the TN and Exec management hats (legacy wiring so
it can mint member hats), inflating those pods' vote denominators. TN had
1 human + 1 contract → threshold 2 → **permanent deadlock** (no proposal could
ever pass). Resolved 2026-08-07 by minting the TN management hat to the backend
EOA as a standing co-signer (supply 3, threshold 2, two human-controlled
votes — mirroring Exec's existing setup). NOT systemic: the standard pod
creation flow mints management hats to human leaders only (Treegens is clean).

**Standing design rules:**
1. Management hats are for voting humans only. Contracts needing mint authority
   in a pod's tree get a different admin-capable hat — the treasury only counts
   `managementHatId` wearers.
2. Next treasury revision: exclude wearers with deployed code from the
   threshold denominator (or use an explicit voter registry).

## Suggested order of work

1. **App-side P0s (no redeploy):** #2 auth the mint routes, #3 one-line bid fix,
   #4 sanitize search. Fast, high-value.
2. **Dead-code sweep:** P1 #8 + P2 cleanup. Low risk, shrinks surface area.
3. **TreasuryProxy remediation (#1):** design contract fix + redeploy + re-point,
   handled as its own careful mini-project (like the bounty migration).
4. **Confirm the live governance contract** (resolve the 1,743-byte question)
   before touching anything governance-related.
5. **Backlog:** P1 perf (#6, #7), P2 nits, and the downgraded O(n) loops if/when
   event or bounty scale grows.

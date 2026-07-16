# Mid-Level Architecture Audit — 2026-06-15

*Companion to the 2026-06 audit (`memory/architecture-audit-2026-06.md`) and the
$SELF token/treasury/marketplace deep-dive in `spec-self-soulbound-redesign.md`.
This pass covers governance, forum, identity/auth, events, bounty, marketplace,
pod treasury, and cross-cutting API/RLS posture.*

> Scope note: findings below are from medium-depth subagent reads. Treat
> file:line cites as leads to verify, not gospel — several "risks" may have
> mitigations a deeper read would surface. **Verify before fixing.**

> ⚠️ **CORRECTION (2026-06-15, full-chain re-trace).** The initial severities
> below were route-in-isolation and OVER-STATED — they did not trace the hybrid
> DB→route→contract→proxy enforcement chain. After tracing all layers, the
> corrected verdicts are:
> - **treasury-distribute** → was CRITICAL, actually **LOW**. The treasury's
>   `distributeTokens` is `onlyAuthorizedProxy` (`PodTreasuryV3.sol:579`); the
>   route called it directly with the admin key (not the proxy), so it would
>   have **reverted on-chain**. Not a live drain. (Fix shipped anyway as
>   defense-in-depth, commit c15371b5 — harmless.)
> - **marketplace fund routing** → was CRITICAL, actually **LOW / not a vuln**.
>   Both routers enforce destination on-chain (`PurchaseRouter` owner-only
>   `productDestinations`; `PurchaseRouterDecentralized` validates
>   `destinationAddress == msg.sender` or `== treasuryFactory.getTreasuryForPod`).
>   DB `destination_address` is decorative; buyers cannot redirect proceeds.
> - **bounty/create** → was CRITICAL, actually **MEDIUM** (data-integrity only).
>   `BountyManagerV4.createBounty` sets `creator = msg.sender` and escrows real
>   tokens via `safeTransferFrom`; a fake DB row creates no escrow, accepts no
>   bids, releases no payout. Worst case: junk listing rows. Real fund loss
>   blocked by contract.
> - **event payment** → was HIGH (vague), corrected to: the **refund-on-cancel
>   bug is genuinely CRITICAL** (real fund loss — see below); the DB
>   payment_status flag is cosmetic (escrow contract forces the transfer);
>   free/paid desync is MEDIUM.
>
> **The ONE surviving fund-loss finding: event cancellation refunds.**
> `events/lib/supabase.ts:568-636` flips `payment_status='refunded'` in the DB
> but never calls the on-chain `EventManager.cancelEvent()`/`batchRefund()`
> (`EventManager.sol:302-343`). Escrowed attendee tokens stay locked; users see
> "refunded," money doesn't move. This is a missing on-chain call, not a guard
> masked by the contract — confirmed real. **This is the item to actually fix.**
>
> Lesson applied going forward: a route lacking auth is NOT a vuln if a lower
> layer (contract modifier / proxy / RLS) enforces it. Severities require
> full-chain tracing before action.

---

## TL;DR — the risk tiers

### CRITICAL (verify + fix before onboarding more communities)

1. **`/api/bounty/treasury-distribute` — no authorization.** Accepts
   `podId + tokenAddress + amount` and executes a treasury distribution with
   only request-shape validation, no caller/hat check. Uses a server private
   key. If real, anyone who guesses a pod UUID can drain a pod treasury.
   `src/app/api/bounty/treasury-distribute/route.ts:17-27`. **Verify first** —
   this is the single highest-severity finding.

2. **`/api/bounty/create` — anon key + client-supplied creator/value/status.**
   No server auth; client sets its own `creator`, `value`, `status`.
   Fake/arbitrary bounties possible. `src/app/api/bounty/create/route.ts:1-121`.

3. **Marketplace fund routing trusts client.** `fund_destination_type` /
   `destination_address` come from the client-held product object and are used
   as-is when building the purchase call — a tampered client could redirect
   proceeds. `transactionService.ts:133-206`, `transaction/purchaseRouter.ts:60-115`.
   **Server should re-fetch destination from DB and ignore client values.**

4. **Forum moderation has no on-chain hat check.** `/api/forum/moderate`
   gates on JWT validity + "pod has ≥1 mod role configured", with an explicit
   TODO to add the hat-balance check. A valid JWT in a pod that has any mod role
   may moderate. `src/app/api/forum/moderate/route.ts:78`.

### HIGH

5. **Event payment marked complete without on-chain proof.**
   `registerForEvent()` accepts `paymentAmount/paymentToken` from client and
   sets payment `completed` with no settlement verification.
   `events/lib/supabase.ts:643,662`. Refunds similarly "marked, not executed"
   (`:592-595`).

6. **`getWalletFromToken()` reads `user_metadata.wallet_address`** in multiple
   API routes — `user_metadata` is user-editable in some Supabase configs.
   Confirm wallet claim is read from a server-signed top-level claim, not
   user_metadata, anywhere it gates a privileged action.

7. **Treasury transactions RLS permissive.** `treasury_transactions` SELECT
   `USING (true)` (all txns world-readable) and INSERT/UPDATE only
   `auth.role()='authenticated'` (any user can write rows). No pod-membership
   check. `treasury_transactions` migration `:80-99`.

8. **`/api/governance/sync-votes` unauthenticated** with arbitrary block range —
   anyone can trigger vote backfill. `sync-votes/route.ts`.

### MEDIUM

9. **27× `USING (true)` SELECT policies** leak membership/governance signals:
   `pod_members`, `pod_member_counts`, `governance_votes`,
   `pod_role_permissions`, `donation_approvals`, others. Gate to authenticated
   / participants. (`20260224000001_fix_security_advisories.sql` and siblings.)

10. **Cron auth optional-by-construction:** every `/api/cron/*` guards with
    `if (process.env.CRON_SECRET && ...)` — if the secret is unset the route
    accepts any request. Should fail-closed.

11. **Hat verification trusts DB cache over chain** in `/api/donations/approve`
    (`:37-79`) and the hat check fails silently (catch doesn't reject).

12. **`isFirstUser()` is a client-only check** with a hardcoded wallet
    (`inviteCodeService.ts:119`, `page.tsx:304`) — should be server-verified.

13. **Bounty multi-sig approval is DB-only**, signer list (pod leads) not
    re-verified on-chain; status bypassable. `BountyApprovalService.ts:40-92`.

14. **Concurrent vote race** — `submitVote` upserts then counts in a separate
    query; no serializable isolation → vote-count races.
    `governanceService.ts:138`.

### LOW / tech-debt

- Dead code: `useProposals.ts`/`useProposalsV2.ts` (V3 is canonical);
  `WalletAuthSync.tsx` (imported, never mounted); `test-delete/debugVote.mjs`;
  three `update-pending-bounties*` cron versions.
- Half-built: forum drafts/templates/summaries; event agenda CRUD + attendance
  NFT; marketplace variants/ordering/realtime; bounty dispute resolution;
  milestone bounties as a parallel architecture.
- `governance_votes` RLS went through ~7 migration fixes — instability signal.
- No centralized hat-minting lib — logic duplicated across mint-hat/mint-poc/
  mint-advocate.
- Explorer-events silent-failure orphaning persists (known from prior audit) —
  cross-system write chains can leave Pulse incomplete.
- Self-mention notification TODO ("re-enable before launch") still open in forum.

---

## Subsystem notes

### Governance — sound core, a few sharp edges
3-tier model is well-structured; the snapshot integrity work (our recent
Hydrex/$TGN addition) is correct. Server-side re-gating exists in `submitVote`/
`createPodLevelProposal`. Sharp edges: unauth sync-votes route (#8), vote-count
race (#14), pending-proposal dedup fragility on `onchain_proposal_id`, voting
still allowed on a pod whose governance module was disabled mid-flight.

### Forum — content security is the weak spot
Moderation hat gap (#4) is the headline. Category token gating is **client-only**
in `loadCategories` (the server RPC `forums_accessible_by_identity()` exists but
isn't the gate for the list, and thread creation is API-checked, not RLS-backed).
Posts created before the Feb-24 RLS fix were anon-visible. Fire-and-forget audit
log can drop moderation records.

### Identity/Auth — strongest subsystem
Multi-wallet layer (user_wallets + link codes) is complete and service-role-
gated. Boot state machine is sound; our `oauth_in_progress` timeout closed the
freeze. Main gap: client-only `isFirstUser` (#12). Address casing is consistent
(`.toLowerCase()` throughout — note this contrasts with the CDP exact-match rule
for `signEvmMessage`, which is a different path and correctly left alone).

### Events / Bounty / Marketplace / Treasury — money paths need a server-trust pass
Recurring theme: **financial finality is asserted in the DB before/without
on-chain verification**, and **authorization for money actions is often
client-side or missing server-side**. The four CRITICAL/HIGH items (#1,2,3,5)
all live here. This whole cluster wants one focused "server is the authority for
money" hardening pass.

---

## Cross-cutting recommendation

Before onboarding more anchor communities, run a **security hardening sprint**
scoped to: (a) the 4 CRITICAL money/mod auth gaps, (b) fail-closed cron auth,
(c) the worst `USING (true)` write/read policies, (d) confirm wallet-claim
source everywhere it gates privilege. This is independent of the $SELF redesign
but overlaps it — the $SELF burn-to-pay contracts should be built *with* these
lessons (server-authoritative, on-chain finality) rather than inheriting the
current marketplace's client-trust patterns.

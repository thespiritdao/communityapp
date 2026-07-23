# Security Sweep — 2026-07-22 (follow-on to BM-001)

Multi-agent triage of known deferred-security notes + broad sweep for the BM-001 pattern
("UI/API-only security" — a check enforced only client-side or trusting a spoofable
request field, bypassable at the real trust boundary). Every High/Critical adversarially verified.

## Headline

The sweep found **2 genuinely reachable, confirmed findings — both the API-layer version of BM-001**:
a route trusts a wallet address from the request *body* instead of binding it to the verified
JWT caller. Neither allows fund theft (on-chain signing/hat gates still hold), but both let an
**unauthenticated** attacker forge state on a financial-governance control and spam privileged reviewers.
Everything else was refuted, downgraded, or is a dead-code note to retire.

---

## Confirmed — worth fixing (the BM-001 shape, at the API layer)

### FM-005 [High] — `donations/approve` trusts body `executiveWallet`, not the JWT caller
**File:** `src/app/api/donations/approve/route.ts:117-149`. **Verdict: CONFIRMED High.**
The route reads `executiveWallet` from the POST body and verifies *that address* holds the Executive
hat on-chain — but never checks the HTTP caller's JWT matches it. Service-role client bypasses RLS.
**Bypass:** an unauthenticated attacker who knows any real executive's public wallet POSTs
`{donationId, executiveWallet: '0xRealExec'}`. The route writes a genuine approval row attributed to
that exec and (REQUIRED_APPROVALS=1) advances the donation to `pending_mint`.
**Not fund theft:** minting still requires a userOp signed by the exec's own smart wallet, and tokens
mint to the donor. Impact = broken-access-control + forged audit trail + defeating the human approval gate.
**Fix:** derive the wallet from the verified JWT (`getWalletFromRequest` in `src/lib/serverPodAuth.ts`,
purpose-built for this) and require it to equal `executiveWallet` (or drop the body field and use the
JWT wallet), then run the hat check on the bound wallet.

### FM-006 [Medium] — `claims/confirm` trusts body `walletAddress`, no JWT, no on-chain burn check
**File:** `src/app/api/claims/confirm/route.ts:70-88` (verified against live code). **Verdict: CONFIRMED Medium.**
Takes `walletAddress` from the body and "verifies" the claim by matching that same body-supplied wallet
(circular). No JWT, service-role client, and `burnTxHash` is written verbatim with **zero on-chain
verification** (line 108). The sibling `GET /api/claims/request?wallet=` (also unauthenticated) lets an
attacker enumerate a victim's live `pending_burn` `payoutRef`.
**Bypass:** attacker POSTs `{payoutRef, walletAddress: '0xVictim', burnTxHash: '0xfake'}` → claim flips to
`awaiting_executive_approval`, forged burn recorded, high-priority alert fired to the whole Exec Pod.
**Not fund theft:** the actual payout gate (`/api/claims/action`) does an on-chain Hats check + off-chain
human step. Impact = ledger corruption + reviewer spam.
**Fix:** JWT-bind the caller to `walletAddress` on both `confirm` and the GET listing; validate `burnTxHash`
on-chain (receipt + burn event with matching payoutRef) before transitioning status.

---

## Other real (lower) findings — worth doing, not urgent

- **SC-005 [Medium] — CRON_SECRET fails OPEN if unset.** Some cron routes guard with
  `if (process.env.CRON_SECRET && authHeader !== ...)` — if the env var is missing, the check is skipped
  entirely. Fix: a shared helper that fails CLOSED (`if (!secret || authHeader !== \`Bearer ${secret}\`) 401`).
  (This is the residual of the earlier ops-hygiene item — worth finishing now with a shared util.)
- **SC-007 [Medium] — V5 `registerPodMetadataFor` trusts admin-supplied treasury.** Our own new admin
  bypass lets the admin register any treasury address for a pod; a compromised/coerced admin could point a
  pod at a treasury it controls. Mitigated by: admin-only + createBounty still requires the leader hat, and
  the wrong-treasury only drains a treasury the admin already influences. Acceptable for a migration helper,
  but worth a follow-up: validate the treasury against the pod registry, or remove the bypass once migration
  is done. **Note: this is a self-inflicted item from today's fix — low real risk, flagged for honesty.**
- **SC-004 [Medium] — paymaster executeBatch target validation.** The per-contract whitelist is generally
  sound (denies on undecodable/empty targets), but `.filter(isAddress)` could theoretically drop a target
  from validation. Low practical reachability; harden the decoder to fail-closed on partial decode.
- **ROLE-003 [Medium] — `pod_role_permissions` RLS leans on the app-controlled `pod_members` table.**
  Defense-in-depth concern; the real gates are on-chain for funds. Worth reviewing the RLS chain.

---

## Triage of the known deferred-security notes — all RETIRE/ACCEPT (no live risk)

- **DN-001 / FM-007 / SC-003 — `PodSELFDistributor` tx.origin:** RETIRE. Not spoofable (tx.origin is the
  signer), owner-gated proxy, zero app callsites, not on the paymaster whitelist, superseded by
  `SelfMinter.mintBatch`. Only residual is a classic phishing anti-pattern against a hat-holder for a
  soulbound (non-transferable, no-market-value) token. Delete or formally deprecate the contract.
- **DN-002 — `PodTreasuryV2` multisig TODO:** RETIRE. V2 is legacy; app uses V3. No live pod uses it.
- **DN-003 / SC-002 — `EligibilityModule` "return true" stubs:** RETIRE. Dead code — the live module is
  `MultiCriteriaEligibilityModule`; staking eligibility is evaluated **off-chain** via `hydrexStakingService`
  → `EligibilityService`, never through this contract stub. Delete or deprecate `EligibilityModule.sol`.
- **DN-004 — `permissions/route.ts:135` "Phase 2 HAT sync" stub:** RETIRE. Dead endpoint — real role-hat
  minting happens in `PodManagerControlPanel.createHat`. Delete the stub (it misled the audit itself).
- **DN-005 — `sensemaker/summarize:84` skipped sentiment:** ACCEPT. Not a security check — a DB-schema
  backlog (sentiment column doesn't exist yet). No boundary weakened.

---

## Refuted / downgraded (checked and cleared — not holes)

- **SC-001 [High→Info] `PodAuthProxy.getHatStatus` returns true for unknown hats:** the "always active for
  unknown hat" is only reachable if this proxy is registered as the toggle module for a hat it doesn't
  manage — not the live wiring. Hardening: return false for unmanaged hats.
- **ROLE-001 / ROLE-002 [High→Low] role/leader checks are DB-only:** the DB permission is a UI gate; all
  *fund* operations re-check on-chain (the authorize→userOp→dbUpdate rule). Not a fund/privilege path.
- **BM-002 [Critical→Medium] pod-deletion proposal endpoint auth:** downgraded — deletion is a proposal that
  still needs the configured governance bar, not a direct destructive action.
- **BM-003 / BM-004 [Critical→Low] governance vote-sync endpoints:** the vote-sync writes are not the
  authoritative tally (Supabase governance_votes + CRON-gated close-proposals is), same class as the refuted
  PodGovernanceV3 event-emitter findings — nothing trusts the injected rows for outcomes.
- **SC-006 [Low] TimeBasedToggleModule:** correctly implemented, no issue.

---

## Recommended action order

1. **FM-005 + FM-006** — JWT-bind both routes via `getWalletFromRequest`. Small, contained, closes the two
   real reachable gaps. (Same fix pattern for both.)
2. **SC-005** — shared fail-closed CRON auth helper across all cron routes.
3. **Retire the dead notes** (DN-001..004) — delete/deprecate so future audits (and future me) aren't misled.
4. **SC-007 follow-up** — tighten or sunset the V5 admin registration bypass after pod migration completes.
5. Defer SC-004 / ROLE-003 as defense-in-depth.

## Process
2 workflows total for the security program; this sweep: 19 agents, ~1M tokens. Adversarial verification
again did the heavy lifting — every Critical the finders raised (5 of them) was downgraded; the 2 that
survived are Highs/Mediums of the exact BM-001 shape, at the API layer instead of on-chain.

# SpiritDAO commapp — Roadmap Action Items

**Created:** 2026-05-19
**Status:** Living document — update as items progress

This doc captures 8 high-level action items, each researched against the current codebase, ordered by lift (lowest → highest). Each item has scope, plan, files affected, and risk notes.

---

## 1. LiveKit Self-Hosting *(lowest lift — config-only)* — ✅ DONE 2026-05-19

**Status:** Complete. Cut over from LiveKit Cloud to Hetzner CX22 ($8/mo flat). See [livekit-self-host memory](../../../../.claude/projects/C--Users-PC-Documents-DAO-App-commapp/memory/livekit-self-host.md) for server details, ops, and troubleshooting.

**Outcome:**
- Server: Hetzner CX22 in Ashburn, Ubuntu 24.04, Docker + Caddy
- Public URL: `wss://livekit.spiritdao.org` (Let's Encrypt auto-TLS)
- App integration: 3 env vars swapped in Vercel; no code changes
- Live call tested successfully on 2026-05-19
- Capacity: ~30–50 concurrent participants; one-click upgrade to CX32 ($11/mo) if needed

---

## 2. Notifications Bug Fixes (chat/DM) — ✅ DONE 2026-05-19

**Status:** Complete. Shipped across 3 commits: `7fa9ed91`, `ad424423`, `ad4296dd`.

**Outcome:**
- Notification cards now render the sender's namecard (avatar + first/last name) via canonical `UserProfileDisplay` instead of raw wallet
- DM modal header uses the same namecard so the recipient's name + avatar render consistently regardless of how the modal was opened
- DM modal opened via notification (`?dm=` URL param) now fetches full name (was only fetching `display_name`/`username`)
- DM bubble colors aligned with canonical chat palette: own = `#E8F1EE` (sage), other = `#F5EDD7` (cream), timestamps = `#8FAAA1`
- Own vs other bubble distinction was broken (mixed-case address compared to lowercase `sender_wallet_id` always evaluated false) — now normalized
- Notifications page now refreshes in real time when new notifications arrive (previously skipped while on `/notifications`)
- DM notification body no longer embeds a stale `senderDisplayName` (which raced with profile fetch and fell back to truncated wallet) — generic body, sender's namecard shown above by the notification card

**Audit findings that turned out to be wrong (verified during impl):**
- Click-to-open DM modal: already worked via `?dm=` URL handler in ChatContainer
- Web-push on DM: already fired via `unifiedNotificationService` → `/api/notifications/send` → `sendPushNotifications`
- JWT wallet_address case mismatch: JWT already normalized lowercase at sign time; not the cause of "disappearing"

**Real "disappear" root cause:** `debouncedRefresh` in `UnifiedNotificationContext` was explicitly skipping refresh while user was on `/notifications`. Removed guard; existing `recentlyClearedIds` protection still prevents cleared items from reappearing.

**Carry-over note:** Existing notification rows in the DB still have old `message` strings ("from 0x12345…"). Not backfilling — they'll age out as users clear them. New notifications use the generic body.

---

## 3. Treasury Quorum Customization — PR 1 ✅ DONE 2026-05-20 | PR 2 ✅ DONE 2026-05-21

**Status:** On-chain infrastructure complete and verified. App-side UI integration not yet started.

**Full audit + deployment record:** [treasury-v3-audit-and-deployment-2026-05.md](treasury-v3-audit-and-deployment-2026-05.md)

**PR 1 outcome (done):**
- New contracts deployed on Base: `PodTreasuryFactoryV3` (`0x6CeD549C...`), `PodTreasuryDeployerV3` (`0x1c7b5479...`), redeployed `PodCreationManagerFactory` (`0x18B947c7...`)
- Configurable threshold (50.01%-100%) per pod, settable at creation, changeable via on-chain vote, floor of 50%+1 enforced
- Wrapper architecture (`PodTreasuryDeployerV3`) enforces caller holds the management hat AND hat is in the canonical SpiritDAO Hats tree (`0x00000749`) — closes front-run squat attack while preserving pod self-sovereignty
- 3 rounds of agent-driven security audit; 1 Critical + 5 High + 6 Medium findings remediated
- 5 downstream contracts repointed to V3 factory via setter calls
- Coinbase Paymaster whitelist updated (4 entries: 2 replaced, 2 added)
- All 5 final smoke tests pass; 13/13 wiring-state checks pass
- Schema migration `20260519000001_add_treasury_threshold.sql` adds `pods.treasury_threshold_bps`

**PR 2 outcome (done 2026-05-21):**
1. ✅ Threshold picker on pod creation form — Simple (50%+1), Strict (66%), Unanimous (100%) presets + 1%-step Custom slider; saves `pods.treasury_threshold_bps`
2. ✅ Activation card on pod page (`TreasuryActivationCard`) — leader-only "Deploy Treasury" CTA that calls `PodTreasuryDeployerV3.deployTreasury` from the leader's CDP smart wallet, parses the `TreasuryDeployed` event, and persists the new address to `pods.treasury_contract_address`. Self-heals if the treasury was already deployed on-chain.
3. ✅ Post-deploy status card — short address with copy + Basescan link, live-read threshold percent, supported-token count
4. ✅ Page-load backfill — if a V3 treasury exists on-chain but the DB wasn't updated, the load block syncs it on first view
5. ✅ V2 pods unchanged — fallback to existing FundButton/warning UI for any pod with `treasury_threshold_bps IS NULL`

**PR 2 carryover (deferred to a follow-up):**
- Threshold change proposals in governance UI (item 4 from the original list)
- Donation approval route migration when the Exec Pod moves to V3
- Per-pod Paymaster whitelisting automation — superseded by the paymaster route extension landed in PR 2 (`treasury_contract_address` now matched by the dynamic check); the original per-pod Coinbase whitelist concern no longer applies.

**Standing obligation for new pod onboarding (added 2026-05-21):**
Before any new pod leader sees the "Deploy Treasury" CTA for the first time, run a pre-flight check on their pod row:
1. `status = 'active'`
2. `management_hat_id` is non-null (long hex string, hat ID in canonical `0x00000749` tree)
3. `treasury_threshold_bps` is between 5001 and 10000
4. `treasury_contract_address` is NULL or `'pending'`
5. `pod_leads` includes the wallet address of the leader who will click the button

Verify factory has no existing treasury for the pod UUID:
```bash
cast call 0x6CeD549C1f08690e435007E661552f4F76229a9B \
  "hasTreasury(string)(bool)" "<pod-uuid>" \
  --rpc-url https://mainnet.base.org
```
Should return `false`. If any of the five DB checks fail, fix the data before the leader interacts with the CTA — first-deploy experience should be a working deploy, not an error toast.

**Carryover items:**
- Existing V2 pods stay on V2 treasuries; V3 is new-pods-only per earlier decision
- Old orphaned contracts (`0x99A291f4...`, `0xBA56...1Dbc`) still deployed but unused; optional cleanup via transferOwnership to burn address
- Per-pod `PodTreasuryV3` Paymaster whitelisting will need a workflow as pods come online (each new treasury is a new address)
- Env hygiene: `NEXT_PUBLIC_POD_CREATION_MANAGER` was stale; cleaned during deploy. `POD_CREATION_MANAGER_FACTORY_NEW` is misnamed — flag for rename in PR 2

---

## 4. Governance Quorum + Voting Flexibility — Layer A ✅ DONE (revised 2026-05-22) | Layer B ✅ DONE 2026-05-22

**Status:** Layer A complete and revised through four iterations between 2026-05-21 and 2026-05-22. Layer B (on-chain DAO Governor) deferred.

**Full technical doc:** [`governance-flexibility-layer-a-2026-05.md`](governance-flexibility-layer-a-2026-05.md)

**What shipped (all in production):**

1. **Per-pod governance configuration** — pods now configure four knobs per tier (POD_OPERATIONAL, POD_TREASURY_BINDING):
   - **Voter base** — all pod members (default) or pod leaders only
   - **Quorum %** — bounded 20%–100%
   - **Approval %** — bounded 50.01%–100%
   - **Voting period** — bounded 12h–720h (30 days)

2. **Platform defaults**, applied when a pod hasn't customized:
   - POD_OPERATIONAL: 30% quorum, 50.01% approval, 72h, all_members
   - POD_TREASURY_BINDING: 50% quorum, 66% approval, 72h, all_members

3. **Permission hierarchy** — three independent AND-gates determine whether a member can vote:
   - `pod_modules.governance_enabled` (module gate)
   - voter_base audience match (audience gate)
   - role-level `governanceParticipation` permission (highest-order signal)

4. **Per-proposal stricter override** — proposal authors can opt UP to a stricter approval bar for high-stakes proposals; cannot drop below the pod default. Validated client-side and server-side.

5. **Governance as a toggleable module** — `pod_modules.governance_enabled` BOOLEAN, default TRUE. Pods that delegate decisions to a parent (or simply don't run proposals) can disable governance without affecting other capabilities. Enforced at two server-side gates via `GovernanceService.isPodGovernanceEnabled()`.

6. **UI surfaces:**
   - Settings card lives inside the leader-only Modules panel (`PodModulesManager`) as the Governance module's config component. Earlier placement on the public pod page was removed.
   - `CreateProposalForm` filters its pod-selection dropdown by `governance_enabled`. Stricter-override picker uses preset chips (`High consensus 70%` / `Supermajority 80%` / `Near-unanimous 90%` / Custom).
   - `ProposalModal` shows live quorum + approval status (green check / red X with required-count math).

7. **Grandfathering** — proposals created before each iteration close under the rules they were created with. No retroactive re-scoring.

**Revision history within Layer A:**

| Date | Iteration | What |
|---|---|---|
| 2026-05-21 | Initial Layer A | Three knobs per tier; OPERATIONAL hardcoded leaders-only |
| 2026-05-22 | Path B | Voter base became per-pod configurable; defaults flipped to `all_members` |
| 2026-05-22 | Module toggle | Governance became a toggleable module; settings card moved to leader panel |
| 2026-05-22 | Enforcement audit | `createPodLevelProposal` + `notifyEligibleVoters` gated server-side via `isPodGovernanceEnabled` |

**Carryover from Layer A:**
- `eligible_voter_count` is snapshotted at creation, not live. Documented behaviour.
- `'admin'` membership_type is recognized as leader-equivalent across the codebase but never actively used. Worth a future cleanup to either drop the value or define it explicitly.
- `pod_governance_proposals` table referenced in `podMultiManagerGovernance.ts` doesn't exist in production; that service is effectively dead code. Either wire up or delete in a future cleanup.
- Live schema dump checked into the repo would catch column-drift bugs cheaply (we hit this twice during Layer A).

**Layer B — DAO-level (shipped 2026-05-22, no redeploy required):**

Initial planning assumed Layer B would require a new Governor contract. Discovery during the planning session: **the deployed `DAOGovernor` already inherits OZ's `GovernorSettings` and `GovernorVotesQuorumFraction`**, so `setVotingDelay`, `setVotingPeriod`, and `updateQuorumNumerator` are already callable — guarded by `onlyGovernance` (only a passing DAO proposal can invoke them). Layer B was a UI surface, not a contract migration.

What shipped:
- `DAOGovernanceSettingsCard` — new card inside the Exec Pod's Governance module config. Only renders for Exec Pod managers. Reads current values from chain, lets the user adjust voting delay / voting period / quorum %, and submits a `proposeWithMetadata` proposal whose calldatas[] invokes the relevant setter(s).
- `daoGovernorParamProposal.ts` — pure helper that encodes the calldata. Bounds: voting delay 1–72h, voting period 12–336h, quorum 4–20%.
- `proposalMetadataService.insertProposalMetadata` — extracted from `CreateProposalForm` so both DAO-wide and DAO-param proposals share one path.

What's intentionally NOT in Layer B:
- Approval threshold remains simple majority of cast votes (`GovernorCountingSimple`). Per-pod supermajority lives in Treasury V3 contracts where fund-moving decisions actually need it.
- Proposal threshold stays at 0; permission to propose is gated in-app via `governanceParticipation`.
- DAO Timelock parameters are tunable separately if ever needed.

See [`governance-flexibility-layer-a-2026-05.md`](governance-flexibility-layer-a-2026-05.md) §9 for the architecture detail.

---

## 5. 3rd-Party DB Integration *(medium lift — partial only)*

**Status:** Not started — needs conversation with community first

**Verdict:** Full per-community isolated DB is **not feasible without major refactor** (181 references to Supabase env vars across 94 files, all assuming single global client; 70+ migrations; cross-feature FKs). Partial ownership is achievable.

**Plan (recommended — Data Export & Sync model):**
1. Build per-pod data export endpoints: `/api/pods/[id]/export` returning all pod-scoped data (members, forum, bounties, knowledge, events) as JSON or SQL dump
2. Add scheduled export (daily/weekly) to a community-owned S3 bucket or webhook destination they specify
3. Optionally: pod-scoped read-only API token allowing them to query their data from their own systems
4. Document the schema so they can ingest into their own instance

**Not in scope:** True dual-write, per-tenant DB, or letting them write back. That's a multi-month refactor.

**Next step:** Talk to the community — "ownership" often means "can I get my data out if I leave" or "can I see it in my tools."

---

## 6. Password Manager Module — ✅ DONE 2026-05-22 (shipped as E2EE, not server-side encryption)

**Status:** Complete. Final architecture diverged significantly from the original plan.

**Full technical doc:** [`password-vault-architecture.md`](password-vault-architecture.md)

**Original plan** proposed server-side encryption (pgcrypto / Supabase Vault / app-level AES with KMS). **What actually shipped** is end-to-end encryption — the server never sees plaintext or content keys.

**What shipped:**

1. **End-to-end encryption** — content keys generated client-side, wrapped per recipient. Server stores only ciphertext blobs and wrapped keys. SpiritDAO operators cannot decrypt pod vault contents even with database access.

2. **Identity model** — each user derives an X25519 keypair from a deterministic CDP wallet signature over a canonical message. Public key published once; private key reconstructed client-side via re-signing.

3. **Per-entry role assignment** — leaders explicitly check which pod roles can read each entry. Crypto enforces (only checked recipients get a wrap); RLS enforces (entry SELECT requires role overlap); API enforces (server filters response).

4. **Two deferred-action queues:**
   - `vault_pending_grants` — newcomer joins → existing managers re-wrap content keys for them
   - `vault_rotation_jobs` — member loses access → next active reader rotates the vault

5. **Schema:** 6 new tables (`vault_user_keys`, `vault_entries`, `vault_wrapped_keys`, `vault_pending_grants`, `vault_rotation_jobs`, `vault_access_log`) + `pod_modules.passwords_enabled` toggle.

6. **Module-toggle permission sync** — turning the Password Vault module on auto-grants `passwordsAccess` to all roles + `passwordsManage` to leader roles. Off → both zeroed across all roles.

7. **Passwords tab in pod management** — visible to anyone with `passwordsManage` (not just pod leaders). This was the trigger for the broader role-permissions refactor (see emergent infrastructure section at the bottom).

8. **Crypto unit tests** — 18 tests covering canonical message, derivation determinism, AES-GCM round-trip, AAD binding, multi-recipient wrap, rotation correctness.

**Why E2EE instead of server-side encryption:** in conversation with the user, "we want secure and we want to convey that to our users" pushed toward the 1Password-style trust model. The original plan's risk note ("if the master key leaks, every password leaks") was structural — eliminating server-held keys eliminated the risk entirely.

**Residual risks documented in user-facing copy:**
- CDP coercion (Coinbase technically could be coerced into producing a signature on a CDP wallet user's behalf)
- Compromised member device with cached identity
- Member who reads then leaves the pod (past values are irrecoverable; rotation prevents future damage)

**Carryover:**
- No version history UI yet — `vault_entries.version` column reserved.
- No password generator in the modal.
- No cross-pod sharing.
- No 2FA secret storage with TOTP codegen.

---

## 7. $SELF Token Issuance Architecture *(high lift — design problem first)*

**Status:** SUPERSEDED & REBUILT — contracts deployed 2026-06-17. The
"monthly-cap + petition ERC-20" plan below is the ORIGINAL thinking; it was
replaced by a **soulbound ERC-1155 redesign** during deep ideation. See the
authoritative specs:
- `docs/spec-self-soulbound-redesign.md` — full design + decision log (D-1…D-21)
- `docs/spec-self-phase0-deploy.md` — deploy + role wiring (DONE, verified)
- `docs/ideation-self-tokenomics.md`, `docs/self-tokenomics-followup-answers.md`

**What actually shipped (Phase 0, 2026-06-17):** 5 soulbound contracts deployed
on Base + role-wired + verified (`scripts/verify-self-roles.mjs`, 14/14 pass):
- `SelfEpochs` `0xe9e9d5E3ACd9F738B58ffe82f974abd34766a7Bb` — soulbound $SELF, (community,epoch) ids, expiry
- `SelfMinter` `0x265dd81EC19Ef936206d6e0f6B3E910877aE70B6` — sole minter, attestation-gated
- `SelfPayment` `0x438a8Ce7F03b6dCFf140bFFB5818323aCd7bC20e` — shared burn-to-pay
- `SelfReceipt` `0x2aeB8C2C9b473DcFCD789c90E8502AD26FE37099` — soulbound redemption proof
- `SelfPrestige` `0x133dB72eB94dD5aF9E5bB148a9656752E57aa103` — ecosystem Tenure bands (Curious→Elder)
The scam-prevention is structural now: soulbound (no resale value to fake mints)
+ hour-anchor + per-pod budget ledger + diminishing returns + Exec review queue.

**Remaining (Phase 1/2):** env vars + paymaster whitelist (in progress
2026-06-17), attestation triggers (queueEarning on check-in/bounty/vote),
burn-to-pay UI, then retire the old ERC-20 + redeploy its dependents (Phase 2).

<details><summary>ORIGINAL plan (superseded — kept for history)</summary>

**Old current-state (the permissive ERC-20 problem this solved):**
- `SelfToken.sol` allows unlimited mint by anyone with `MINTER_ROLE`, no caps anywhere
- `PodSELFDistributor.sol` tracks distributions but doesn't gate quantities
- Only existing cap: faucet's 10 $SELF / 24h per wallet

**Old plan — "Exec Pod monthly cap + petition" model:**

1. **Centralize minting:**
   - Revoke `MINTER_ROLE` from all addresses except a new `SELFAllocationManager.sol` contract
   - `SELFAllocationManager` holds per-pod monthly caps + tracks usage

2. **On-chain enforcement:**
   - New contract: `SELFAllocationManager.sol`
     - `mapping(uint256 podId => MonthlyCap)` — `cap`, `mintedThisMonth`, `resetTimestamp`
     - `mintForPod(podId, recipient, amount)` — checks cap, reverts if exceeded
     - Only callable by pod's distributor (via Hats check)
     - `setCap(podId, amount)` — Exec Pod hat only

3. **Petition flow (off-chain):**
   - DB tables: `pod_self_cap_requests` (pod_id, requested_amount, justification, requested_at, status, approver_address, approved_amount)
   - API: `POST /api/pods/self-request` (pod leader submits), `POST /api/pods/self-approve` (Exec Pod approves → triggers on-chain `setCap`)
   - UI: pod settings shows current cap, remaining this month, "Request increase" button
   - Exec Pod dashboard lists pending requests

4. **Anti-abuse:**
   - Default cap: 0 (must petition first)
   - Auto-cap reset: monthly via cron
   - Justification required (free text, ideally linked to a forum proposal)
   - Public ledger at `/explorer` shows every allocation grant + usage

5. **Cross-community exchange:**
   - $SELF remains a single ERC20 (no per-pod sub-tokens) — interoperability preserved
   - Receiving a transfer from another pod doesn't affect cap (only minting does)
   - Optionally: tag `metadata` on each mint indicating issuing pod for provenance display

**Risk:** Migration of existing $SELF balances and MINTER_ROLE revocation needs coordinated deploy. Existing held tokens are unaffected; only new issuance changes.

</details>

---

## 10. Paymaster whitelist by SELECTOR, not signature *(low lift — ops hygiene)*

**Status:** Backlog (raised 2026-06-17 during $SELF paymaster setup)

**The finding:** The Coinbase paymaster dashboard **rejects tuple-bearing
function signatures** (e.g. `SelfMinter.mintBatch(bytes32,(address,uint224,
uint32,uint256,bytes32)[])` would not save — the parser chokes on the inner
`(...)` tuple). It accepts either signatures OR 4-byte selectors; selectors
always save and are unambiguous.

**Standard going forward:** whitelist ALL contract functions on the paymaster
by **4-byte selector**, not written signature. Reasons:
- Tuple/struct params are unrepresentable as signatures in their UI; selectors
  sidestep it entirely.
- Selectors are exact — no whitespace/format ambiguity, no risk of a typo
  producing a *different valid-looking* signature that fails to match at runtime
  (which fails CLOSED / silently — the worst failure mode for gasless UX).
- One consistent format across every contract.

**Compute selectors with viem:** `toFunctionSelector('fnName(types...)')`.

**Action items:**
- [ ] Document the current platform paymaster whitelist as selectors (audit what's
      there now — some entries are signatures).
- [ ] Adopt "selectors only" as the convention in the deploy runbook / any future
      contract-deploy checklist.
- [ ] $SELF selectors already computed (2026-06-17): SelfMinter
      `0x9642474c,0x601a2896` · SelfPayment `0x5fad93d9` · SelfPrestige
      `0x7c648618,0xa343862a` · SelfReceipt `0x2639f481,0x942c5875`.

**Risk:** None — selectors and signatures are equivalent on-chain; this is
purely how entries are recorded in the paymaster config.

---

## 8. Full Smart Contract Security Audit *(highest lift — comprehensive)*

**Status:** Not started

**Scope:** 43 .sol files, 11,545 lines, OZ ^5.2.0.

**Notable findings already surfaced during research:**
- `PodTreasuryV2.sol:36-38` — explicit TODO admitting single-signer is unsafe
- `PodSELFDistributor.sol:103-113` — **uses `tx.origin`** for pod manager validation — known anti-pattern that breaks on proxy calls and can be phished. **HIGH severity.**
- `PurchaseRouter.sol` — low-level `call` with a "backwards compatibility" comment; verify return value handling
- 35 contracts have `Ownable` or admin roles — need timelock review

**Plan (phased):**

**Phase A — Triage & Critical (1–2 weeks of agent-driven analysis):**
1. Run a security-review agent per contract group, in priority order:
   - **Critical first:** SystemToken, SelfToken, Advocate, ProofOfCuriosity, DAOGovernor, DAOTimelock, PodTreasuryV2(+WithVoting), BountyManagerV4, EventEscrow, PodSELFDistributor
   - **High:** PodGovernance v1/v3, PodApplicationVoting, PodCreationManagerV2, PodAuthProxy, PodBountyService
   - **Medium:** PurchaseRouter(s), TokenClaim, TokenFaucet, EligibilityModule, MultiCriteriaEligibilityModule
   - **Low:** HatMinter, SimplePodRegistry, toggle modules, factories

2. Each contract gets structured review covering:
   - Reentrancy
   - Access control (owner backdoors, missing timelocks)
   - Integer overflow/underflow
   - `tx.origin` usage
   - External call return value checks
   - Reinitialization risks on upgradeable proxies
   - Front-running surface
   - Price/oracle manipulation (where relevant)
   - DoS via gas griefing or unbounded loops

3. Cross-contract reasoning: hats permission paths, paymaster whitelist boundaries, role chains

**Phase B — Fix & Reissue:**
4. Triaged findings → prioritized fix backlog
5. Fix critical/high issues, redeploy affected contracts
6. Publish formal report (`/docs/security-audit-2026.md`) covering scope, methodology, findings, severity, fixes, residual risks

**Realistic framing:** Claude-driven review finds real issues but is not a substitute for adversarial human review. Frame the public report honestly: "internal multi-agent security review" not "formal audit by third-party firm."

**Risk:** Some findings will require redeploying contracts that hold funds. Migration plan + user comms needed.

---

## 9. Identity-Comparison Audit *(medium lift — proactive cleanup)*

**Status:** Open / Not Yet Started — created 2026-05-25

**Full spec:** [`spec-identity-comparison-audit.md`](spec-identity-comparison-audit.md)

**Why:** The platform multi-wallet identity layer shipped 2026-05-24. The foundation is correct, but the rest of the codebase was built assuming one user = one wallet. During the vault rollout we hit the same root cause (`useEvmAddress()` returns a per-device CDP wallet, not the user's canonical) eleven times in different files. Rather than chase failures feature-by-feature as more users sign in from second devices, we do a proactive sweep.

**Scope:** Three surfaces — client hooks (~50 callsites), server routes (~30), RLS policies (~20). Most are 1–2 line patches. The work is in finding them, classifying signing-context vs identity-read, and applying the right pattern.

**Estimated:** 2–3 focused days across four phases (client → server → RLS → standards/lint).

**Trigger:** Vault validated as of 2026-05-24. No further blockers to starting.

**Not in scope:** Redesigning identity, rewriting features, adding a comprehensive multi-wallet test suite.

---

# Recommended Sequence

| # | Item | Lift | Status |
|---|------|------|--------|
| 1 | LiveKit self-host | XS | ✅ Done 2026-05-19 |
| 2 | Notification bug fixes | S | ✅ Done 2026-05-19 |
| 3 | Treasury quorum config — contracts + on-chain wiring (PR 1) | M | ✅ Done 2026-05-20 |
| 3 | Treasury quorum config — app UI + activation flow (PR 2) | S–M | ✅ Done 2026-05-21 |
| 4 | Governance flexibility (Layer A) | M | ✅ Done 2026-05-21, revised 2026-05-22 |
| 4a | Path B — per-pod voter base toggle | S | ✅ Done 2026-05-22 |
| 4a | Governance as a toggleable module | S | ✅ Done 2026-05-22 |
| 4a | Server-side `governance_enabled` enforcement audit | S | ✅ Done 2026-05-22 |
| 4b | Governance flexibility (Layer B — DAO Governor params) | S (no redeploy needed) | ✅ Done 2026-05-22 |
| 5 | 3rd-party DB (export model) | M | Talk to community first |
| 6 | Password manager module | M–L | ✅ Done 2026-05-22 (shipped as E2EE, see §6 + [tech doc](password-vault-architecture.md)) |
| 7 | $SELF issuance overhaul | L | Pending |
| 8 | Smart contract audit | XL | Partially started (V3 treasury done — see [audit doc](treasury-v3-audit-and-deployment-2026-05.md)) |
| 9 | Identity-comparison audit | M | Open 2026-05-25 — proactive cleanup, see [spec](spec-identity-comparison-audit.md) |

**Suggested parallelism:** #8 (audit) can run as a background workstream while #7 executes. #5 starts with a conversation, not code.

**Flag for review:** #7 ($SELF issuance) requires contract migrations that touch live funds — warrants a separate planning session before any code. (Layer B turned out not to require a redeploy; see §4 above.)

---

# Emergent Infrastructure (Unplanned, Shipped 2026-05-22 → 2026-05-23)

These weren't on the original roadmap. They emerged from doing the
Password Vault work and recognizing that the platform's permission
and management surfaces couldn't support the feature cleanly. Listed
here so future contributors can see the work and find the docs.

## Role permissions — Core / Add-Ons / Paid architecture — ✅ DONE 2026-05-22

**Full technical doc:** [`role-permissions-design-philosophy.md`](role-permissions-design-philosophy.md)

The role permissions editor used to be a flat list gated entirely by `canManageMembers`. A non-leader role holding `passwordsManage` (or any other specialist flag) couldn't actually use the permission. Fixed by:

1. **Categorization** — Core / Add-Ons / Paid groups in `UnifiedMembershipManager`. Add-on and Paid groups only render when their module is enabled. Collapsible matching the Modules tab.
2. **Granular permission threading** — `usePodManagementState` exposes `canManagePasswords`, `canViewTreasury`, `canManageAgent`, `canManageSurveys`. Each tab in `PodManagementContainer` is gated by its specific flag OR `canManageMembers`.
3. **Gear icon broadened** — `canManagePodSync` now OR's leader status with any `*Manage`-class flag, so non-leader role holders can reach the manage page.
4. **Auto-zero on module-off** — module toggle sync blocks for `surveys_enabled`, `community_agent_enabled`, `passwords_enabled` zero the corresponding flags across all roles when turned off, set defaults when turned on.
5. **`agentManage` permission** added — non-leaders can now configure the AI agent without holding billing authority.
6. **Treasury read-only access** — `treasuryViewing` holders now see the Treasury tab; `TreasuryManagement` hides Distribute/Settings tabs for read-only viewers.

## Collapsible categories UX pattern — ✅ DONE 2026-05-23

**Full pattern doc:** [`collapsible-categories-pattern.md`](collapsible-categories-pattern.md)

Recognized that flat lists of toggles don't scale. Adopted the same Core / Add-Ons / Paid collapsible affordance in both Pod Modules and the Role Permissions editor. Future admin surfaces should use this pattern by default.

## Tech doc consolidation — ✅ DONE 2026-05-23

Added six new architecture docs covering cross-cutting subsystems that previously only existed in code:

- [`pods-architecture-overview.md`](pods-architecture-overview.md)
- [`authentication-and-session-model.md`](authentication-and-session-model.md)
- [`paymaster-gas-sponsorship.md`](paymaster-gas-sponsorship.md)
- [`cron-jobs-catalog.md`](cron-jobs-catalog.md)
- [`rag-stack-overview.md`](rag-stack-overview.md)
- [`README.md`](README.md) — index for the docs directory

Three feature areas still have gaps worth filling when those features are next touched: Forum, Events, Marketplace + Cart + Settlement, Donations/Claims bridge, Bounty system end-to-end.

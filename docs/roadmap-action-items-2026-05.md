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

## 3. Treasury Quorum Customization *(low-medium lift — already partly there)*

**Status:** Not started

**Current state:**
- `PodTreasuryV2WithVoting.sol:264-269` hardcodes 50%+1 of management hat holders
- Donation approval (`/api/donations/approve/route.ts:289,353`) hardcodes `requiredApprovals: 1`
- `PodTreasuryV2.sol:36-38` has a TODO acknowledging single-signer is unsafe for production

**Plan:**
1. Add `treasury_config` row to `pods` (or new table): `quorum_percentage`, `min_approvals`
2. Modify `PodTreasuryV2WithVoting.getRequiredApprovals()` to take a configurable threshold via constructor param or setter (governance-gated)
3. Migrate existing pods to default 50%+1, allow exec-pod-approved overrides
4. Update donation approve route to read from config
5. Redeploy new treasury contracts for pods that opt in (existing immutable instances stay as-is)

**Risk:** Existing deployed treasuries are immutable — only new ones can opt in unless a proxy upgrade pattern is added.

---

## 4. Governance Quorum + Voting Flexibility *(medium lift)*

**Status:** Not started

**Current state:**
- `DAOGovernor.sol` uses `GovernorVotesQuorumFraction` — set in constructor, immutable post-deployment
- Voting delay/period: constructor params, no setters
- Pod-level: `podMultiManagerGovernance.ts:107` hardcodes 67% majority; `ipfsAggregationService.ts:82` uses simple majority

**Plan — two layers:**

**Layer A — Pod-level (easy, DB-only):**
1. New `pod_governance_config` table: `pod_id, quorum_percentage, approval_threshold, voting_period_hours`
2. Per-proposal override: add `approval_threshold` column to `pod_level_proposals`
3. Replace hardcoded `0.67` and majority checks with config lookups in `podMultiManagerGovernance.ts:107` and `ipfsAggregationService.ts:82`
4. UI: governance settings panel in pod admin

**Layer B — DAO-level (harder, on-chain):**
1. Cannot modify current DAOGovernor without redeploy
2. Two options:
   - Replace with `GovernorSettings`-extended governor that allows DAO-vote-gated parameter updates
   - Per-proposal supermajority: custom governor overriding `quorum(blockNumber)` with per-proposal mapping

**Recommended:** Layer A only initially. Layer B as a follow-up.

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

## 6. Password Manager Module *(medium-high lift — encryption gap is real)*

**Status:** Not started

**Pattern is clear, but encryption infrastructure is missing.**

**Pod module pattern:** Well-established (`src/app/api/pods/[id]/modules/route.ts:14-25`, 10 existing modules). Following it for "passwords" is straightforward.

**Blocker:** No encryption-at-rest exists anywhere in the codebase. Storing passwords in Supabase plaintext is non-negotiable risk.

**Plan:**
1. **Encryption layer first** (the real work):
   - Option A: Supabase Vault (native, simplest, but newer)
   - Option B: pgcrypto with master key in env var (simple, key rotation painful)
   - Option C: App-level AES-256-GCM with KMS-stored keys (most secure, most work)
   - **Recommended:** pgcrypto + per-pod key derived from a master key
2. Schema:
   - `pod_passwords` (id, pod_id, category_id, label, encrypted_value, tags[], created_by, updated_at)
   - `pod_password_categories` (id, pod_id, name)
   - `pod_password_permissions` (password_id, role_id, can_read, can_edit, can_delete) — finer than pod-level
3. Add `passwords_enabled` to `ALLOWED_KEYS` + `pod_modules` migration
4. Add `passwordsAccess`, `passwordsManage` to `HatPermissions` type and `PodRolePermissionsService:486-509`
5. Build CRUD UI mirroring knowledge-base module layout
6. Audit log: every read of a decrypted password gets logged to `pod_password_access_log` (visible to pod leaders)

**Risk:** Key management is the hard part. If the master key leaks, every password leaks. Document key rotation procedure.

---

## 7. $SELF Token Issuance Architecture *(high lift — design problem first)*

**Status:** Not started

**Current state is permissive:**
- `SelfToken.sol` allows unlimited mint by anyone with `MINTER_ROLE`, no caps anywhere
- `PodSELFDistributor.sol` tracks distributions but doesn't gate quantities
- Only existing cap: faucet's 10 $SELF / 24h per wallet

**Scam fear is justified.** Current system has zero structural prevention.

**Plan — "Exec Pod monthly cap + petition" model:**

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

# Recommended Sequence

| # | Item | Lift | Status |
|---|------|------|--------|
| 1 | LiveKit self-host | XS | ✅ Done 2026-05-19 |
| 2 | Notification bug fixes | S | ✅ Done 2026-05-19 |
| 3 | Treasury quorum config | S–M | Up next |
| 4 | Governance flexibility (Layer A only) | M | Pending |
| 5 | 3rd-party DB (export model) | M | Talk to community first |
| 6 | Password manager module | M–L | Pending |
| 7 | $SELF issuance overhaul | L | Pending |
| 8 | Smart contract audit | XL | Pending (good background workstream) |

**Suggested parallelism:** #8 (audit) can run as a background workstream while #1–#4 execute sequentially. #5 starts with a conversation, not code.

**Flag for review:** #4 Layer B (DAO Governor replacement) and #7 ($SELF issuance) both require contract migrations that touch live funds/governance — warrant separate planning sessions before any code.

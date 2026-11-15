# Congregant Architecture Integration Scope

**Date:** 2026-08-18
**Source paper:** *Congregant, Not Citizen: Constitutional Design for AI Members of Human Communities* (Rivers, 2026 — SSRN + AI & Society submission, `DAO\Grants\Congregant-Publication\`)
**Target system:** commapp (Next.js + Supabase + Base mainnet: Hats Protocol, CDP smart wallets, PodGovernanceV3, $SYSTEM/$SELF/PoC/Advocate tokens)

---

## 1. Purpose

The paper makes a specific, strong claim: the AI agent's exclusion from governance is enforced **"in contract code rather than policy"** — the agent holds a wallet but is structurally unable to vote, wear hats, hold PoC, or accrue $SELF, and its continuation is decided by a recurring **existence referendum** paid from the pod treasury. This document scopes the work required to make every claim in the paper *literally true in the deployed system*, and to harden the places where today's implementation achieves the paper's outcome by absence rather than by constitution.

The distinction matters. Today the agent cannot vote because it **has no real wallet** (`deriveAgentWallet()` produces a pseudo-address, `src/services/communityAgent/types.ts:11-15`). That is exclusion by non-existence, not exclusion by constitutional design. Nothing onchain prevents an Advocate NFT or a hat from being minted to any address an agent might later control, and the agent's actual write-path into the community runs through the Supabase **service role** — a backend superuser bypass that is the opposite of a legible, inspectable boundary. The integration goal is to give the agent a real onchain existence *and* real onchain exclusion, so the "honest mask," the ledger-as-field-instrument, and the existence referendum become verifiable properties of the system rather than descriptions of intent.

---

## 2. Current State (audit summary, 2026-08-18)

### What already matches the paper

| Paper claim | Status | Where |
|---|---|---|
| Membership decomposed into four strata | ✅ Deployed | PoC (minted at onboarding, `/api/onboarding/mint-poc`), Hats roles (`pod_role_permissions`, tree 136), $SELF (`PodSELFDistributor.sol`, verified-hours minting, ~2yr linear decay, permanent Tenure bands — `src/guides/user/15-self-token-and-tenure.md`), 1p1v via soulbound Advocate NFT + `PodGovernanceV3` |
| Agent with name/avatar/social roles | ✅ Deployed | Kairos (TN pod): daily posts, @mention replies (forum + chat), weekly event drafts. `src/services/communityAgent/*`, crons under `/api/cron/community-agent/*` |
| 25 $SYSTEM / 30-day subscription | ✅ Partial | `/api/community-agent/subscribe/route.ts` — onchain $SYSTEM payment via PurchaseRouter, verified by tx receipt. **But**: leader-initiated, not governance-voted; TN + Exec pods hardcoded exempt (`EXEMPT_POD_IDS`) |
| Activity ledger with agent + human acts | ✅ Partial | Pulse/explorer feed (`recordExplorerEvent()`, `/api/explorer`) records agent posts alongside human events. Provenance exists but isn't formalized or onchain-anchored |
| Per-pod situated knowledge base | ✅ Partial | Pinecone `agent-{podId}` namespaces + `spiritdao-books` (9,667 vectors). **But** corpus = *uploaded documents*, not the pod's live forum discourse as the paper describes |
| Gasless AA transactions | ✅ Deployed | CDP smart accounts + paymaster, `useSendUserOperation()` pattern (`CDP_SMART_WALLET_ARCHITECTURE.md`) |

### Where the paper is ahead of the code

| Paper claim | Reality | Gap severity |
|---|---|---|
| Agent "holds a wallet" | Pseudo-address `0xca10 + podUUID` — no keys, no onchain existence, cannot receive or hold anything | **High** — foundational for everything below |
| Exclusion "in contract code" | Exclusion is de facto (no wallet) + de jure only in app logic. No contract prevents minting PoC/Advocate/$SELF/hats to an agent address | **High** — this is the paper's central claim |
| Agent acts are provenance-bounded | Agent writes via `supabaseAdmin` service role — a bypass with *more* power than any human member, not less | **High** — inverts the constitutional story |
| Existence referendum | Subscription renewal is a pod-leader payment action, not a treasury vote. No proposal is ever generated | **High** — the paper's "small constitutional invention" doesn't exist yet |
| Agent's mind "made of the pod's own discourse: its forum threads" | RAG corpus is manually uploaded docs; no forum-thread ingestion loop | **Medium** |
| "Leaders review event drafts before publication" | Weekly-events cron writes DB records; approval workflow for `current_events` unimplemented; no draft/publish state machine | **Medium** |
| "Every agent action is provenance-labeled" in a publicly studiable ledger | Feed exists but is app-internal; no researcher-grade export, no onchain anchoring, no per-act attribution guarantee | **Medium** |
| Boundary "contestable by the governed" via supermajority | Governance exists generically; no defined constitutional-amendment procedure for agent standing, and agent admission is a leader toggle, not a pod vote | **Medium** |
| "The community has swapped… the minds animating its agents" (model-agnostic) | True in code (Sonnet/Haiku per task), no action needed | ✅ |

### Adjacent known gaps (from repo audit docs)

- No automatic hat-revocation sync — DB can drift from chain (`DatabaseFirstPermissionService.ts:388` TODO)
- Kairos knowledge-base distillation incomplete (foundational doc, ritual library, glossary — `Kairos_Spec_v2_Final.md` §3)
- Crisis protocol specified but not wired into mention replies
- Subscription paywall enforcement not live for non-exempt pods
- SystemTokenV2 (hat-gated minting) built but not migrated

---

## 3. Design Principles for the Integration

1. **Constitution over configuration.** Every boundary the paper names must be checkable by a third party reading the chain, not by trusting the backend. Where full onchain enforcement is impractical, the fallback is onchain *registration* (agent addresses publicly flagged) + contract-level mint guards.
2. **Reduce the agent's backend privilege as its onchain identity grows.** The end state: the agent posts through the same authenticated paths as members, with a scoped key — not `supabaseAdmin`.
3. **Everything the agent does must be attributable, revocable, and renewable.** Presence is granted (subscription), never accrued.
4. **Ship in phases that are independently valuable.** Each phase leaves the system consistent; no phase requires a big-bang migration.
5. **The boundary itself stays governable.** Nothing below hard-codes agent exclusion in a way a supermajority couldn't lawfully reverse (the paper's §7 contestability requirement).

---

## 4. Phased Implementation Plan

### Phase 1 — Real Onchain Agent Identity (foundation)

> **Status 2026-08-18: code complete** — see `AGENT_WALLET_ARCHITECTURE.md`. Built: `src/contracts/AgentRegistry.sol` (compiled), `agentWalletService.ts`, `/api/community-agent/identity`, deploy script, migration script (`--dry-run` supported), auto-provisioning on module enable, identity UI block. Remaining: ops rollout (set `AGENT_WALLET_MASTER_KEY`, deploy contract, paymaster whitelist, run migration).

**Goal:** Replace pseudo-addresses with real, held, inspectable wallets so the sentence "it holds a name, an avatar, a wallet" is true.

**Steps:**
1. **Create a CDP server wallet per agent.** Use CDP's server-managed EVM accounts (same infra as the app's smart wallets, but backend-held). One smart account per pod-agent, created when the community-agent module is enabled.
   - New service: `src/services/communityAgent/agentWalletService.ts` (create, cache address in `pod_modules.community_agent_config.wallet_address`).
   - Key custody: CDP-managed (no raw keys in env). Document in a new `AGENT_WALLET_ARCHITECTURE.md`.
2. **Deploy an `AgentRegistry` contract** (Base mainnet): `registerAgent(address agent, bytes32 podId)`, `isAgent(address) → bool`, `deactivateAgent(address)`. Registration restricted to the executive hat wearer (reuse the SystemTokenV2 hat-check pattern). This is the single onchain source of truth for "this address is an artificial member."
   - New contract: `contracts/AgentRegistry.sol`; deploy script in `scripts/`; address in `src/config/contracts.ts`.
3. **Migration:** for each existing agent (Kairos), create wallet, register onchain, backfill `user_profiles` row from pseudo-address to real address (preserve post history via an `previous_address` column or an address-mapping table). Keep `deriveAgentWallet()` only as a legacy resolver for old rows.
4. **UI:** agent profile pages show the real address with an "Artificial member — view onchain registration" link (Basescan). This is the "honest mask" made clickable.

**Acceptance criteria:** Kairos has a real Base address; `AgentRegistry.isAgent(kairos) == true` verifiable on Basescan; app resolves agent identity from the registry, not a hardcoded constant.

**Dependencies:** none. **Effort:** ~1–2 weeks incl. contract audit-lite + migration.

---

### Phase 2 — Constitutional Exclusion in Contract Code (the core claim)

> **Status 2026-08-18: deployed.**
> - `AgentExclusionEligibilityModule` live at `0x4A63A3F309242B0a6807Be5A448FEa4fA3C7e17E`, attached to **all 5 live hats** (TN mgmt/member, Treegens member via backend admin; Exec mgmt + Community Pod mgmt via top-hat wearer, txs `0x0d11d7b7…`, `0x3e8b1733…`, 2026-08-18). Verified: `isEligible(Kairos) = false` on every hat; humans unaffected. Verify anytime: `node scripts/verify-agent-exclusion.mjs`.
> - Server mint guards (`src/lib/agentGuard.ts`) wired into mint-poc, mint-advocate, mint-hat, self/mint-batch (agent rows → status `rejected`).
> - Contract-level guards added to `ProofOfCuriosityV2.sol`, `AdvocateV2.sol`, `SelfMinter.sol` sources (owner-settable `setAgentRegistry`, constructor-compatible) — **these ride the next redeploys; deployed bytecode is covered by the server guards + monitor until then.**
> - `/constitution` public page + `/api/constitution` monitor live-verify all four denials per registered agent (multicall-batched). All checks green for Kairos as of deploy day.

**Goal:** Make the four denials (`no PoC`, `no hat`, `no $SELF`, `no vote`) enforced by contracts, not by the agent's inability to ask.

**Steps:**
1. **PoC contract:** add (or wrap in V2) a mint guard: `require(!agentRegistry.isAgent(to))`. If the deployed PoC contract is immutable, enforcement moves to the minting path — `/api/onboarding/mint-poc` checks the registry — plus a public monitor (step 5) that would surface any violation. Prefer contract-level if a PoC redeploy is already on the roadmap.
2. **$SELF / PodSELFDistributor:** same registry guard on `mint`/credit paths. The distributor is upgradeable/redeployable per repo history — add `require(!agentRegistry.isAgent(recipient))` in the batch-mint entrypoint.
3. **Advocate NFT:** registry guard in `mint`/`batchMint` (contract change on next redeploy; interim: guard in the minting service + monitor).
4. **Hats:** deploy a **Hats eligibility module** (via the Hats Module Factory, `0xfE66...9efA`) that returns `eligible = false` for any address in `AgentRegistry`. Attach it to the pod-membership and pod-leader hats as they're created by `PodCreationManager`; retrofit existing hats where the admin hat allows.
5. **Public exclusion monitor:** a small cron (`/api/cron/constitution-monitor`) that checks, for every registered agent address: PoC balance == 0, Advocate balance == 0, $SELF balance == 0, `isWearerOfHat == false` for all known hats, no `PodGovernanceV3` vote events. Result published to a public status page (`/constitution`) — the paper's "a member need not understand machine learning to verify that the agent holds no vote; the ledger shows it," operationalized.
6. **Voting:** `PodGovernanceV3.recordVote` already requires Advocate NFT; with steps 3–5 the chain of exclusion is closed. Optionally add an explicit `require(!agentRegistry.isAgent(msg.sender))` in the next governance-contract iteration for defense in depth and legibility (the revert reason itself becomes constitutional text).

**Acceptance criteria:** for each denial, there is either (a) a contract that reverts, or (b) a guarded mint path *plus* a public monitor proving the invariant holds. The `/constitution` page shows green checks with Basescan links.

**Dependencies:** Phase 1. **Effort:** ~2–3 weeks (eligibility module is the novel piece; the mint guards are small diffs riding existing redeploy plans — coordinate with the SystemTokenV2 migration to batch contract work).

---

### Phase 3 — Demote the Agent's Backend Privilege

> **Status 2026-08-18: deployed.**
> - `community_agent` Postgres role live (migration `20260818000001_agent_scoped_role.sql`, applied): INSERT-only on forum/chat/agent-posts/events, no UPDATE/DELETE anywhere, no access to votes/treasuries/memberships/profiles. RLS requires attribution to the caller's own registered agent wallet AND `actor_type='agent'`.
> - Agent writes authenticate via short-lived HS256 JWTs (`agentDbClient.ts`, signed with SUPABASE_JWT_SECRET). Infrastructure failures fall back to service role loudly; RLS refusals never fall back.
> - All four posting paths (daily-post, process-mentions, chatHandler, weekly-events) migrated off `supabaseAdmin` for content writes. Remaining admin usage is reads/config only.
> - `actor_type` provenance columns on forum_threads/forum_posts/chat_messages/events/explorer_events, backfilled for Kairos history; explorer_events stamped by DB trigger (`20260818000002`), immune to caller claims.
> - Rate limits moved to `community_agent_config` (`max_forum_replies_per_day` default 10, `max_chat_replies_per_day` default 20) — pod-governable.
> - Live-verified 8/8 boundary checks (script since retired; covered by `npm run verify:session`): own-content insert works; mis-attribution, human-masquerade, UPDATE, DELETE, and privileged reads all refused.

**Goal:** Close the gap between the constitutional story (agent has *less* power than members) and the implementation (agent writes via service-role, which has *more*).

**Steps:**
1. **Scoped agent write-path.** Replace `supabaseAdmin` inserts in `process-mentions`, `daily-post`, `chatHandler` with a dedicated Postgres role (or a Supabase auth user per agent + RLS policies keyed to registered agent addresses) that can *only* insert into `forum_posts`, `forum_threads`, `chat_messages`, `community_agent_posts`, and events-drafts — and only with `author = its own agent address`.
   - New RLS policies: `agent can insert own posts`; migration in `supabase/migrations/`.
2. **Provenance columns.** Add `actor_type ('human'|'agent')` + `agent_id` to `forum_posts`, `chat_messages`, and explorer events, populated automatically by the write-path (not by the model's honesty). Backfill Kairos history.
3. **Rate limits move from code constants to `community_agent_config`** so pods (not devs) set them — a collective-choice rule in Ostrom's sense, governable per pod.
4. **Kill remaining pseudo-address logic** once backfill verifies clean.

**Acceptance criteria:** grep shows zero `supabaseAdmin` usage in agent posting paths; an agent-role key leaked in the worst case can post spam but cannot touch votes, treasuries, memberships, or permissions.

**Dependencies:** Phase 1 (real identity to key RLS on). **Effort:** ~1–2 weeks.

---

### Phase 4 — The Existence Referendum

> **Status 2026-08-18: deployed.**
> - Daily cron `/api/cron/community-agent/renewal-referendums` (registered in vercel.json, 6:00 UTC): opens `agent_renewal` pod proposals (POD_TREASURY_BINDING tier, system-attributed `system:existence-referendum`, activity summary included) — treasury pods 7 days before expiry, grant-funded pods on a 90-day cadence. Voted/tallied/closed by the existing generic governance machinery.
> - Enforcement in same cron: approved+grant → next cycle scheduled; approved+treasury → payment authorized (leader-executed — server never moves treasury funds); rejected → `paused_by_referendum` silences the agent (grant) or blocks re-subscription (treasury). No farewell post by design.
> - `/api/community-agent/subscribe` gated: once a referendum has run, payment requires an approved unconsumed `agent_renewal` proposal (one vote = one renewal period). First-ever subscription exempt.
> - `EXEMPT_POD_IDS` → `GRANT_FUNDED_POD_IDS`: grant funding waives payment only — TN + Exec agents face the referendum like everyone else. **TN's first existence referendum: proposal opens 2026-08-25, vote closes 2026-09-01** (seeded on first live cron run).
> - UI: Existence Referendum block in PodCommunityAgentManager (open-vote link, execute-renewal CTA, outcome history).
> - Live-tested on dev server: first run seeds schedule, second run no-ops (idempotent).

**Goal:** Turn subscription renewal from a leader payment into the recurring, public, human-only vote the paper names.

**Steps:**
1. **Treasury-sourced payment.** Route the 25 $SYSTEM payment from the **pod treasury** (TreasuryProxy) rather than a leader's personal wallet. Requires a treasury-spend path for the subscription (reuse the bounty-payment treasury pattern).
2. **Renewal proposal generation.** A cron (extend `check-subscriptions`) creates a governance proposal in `pod_level_proposals` T-7 days before expiry: *"Renew [agent name]'s operation for 30 days (25 $SYSTEM from treasury)?"* — tagged `type: agent_renewal`, linked to the agent's activity summary for the period (auto-generated from the ledger: posts made, mentions answered, events drafted — deliberation material).
3. **Vote → execution wiring.** Pass ⇒ treasury payment executes + subscription extends (existing subscribe-route verification logic reused, actor = treasury). Fail or quorum miss ⇒ subscription lapses at expiry; agent enters `paused` state (config flag the crons already respect); a final farewell post is **not** auto-generated (the community's silence is the outcome — avoid emotional manipulation of the vote, cf. paper §8 on attachment).
4. **Cadence policy.** 30-day payment ≠ 30-day vote necessarily. Recommend: vote quarterly, payments monthly-automatic between votes, any member can trigger an off-cycle referendum by standard proposal. Make cadence a `community_agent_config` field so each pod chooses — the referendum itself becomes a governed parameter.
5. **Remove hardcoded exemptions** (`EXEMPT_POD_IDS`): convert TN/Exec exemption into a governance-approved grant recorded in the same subscriptions table (`funded_by: 'dao_grant'`), so *every* agent's continuation is on the record. The founding pod's agent should face the referendum too — the paper's credibility depends on it.
6. **First-class UI:** referendum appears in the governance module like any proposal; agent renewal history visible on the agent's profile ("Renewed 4 times; last vote 87% in favor").

**Acceptance criteria:** Kairos's next renewal is decided by a recorded TN-pod vote that moves treasury $SYSTEM; the vote, payment tx, and outcome are all in the public ledger.

**Dependencies:** Phases 1–3 (treasury pays a *real* address; provenance labels the resulting acts). **Effort:** ~2–3 weeks.

---

### Phase 5 — The Situated Mind (discourse ingestion)

> **Status 2026-08-19: deployed (engineering).**
> - Nightly cron `sync-forum-corpus` (3:00 UTC, vercel.json): incrementally embeds pod forum threads/posts into `agent-{podId}` under consent rules. Deterministic vector IDs (edits re-upsert), deleted posts pruned.
> - Consent: pod-level `corpus_includes_forum` (default OFF — leader toggle in agent manager, no pod ingests until it chooses); member-level `user_profiles.exclude_from_agent_corpus` (migration `20260818000003`, applied) — self-serve via `/api/community-agent/corpus-optout`, retroactive vector deletion on next sync.
> - Loop guard: agent's own posts excluded by default (`corpus_includes_own_posts` override).
> - Identity minimization: vectors carry no author identity — only a keyed HMAC `author_hash` enabling opt-out deletion.
> - Transparency: `/api/community-agent/transparency` + "What the agent is made of" card (doc chunks, forum chunks + sync date, philosophy index, echo-loop status, personal opt-out control).
> - Live-tested: sync skips non-consenting pods; transparency endpoint verified against TN.
> - **Outstanding (editorial, not engineering):** Kairos KB distillation per `Kairos_Spec_v2_Final.md` §3 — TN's own agent namespace is empty (0 vectors); Kairos leans on the shared books index.

**Goal:** Make "the agent's knowledge base is built from the pod's own discourse: its forum threads, documents, and self-descriptions" true, with consent and inspectability.

**Steps:**
1. **Forum ingestion pipeline.** Nightly cron embeds new/edited forum threads and posts for agent-enabled pods into `agent-{podId}` Pinecone namespace (chunk by post, metadata: thread_id, author *type* — never train the agent to imitate specific members; strip author identity or hash it).
2. **Consent gate.** Pod-level setting (`corpus_includes_forum: bool`, default off, enabled by pod vote or at minimum leader action surfaced to members) + per-member opt-out (`user_profiles.exclude_from_agent_corpus`). This is a constitutional question — who may be *made into* the agent — and deserves the same explicitness as the franchise boundary.
3. **Self-referential loop guard.** Exclude the agent's own posts from its corpus by default (prevent feedback amplification / drift; the paper's §5 concern), with a config override for pods that want the loop.
4. **Corpus transparency page.** Per-pod: what sources are in the agent's mind (N forum threads through date X, M uploaded docs, shared philosophy index yes/no), visible to all members. Extends the honest-mask principle from permissions to epistemics.
5. **Finish the Kairos KB** (pre-existing gap, becomes urgent here): foundational TN document, glossary, ritual library, comparative framework per `Kairos_Spec_v2_Final.md` §3 — without it, discourse ingestion amplifies noise.

**Dependencies:** Phase 3 (provenance columns feed the ingestion filter). **Effort:** ~2 weeks engineering + KB editorial work (non-engineering, can parallelize from day 1).

---

### Phase 6 — Ledger as Field Instrument

> **Status 2026-08-19: deployed.**
> - **Trace lineage**: `/explorer/trace/{proposalId}` + API — deliberation (thread + opener's actor_type) → proposal (creator, tier, IPFS manifest) → votes (all human, /constitution cross-link) → resource movement (renewal/treasury tx). Answers the paper's "did the agent's prompt open the thread that became the proposal that won the vote?"
> - **Public export**: `/api/explorer/export` (v1) — keyset-paginated, rate-limited (60/min/IP), actor_type/pod/period filters; `?anchors=1` returns anchor records. Attribution unified since Phase 3 (DB-stamped actor_type).
> - **Merkle anchoring**: `LedgerAnchor` contract live at `0xDbcE1A7cA8a3C887D4E112FE36994D545e032b21` (owner: pod-admin EOA); weekly cron (Mondays 4:00 UTC) roots each period's events (documented leaf formula in `src/lib/ledgerMerkle.ts`); `ledger_anchors` table (migration `20260819000001`, applied).
> - **First anchor committed**: 396 events (entire platform history 2025-08-14 → 2026-08-19) at root `0x8c8605af…8480`, tx `0xbdf7cecb…ca092`. **End-to-end verified**: an independent reimplementation using only the public export API reproduces the onchain root exactly.

**Goal:** Upgrade the Pulse feed from app feature to the paper's research-grade instrument: "parasocieties should be built to be studiable by their own members."

**Steps:**
1. **Unify attribution.** Every explorer event carries `actor_type`, `actor_address`, `act_category` (speech / draft / vote / treasury / attendance / mint). Backfill.
2. **Trace queries.** Materialized lineage links: agent post → thread → proposal → vote → treasury movement (the paper's "did the agent's prompt open the thread that became the proposal that won the vote?"). Concretely: `proposal.source_thread_id` FK (encourages deliberation-before-decision structurally) and thread → first-post attribution. A `/explorer/trace/{proposalId}` view renders the chain.
3. **Public read API + export.** Versioned, rate-limited, anonymization-respecting JSON export of the ledger for members and researchers (supports the "web-native companion with live platform data" offered in the paper, and future publications).
4. **Onchain anchoring (light).** Extend the existing IPFS vote-aggregation pattern: periodic Merkle root of the activity ledger posted onchain, so the ledger itself is tamper-evident — the field instrument can't be quietly edited by its operator.

**Dependencies:** Phase 3 provenance. **Effort:** ~2 weeks (anchoring is a few days riding `ipfsAggregationService`).

---

### Phase 7 — Procedural Safeguards & Boundary Governance

> **Status 2026-08-19: deployed.**
> - **Draft approval (7.1)**: verified pre-existing and complete — agent events insert as drafts, leaders review/edit/publish/reject (`AgentEventDrafts`).
> - **Admission by vote (7.2)**: first-time agent enablement in governance-enabled pods creates a 7-day `agent_admission` proposal instead of toggling; enforcement in the referendum cron enables + provisions wallet/registry on approval. Pods without governance keep the leader toggle (no franchise to consult). Kairos backfilled `agent_admitted_by: legacy-pre-constitution`.
> - **Amendment procedure (7.3)**: `src/guides/user/16-ai-agents-and-the-constitution.md` — strata table, admission, existence referendum, corpus rights, safeguards, and the lawful path to redraw the boundary (constitutional tier, 67% + 50% quorum, deliberate contract-level execution). Embeddable into Sensemaker via `npm run embed:docs`.
> - **Crisis protocol (7.4)**: `crisisService.ts` wired into forum + chat mention replies — fixed human-written response w/ 988 (model never invoked), discreet leader notification (no content/identity). 11/11 detection unit checks pass incl. idiom + philosophical-mortality negatives.
> - **Drift monitor (7.5)**: monthly Haiku judge scores outputs against Kairos spec §8 rubric + authority_creep; report stored in config, leaders notified on flags.
> - **Operational fix discovered during testing**: the agent crons (daily-post, process-mentions, weekly-events, check-subscriptions) were NEVER scheduled — Kairos posted twice ever, last 2026-05-04. All four now registered in vercel.json; Kairos resumes daily posts on next deploy.

**Goal:** Close the paper's §5 safeguards and §7 contestability commitments.

**Steps:**
1. **Draft/approve state machine for agent outputs with publication consequences.** `events` rows created by the agent get `status: 'draft'` + leader approval UI (the paper asserts this exists; make it so). Same gate for the spec'd `current_events` task before enabling it.
2. **Agent admission by vote.** Enabling the community-agent module for a pod becomes a pod proposal (name + avatar + corpus sources in the proposal body), not a leader toggle. The community chooses its congregant on the record.
3. **Constitutional amendment procedure, documented.** A short governance doc (in-app, `src/guides/user/`) defining how a pod or the DAO would lawfully grant agents standing: proposal class `constitutional`, supermajority threshold (recommend 67% + minimum quorum), and what the execution path would be (registry deactivation ≠ standing grant; a standing grant would be a new deliberate contract change). The point (paper §7): the line can move, but only as an act.
4. **Crisis protocol integration.** Wire the spec'd detection (self-harm language) into `mention_reply`/`chat_reply` paths with the 988-resource response and human escalation — a liability gap independent of the paper, but the congregant frame raises the stakes of the agent being someone's daily interlocutor.
5. **Drift monitoring.** Lightweight monthly eval: sample agent outputs scored against the Kairos vocabulary/constraint rubric (spec §8) by an LLM judge; results to pod leaders. Influence-without-authority still requires the influence to be good.

**Dependencies:** Phase 4 (proposal machinery reuse). **Effort:** ~2–3 weeks spread.

---

## 5. Sequencing & Effort Summary

```
Phase 1  Agent identity (wallet + registry)        ██        ~1–2 wk   ← start here
Phase 2  Contract-level exclusion                   ████      ~2–3 wk   ← the paper's core claim
Phase 3  Demote backend privilege / provenance      ██        ~1–2 wk   (parallel w/ 2)
Phase 4  Existence referendum                       ████      ~2–3 wk
Phase 5  Situated mind (discourse RAG + consent)    ███       ~2 wk + editorial (parallel from day 1)
Phase 6  Ledger as field instrument                 ███       ~2 wk
Phase 7  Safeguards + boundary governance           ███       ~2–3 wk
                                                    total     ~10–14 engineering weeks
```

**Critical path:** 1 → 2 → 4 (identity → exclusion → referendum). Phases 3, 5, 6 hang off Phase 1/3 outputs and can interleave. The Kairos KB editorial track and the amendment-procedure doc (7.3) have no code dependencies and can begin immediately.

**Recommended batching with existing roadmap:** Phase 2's contract changes should ride the already-planned SystemTokenV2 migration window (one audit cycle, one paymaster-whitelist update, one announcement) — see `SYSTEMTOKENV2_REDEPLOYMENT_PLAN.md`.

---

## 6. Risks & Open Questions

1. **Immutable deployed contracts** (PoC, Advocate as-deployed) may not accept registry guards without redeploy. Mitigation: guarded mint paths + public monitor (Phase 2.5) achieve *verifiable* exclusion even where not *reverting* exclusion; fold hard guards into the next planned redeploys. Be precise in future paper revisions about which denials are contract-reverting vs. monitor-verified.
2. **Agent wallet custody.** A real wallet means real key-compromise surface. CDP server-wallet custody + the fact that the constitution strips the address of all standing means a compromised agent key can *speak* falsely but cannot vote, mint, or move treasuries — the architecture's own thesis is the mitigation. State this in the security docs.
3. **Referendum failure UX.** A failed renewal silently stopping a beloved daily voice will be felt. Decide deliberately (per pod?) what lapse looks like: immediate silence at expiry vs. a grace week. Do not let the agent campaign for itself — consider a norm (or hard rule) that the agent does not post about its own renewal.
4. **Exemption removal politics.** Ending TN/Exec hardcoded exemptions (Phase 4.5) makes the founding pod eat its own constitutional cooking. Sequence with a heads-up to the community; the first TN existence referendum is itself publishable material.
5. **Corpus consent scope.** Forum ingestion (Phase 5) converts member speech into agent substance. The per-member opt-out is a floor; whether ingestion requires a pod vote is a genuine constitutional-choice question — recommend putting it to one, and documenting the outcome.
6. **Drift between DB and chain** (pre-existing): the exclusion monitor (2.5) partially covers agents, but the general hat-revocation sync gap remains — worth a small standing cron regardless of this project.
7. **Paper/system version skew.** AI & Society review will take months; if reviewers or readers inspect the live system, it should match the manuscript. Phases 1–4 are the ones the paper's strongest sentences depend on; prioritize them ahead of the Open Forum submission's likely review window.

---

## 7. Definition of Done

The integration is complete when a skeptical reader of the paper can, without the team's help:

1. Find the agent's real address and its `AgentRegistry` entry on Basescan (Phase 1).
2. Verify onchain/via the `/constitution` page that the address holds no PoC, no hat, no $SELF, no Advocate, and has emitted no vote event (Phase 2).
3. See every agent act provenance-labeled in the public ledger and trace an agent prompt → thread → proposal → vote → treasury chain (Phases 3, 6).
4. Read the recorded pod vote that most recently renewed — or declined to renew — the agent's subscription, and the treasury transaction it authorized (Phase 4).
5. See what the agent's mind is made of, and how a member opts their words out of it (Phase 5).
6. Read the lawful procedure by which the community could one day decide otherwise (Phase 7).

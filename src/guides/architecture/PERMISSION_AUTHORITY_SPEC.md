# Pod Permission Authority Spec + Enforcement Audit

**Date:** 2026-08-07
**Status:** DRAFT — Part 1 requires ratification by leadership (Ron). Part 2 is
the audited current state with confidence markers.
**Why this exists:** the TreasuryProxy fix (2026-08-07) enforced leader-only
authority on-chain, silently under-implementing the granular role model. Root
cause: authority intent lived only in the DB schema and in heads — every
contract/API author has been inferring it independently. This document is the
single source of intent. **Contracts and API routes implement FROM this spec,
never from inference.**

---

# PART 1 — THE AUTHORITY SPEC (ratify this)

## Vocabulary

- **Management hat** — the pod's `management_hat_id`. Its wearers are the pod's
  leaders.
- **Role hat** — any hat with a row in `pod_role_permissions`
  (`token_address` = hat id) whose `permissions` object grants capability keys.
  Created by leaders via the app (RoleCreationModal).
- **Capability** — one of the 21 permission keys below.

## The Universal Authority Rule

> A wallet holds capability X in pod P iff it wears P's **management hat**, OR
> it wears an **active role hat** of P whose role grants X.

Leaders implicitly hold ALL capabilities in their pod (the management hat is a
superset role). This is intended behavior, not a bypass.

**Standing sub-rules (from the 2026-08 audits):**
1. Management hats are worn by voting humans only. Contracts needing tree
   authority (e.g. HatMinter) wear a separate admin-capable hat — never the
   management hat (it inflates treasury vote thresholds).
2. On-chain enforcement of role hats uses the **registry pattern**
   (BountyManagerV5's `authorizedFunderHat`): a leader registers role-hat IDs
   per capability on the contract; the contract checks
   `wears(managementHat) || wears(registeredHat)`. Contracts never read the DB.
3. ⚠️ FOR RATIFICATION: Executive Pod leaders currently receive management
   access to ALL pods (`useHybridPodPermission.ts:124-129`). Confirm this is
   intended platform policy, or scope it.

## Enforcement Tiers

Which layers MUST enforce a capability depends on what it protects:

| Tier | Protects | Required enforcement |
|---|---|---|
| **T1 — value-moving** | on-chain funds/tokens | **Contract** (registry pattern, honors role hats) + API + UI |
| **T2 — integrity-mutating** | server data others rely on | **API** (DB role lookup + on-chain hat verification) + UI |
| **T3 — participation/UX** | read access, personal actions | UI (+ RLS where present) |

UI-only enforcement of T1/T2 capabilities is a defect: anyone can bypass the UI
and call the API/contract directly.

## Per-Capability Spec

| Capability | Tier | Authority rule | Must be enforced at |
|---|---|---|---|
| treasuryManagement | **T1** | mgmt hat OR registered role hat | Contract (proxy + treasury) + API + UI |
| bountyManagement | **T1** | mgmt hat OR registered funder hat | Contract (✅ exists) + UI |
| marketplaceManage | T2 | mgmt hat OR role hat | API + UI |
| memberManagement | T2 | mgmt hat OR role hat | API + UI |
| roleAssignment | T2 | mgmt hat OR role hat | API + UI |
| subPodCreation | T2 | mgmt hat OR role hat | API + UI |
| chatModeration | T2 | mgmt hat OR role hat | API + UI |
| forumModeration | T2 | mgmt hat OR role hat | API (✅ exists) + UI |
| knowledgeBaseManage | T2 | mgmt hat OR role hat | API + UI |
| surveyManage | T2 | mgmt hat OR role hat | API + UI |
| passwordsManage | T2 | mgmt hat OR role hat | API (✅ exists) + UI |
| passwordsAccess | T2 | mgmt hat OR role hat | API (✅ exists) + UI |
| agentManage | T2 | mgmt hat OR role hat | API + UI |
| eventCreation | T2* | mgmt hat OR role hat | API + UI (*event funds escrow on-chain but creator stakes their own funds — contract gate optional) |
| treasuryViewing | T3 | any role granting it | UI |
| chatAccess | T3 | any role granting it | API (✅ exists) + UI |
| forumAccess | T3 | any role granting it | UI |
| knowledgeBaseAccess | T3 | any role granting it | UI |
| marketplaceAccess | T3 | any role granting it | UI |
| governanceParticipation | T3† | any role granting it | UI († DAO-wide voting is separately gated by Advocate token — on-chain by construction) |
| surveyRespond | T3 | any role granting it | UI |

---

# PART 2 — ENFORCEMENT AUDIT MATRIX (current state, 2026-08-07)

Legend: ✅ enforced honoring role hats · Ⓛ leader-only (role hats ignored) ·
❌ not enforced at this layer · — not required by spec · (v) personally
verified this session · (a) agent-reported, spot-check before relying on it

| Capability | Tier | UI | API | Contract | Verdict vs spec |
|---|---|---|---|---|---|
| treasuryManagement | T1 | ✅(v) | ❌ | **Ⓛ(v)** proxy mgmt-hat-only; V3 proposals mgmt-hat-only | **GAP G1 — the trigger for this doc** |
| bountyManagement | T1 | ✅(v) | ❌(a) create route has no check | ✅(v) V5 funder-hat registry | Contract compliant; API gap tolerable (contract fails closed) |
| chatAccess | T3 | ✅ | ✅(a) chat-messages route | — | Compliant |
| forumModeration | T2 | ✅ | ✅(a) moderate route: role perms + on-chain hat | — | Compliant |
| passwordsAccess/Manage | T2 | ✅ | ✅(v, prior audit) | — | Compliant |
| memberManagement | T2 | ✅ | ~(a) podAuthMiddleware covers some routes | — | Partial — verify coverage of every member-mutating route |
| chatModeration | T2 | ✅ | ❌(a) | — | **GAP G2** |
| eventCreation | T2 | ✅ | ❌(a) event routes unchecked | ❌(a) contract doesn't restrict creators | **GAP G2** |
| knowledgeBaseManage | T2 | ✅ | ❌(a) | — | **GAP G2** |
| marketplaceManage | T2 | ✅ | ❌(a) | — | **GAP G2** |
| roleAssignment | T2 | ✅ | ❌(a) | — | **GAP G2** |
| subPodCreation | T2 | ✅ | ❌(a) | — | **GAP G2** |
| surveyManage/Respond | T2/T3 | ✅ | ✅(v) | — | **G3 RESOLVED (2026-08-10)** — see below |
| agentManage | T2 | ✅ | ❌(a) | — | **GAP G2** |
| governanceParticipation | T3 | ✅ | — | — (Advocate gating separate) | Compliant pending † confirmation |
| treasuryViewing / forumAccess / kbAccess / marketplaceAccess | T3 | ✅ | — | — | Compliant |
| (pod modules config) | T2 | ✅ | ✅(v) leader/Exec only | — | **G4 RESOLVED (2026-08-10)** — false positive; see below |

## Gaps, ranked

**G1 — treasuryManagement contract layer ignores role hats.** The known
trigger. Fix: TreasuryProxy v2.1 with `setAuthorizedTreasuryHat` registry
(mirrors V5 bounties); fold same pattern into the next PodTreasuryV3 revision
(its proposal functions are also leader-only). Status: v2.1 approved, in
progress.

**G2 — a family of T2 mutating API routes are UI-only.** Events, knowledge
base, chat moderation, marketplace manage, role assignment, sub-pods, agent
manage, pod modules. Anyone with a session can bypass the UI and call these
directly. Same *class* of flaw as the proxy bug, at the API layer. Fix pattern
already exists in-repo: the passwords routes' `callerHasPermission` /
`podAuthMiddleware`. Apply uniformly. (Pre-launch priority right after G1.)

**G3 — surveys: RESOLVED (2026-08-10).** The "not located" flag was a coverage
gap in the automated sweep, not an absent enforcement. All survey writes go
through 5 API routes (zero direct client→DB writes — the ideal pattern), each
cryptographically verifies the JWT (`jwt.verify`, not just decode), and gates
before writing. Survey tables also have live RLS as a backstop. **One real gap
found and fixed:** the create/edit/delete routes checked `isPodLeader` instead
of the `surveyManage` permission — so the role editor's "Survey Manage" toggle
(exposed in the controls tab, understood by the whole permission stack) was
silently unenforced: a leader could grant a custom "Survey Manager" role and it
wouldn't actually work at the API. Fixed by gating POST/PUT/DELETE on the new
`requirePodPermissionOrLeader(podId, 'surveyManage')` guard (granular role OR
pod leader — preserves existing leader access, adds role delegation). The
`respond` route is correctly gated on survey *audience* membership (better than
a flat surveyRespond check) and left as-is. NOTE: `check_pod_permission` DB fn
does NOT grant leaders implicitly, which is why the guard ORs leadership in —
important for any future route reusing it.

**G4 — RESOLVED (2026-08-10): false positive.** The `pods/[id]/modules` PUT was
NOT unchecked — it's one of the most carefully-authorized routes in the app:
JWT cryptographically verified, gated on pod-leader OR Executive-leader, with
exec-only keys (external wallet linking) further restricted to Exec-hat wearers,
whitelisted boolean keys only. It's also the *source of truth* that propagates
module state into role permissions (syncs subPodCreation/surveyManage+Respond/
agentManage/passwordsAccess+Manage when modules toggle). Toggling a pod's
features on/off is a core leadership action, intentionally NOT a delegatable
role permission — so the "missing capability key" was by design, not a gap. No
`moduleManage` key is referenced anywhere (verified). Change made: refactored
the route to use the shared serverPodAuth helpers (getWalletFromRequest /
isPodLeader / isExecutiveLeader) instead of local duplicates — cleanliness only,
behavior identical.

## Confidence & follow-up

Rows marked (a) come from the 2026-08-07 automated sweep and were not all
line-verified. Before building on any single row, spot-check it. The G2 list
should be re-verified route-by-route as the first step of its fix.

## G2 status update (2026-08-08) — API-route pass COMPLETE

Verified route-by-route (the original G2 list was partly speculative; several
suspected routes turned out to already have auth — surveys, modules, agent
config/corpus, forum tags — or to be read-only despite POST). Real gaps found
and fixed:

| Route | Was | Now |
|---|---|---|
| `events/update-contract` POST | unauthenticated — anyone could re-point an event's payment contract | JWT + must be event creator or Executive leader |
| `events/batch-create-gasless` POST | unauthenticated, signed with backend admin key, ZERO callers | **deleted** (dead + dangerous) |
| `pod-deletion/create-proposal` POST | leader check literally commented out | JWT + `isPodLeader`; `proposed_by` forced to verified caller |
| `pods/roles/[roleId]/eligibility` PUT | unauthenticated role-criteria editing | JWT + granular `roleAssignment` permission; `updatedBy` forced to caller |
| `pods/sync-members` POST | anonymous | JWT session required (anti-spam; writes chain-derived data only) |

New shared plumbing: `src/lib/apiPodGuard.ts` (`requireWallet`,
`requirePodPermission` — the universal authority rule, server-side) and
`src/lib/authHeaders.ts` (client helper to attach the session JWT). All five
live callers updated to send the header.

**Remaining (G2b): RLS audit.** Several capabilities' writes never touch an API
route — they go client → Supabase directly (knowledge base CRUD, marketplace
product management, chat moderation actions, role creation). Their server-side
enforcement is Supabase RLS policies, whose quality is UNAUDITED. Next pass:
enumerate the RLS policies per table and verify they encode the authority rule
(or route those writes through guarded API endpoints).

## Remediation order

1. **G1**: proxy v2.1 registry (in progress) → re-flip Exec/TN → Treegens lands
   on final proxy.
2. **G2**: one shared `requirePodPermission(podId, wallet, key)` server helper
   (generalize the passwords pattern); apply to every T2 mutating route;
   route-by-route verification list as the PR checklist.
3. **G3/G4**: map surveys; add missing capability keys.
4. Treasury V4 (later): registry pattern + exclude contract wearers from
   thresholds.

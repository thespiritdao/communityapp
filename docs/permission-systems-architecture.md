# Permission Systems — Architecture, Divergence, and the Ideal

*Reference doc. Explains the two permission systems that gate "can this user do
X in this pod?", why they exist, how they've drifted, and the target
architecture. Written 2026-07-16 after a run of bugs traced to their
inconsistency.*

---

## TL;DR

There are two parallel permission systems answering the same question. They were
built at different times for different purposes and are kept in sync **manually**,
which is the root of several recent bugs. Consolidation is worthwhile but is a
cross-cutting refactor to do **after onboarding**, not during. The ideal is NOT
"merge into one hook" — it is "one source of truth, two enforcement tiers."

Crucially: **neither hook is the real security boundary for anything that moves
value.** Fund/treasury operations are enforced server-side (the
authorize -> sendUserOperation -> dbUpdate pattern verifies hat ownership
on-chain). The hooks below are UI-visibility gates.

---

## The two systems

### System A — `useDatabaseFirstPermissions` (`src/hooks/useDatabaseFirstPermissions.ts`)

- **What it answers:** "Can this user manage / view this pod?" (coarse-grained.)
- **How:** reads the user's memberships from `active_pod_members` (DB-first, fast,
  cached). Key function `canManagePodSync(podId)`.
- **Has an EXECUTIVE OVERRIDE:** `if (isExecutiveLeader) return true` — an
  Executive Pod Leader can manage every pod.
- **Used for:** the pod card / gear icon / "can I even reach this pod's manage
  page", pod-delete gate, and now the exec-only module toggle.
- **Posture:** fast and trusting. Good for UI gating where a moment of staleness
  is harmless.

### System B — `useHybridPodPermission` (`src/hooks/useHybridPodPermission.ts`)

- **What it answers:** "Does this user have permission X in this pod, RIGHT NOW,
  provably?" (fine-grained, per-feature: `memberManagement`, `treasuryManagement`,
  `bountyManagement`, etc.)
- **How:** a THREE-FACTOR check — (1) on-chain `balanceOf` of the pod's role hat,
  (2) the DB permission flag, (3) no unsigned pod agreements. All three must pass.
- **Has the EXECUTIVE OVERRIDE (added 2026-07-16):** execs bypass the per-pod
  hat/role check, matching System A.
- **Used for:** the pod management TABS (Members mgmt, Treasury, Modules,
  Settings, Sub-Pods, Surveys, Agent, Passwords, Delete) and fund-related
  features.
- **Posture:** strict. Its explicit design goal: "losing your hat should
  IMMEDIATELY revoke access." Right for anything touching funds.

---

## Why two exist (the purpose behind each)

This is deliberate history, not just mess:

- **System A (DB-first)** is the fast path. Reading `active_pod_members` is cheap
  and instant, so the UI can decide "show the gear icon" without an on-chain call
  on every render.
- **System B (hybrid, three-factor)** is the newer, stricter security model built
  specifically for FUND operations. The on-chain hat check means access can't lag
  behind a revoked hat — important when money is involved. The agreement-signature
  factor adds accountability.

So the divergence in *posture* is intentional and valuable. You genuinely want
UI gating to be fast/loose and fund gating to be strict/provable.

## Why the drift causes bugs (the actual problem)

The two systems share **logic they must agree on** — most importantly "who is an
executive" and "who leads this pod" — but each implements it separately. When one
gets a rule the other doesn't, they disagree, and a user falls into the gap.
Recent examples, all the same root cause:

1. **Pod-delete leak** — the delete button gated on a feature permission that a
   member could hold, not on leadership. (Fixed by gating on leadership.)
2. **Module-toggle gap** — the exec-only toggle gated on `isExecPod` (a
   pod-identity flag that's never true on the standard manage route) instead of
   `isExecutiveLeader` (the user). Disabled for everyone. (Fixed.)
3. **Exec sees only Members + Agreements** — System A's exec override let an exec
   REACH a pod's manage page, but System B (which gates the tabs) had NO exec
   override, so every leader tab was hidden. (Fixed 2026-07-16 by adding the exec
   override to System B.)
4. **Server module route rejected execs** — `PUT /api/pods/[id]/modules` gated on
   `isPodLeader` FIRST and 403'd ("not a pod leader") before the exec-only-keys
   check ran. The client hooks let an exec click the toggle, but the server —
   which had no exec override — denied it. (Fixed 2026-07-16: base gate now allows
   this pod's leader OR an Executive Pod Leader, mirroring the hooks.)

The pattern: a rule lived in one system and not the other. Four bugs, one cause.
The server is a THIRD copy of "who may manage this pod" — include it in the
"check every layer" invariant below, not just the two client hooks.

## The current invariant (until consolidation)

**Any new permission-gated surface must be checked against BOTH systems.** If you
add a gate, ask: does System A agree with System B on who passes? In particular:

- Does the exec override apply where it should? (Both systems now have it — keep
  it that way.)
- Is a "leader" check actually checking leadership, not a feature permission a
  member might hold?
- Is `isExecPod` (pod identity) being confused with `isExecutiveLeader` (the
  user)? They are different things.

---

## The ideal architecture (target, build post-onboarding)

**Not** "one hook." The ideal is **one source of truth with tiered enforcement:**

1. **One permission resolver.** A single place that computes "what can this user
   do in this pod?" — role lookup, the executive override, and agreement checks
   in ONE implementation. No parallel copies of "who is an exec."

2. **Two enforcement tiers it exposes** (same source, different strictness):
   - **`canView` / `canManage`** — DB-first, fast. For UI visibility (which tabs,
     which buttons). A moment of staleness is fine here.
   - **`canTransactFunds`** — adds the live on-chain hat check + agreement check.
     For anything that moves value.
   Because both tiers derive from ONE resolver, they can never disagree about who
   is an exec or who leads a pod. Only the strictness differs, by design.

3. **Server-side stays the real boundary.** Every value-moving operation already
   verifies hat ownership on-chain server-side (authorize -> userOp -> dbUpdate).
   The hooks are UI/UX; the server + chain enforce. Consolidation does not change
   this — it just stops the two UI systems from drifting.

### Migration sketch (for the future refactor)
- Extract the shared resolver (exec override + role/leader lookup + agreements)
  into one module.
- Reimplement `canManagePodSync` and `useHybridPodPermission` as thin tiers over
  that resolver (fast tier / strict tier), preserving each call site's current
  posture.
- Surfaces to touch (audit before starting): the pod card/gear, all management
  tabs (PodManagementContainer), fund features (treasury, bounties, distributions),
  the module toggles, forum/chat moderation gates, and the exec-only controls.
- Verify against the delete-button, module-toggle, and exec-access cases above as
  regression tests.

### Timing
Do this **after the first communities are onboarded and stable.** It touches
every permission-gated surface; a consolidation bug during onboarding is far
worse than the manual-sync papercut. Until then, hold the "check both systems"
invariant above.

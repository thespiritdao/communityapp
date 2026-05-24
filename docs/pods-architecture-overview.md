# Pods — Architecture Overview

*Last updated: 2026-05-23*

Pods are the central organizing unit of the app. Every other feature
(governance, treasury, chat, forum, events, vault, etc.) is scoped to
a pod. This document is the map for a new engineer trying to navigate
the ~45 services that make pods work.

It does NOT enumerate every service. It explains the **layers**, the
**creation flow**, and the **where-to-look-when-X-happens** questions
that come up most often.

## Layer cake

```
┌─────────────────────────────────────────────────────────────────┐
│  UI (src/features/pods/components/)                             │
│  • PodCard, PodDetailsContainer, PodManagementContainer         │
│  • PodModulesManager, UnifiedMembershipManager                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  Hooks (src/features/pods/hooks/)                               │
│  • usePodManagementState, usePodMembers, usePodPermission       │
│  • useHybridPodPermission (DB + on-chain)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  Services (src/features/pods/services/)                         │
│  Two main families:                                             │
│   ─ Pod lifecycle: PodService, PodCoreService, PodOperations,   │
│     PodDatabaseService, PodDeletionService, PodAccessControl    │
│   ─ Hat-tree management: HatCreation, HatBlockchainSync,        │
│     HatsModuleDeployment, hatToggleService, hatModuleConfig     │
│  Plus: Treasury, Governance, Roles, Membership, Eligibility,    │
│        Agreements, Notifications.                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  Persistence + chain                                            │
│  • Supabase: pods, pod_modules, pod_role_permissions,           │
│    active_pod_members (view), pod_governance_config, etc.       │
│  • Base mainnet: Hats Protocol, PodCreationManagerV2,           │
│    PodTreasuryV3, Governor                                      │
└─────────────────────────────────────────────────────────────────┘
```

The cleanest mental model: **DB is the source of truth for fast
reads; chain is the source of truth for capability.** Services that
mutate state usually write the DB first, then schedule the on-chain
sync as a separate transaction.

## Key tables

| Table | Role |
|---|---|
| `pods` | Pod record. `pod_leads[]`, `management_hat_id`, `membership_hat_id`, `treasury_contract_address`, `creation_manager_address` |
| `pod_modules` | Per-pod feature toggles (`chat_enabled`, `passwords_enabled`, etc.) |
| `pod_role_permissions` | Role definitions keyed by `(pod_id, token_address=hat_id)`. `permissions` JSONB holds the flag set |
| `active_pod_members` | View: wallet → pod_id via hat ownership. Source of truth for "is X in pod Y" |
| `pod_governance_config` | Per-pod quorum/threshold/voting period (see governance-flexibility doc) |
| `pod_role_assignments` | **Does not exist.** A common false friend in old code/RLS. Use `active_pod_members` instead |

## Pod creation flow (Option D — 2026-03-05)

The flow exists in this shape because `createHat` requires the caller
to hold the COMMUNITY_PODS_PARENT hat, and no end user does.

```
1. User opens "Create Pod" UI (HatsModulePodCreationForm.tsx)
2. Client calls createPodProposal() on PodCreationManagerV2
   (gas sponsored via the paymaster proxy — contract is whitelisted)
3. Contract emits PodProposed(managementHatId), creates the hat
   tree internally (it holds the parent hat)
4. Client deploys the treasury proxy (PodTreasuryV3) in a second tx
5. POST /api/pods/create writes pods row + initial roles +
   default pod_modules. Status: 'pending_review'
6. After 48h with no veto OR explicit Exec approval, status flips
   to 'active'. Permissionless finalization after 48h is also
   available on-chain.
```

**Key files for this flow:**
- `src/features/pods/components/HatsModulePodCreationForm.tsx` — UI
- `src/contracts/PodCreationManagerV2.sol` — on-chain handler
- `src/app/api/pods/create/route.ts` — DB write + fallback server-side
  `createPodProposal()` call
- `src/features/pods/services/PodCoreService.ts` — orchestrates DB
  inserts
- `src/features/pods/services/PodRolePermissionsService.ts` — seeds
  the leader + member roles with default permission flags

## Pod role resolution

The canonical "wallet W has permission X in pod P" check is documented
in `role-permissions-design-philosophy.md`. The short version:

```sql
EXISTS (
  SELECT 1
  FROM active_pod_members apm
  JOIN pod_role_permissions prp
    ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
  WHERE apm.pod_id = <target>
    AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
    AND apm.is_active = true
    AND (prp.permissions->>'X')::boolean = true
)
```

There is **no `pod_role_assignments` table.** The wallet→role link
comes from matching `active_pod_members.hat_id` against
`pod_role_permissions.token_address`.

For client code, prefer `useHybridPodPermission(podId, 'X')` which
checks DB + on-chain hat balance + eligibility agreements.

## Modules + permissions sync

When a leader toggles a module on or off via `PodModulesManager`, the
PUT `/api/pods/[id]/modules` endpoint runs a **sync block** for each
known module-toggleable permission:

- `sub_pods_enabled` ↔ `subPodCreation`
- `surveys_enabled` ↔ `surveyRespond` (all roles), `surveyManage` (leader roles)
- `passwords_enabled` ↔ `passwordsAccess` / `passwordsManage`
- `community_agent_enabled` ↔ `agentManage` (leader only)

Module off → flags zeroed on every role. Module re-enabled → defaults
re-applied (members get access, leaders get manage). Leaders can then
override per-role in `UnifiedMembershipManager`.

## Pod deletion (Option B — proposal-based)

Pods can't be hard-deleted on-chain (hats persist), but they can be
**deactivated**:

1. Leader (or anyone with `memberManagement`) submits a deletion
   proposal via `PodDeletionButtonV2`.
2. Active members vote in `pod_deletion_proposals` over 7 days.
3. On pass: `PodDeletionService` runs — burns role hats, deactivates
   memberships, marks pod `status: 'deleted'`, leaves treasury intact
   for asset recovery.

Treasury contracts are not destroyed; pod leaders retain the ability
to drain to a successor pod or external wallet.

## Treasury linkage

Treasury is its own subsystem but lives on the pod row:
`treasury_contract_address`. See `treasury-v3-audit-and-deployment-2026-05.md`
for the V3-specific design.

A pod can exist without a treasury; toggling the Treasury module on
prompts the leader to deploy one via `PodSpecificTreasuryManager`.
The deployed proxy address is written back to `pods.treasury_contract_address`
and immediately becomes eligible for gas-sponsored writes via the
paymaster proxy (which checks pod rows dynamically).

## Sub-pods

When the Sub-Pods module is enabled, pod leaders can spawn child pods
that inherit the parent's hat tree under the parent's `management_hat_id`
sub-tree. Activation flows through the Exec Pod for review (same UI
as top-level pod creation).

Sub-pods get their own `pods` row with `parent_pod_id` set; queries
across the tree use recursive CTEs in the DB or recursive joins in
the `pods` service.

## Where to look when X happens

| Event | Start here |
|---|---|
| Pod created | `PodCreationManagerV2.sol`, `api/pods/create/route.ts` |
| User joins pod | `PodMembershipApplicationService` → `api/pods/[id]/applications/[applicationId]/approve` |
| Role permission changes | `UnifiedMembershipManager.handleSaveToDatabase` → `PodRolePermissionsService.updateRolePermission` |
| Module toggled | `PodModulesManager.toggleModule` → `api/pods/[id]/modules/route.ts` sync block |
| Member removed | `usePodManagementHandlers.handleRemoveMember` → `PodOperationsService.removeMember` |
| Pod listed in nav | `usePods.canUserManagePod` → `useDatabaseFirstPermissions.canManagePodSync` |
| Pod deleted | `PodDeletionButtonV2` → `PodDeletionService` |

## Known footguns

- **The pod_role_assignments table doesn't exist.** Any old RLS or
  service code referencing it is wrong; rewrite using `active_pod_members`
  + `pod_role_permissions`.
- **`canManagePodSync`** OR's leader status with any `*Manage` flag.
  Don't add new manage-class flags without listing them in `MANAGE_KEYS`
  inside `useDatabaseFirstPermissions.ts` or the gear icon won't appear.
- **Hat IDs are sourced from `pod_role_permissions.token_address`**,
  never from env vars or a separate registry. The `hatRegistry` cache
  reads from this table.
- **Treasury V3 factory is mutable** to support V2→V3 migration. See
  the treasury doc for the migration story.
- **Pod creation status** is `pending_review` until exec approval or
  48h timeout — anything that consumes pod data should filter on
  `status = 'active'` unless it specifically handles pending.

## File map

| Path | Role |
|---|---|
| `src/features/pods/components/` | UI surface |
| `src/features/pods/hooks/` | React data hooks (state, permissions, members) |
| `src/features/pods/services/` | Core services (~45 files; see categories above) |
| `src/contracts/PodCreationManagerV2.sol` | On-chain pod factory |
| `src/contracts/PodTreasuryV3.sol` | Per-pod treasury proxy |
| `src/app/api/pods/[id]/` | Per-pod API routes (modules, members, applications, treasury, etc.) |
| `supabase/migrations/2026*pod*.sql` | Schema evolution |

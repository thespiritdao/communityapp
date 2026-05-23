# Role Permissions — Design Philosophy

*Last updated: 2026-05-22*

This document explains why pod role permissions are organized the way
they are after the May 2026 refactor, and the principles that should
guide future additions. If you're adding a new pod-scoped feature,
read this before writing code.

## The problem we solved

For most of the app's history, "manage" was binary. You were a pod
leader (saw the gear icon, accessed every panel inside Pod Management)
or you were a member (no admin surface at all). Per-feature permission
flags existed in the `HatPermissions` interface — `bountyManagement`,
`marketplaceManage`, `knowledgeBaseManage`, and others — but the UI
collapsed them all into a single `canManageMembers` check. Setting
those flags on a non-leader role had no visible effect anywhere.

This worked when pods were small enough that one leader did
everything. As role specialization started to matter (a marketing
manager who shouldn't touch treasury; a survey administrator who
shouldn't manage members), the gap became visible. The first time it
hurt was when we shipped the password vault: a non-leader role with
`passwordsManage` couldn't actually reach the vault to manage it.

## The three principles

### 1. Module and permission are two sides of the same thing

A **module** is a capability the pod has turned on (Surveys, Password
Vault, Community AI Agent). A **permission** is whether a given role
can use that capability. These had been managed in two unrelated
places — Modules tab vs. Manager Controls tab — with no coupling.

The refactored model treats them as coupled by design:

- When a leader enables a module, the corresponding permission flags
  auto-sync onto existing roles (leader roles get the manage flag;
  member roles get the access/respond flag, where applicable).
- When a leader disables a module, those flags are zeroed across all
  roles. Re-enabling re-applies the defaults; leaders can then
  customize.
- The permission editor only shows add-on or paid groups whose module
  is currently enabled. Flags belonging to disabled modules are hidden
  rather than displayed as "always false."

This is enforced server-side in `src/app/api/pods/[id]/modules/route.ts`
via a sync block per toggleable module, mirroring the pattern that
already existed for `sub_pods_enabled`.

### 2. Permission categories reflect what's actually true

The permission editor groups flags into three sections:

- **Core** — permissions every pod has, gating capabilities every pod
  uses. Chat, forum, governance participation, member management, role
  assignment, treasury (viewing and managing), events, bounties,
  marketplace, knowledge base, sub-pods.
- **Add-ons** — optional modules. A flag in this group is only
  meaningful if its module is enabled. Today: Surveys, Password Vault.
- **Paid** — features with billing implications. Today: Community AI
  Agent. Subscription billing actions remain leader-only regardless of
  the per-role flag — the flag governs *configuration*, not spending.

These categories aren't arbitrary. They reflect three different
relationships between the pod and the feature:

- Core features are infrastructure — assumed to exist.
- Add-ons are choices — opt in or out per pod.
- Paid features are commitments — billing implications shift the
  trust boundary.

Future flags should be classified into one of these three. If a flag
doesn't fit, that's a sign the category model needs to expand — not
that the flag should land in a flat list.

### 3. The pod surface should expose capability, not assume rank

Today's pod management page has a tab bar. Each tab is gated by a
specific permission, not by a generic "is leader" check. The tabs a
user sees on a given pod reflect *what they can actually do there*:

- A marketing manager with `passwordsManage` sees the Passwords tab
  and nothing else (assuming no other manage flags).
- A treasury viewer with `treasuryViewing` sees the Treasury tab in
  read-only mode (balances, history) — no Distribute/Settings tabs.
- A pod leader sees everything they have flags for.

The gear icon on the pod card opens this same surface for anyone
holding any `*Manage`-class flag, not just `pod_leads` members.
`canManagePodSync` was broadened to OR the leader check with a scan
across known manage-class flags.

This means the "pod manage page" isn't an admin destination. It's a
capability index — same place for everyone, different contents
depending on what you hold.

## How a new feature fits in

When you add a new pod-scoped feature, ask:

1. **Is this feature gated by a module toggle?** If yes, you're
   probably looking at an add-on or paid feature. If no, it's core.
2. **What permissions does the feature need?** Usually two: an access
   flag for "can use" and a manage flag for "can configure / mutate."
   Some features only need one.
3. **How do those flags get onto roles?** Add a sync block in
   `modules/route.ts` for the module toggle, following the password
   vault pattern. Default the manage flag to leader roles; default the
   access flag to all roles (or leave as-is, depending on the
   feature).
4. **Where does the UI for that feature live?** Three options:
   - **Inside an existing global route** (e.g. forum, chat) with the
     pod scope passed via query/state. The permission flag gates UI
     elements inline.
   - **As a pod-tab** (e.g. Passwords) when the feature is fundamentally
     pod-scoped and benefits from a dedicated surface.
   - **As a modules-tab subsection** when the feature is purely
     configuration that lives alongside the toggle.

The default choice is "pod-tab if it's something members of the pod
will use day-to-day; modules-tab subsection if it's setup only."

## What didn't change

Some things look like they should fit this pattern but don't, and
that's intentional:

- **Chat, Forum, Knowledge Base, Events, Bounties, Marketplace,
  Governance** — these are *core* features and they have their own
  global routes with pod-scoped views. They don't need a per-pod tab
  on the management page. Their access flags still gate inline UI
  inside the global routes.
- **`treasuryViewing` vs. `treasuryManagement`** — kept as separate
  flags because they govern semantically different actions (read vs.
  write). The Treasury tab is visible to either; the panel inside
  hides write controls when only viewing.
- **Subscription billing** — managed by a separate code path, not by
  the permission model. Even a non-leader with `agentManage` can't
  pause the agent's subscription. This is intentional: spend authority
  belongs to leaders.

## Operator guidance

### Adding a new add-on module

1. Add the column to `pod_modules` schema and the module entry in
   `PodModulesManager`'s `ADDON_MODULES` array.
2. Add the access/manage permission flags to the `HatPermissions`
   interface in `hatPermissionsService.ts` as optional booleans.
3. Add a sync block in `src/app/api/pods/[id]/modules/route.ts`
   following the `passwords_enabled` example: iterate
   `pod_role_permissions` for the pod, set the flags based on
   `role_type === 'leader'`.
4. Add the permission definitions to the catalog in
   `UnifiedMembershipManager.tsx`'s `ADD_ON_GROUPS`. The group only
   renders when `moduleFlags.<module>_enabled` is true.
5. If the feature has a tab in `PodManagementContainer`, add the case
   to `TabContent`, the entry to the `tabs` array in `TabNavigation`,
   and the relevant `canManage*` flag to `usePodManagementState`.

### Adding a new paid module

Same as add-on, but the flag goes into `PAID_GROUPS` in the editor.
Confirm that billing actions are gated outside the permission model —
typically by a `pod_leads` check, not the `*Manage` flag.

### Debugging "the permission isn't working"

Most reports of this fall into one of three buckets:

1. **The flag was never in the editor.** A flag in `HatPermissions`
   doesn't auto-appear in the editor; it must be added to the catalog
   in `UnifiedMembershipManager`. Pre-May 2026 this was the most
   common failure mode.
2. **The module is off.** The flag is hidden in the editor and zeroed
   on all roles. Enable the module first.
3. **The tab uses the wrong gate.** Check the corresponding case in
   `PodManagementContainer`'s `TabContent` — gates that use
   `canManageMembers` instead of the specific `*Manage` flag won't
   surface for non-leader role holders. The May 2026 refactor fixed
   the known cases; new tabs should use the specific flag.

## File map for future contributors

| File | Role |
|---|---|
| `src/services/hatPermissionsService.ts` | `HatPermissions` interface — single source of truth for flag names |
| `src/features/pods/services/PodRolePermissionsService.ts` | Default-role templates |
| `src/services/DatabaseFirstPermissionService.ts` | Loads memberships + per-role permission JSON |
| `src/hooks/useDatabaseFirstPermissions.ts` | `canManagePodSync` (gear-icon visibility) |
| `src/hooks/useHybridPodPermission.ts` | Per-flag check with on-chain hat verification + DB |
| `src/features/pods/hooks/usePodManagementState.ts` | Per-tab capability resolution |
| `src/features/pods/components/PodManagementContainer.tsx` | Tab bar + dispatcher |
| `src/features/pods/components/UnifiedMembershipManager.tsx` | Permission catalog + editor UI |
| `src/app/api/pods/[id]/modules/route.ts` | Module toggle sync blocks |
| `src/features/pods/components/PodCard.tsx` | Gear icon visibility |

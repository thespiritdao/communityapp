/**
 * Server-side credential scope for bounty creation.
 *
 * Mirrors the browser's useBountyManagementAccess + useCredentialOptions: a
 * creator may gate a bounty only on credentials issued by communities they
 * can manage. "Manage" = the pod has the bounties module enabled AND the
 * creator holds a role there whose permissions include bountyManagement (a
 * leader with no role row gets the leader defaults, as in useHatPermissions).
 *
 * Used by /api/bounty/create to reject gates the form would never offer.
 */

import {
  EXECUTIVE_POD_ID,
  normalizeHatId,
} from '@/features/bounty/lib/eligibility';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BountyScope {
  /** Pods the creator can manage bounties for. */
  podIds: Set<string>;
  /** Normalised (decimal) hat ids of every role defined by those pods. */
  roleHatIds: Set<string>;
  /** Lower-cased contract addresses of tokens those pods own (+ DAO-level if allowed). */
  tokenAddresses: Set<string>;
  /** Events organised by those pods (uuids). */
  eventIds: Set<string>;
  /** Courses (knowledge categories with is_course) run by those pods. */
  courseIds: Set<string>;
  /** Executive Pod managers may gate on DAO-level tokens. */
  allowDaoLevel: boolean;
}

export async function loadBountyScope(
  supabase: SupabaseClient,
  wallet: string,
): Promise<BountyScope> {
  const w = wallet.toLowerCase();
  const scope: BountyScope = {
    podIds: new Set(),
    roleHatIds: new Set(),
    tokenAddresses: new Set(),
    eventIds: new Set(),
    courseIds: new Set(),
    allowDaoLevel: false,
  };

  const { data: memberships } = await supabase
    .from('active_pod_members')
    .select('pod_id, hat_id, membership_type')
    .eq('wallet', w)
    .eq('is_active', true);
  if (!memberships || memberships.length === 0) {
    return scope;
  }

  const candidatePodIds = Array.from(
    new Set(memberships.map((m) => m.pod_id).filter(Boolean)),
  );

  const [modulesRes, rolesRes] = await Promise.all([
    supabase
      .from('pod_modules')
      .select('pod_id, bounties_enabled')
      .in('pod_id', candidatePodIds),
    supabase
      .from('pod_role_permissions')
      .select('pod_id, token_address, permissions, is_active')
      .in('pod_id', candidatePodIds),
  ]);
  const bountiesOn = new Set(
    (modulesRes.data ?? [])
      .filter((m) => m.bounties_enabled)
      .map((m) => m.pod_id),
  );

  type RoleRow = {
    pod_id: string;
    token_address: string | null;
    permissions: unknown;
    is_active: boolean | null;
  };
  const roleRows = (rolesRes.data ?? []) as RoleRow[];
  const permissionFor = (podId: string, hatId: string): boolean | null => {
    const row = roleRows.find(
      (r) => r.pod_id === podId && normalizeHatId(r.token_address) === hatId,
    );
    if (!row) {
      return null;
    }
    let perms: unknown = row.permissions;
    if (typeof perms === 'string') {
      try {
        perms = JSON.parse(perms);
      } catch {
        perms = null;
      }
    }
    return Boolean(
      (perms as { bountyManagement?: unknown } | null)?.bountyManagement ===
        true,
    );
  };

  for (const m of memberships) {
    if (!m.pod_id || !bountiesOn.has(m.pod_id)) {
      continue;
    }
    const hat = normalizeHatId(m.hat_id);
    const fromRole = hat ? permissionFor(m.pod_id, hat) : null;
    // No role row → leader defaults (bountyManagement: isLeader).
    const canManage =
      fromRole === null ? m.membership_type === 'leader' : fromRole;
    if (canManage) {
      scope.podIds.add(m.pod_id);
    }
  }
  if (scope.podIds.size === 0) {
    return scope;
  }

  scope.allowDaoLevel = scope.podIds.has(EXECUTIVE_POD_ID);
  const managed = Array.from(scope.podIds);

  // Roles issued by managed pods (not just the creator's own memberships).
  const { data: allRoles } = await supabase
    .from('pod_role_permissions')
    .select('pod_id, token_address, is_active')
    .in('pod_id', managed);
  for (const r of allRoles ?? []) {
    if (r.is_active === false) {
      continue;
    }
    const hat = normalizeHatId(r.token_address);
    if (hat) {
      scope.roleHatIds.add(hat);
    }
  }

  let tokensQuery = supabase
    .from('tokens')
    .select('contract_address, owner_pod_id')
    .eq('is_active', true);
  tokensQuery = scope.allowDaoLevel
    ? tokensQuery.or(
        `owner_pod_id.in.(${managed.join(',')}),owner_pod_id.is.null`,
      )
    : tokensQuery.in('owner_pod_id', managed);
  const [{ data: tokens }, { data: events }, { data: courses }] = await Promise.all([
    tokensQuery,
    supabase
      .from('events')
      .select('id')
      .in('organizing_pod_id', managed)
      .in('status', ['published', 'completed']),
    supabase
      .from('knowledge_categories')
      .select('id')
      .in('pod_id', managed)
      .eq('is_course', true),
  ]);
  for (const k of courses ?? []) {
    if (k.id) {
      scope.courseIds.add(String(k.id));
    }
  }
  for (const t of tokens ?? []) {
    if (t.contract_address) {
      scope.tokenAddresses.add(String(t.contract_address).toLowerCase());
    }
  }
  for (const e of events ?? []) {
    if (e.id) {
      scope.eventIds.add(String(e.id));
    }
  }

  return scope;
}

export interface GateInput {
  kind: string;
  id: string;
  name: string;
  minBalance?: number;
}

/** Returns the first gate outside the creator's scope, or null if all are allowed. */
export function firstGateOutOfScope(
  gates: GateInput[],
  scope: BountyScope,
): GateInput | null {
  for (const g of gates) {
    const id = g.id.trim();
    if (g.kind === 'pod' && !scope.podIds.has(id)) {
      return g;
    }
    if (g.kind === 'hat' && !scope.roleHatIds.has(normalizeHatId(id))) {
      return g;
    }
    if (g.kind === 'event' && !scope.eventIds.has(id)) {
      return g;
    }
    if (g.kind === 'accreditation' && !scope.courseIds.has(id)) {
      return g;
    }
    if (
      (g.kind === 'erc20' || g.kind === 'erc721') &&
      !scope.tokenAddresses.has(id.toLowerCase())
    ) {
      return g;
    }
  }
  return null;
}

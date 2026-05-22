// Per-pod governance configuration: voter base, quorum %, approval %,
// voting period per tier. NULL in the DB = "use platform default" —
// null-coalesced at read time so existing pods continue to behave as
// they did before.
//
// Voter base (Path B, 2026-05-22):
//   'all_members' (default) → every active pod member with
//      governanceParticipation=true on their role can vote
//   'leaders'              → narrowed to pod_members.membership_type
//      IN ('leader','admin') with governanceParticipation=true
//
// Permission hierarchy: per-role governanceParticipation is the
// highest-order signal. If a user has that permission OFF, they
// cannot vote regardless of voter_base. The voter_base setting
// determines the maximum reachable audience; the role permission
// is the per-user gate into it.

import { supabase } from '@/utils/supabaseClient';
import type {
  GovernanceTier,
  ResolvedThresholds,
} from '@/features/governance/services/proposalResultEngine';
import {
  APPROVAL_CEIL_BPS,
  APPROVAL_FLOOR_BPS,
  QUORUM_CEIL_BPS,
  QUORUM_FLOOR_BPS,
} from '@/features/governance/services/proposalResultEngine';

export const VOTING_HOURS_FLOOR = 12;
export const VOTING_HOURS_CEIL = 720;

export type VoterBase = 'leaders' | 'all_members';

export interface TierConfig extends ResolvedThresholds {
  voter_base: VoterBase;
}

export const PLATFORM_DEFAULTS: Record<
  'POD_OPERATIONAL' | 'POD_TREASURY_BINDING',
  TierConfig
> = {
  POD_OPERATIONAL: {
    quorum_bps: 3000, // 30%
    approval_bps: 5001, // 50%+1
    voting_hours: 72,
    voter_base: 'all_members',
  },
  POD_TREASURY_BINDING: {
    quorum_bps: 5000, // 50%
    approval_bps: 6600, // 66%
    voting_hours: 72,
    voter_base: 'all_members',
  },
};

export interface PodGovernanceConfig {
  operational: TierConfig;
  treasury: TierConfig;
}

interface PodGovColumns {
  gov_op_quorum_bps: number | null;
  gov_op_approval_bps: number | null;
  gov_op_voting_hours: number | null;
  gov_op_voter_base: VoterBase | null;
  gov_treasury_quorum_bps: number | null;
  gov_treasury_approval_bps: number | null;
  gov_treasury_voting_hours: number | null;
  gov_treasury_voter_base: VoterBase | null;
}

function coalesce(
  stored: Partial<TierConfig>,
  defaults: TierConfig,
): TierConfig {
  return {
    quorum_bps: stored.quorum_bps ?? defaults.quorum_bps,
    approval_bps: stored.approval_bps ?? defaults.approval_bps,
    voting_hours: stored.voting_hours ?? defaults.voting_hours,
    voter_base: stored.voter_base ?? defaults.voter_base,
  };
}

export async function getPodGovernanceConfig(
  podId: string,
): Promise<PodGovernanceConfig> {
  const { data, error } = await supabase
    .from('pods')
    .select(
      'gov_op_quorum_bps, gov_op_approval_bps, gov_op_voting_hours, gov_op_voter_base, gov_treasury_quorum_bps, gov_treasury_approval_bps, gov_treasury_voting_hours, gov_treasury_voter_base',
    )
    .eq('id', podId)
    .maybeSingle();

  if (error) {
    console.error('getPodGovernanceConfig: read failed, using platform defaults', error);
    return {
      operational: { ...PLATFORM_DEFAULTS.POD_OPERATIONAL },
      treasury: { ...PLATFORM_DEFAULTS.POD_TREASURY_BINDING },
    };
  }

  const row = (data ?? {}) as Partial<PodGovColumns>;
  return {
    operational: coalesce(
      {
        quorum_bps: row.gov_op_quorum_bps ?? undefined,
        approval_bps: row.gov_op_approval_bps ?? undefined,
        voting_hours: row.gov_op_voting_hours ?? undefined,
        voter_base: row.gov_op_voter_base ?? undefined,
      },
      PLATFORM_DEFAULTS.POD_OPERATIONAL,
    ),
    treasury: coalesce(
      {
        quorum_bps: row.gov_treasury_quorum_bps ?? undefined,
        approval_bps: row.gov_treasury_approval_bps ?? undefined,
        voting_hours: row.gov_treasury_voting_hours ?? undefined,
        voter_base: row.gov_treasury_voter_base ?? undefined,
      },
      PLATFORM_DEFAULTS.POD_TREASURY_BINDING,
    ),
  };
}

export function getThresholdsForTier(
  config: PodGovernanceConfig,
  tier: GovernanceTier,
): ResolvedThresholds {
  if (tier === 'POD_TREASURY_BINDING') return config.treasury;
  // DAO_CONSTITUTIONAL is on-chain; if a caller asks for it we return
  // operational defaults so nothing crashes, but no code path should hit this.
  return config.operational;
}

export function getVoterBaseForTier(
  config: PodGovernanceConfig,
  tier: GovernanceTier,
): VoterBase {
  if (tier === 'POD_TREASURY_BINDING') return config.treasury.voter_base;
  return config.operational.voter_base;
}

export interface UpdatePartial {
  quorum_bps?: number | null;
  approval_bps?: number | null;
  voting_hours?: number | null;
  voter_base?: VoterBase | null;
}

function validate(partial: UpdatePartial): void {
  if (
    partial.quorum_bps != null &&
    (partial.quorum_bps < QUORUM_FLOOR_BPS ||
      partial.quorum_bps > QUORUM_CEIL_BPS)
  ) {
    throw new Error(
      `quorum_bps ${partial.quorum_bps} outside allowed range ${QUORUM_FLOOR_BPS}–${QUORUM_CEIL_BPS}`,
    );
  }
  if (
    partial.approval_bps != null &&
    (partial.approval_bps < APPROVAL_FLOOR_BPS ||
      partial.approval_bps > APPROVAL_CEIL_BPS)
  ) {
    throw new Error(
      `approval_bps ${partial.approval_bps} outside allowed range ${APPROVAL_FLOOR_BPS}–${APPROVAL_CEIL_BPS}`,
    );
  }
  if (
    partial.voting_hours != null &&
    (partial.voting_hours < VOTING_HOURS_FLOOR ||
      partial.voting_hours > VOTING_HOURS_CEIL)
  ) {
    throw new Error(
      `voting_hours ${partial.voting_hours} outside allowed range ${VOTING_HOURS_FLOOR}–${VOTING_HOURS_CEIL}`,
    );
  }
  if (
    partial.voter_base != null &&
    partial.voter_base !== 'leaders' &&
    partial.voter_base !== 'all_members'
  ) {
    throw new Error(
      `voter_base must be 'leaders' or 'all_members'; got ${partial.voter_base}`,
    );
  }
}

export async function updatePodGovernanceConfig(
  podId: string,
  tier: 'POD_OPERATIONAL' | 'POD_TREASURY_BINDING',
  partial: UpdatePartial,
): Promise<void> {
  validate(partial);

  const prefix = tier === 'POD_OPERATIONAL' ? 'gov_op_' : 'gov_treasury_';
  const update: Record<string, number | string | null> = {};
  if ('quorum_bps' in partial)
    update[`${prefix}quorum_bps`] = partial.quorum_bps ?? null;
  if ('approval_bps' in partial)
    update[`${prefix}approval_bps`] = partial.approval_bps ?? null;
  if ('voting_hours' in partial)
    update[`${prefix}voting_hours`] = partial.voting_hours ?? null;
  if ('voter_base' in partial)
    update[`${prefix}voter_base`] = partial.voter_base ?? null;

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from('pods')
    .update(update)
    .eq('id', podId);

  if (error) throw error;
}

/**
 * Return the wallet addresses of eligible voters for a tier on a pod,
 * honoring both the pod's voter_base setting and the per-role
 * governanceParticipation permission.
 *
 * Eligibility rules:
 *   1. Member must be in active_pod_members for this pod.
 *   2. Member's hat_id must be linked to a pod_role_permissions row with
 *      permissions->>'governanceParticipation' = 'true'.
 *   3. If voter_base = 'leaders', additionally membership_type must be
 *      'leader' or 'admin'.
 *
 * Rule 2 is the highest-order signal: a member with the permission OFF
 * cannot vote even if they're in the audience defined by voter_base.
 */
export async function getEligibleVoterWallets(
  podId: string,
  tier: GovernanceTier,
): Promise<string[]> {
  if (tier === 'DAO_CONSTITUTIONAL') return [];

  const config = await getPodGovernanceConfig(podId);
  const voterBase = getVoterBaseForTier(config, tier);

  // Fetch active members of this pod with their hat_id so we can join
  // to pod_role_permissions for the governanceParticipation check.
  let memberQuery = supabase
    .from('active_pod_members')
    .select('wallet, hat_id, membership_type')
    .eq('pod_id', podId);

  if (voterBase === 'leaders') {
    memberQuery = memberQuery.in('membership_type', ['leader', 'admin']);
  }

  const { data: members, error: memberError } = await memberQuery;
  if (memberError) {
    console.error('getEligibleVoterWallets: member query failed', memberError);
    return [];
  }
  if (!members || members.length === 0) return [];

  // Look up which hat_ids in this pod have governanceParticipation=true.
  const { data: roleRows, error: roleError } = await supabase
    .from('pod_role_permissions')
    .select('token_address, permissions, is_active')
    .eq('pod_id', podId)
    .eq('is_active', true);

  if (roleError) {
    console.error('getEligibleVoterWallets: role query failed', roleError);
    return [];
  }

  const permissionedHats = new Set(
    (roleRows ?? [])
      .filter(
        (r: any) => r?.permissions?.governanceParticipation === true,
      )
      .map((r: any) => String(r.token_address)),
  );

  return members
    .filter((m: any) => m.hat_id && permissionedHats.has(String(m.hat_id)))
    .map((m: any) => m.wallet)
    .filter(Boolean);
}

export async function getEligibleVoterCount(
  podId: string,
  tier: GovernanceTier,
): Promise<number> {
  const wallets = await getEligibleVoterWallets(podId, tier);
  return wallets.length;
}

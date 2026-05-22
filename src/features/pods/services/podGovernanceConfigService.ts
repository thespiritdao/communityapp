// Per-pod governance configuration: quorum %, approval %, voting period
// per tier. NULL in the DB = "use platform default" — null-coalesced at
// read time so existing pods continue to behave as they did before.

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

export const PLATFORM_DEFAULTS: Record<
  'POD_OPERATIONAL' | 'POD_TREASURY_BINDING',
  ResolvedThresholds
> = {
  POD_OPERATIONAL: {
    quorum_bps: 3000, // 30%
    approval_bps: 5001, // 50%+1
    voting_hours: 72,
  },
  POD_TREASURY_BINDING: {
    quorum_bps: 5000, // 50%
    approval_bps: 6600, // 66%
    voting_hours: 72,
  },
};

export interface PodGovernanceConfig {
  operational: ResolvedThresholds;
  treasury: ResolvedThresholds;
}

interface PodGovColumns {
  gov_op_quorum_bps: number | null;
  gov_op_approval_bps: number | null;
  gov_op_voting_hours: number | null;
  gov_treasury_quorum_bps: number | null;
  gov_treasury_approval_bps: number | null;
  gov_treasury_voting_hours: number | null;
}

function coalesce<T extends ResolvedThresholds>(
  stored: Partial<ResolvedThresholds>,
  defaults: T,
): ResolvedThresholds {
  return {
    quorum_bps: stored.quorum_bps ?? defaults.quorum_bps,
    approval_bps: stored.approval_bps ?? defaults.approval_bps,
    voting_hours: stored.voting_hours ?? defaults.voting_hours,
  };
}

export async function getPodGovernanceConfig(
  podId: string,
): Promise<PodGovernanceConfig> {
  const { data, error } = await supabase
    .from('pods')
    .select(
      'gov_op_quorum_bps, gov_op_approval_bps, gov_op_voting_hours, gov_treasury_quorum_bps, gov_treasury_approval_bps, gov_treasury_voting_hours',
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
      },
      PLATFORM_DEFAULTS.POD_OPERATIONAL,
    ),
    treasury: coalesce(
      {
        quorum_bps: row.gov_treasury_quorum_bps ?? undefined,
        approval_bps: row.gov_treasury_approval_bps ?? undefined,
        voting_hours: row.gov_treasury_voting_hours ?? undefined,
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

export interface UpdatePartial {
  quorum_bps?: number | null;
  approval_bps?: number | null;
  voting_hours?: number | null;
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
}

export async function updatePodGovernanceConfig(
  podId: string,
  tier: 'POD_OPERATIONAL' | 'POD_TREASURY_BINDING',
  partial: UpdatePartial,
): Promise<void> {
  validate(partial);

  const prefix = tier === 'POD_OPERATIONAL' ? 'gov_op_' : 'gov_treasury_';
  const update: Record<string, number | null> = {};
  if ('quorum_bps' in partial)
    update[`${prefix}quorum_bps`] = partial.quorum_bps ?? null;
  if ('approval_bps' in partial)
    update[`${prefix}approval_bps`] = partial.approval_bps ?? null;
  if ('voting_hours' in partial)
    update[`${prefix}voting_hours`] = partial.voting_hours ?? null;

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from('pods')
    .update(update)
    .eq('id', podId);

  if (error) throw error;
}

/**
 * Count eligible voters at the moment of proposal creation, used as the
 * quorum denominator. Snapshotted onto the proposal row so that mid-vote
 * membership churn does not move the bar.
 *
 * OPERATIONAL: managers only (pod_members.role='manager', status='active').
 * TREASURY_BINDING: all active pod members.
 */
/**
 * Return the wallet addresses of eligible voters for a tier. Mirrors
 * `getEligibleVoterCount` exactly so the recipient set of new-proposal
 * notifications matches the set of people who can actually vote.
 */
export async function getEligibleVoterWallets(
  podId: string,
  tier: GovernanceTier,
): Promise<string[]> {
  if (tier === 'DAO_CONSTITUTIONAL') return [];

  let query = supabase
    .from('pod_members')
    .select('wallet_address')
    .eq('pod_id', podId)
    .eq('status', 'active');

  if (tier === 'POD_OPERATIONAL') {
    query = query.eq('role', 'manager');
  }

  const { data, error } = await query;
  if (error) {
    console.error('getEligibleVoterWallets failed', error);
    return [];
  }
  return (data ?? [])
    .map((row: any) => row.wallet_address)
    .filter(Boolean);
}

export async function getEligibleVoterCount(
  podId: string,
  tier: GovernanceTier,
): Promise<number> {
  if (tier === 'DAO_CONSTITUTIONAL') return 0;

  let query = supabase
    .from('pod_members')
    .select('wallet_address', { count: 'exact', head: true })
    .eq('pod_id', podId)
    .eq('status', 'active');

  if (tier === 'POD_OPERATIONAL') {
    query = query.eq('role', 'manager');
  }

  const { count, error } = await query;
  if (error) {
    console.error('getEligibleVoterCount failed', error);
    return 0;
  }
  return count ?? 0;
}

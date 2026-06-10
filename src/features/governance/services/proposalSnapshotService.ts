/**
 * Per-proposal token eligibility snapshots ("Option 2" for token-gated pods).
 *
 * When a pod opts in (pods.gov_snapshot_enabled + token + minimum), every new
 * pod-level proposal captures, at publication time, each eligible voter's
 * qualifying token amount (on-chain held balance + Hydrex-staked, when the
 * token is $TGN and the Hydrex source is enabled). Voting on that proposal
 * then additionally requires a passing snapshot row.
 *
 * This is NOT token-weighted voting: tallying stays 1-person-1-vote and the
 * role/hat requirement still applies. The snapshot only adds "…and you must
 * hold the threshold at publication time" on top.
 *
 * Enforcement keys off the existence of snapshot rows for a proposal, not the
 * pod's current config — so flipping the config never retroactively changes
 * who may vote on in-flight proposals.
 *
 * Failure policy: snapshot capture is all-or-nothing. If any balance read or
 * the Hydrex source fails, proposal creation aborts rather than silently
 * publishing an un-gated (or partially gated) proposal for a pod that opted
 * into snapshot integrity.
 */

import { supabase } from '@/utils/supabaseClient';
import { getEligibleVoterWallets } from '@/features/pods/services/podGovernanceConfigService';
import {
  HYDREX_STAKING_ENABLED,
  TGN_TOKEN_ADDRESS,
  fetchQualifyingStakedTgn,
} from '@/features/pods/services/hydrexStakingService';
import type { GovernanceTier } from '@/features/governance/services/proposalResultEngine';

export interface PodSnapshotConfig {
  enabled: boolean;
  tokenId: string;
  minimum: number;
}

export interface SnapshotRow {
  wallet: string;
  held_amount: number;
  staked_amount: number;
  total_amount: number;
  passed: boolean;
}

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const BALANCE_BATCH_SIZE = 5;

/**
 * Read the pod's snapshot config. Returns null unless the feature is fully
 * configured (enabled + token + positive minimum) — partially configured pods
 * behave exactly as before.
 */
export async function getPodSnapshotConfig(
  podId: string,
): Promise<PodSnapshotConfig | null> {
  const { data, error } = await supabase
    .from('pods')
    .select('gov_snapshot_enabled, gov_snapshot_token_id, gov_snapshot_minimum')
    .eq('id', podId)
    .maybeSingle();

  if (error) {
    // Read failure must not silently disable an integrity feature; but it
    // also must not block pods that never opted in. Failing closed here would
    // break every pod on a transient read error, so log and treat as not
    // configured — the capture path re-reads nothing from this helper.
    console.error('getPodSnapshotConfig: read failed', error);
    return null;
  }

  const minimum = Number(data?.gov_snapshot_minimum ?? 0);
  if (
    data?.gov_snapshot_enabled !== true ||
    !data?.gov_snapshot_token_id ||
    !(minimum > 0)
  ) {
    return null;
  }
  return {
    enabled: true,
    tokenId: String(data.gov_snapshot_token_id),
    minimum,
  };
}

/**
 * Compute snapshot rows for every wallet eligible to vote on this pod/tier.
 * Throws on any read failure (all-or-nothing — see module header).
 */
export async function computeEligibilitySnapshot(
  podId: string,
  tier: GovernanceTier,
  config: PodSnapshotConfig,
): Promise<SnapshotRow[]> {
  const { data: token, error: tokenError } = await supabase
    .from('tokens')
    .select('id, name, contract_address, decimals, token_type, is_active')
    .eq('id', config.tokenId)
    .maybeSingle();

  if (tokenError || !token) {
    throw new Error(
      `Snapshot token '${config.tokenId}' not found in token registry.`,
    );
  }
  if (token.token_type !== 'erc20' || token.is_active !== true) {
    throw new Error(
      `Snapshot token '${config.tokenId}' is not an active registered ERC-20.`,
    );
  }

  const wallets = await getEligibleVoterWallets(podId, tier);
  if (wallets.length === 0) return [];

  const { createPublicClient, http } = await import('viem');
  const { base } = await import('viem/chains');
  const publicClient = createPublicClient({ chain: base, transport: http() });

  const decimals = typeof token.decimals === 'number' ? token.decimals : 18;
  const includeStaked =
    HYDREX_STAKING_ENABLED &&
    String(token.contract_address).toLowerCase() ===
      TGN_TOKEN_ADDRESS.toLowerCase();

  const rows: SnapshotRow[] = [];
  for (let i = 0; i < wallets.length; i += BALANCE_BATCH_SIZE) {
    const batch = wallets.slice(i, i + BALANCE_BATCH_SIZE);
    const batchRows = await Promise.all(
      batch.map(async (wallet): Promise<SnapshotRow> => {
        const rawHeld = await publicClient.readContract({
          address: token.contract_address as `0x${string}`,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [wallet as `0x${string}`],
        });
        const held = Number(rawHeld) / 10 ** decimals;

        let staked = 0;
        if (includeStaked) {
          const stake = await fetchQualifyingStakedTgn(wallet);
          if (!stake.resolved) {
            throw new Error(
              `Hydrex staked balance unavailable for ${wallet}: ${stake.details}`,
            );
          }
          staked = stake.qualifyingTgn;
        }

        const total = held + staked;
        return {
          wallet: wallet.toLowerCase(),
          held_amount: held,
          staked_amount: staked,
          total_amount: total,
          passed: total >= config.minimum,
        };
      }),
    );
    rows.push(...batchRows);
  }
  return rows;
}

/** Persist snapshot rows for a created proposal. Throws on failure. */
export async function persistSnapshot(
  proposalId: string,
  podId: string,
  config: PodSnapshotConfig,
  rows: SnapshotRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('proposal_eligibility_snapshots').insert(
    rows.map((r) => ({
      proposal_id: proposalId,
      pod_id: podId,
      token_id: config.tokenId,
      minimum_required: config.minimum,
      ...r,
    })),
  );
  if (error) {
    throw new Error(`Failed to persist eligibility snapshot: ${error.message}`);
  }
}

/**
 * Check whether a wallet may vote on a proposal under the snapshot rule.
 * `enforced` is false when the proposal has no snapshot (pre-existing
 * proposals and pods that never opted in) — callers skip the check entirely.
 */
export async function checkSnapshotEligibility(
  proposalId: string,
  wallet: string,
): Promise<{ enforced: boolean; passed: boolean; details: string }> {
  const { data, error } = await supabase
    .from('proposal_eligibility_snapshots')
    .select('wallet, passed, minimum_required, total_amount')
    .eq('proposal_id', proposalId);

  if (error) {
    // Fail closed only when we know a snapshot should exist — we can't know
    // that here, so a read error blocks the vote with a retryable message
    // rather than waving it through.
    throw new Error(`Snapshot eligibility check failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    return { enforced: false, passed: true, details: 'No snapshot for this proposal.' };
  }

  const row = data.find(
    (r: any) => String(r.wallet).toLowerCase() === wallet.toLowerCase(),
  );
  if (!row) {
    return {
      enforced: true,
      passed: false,
      details:
        'You were not an eligible voter when this proposal was published.',
    };
  }
  return {
    enforced: true,
    passed: row.passed === true,
    details: row.passed
      ? 'Snapshot eligibility met.'
      : `This proposal requires ${row.minimum_required} qualifying tokens at publication time; you held ${Number(row.total_amount).toFixed(2)}.`,
  };
}

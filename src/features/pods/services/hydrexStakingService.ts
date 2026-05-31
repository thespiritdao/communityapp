/**
 * Hydrex staking eligibility source — STUB, DISABLED BY DEFAULT.
 *
 * TreeGens members stake $TGN on Hydrex.Fi; the staked position is used as the
 * governance snapshot. This service is the seam for reading a wallet's qualifying
 * $TGN from Hydrex so it can serve as an alternative eligibility source alongside
 * direct on-chain balance.
 *
 * IMPORTANT — why this is a stub and NOT enabled:
 *   The Hydrex endpoint below returns LP-POOL positions, not a clean per-wallet
 *   *staked* $TGN figure. LP exposure (a USDC+TGN / AZUSD+TGN pair) is
 *   price-sensitive and subject to impermanent loss, which is semantically
 *   different from "staked 2K $TGN as a governance snapshot". Before enabling
 *   this source we must confirm with Hydrex which number is the governance
 *   snapshot (a dedicated staked balance vs. decomposing the TGN reserve of an
 *   LP position). See docs/treegens-integration.md → "Hydrex" open item.
 *
 * Activation later is: finish `fetchQualifyingStakedTgn` against the confirmed
 * endpoint shape and set HYDREX_STAKING_ENABLED — no eligibility re-architecture.
 *
 * This is an OFF-CHAIN HTTP read; it can only feed the server-side DB eligibility
 * evaluator (EligibilityService), never an on-chain contract check.
 */

// Master kill switch. Keep false until the Hydrex snapshot semantics are confirmed.
export const HYDREX_STAKING_ENABLED = false;

// Hydrex liquidity API (historical pool positions).
// Docs: https://liquidity.api.hydrex.fi/docs#/historical/HistoricalPositionsController_getPoolPositionsTimeRange
export const HYDREX_API_BASE = 'https://liquidity.api.hydrex.fi';

// Known $TGN pools on Hydrex (Base). The TGN side of these positions is the
// candidate signal for staking-based eligibility.
export const HYDREX_TGN_POOLS = {
  AZUSD_TGN: '0x30816a9e6572407a83ba5fd18e145d9dd81540f5',
  USDC_TGN: '0x38564ddf10fe9941139f92d6ccdde2e094b83603',
} as const;

export interface HydrexStakeResult {
  /** Human-readable qualifying $TGN attributed to the wallet across known pools. */
  qualifyingTgn: number;
  /** True when a real value was fetched; false when the source is disabled/unavailable. */
  resolved: boolean;
  details: string;
}

/**
 * Fetch a wallet's qualifying staked/LP $TGN from Hydrex.
 *
 * STUB: returns unresolved (qualifyingTgn 0) while disabled. When enabled, this
 * will query getPoolPositionsTimeRange for HYDREX_TGN_POOLS and sum the wallet's
 * TGN-side amount per the snapshot semantics confirmed with Hydrex.
 */
export async function fetchQualifyingStakedTgn(
  walletAddress: string,
): Promise<HydrexStakeResult> {
  if (!HYDREX_STAKING_ENABLED) {
    return {
      qualifyingTgn: 0,
      resolved: false,
      details: 'Hydrex staking source is disabled (pending snapshot confirmation).',
    };
  }

  // TODO (enable later): fetch getPoolPositionsTimeRange for each pool in
  // HYDREX_TGN_POOLS, filter to `walletAddress`, decompose the position into its
  // TGN reserve per confirmed snapshot semantics, and sum across pools.
  // Intentionally not implemented while disabled.
  void walletAddress;
  return {
    qualifyingTgn: 0,
    resolved: false,
    details: 'Hydrex staking fetch not yet implemented.',
  };
}

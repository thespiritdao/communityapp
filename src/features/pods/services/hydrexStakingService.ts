/**
 * Hydrex staking eligibility source.
 *
 * TreeGens members "stake" $TGN by holding LP positions in Hydrex's two TGN
 * pools on Base (confirmed with Hydrex 2026-06: there is no separate TGN
 * staking contract — the LP position, including single-sided/ICHI-vault
 * deposits, IS the staked position). This service reads a wallet's qualifying
 * $TGN from Hydrex's public liquidity API so staked tokens can count toward
 * governance eligibility without unstaking.
 *
 * Data source: GET {HYDREX_API_BASE}/positions/user/{address}
 * Verified response shape (live, 2026-06-10): positionsByPool[] groups with
 * tokens.token0/token1 metadata (id = contract address) and positions[] each
 * carrying owner, amounts.{token0,token1} (human units) and
 * valuesUSD.{token0,token1,total}. ICHI-vault positions are expanded to the
 * depositor's wallet with their share of the underlying amounts.
 *
 * This is an OFF-CHAIN HTTP read; it can only feed the server-side DB
 * eligibility evaluator (EligibilityService) and the proposal snapshot layer,
 * never an on-chain contract check.
 */

// Master kill switch. Enables both criterion evaluation (EligibilityService)
// and the staking option in the criteria-builder UI.
export const HYDREX_STAKING_ENABLED =
  process.env.NEXT_PUBLIC_HYDREX_STAKING_ENABLED === 'true';

// Hydrex liquidity API (public, CORS *).
// Docs: https://liquidity.api.hydrex.fi/docs
export const HYDREX_API_BASE = 'https://liquidity.api.hydrex.fi';

// $TGN on Base — must match the registered `tokens` row used for gating.
export const TGN_TOKEN_ADDRESS =
  '0xd75dfa972c6136f1c594fec1945302f885e1ab29';

// Known $TGN pools on Hydrex (Base). Only positions in these pools qualify.
export const HYDREX_TGN_POOLS = {
  AZUSD_TGN: '0x30816a9e6572407a83ba5fd18e145d9dd81540f5',
  USDC_TGN: '0x38564ddf10fe9941139f92d6ccdde2e094b83603',
} as const;

/**
 * How a concentrated-liquidity position converts to "staked $TGN":
 *  - 'tgn_side'            → the literal TGN amount currently in the position.
 *                            Fluctuates with price; an in-range deposit can
 *                            drift below threshold with no member action.
 *  - 'total_value_in_tgn'  → the position's full value (both sides) expressed
 *                            in TGN at current price. Stable against pool
 *                            rebalancing; recommended and default.
 * Pending final confirmation from TreeGens — switch here if they choose the
 * literal reading.
 */
export type HydrexValuationMode = 'tgn_side' | 'total_value_in_tgn';
export const HYDREX_VALUATION_MODE: HydrexValuationMode = 'total_value_in_tgn';

export interface HydrexStakeResult {
  /** Qualifying $TGN per HYDREX_VALUATION_MODE (human units). */
  qualifyingTgn: number;
  /** Literal TGN side of the wallet's positions across qualifying pools. */
  tgnSideTgn: number;
  /** Full position value across qualifying pools, expressed in TGN. */
  totalValueTgn: number;
  /** True when a real value was fetched; false when disabled/unavailable. */
  resolved: boolean;
  details: string;
}

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Fetch a wallet's qualifying staked/LP $TGN from Hydrex.
 *
 * Fails closed: any network/parse error returns resolved:false so callers
 * never treat an outage as "0 staked, criterion failed" vs. "source down" —
 * EligibilityService surfaces the details, and the snapshot layer aborts.
 */
export async function fetchQualifyingStakedTgn(
  walletAddress: string,
): Promise<HydrexStakeResult> {
  if (!HYDREX_STAKING_ENABLED) {
    return {
      qualifyingTgn: 0,
      tgnSideTgn: 0,
      totalValueTgn: 0,
      resolved: false,
      details: 'Hydrex staking source is disabled.',
    };
  }

  try {
    const res = await fetch(
      `${HYDREX_API_BASE}/positions/user/${walletAddress}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) {
      return {
        qualifyingTgn: 0,
        tgnSideTgn: 0,
        totalValueTgn: 0,
        resolved: false,
        details: `Hydrex API returned ${res.status}.`,
      };
    }
    const data = await res.json();

    const qualifyingPools = new Set(
      Object.values(HYDREX_TGN_POOLS).map((a) => a.toLowerCase()),
    );
    const tgnAddress = TGN_TOKEN_ADDRESS.toLowerCase();

    let tgnSideTgn = 0;
    let tgnSideUsd = 0;
    let totalUsd = 0;

    for (const group of data?.positionsByPool ?? []) {
      if (!qualifyingPools.has(String(group?.poolId ?? '').toLowerCase())) {
        continue;
      }
      // Identify which side of this pool is TGN by contract address — never
      // assume token ordering.
      let tgnKey: 'token0' | 'token1' | null = null;
      if (group?.tokens?.token0?.id?.toLowerCase() === tgnAddress) {
        tgnKey = 'token0';
      } else if (group?.tokens?.token1?.id?.toLowerCase() === tgnAddress) {
        tgnKey = 'token1';
      }
      if (!tgnKey) continue;

      for (const pos of group?.positions ?? []) {
        tgnSideTgn += Number(pos?.amounts?.[tgnKey] ?? 0) || 0;
        tgnSideUsd += Number(pos?.valuesUSD?.[tgnKey] ?? 0) || 0;
        totalUsd += Number(pos?.valuesUSD?.total ?? 0) || 0;
      }
    }

    // TGN price derived from the positions themselves (USD value of the TGN
    // side / TGN amount). If no position holds any TGN (fully out of range on
    // the stable side), we cannot price the conversion — fall back to the
    // literal TGN side rather than guessing.
    const tgnPriceUsd = tgnSideTgn > 0 ? tgnSideUsd / tgnSideTgn : 0;
    const totalValueTgn =
      tgnPriceUsd > 0 ? totalUsd / tgnPriceUsd : tgnSideTgn;

    const qualifyingTgn =
      HYDREX_VALUATION_MODE === 'total_value_in_tgn'
        ? totalValueTgn
        : tgnSideTgn;

    return {
      qualifyingTgn,
      tgnSideTgn,
      totalValueTgn,
      resolved: true,
      details: `Hydrex: ${tgnSideTgn.toFixed(2)} TGN-side, ${totalValueTgn.toFixed(2)} TGN total value across ${qualifyingPools.size} pools (mode: ${HYDREX_VALUATION_MODE}).`,
    };
  } catch (error) {
    return {
      qualifyingTgn: 0,
      tgnSideTgn: 0,
      totalValueTgn: 0,
      resolved: false,
      details: `Hydrex API unreachable: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

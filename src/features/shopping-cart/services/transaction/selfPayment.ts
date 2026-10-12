// src/features/shopping-cart/services/transaction/selfPayment.ts
// $SELF burn-to-pay for the marketplace (V2 soulbound).
//
// V2 $SELF is ERC-1155 with per-epoch ids + linear decay, so it cannot be paid
// through PurchaseRouter (which expects an ERC-20 amount). Instead we call
// SelfPaymentV2.payWithSelf(listingCommunity, productId, requiredHours, ids[],
// amounts[]). The contract credits Σ amounts[i] × recognitionWeight × decay; we
// only ever spend SAME-community ids (weight = 100%), so weighted value per id
// is rawAmount × decayBps / 10000.
//
// Selection is greedy newest-epoch first (highest decay factor = least raw $SELF
// burned to cover the price). 1 $SELF = 1 hour = 1e18 wei; price_self of N means
// N hours → requiredHours = N × 1e18.

import { getAuthHeaders } from '@/lib/authHeaders';

const selfPaymentABI = require('src/abis/SelfPaymentV2.json');

const BPS = 10_000n;
const BPS_SQ = BPS * BPS;
const HOUR = 10n ** 18n;

const SELF_PAYMENT = process.env.NEXT_PUBLIC_SELF_PAYMENT as
  | `0x${string}`
  | undefined;

export interface SelfHolding {
  id: string;         // token id (uint256, decimal string)
  community: string;  // uint224 decimal string
  epoch: number;
  rawWei: string;     // raw balance for this id (decimal string)
  decayBps: number;   // current decay factor in bps (0..10000)
  weightBps: number;  // recognition weight vs listing community (0..10000)
}

/** One id selected for burning, with the raw amount + the value it credits. */
export interface SelectedLeg {
  id: string;
  community: string;
  epoch: number;
  rawWei: string;     // raw $SELF burned from this id
  decayBps: number;
  weightBps: number;
  /** Credited (weighted) value this leg contributes, wei (1e18 = 1h). */
  creditedWei: string;
}

export interface SelfPaymentSelection {
  ids: bigint[];
  amounts: bigint[];
  /** Total credited (weighted×decayed) value the selection covers, wei. */
  creditedWei: bigint;
  /** Total raw $SELF burned, wei. */
  rawBurnedWei: bigint;
  /** Per-leg breakdown for the confirmation modal. */
  legs: SelectedLeg[];
  /** True if any cross-community (weight < 100%) id was used. */
  usesCrossCommunity: boolean;
}

/**
 * Greedily select ids/amounts so the CREDITED value (raw × weight × decay)
 * covers `requiredHoursWei`. Best holdings first: highest recognition weight,
 * then newest epoch (least decayed) — i.e. spend full-value same-community
 * $SELF before discounted cross-community $SELF. Returns null if the wallet's
 * accepted $SELF is insufficient.
 */
// Over-select margin (basis points) to absorb decay drift between the holdings
// snapshot and on-chain inclusion. The buyer reads a confirmation modal and the
// tx takes a block to land, during which decay keeps dropping; selecting amounts
// that exactly cover requiredHours leaves zero slack and the contract reverts
// ("underpaid"). ~1% headroom eliminates the vast majority of failed burns at
// the cost of a marginally larger burn only when drift actually occurs.
const SELECTION_MARGIN_BPS = 100n; // 1%

export function selectSelfIds(
  holdings: SelfHolding[],
  requiredHoursWei: bigint,
): SelfPaymentSelection | null {
  if (requiredHoursWei <= 0n) return null;

  // Select against a slightly inflated target so the burn has headroom against
  // decay drift. The true requiredHours is still what the contract enforces.
  const selectionTarget =
    (requiredHoursWei * (BPS + SELECTION_MARGIN_BPS)) / BPS;

  // Best-first: full-weight & freshest spent before discounted/older.
  const sorted = [...holdings].sort(
    (a, b) => b.weightBps - a.weightBps || b.epoch - a.epoch,
  );

  const ids: bigint[] = [];
  const amounts: bigint[] = [];
  const legs: SelectedLeg[] = [];
  let credited = 0n;
  let rawBurned = 0n;
  let usesCrossCommunity = false;

  for (const h of sorted) {
    if (credited >= selectionTarget) break;
    const decay = BigInt(h.decayBps);
    const weight = BigInt(h.weightBps);
    const rawBal = BigInt(h.rawWei);
    if (decay <= 0n || weight <= 0n || rawBal <= 0n) continue;

    const remaining = selectionTarget - credited;

    // credited(raw) = raw × weight × decay / BPS². To contribute `remaining`
    // we need raw = ceil(remaining × BPS² / (weight × decay)). Cap at balance;
    // round UP so integer truncation never under-pays.
    const denom = weight * decay;
    const neededRaw = (remaining * BPS_SQ + denom - 1n) / denom;
    const useRaw = neededRaw <= rawBal ? neededRaw : rawBal;
    if (useRaw <= 0n) continue;

    const legCredited = (useRaw * denom) / BPS_SQ;
    ids.push(BigInt(h.id));
    amounts.push(useRaw);
    credited += legCredited;
    rawBurned += useRaw;
    if (weight < BPS) usesCrossCommunity = true;
    legs.push({
      id: h.id,
      community: h.community,
      epoch: h.epoch,
      rawWei: useRaw.toString(),
      decayBps: h.decayBps,
      weightBps: h.weightBps,
      creditedWei: legCredited.toString(),
    });
  }

  // Fail only if we can't cover the TRUE requirement. The margin is best-effort
  // headroom: if the wallet has enough for requiredHours but not the full +1%,
  // still proceed (better to attempt than to block a payable purchase).
  if (credited < requiredHoursWei) return null; // insufficient accepted $SELF
  return { ids, amounts, creditedWei: credited, rawBurnedWei: rawBurned, legs, usesCrossCommunity };
}

/**
 * Fetch the wallet's same-community $SELF holdings and build the payWithSelf
 * call for a purchase. Returns null if $SELF payment isn't configured or the
 * wallet lacks sufficient same-community $SELF.
 *
 * @param walletAddress buyer wallet
 * @param listingCommunity uint224 communityId of the product's pod
 * @param productId product id string passed to the receipt
 * @param priceSelfHours product price_self in HOURS (e.g. 2 → 2 $SELF)
 */
export interface SelfPaymentCall {
  call: {
    address: `0x${string}`;
    abi: any;
    functionName: string;
    args: any[];
  };
  selection: SelfPaymentSelection;
  requiredHoursWei: bigint;
}

/** price_self is denominated in HOURS; 1 hour = 1e18 wei. */
export function priceSelfToWei(priceSelfHours: number): bigint {
  return (BigInt(Math.round(priceSelfHours * 100)) * HOUR) / 100n;
}

export async function buildSelfPaymentCall(args: {
  walletAddress: string;
  listingCommunity: bigint;
  productId: string;
  priceSelfHours: number;
}): Promise<SelfPaymentCall | null> {
  if (!SELF_PAYMENT) {
    console.error('[selfPayment] NEXT_PUBLIC_SELF_PAYMENT not configured');
    return null;
  }
  if (!args.priceSelfHours || args.priceSelfHours <= 0) return null;

  const requiredHoursWei = priceSelfToWei(args.priceSelfHours);

  const res = await fetch(
    `/api/self/holdings?wallet=${args.walletAddress}` +
      `&community=${args.listingCommunity.toString()}&detail=1`,
    { headers: await getAuthHeaders() },
  );
  if (!res.ok) {
    console.error('[selfPayment] holdings fetch failed:', res.status);
    return null;
  }
  const data = await res.json();
  const holdings: SelfHolding[] = data?.holdings ?? [];

  const selection = selectSelfIds(holdings, requiredHoursWei);
  if (!selection) {
    console.error('[selfPayment] insufficient accepted $SELF', {
      requiredHoursWei: requiredHoursWei.toString(),
      have: holdings,
    });
    return null;
  }

  return {
    call: {
      address: SELF_PAYMENT,
      abi: selfPaymentABI,
      functionName: 'payWithSelf',
      args: [
        args.listingCommunity.toString(),
        args.productId,
        requiredHoursWei.toString(),
        selection.ids.map((i) => i.toString()),
        selection.amounts.map((a) => a.toString()),
      ],
    },
    selection,
    requiredHoursWei,
  };
}

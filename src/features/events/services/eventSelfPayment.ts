// src/features/events/services/eventSelfPayment.ts
// $SELF burn-to-pay for EVENT tickets (soulbound V2).
//
// EventManagerV2 doesn't transfer $SELF (it can't — soulbound). Instead the
// attendee BURNS $SELF via SelfPaymentV2.payWithSelf (productId == eventId),
// which mints a SelfReceipt, then registers with registerForEvent(eventId,
// receiptId). This is a TWO-STEP, SEQUENTIAL flow: register needs the receiptId
// that only exists after the burn executes, so they can't be one batched userOp.
//
// Reuses the marketplace burn-id selection (buildSelfPaymentCall) — same
// payWithSelf semantics, productId = eventId.

import { decodeEventLog } from 'viem';
import { podToCommunityId } from '@/features/self/lib/communityId';
import { buildSelfPaymentCall } from '@/features/shopping-cart/services/transaction/selfPayment';

const selfPaymentABI = require('src/abis/SelfPaymentV2.json');

const SELF_PAYMENT = process.env.NEXT_PUBLIC_SELF_PAYMENT?.toLowerCase();

export interface EventSelfBurn {
  /** The payWithSelf call to send (encode + sendUserOperation). */
  call: { address: `0x${string}`; abi: any; functionName: string; args: any[] };
  /** Total raw $SELF that will be burned (wei), for UI display. */
  rawBurnedWei: bigint;
}

/**
 * Build the payWithSelf burn call for a $SELF-priced event ticket.
 * @param walletAddress attendee
 * @param podId         the event's community pod (fund_recipient_pod_id /
 *                      organizing_pod_id) — derives listingCommunity
 * @param eventId       on-chain event id (== SelfReceipt productId)
 * @param priceSelfHours ticket price in $SELF hours (1 = 1 $SELF)
 * Returns null if not configured or the attendee lacks enough $SELF.
 */
export async function buildEventSelfBurn(args: {
  walletAddress: string;
  podId: string;
  eventId: string;
  priceSelfHours: number;
}): Promise<EventSelfBurn | null> {
  if (!args.podId) {
    console.error('[eventSelfPayment] event has no pod — cannot derive community');
    return null;
  }
  const listingCommunity = podToCommunityId(args.podId);

  const result = await buildSelfPaymentCall({
    walletAddress: args.walletAddress,
    listingCommunity,
    productId: args.eventId,
    priceSelfHours: args.priceSelfHours,
  });
  if (!result) return null;

  return { call: result.call, rawBurnedWei: result.selection.rawBurnedWei };
}

/**
 * Extract the minted SelfReceipt id from a payWithSelf transaction receipt by
 * decoding the PaidWithSelf event. Returns null if not found.
 */
export function extractReceiptId(logs: readonly any[]): bigint | null {
  for (const log of logs) {
    if (SELF_PAYMENT && log.address?.toLowerCase() !== SELF_PAYMENT) continue;
    try {
      const decoded = decodeEventLog({
        abi: selfPaymentABI,
        data: log.data,
        topics: log.topics,
      }) as { eventName: string; args: Record<string, any> };
      if (decoded.eventName === 'PaidWithSelf') {
        return decoded.args.receiptId as bigint;
      }
    } catch {
      // not a PaidWithSelf log — skip
    }
  }
  return null;
}

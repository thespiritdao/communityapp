'use client';

// Shared $SELF burn-to-pay flow for both checkout UIs (Cart.tsx and
// TransactionFlow.tsx). Owns: deriving the listing community from the product's
// pod, fetching holdings + building the payWithSelf call, and the confirmation
// modal state. Keeps the per-component send/encode loops untouched — they just
// feed the returned call into their existing userOp path.

import { useCallback, useState } from 'react';
import { podToCommunityId } from '@/features/self/lib/communityId';
import {
  buildSelfPaymentCall,
  type SelfPaymentCall,
} from '../services/transaction/selfPayment';
import type { ICartProduct } from '../models';

export interface PreparedSelfPayment extends SelfPaymentCall {
  priceSelfHours: number;
}

interface UseSelfPaymentFlow {
  /** The prepared call + selection, set once prepare() succeeds (drives modal). */
  prepared: PreparedSelfPayment | null;
  preparing: boolean;
  error: string | null;
  /**
   * Build the payWithSelf call for the cart. Returns the prepared payment, or
   * null if not payable in $SELF (no pod, insufficient $SELF, not configured).
   * On success `prepared` is also set so the confirmation modal can render.
   */
  prepare: (
    products: ICartProduct[],
    walletAddress: string,
  ) => Promise<PreparedSelfPayment | null>;
  clear: () => void;
}

export function isSelfPayment(tokenSymbol?: string): boolean {
  return tokenSymbol === '$SELF';
}

export function useSelfPaymentFlow(): UseSelfPaymentFlow {
  const [prepared, setPrepared] = useState<PreparedSelfPayment | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepare = useCallback(
    async (products: ICartProduct[], walletAddress: string) => {
      setPreparing(true);
      setError(null);
      try {
        const podId = products[0]?.pod_id;
        if (!podId) {
          throw new Error(
            'This item has no community, so it can’t be paid in $SELF.',
          );
        }
        // All cart items must share one community (single payWithSelf call).
        const mixed = products.some((p) => p.pod_id && p.pod_id !== podId);
        if (mixed) {
          throw new Error(
            'Your cart mixes items from different communities; pay for them separately to use $SELF.',
          );
        }

        const listingCommunity = podToCommunityId(podId);
        const priceSelfHours = products.reduce(
          (sum, p) =>
            sum + (Number((p as any).price_self) || 0) * (p.quantity || 1),
          0,
        );
        const productId = products.map((p) => p.id).join(',');

        const result = await buildSelfPaymentCall({
          walletAddress,
          listingCommunity,
          productId,
          priceSelfHours,
        });
        if (!result) {
          throw new Error('You don’t have enough $SELF for this purchase.');
        }

        const out: PreparedSelfPayment = { ...result, priceSelfHours };
        setPrepared(out);
        return out;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to prepare $SELF payment');
        setPrepared(null);
        return null;
      } finally {
        setPreparing(false);
      }
    },
    [],
  );

  const clear = useCallback(() => {
    setPrepared(null);
    setError(null);
  }, []);

  return { prepared, preparing, error, prepare, clear };
}

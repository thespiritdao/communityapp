// src/features/shopping-cart/hooks/useCartCalculations.ts
import { useMemo } from 'react';
import { parseUnits } from 'ethers';
import type { ICartProduct } from '../models';

export interface Token {
  address: string;
  chainId: number;
  decimals: number;
  image: string;
  name: string;
  symbol: string;
}

export interface CartCalculations {
  systemApprovalAmount: bigint;
  selfApprovalAmount: bigint;
  totalSystemPrice: number;
  totalSelfPrice: number;
  selectedTokenAmount: bigint;
  selectedTokenPrice: number;
}

/**
 * Converts a number to BigInt token amount with 18 decimals
 * CRITICAL: This function must match the exact logic from Cart.tsx
 */
function formatTokenAmount(amount: number): bigint {
  if (isNaN(amount) || amount < 0) {
    throw new Error('Invalid amount: must be a non-negative number');
  }
  // Explicitly handle zero to avoid any precision issues
  if (amount === 0) {
    return BigInt(0);
  }
  // Convert to string with fixed precision to avoid floating point issues
  const amountStr = amount.toFixed(18);
  return parseUnits(amountStr, 18);
}

/**
 * Hook to calculate cart totals and approval amounts
 *
 * IMPORTANT: This hook extracts the exact calculation logic from Cart.tsx
 * without changing any behavior. All calculations must remain identical.
 */
export const useCartCalculations = (
  products: ICartProduct[],
  selectedToken: Token,
  total?: { totalSystemPrice?: number; totalSelfPrice?: number },
): CartCalculations => {
  return useMemo(() => {
    // Extract totals from cart context (same as original)
    const totalSystemPrice = total?.totalSystemPrice ?? 0;
    const totalSelfPrice = total?.totalSelfPrice ?? 0;

    // Calculate approval amounts based on selected token for single-token payment
    // CRITICAL: This logic must match Cart.tsx exactly
    const systemApprovalAmount =
      selectedToken.symbol === '$SYSTEM'
        ? formatTokenAmount(totalSystemPrice)
        : BigInt(0);
    const selfApprovalAmount =
      selectedToken.symbol === '$SELF'
        ? formatTokenAmount(totalSelfPrice)
        : BigInt(0);

    // Additional derived calculations
    const selectedTokenAmount =
      selectedToken.symbol === '$SYSTEM'
        ? systemApprovalAmount
        : selfApprovalAmount;
    const selectedTokenPrice =
      selectedToken.symbol === '$SYSTEM' ? totalSystemPrice : totalSelfPrice;

    return {
      systemApprovalAmount,
      selfApprovalAmount,
      totalSystemPrice,
      totalSelfPrice,
      selectedTokenAmount,
      selectedTokenPrice,
    };
  }, [products, selectedToken, total?.totalSystemPrice, total?.totalSelfPrice]);
};

/**
 * Hook for debugging cart calculations
 * Extracts the debug logging logic from Cart.tsx
 */
export const useCartCalculationsDebug = (
  calculations: CartCalculations,
  selectedToken: Token,
  products: ICartProduct[],
) => {
  useMemo(() => {
    console.log('🔍 Cart Amount Debug:', {
      selectedToken: selectedToken.symbol,
      totalSystemPrice: calculations.totalSystemPrice,
      totalSelfPrice: calculations.totalSelfPrice,
      systemApprovalAmount: calculations.systemApprovalAmount.toString(),
      selfApprovalAmount: calculations.selfApprovalAmount.toString(),
      systemIsZero: calculations.systemApprovalAmount === BigInt(0),
      selfIsZero: calculations.selfApprovalAmount === BigInt(0),
      singleTokenLogic: {
        payingWithSystem: selectedToken.symbol === '$SYSTEM',
        payingWithSelf: selectedToken.symbol === '$SELF',
        expectedSystemAmount:
          selectedToken.symbol === '$SYSTEM'
            ? calculations.totalSystemPrice
            : 0,
        expectedSelfAmount:
          selectedToken.symbol === '$SELF' ? calculations.totalSelfPrice : 0,
      },
      products: products?.map((p) => ({
        id: p.id,
        name: p.name,
        price_system: p.price_system,
        price_self: p.price_self,
        quantity: p.quantity,
      })),
    });
  }, [calculations, selectedToken, products]);
};

"use client";

import { memo, useMemo } from "react";
import styled from "styled-components";
import formatPrice from "@/utils/formatPrice";
import type { ICartTotal } from "../../../models";

const SummaryContainer = styled.div`
  padding: 1rem;
  background: #f8f9fa;
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
  margin: 0.5rem 0;
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.25rem 0;
  
  &.total {
    border-top: 1px solid #ddd;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    font-weight: 600;
    font-size: 1.1rem;
  }
`;

const TokenLabel = styled.span`
  font-size: 0.9rem;
  color: #666;
  
  &.system {
    color: #0066cc;
  }
  
  &.self {
    color: #00aa44;
  }
`;

const PriceValue = styled.span`
  font-weight: 500;
  
  &.system {
    color: #0066cc;
  }
  
  &.self {
    color: #00aa44;
  }
`;

const ItemCount = styled.div`
  font-size: 0.8rem;
  color: #666;
  margin-bottom: 0.5rem;
`;

interface CartSummaryProps {
  total: ICartTotal | undefined;
  productCount: number;
}

/**
 * CartSummary - Optimized cart totals display
 * - Memoized price calculations
 * - Real-time updates
 * - Clear token breakdown
 */
const CartSummary = memo(({ total, productCount }: CartSummaryProps) => {
  // Memoize calculations to prevent unnecessary re-computation
  const calculations = useMemo(() => {
    const systemTotal = total?.totalSystemPrice ?? 0;
    const selfTotal = total?.totalSelfPrice ?? 0;
    const hasSystemPrice = systemTotal > 0;
    const hasSelfPrice = selfTotal > 0;
    
    return {
      systemTotal,
      selfTotal,
      hasSystemPrice,
      hasSelfPrice,
      itemCount: total?.productQuantity ?? productCount,
      grandTotal: systemTotal + selfTotal
    };
  }, [total, productCount]);

  if (calculations.itemCount === 0) {
    return null;
  }

  return (
    <SummaryContainer>
      <ItemCount>
        {calculations.itemCount} item{calculations.itemCount !== 1 ? 's' : ''} in cart
      </ItemCount>

      {calculations.hasSystemPrice && (
        <SummaryRow>
          <TokenLabel className="system">$SYSTEM Total:</TokenLabel>
          <PriceValue className="system">
            {formatPrice(calculations.systemTotal, "$")}
          </PriceValue>
        </SummaryRow>
      )}

      {calculations.hasSelfPrice && (
        <SummaryRow>
          <TokenLabel className="self">$SELF Total:</TokenLabel>
          <PriceValue className="self">
            {formatPrice(calculations.selfTotal, "$")}
          </PriceValue>
        </SummaryRow>
      )}

      {calculations.hasSystemPrice && calculations.hasSelfPrice && (
        <SummaryRow className="total">
          <span>Combined Value:</span>
          <span>{formatPrice(calculations.grandTotal, "$")}</span>
        </SummaryRow>
      )}

      {!calculations.hasSystemPrice && !calculations.hasSelfPrice && (
        <SummaryRow>
          <TokenLabel>Total:</TokenLabel>
          <PriceValue>Free</PriceValue>
        </SummaryRow>
      )}
    </SummaryContainer>
  );
});

CartSummary.displayName = 'CartSummary';

export default CartSummary;
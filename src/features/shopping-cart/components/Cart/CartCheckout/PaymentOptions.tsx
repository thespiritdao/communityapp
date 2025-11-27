'use client';

import { memo, useMemo } from 'react';
import styled from 'styled-components';
import formatPrice from '@/utils/formatPrice';
import type { Token } from './CartCheckout';

const OptionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const PaymentOption = styled.button<{
  isRecommended?: boolean;
  hasInsufficientBalance?: boolean;
  disabled?: boolean;
}>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border: 2px solid ${(props) =>
    props.hasInsufficientBalance
      ? '#dc3545'
      : props.isRecommended
        ? '#007bff'
        : '#e0e0e0'};
  border-radius: 8px;
  background: ${(props) =>
    props.hasInsufficientBalance
      ? '#fff5f5'
      : props.isRecommended
        ? '#f0f8ff'
        : 'white'};
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  transition: all 0.2s ease;
  opacity: ${(props) => (props.disabled ? 0.6 : 1)};
  
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
  }
  
  &:disabled {
    cursor: not-allowed;
  }
`;

const TokenInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const TokenIcon = styled.img`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f0f0f0;
`;

const TokenDetails = styled.div`
  text-align: left;
`;

const TokenName = styled.div`
  font-weight: 600;
  color: #333;
  font-size: 0.9rem;
`;

const TokenBalance = styled.div<{ hasInsufficientBalance?: boolean }>`
  font-size: 0.75rem;
  color: ${(props) => (props.hasInsufficientBalance ? '#dc3545' : '#666')};
`;

const PriceInfo = styled.div`
  text-align: right;
`;

const Price = styled.div`
  font-weight: 600;
  color: #333;
  font-size: 0.9rem;
`;

const PriceSubtext = styled.div`
  font-size: 0.75rem;
  color: #666;
`;

const RecommendedBadge = styled.span`
  background: #007bff;
  color: white;
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 500;
  margin-left: 0.5rem;
`;

const BASE_CHAIN_ID = 8453;

const tokenOptions: Token[] = [
  {
    name: '$SYSTEM',
    address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN!,
    symbol: '$SYSTEM',
    decimals: 18,
    image: '/logos/systemlogo.jpg',
    chainId: BASE_CHAIN_ID,
  },
  {
    name: '$SELF',
    address: process.env.NEXT_PUBLIC_SELF_TOKEN!,
    symbol: '$SELF',
    decimals: 18,
    image: '/logos/Self.jpg',
    chainId: BASE_CHAIN_ID,
  },
];

interface PaymentOptionsProps {
  totalSystemPrice: number;
  totalSelfPrice: number;
  tokenBalances: {
    systemBalance: string;
    selfBalance: string;
  };
  onTokenSelect: (token: Token) => void;
  disabled?: boolean;
}

/**
 * PaymentOptions - Token selection with balance checking
 * - Shows available payment methods
 * - Indicates insufficient balances
 * - Recommends optimal payment method
 */
const PaymentOptions = memo(
  ({
    totalSystemPrice,
    totalSelfPrice,
    tokenBalances,
    onTokenSelect,
    disabled = false,
  }: PaymentOptionsProps) => {
    // Memoize payment calculations
    const paymentAnalysis = useMemo(() => {
      const systemBalance = Number.parseFloat(
        tokenBalances.systemBalance || '0',
      );
      const selfBalance = Number.parseFloat(tokenBalances.selfBalance || '0');

      const canPayWithSystem =
        totalSystemPrice > 0 && systemBalance >= totalSystemPrice;
      const canPayWithSelf =
        totalSelfPrice > 0 && selfBalance >= totalSelfPrice;

      const systemInsufficientBalance =
        totalSystemPrice > 0 && systemBalance < totalSystemPrice;
      const selfInsufficientBalance =
        totalSelfPrice > 0 && selfBalance < totalSelfPrice;

      // Determine recommended payment method
      let recommendedToken: string | null = null;
      if (canPayWithSystem && canPayWithSelf) {
        // Both available - recommend the one with smaller required amount
        recommendedToken =
          totalSystemPrice <= totalSelfPrice ? '$SYSTEM' : '$SELF';
      } else if (canPayWithSystem) {
        recommendedToken = '$SYSTEM';
      } else if (canPayWithSelf) {
        recommendedToken = '$SELF';
      }

      return {
        systemBalance,
        selfBalance,
        canPayWithSystem,
        canPayWithSelf,
        systemInsufficientBalance,
        selfInsufficientBalance,
        recommendedToken,
        hasAnyValidPayment: canPayWithSystem || canPayWithSelf,
      };
    }, [tokenBalances, totalSystemPrice, totalSelfPrice]);

    if (totalSystemPrice === 0 && totalSelfPrice === 0) {
      return (
        <div
          style={{
            padding: '1rem',
            textAlign: 'center',
            color: '#666',
            background: '#f8f9fa',
            borderRadius: '8px',
          }}
        >
          This order is free! Click continue to proceed.
        </div>
      );
    }

    return (
      <OptionsContainer>
        {/* System Token Option */}
        {totalSystemPrice > 0 && (
          <PaymentOption
            isRecommended={paymentAnalysis.recommendedToken === '$SYSTEM'}
            hasInsufficientBalance={paymentAnalysis.systemInsufficientBalance}
            disabled={disabled || paymentAnalysis.systemInsufficientBalance}
            onClick={() =>
              !disabled &&
              !paymentAnalysis.systemInsufficientBalance &&
              onTokenSelect(tokenOptions[0])
            }
          >
            <TokenInfo>
              <TokenIcon src="/logos/systemlogo.jpg" alt="$SYSTEM" />
              <TokenDetails>
                <TokenName>
                  $SYSTEM
                  {paymentAnalysis.recommendedToken === '$SYSTEM' && (
                    <RecommendedBadge>Recommended</RecommendedBadge>
                  )}
                </TokenName>
                <TokenBalance
                  hasInsufficientBalance={
                    paymentAnalysis.systemInsufficientBalance
                  }
                >
                  Balance: {formatPrice(paymentAnalysis.systemBalance, '$')}
                  {paymentAnalysis.systemInsufficientBalance &&
                    ' (Insufficient)'}
                </TokenBalance>
              </TokenDetails>
            </TokenInfo>
            <PriceInfo>
              <Price>{formatPrice(totalSystemPrice, '$')}</Price>
              <PriceSubtext>Required</PriceSubtext>
            </PriceInfo>
          </PaymentOption>
        )}

        {/* Self Token Option */}
        {totalSelfPrice > 0 && (
          <PaymentOption
            isRecommended={paymentAnalysis.recommendedToken === '$SELF'}
            hasInsufficientBalance={paymentAnalysis.selfInsufficientBalance}
            disabled={disabled || paymentAnalysis.selfInsufficientBalance}
            onClick={() =>
              !disabled &&
              !paymentAnalysis.selfInsufficientBalance &&
              onTokenSelect(tokenOptions[1])
            }
          >
            <TokenInfo>
              <TokenIcon src="/logos/Self.jpg" alt="$SELF" />
              <TokenDetails>
                <TokenName>
                  $SELF
                  {paymentAnalysis.recommendedToken === '$SELF' && (
                    <RecommendedBadge>Recommended</RecommendedBadge>
                  )}
                </TokenName>
                <TokenBalance
                  hasInsufficientBalance={
                    paymentAnalysis.selfInsufficientBalance
                  }
                >
                  Balance: {formatPrice(paymentAnalysis.selfBalance, '$')}
                  {paymentAnalysis.selfInsufficientBalance && ' (Insufficient)'}
                </TokenBalance>
              </TokenDetails>
            </TokenInfo>
            <PriceInfo>
              <Price>{formatPrice(totalSelfPrice, '$')}</Price>
              <PriceSubtext>Required</PriceSubtext>
            </PriceInfo>
          </PaymentOption>
        )}

        {!paymentAnalysis.hasAnyValidPayment && (
          <div
            style={{
              padding: '1rem',
              textAlign: 'center',
              color: '#dc3545',
              background: '#fff5f5',
              borderRadius: '8px',
              border: '1px solid #dc3545',
            }}
          >
            <strong>Insufficient Balance</strong>
            <br />
            <small>
              Please add funds to your wallet to complete this purchase.
            </small>
          </div>
        )}
      </OptionsContainer>
    );
  },
);

PaymentOptions.displayName = 'PaymentOptions';

export default PaymentOptions;

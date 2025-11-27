'use client';

import { memo, useState, useCallback, lazy, Suspense } from 'react';
import styled from 'styled-components';
import type { ICartProduct, ICartTotal } from '../../../models';

// Lazy load heavy checkout components
const PaymentOptions = lazy(() => import('./PaymentOptions'));
const TransactionFlow = lazy(() => import('./TransactionFlow'));

const CheckoutContainer = styled.div`
  padding: 1rem;
  background: white;
  border-top: 2px solid #f0f0f0;
`;

const CheckoutStep = styled.div<{ isActive: boolean }>`
  opacity: ${(props) => (props.isActive ? 1 : 0.6)};
  transition: opacity 0.2s ease;
  margin-bottom: 1rem;
`;

const StepHeader = styled.h3`
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: #333;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const StepNumber = styled.span`
  background: #007bff;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: bold;
`;

const LoadingSkeleton = styled.div`
  background: #f0f0f0;
  border-radius: 4px;
  height: 100px;
  animation: pulse 1.5s ease-in-out infinite;
  
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
`;

export interface Token {
  address: string;
  chainId: number;
  decimals: number;
  image: string;
  name: string;
  symbol: string;
}

interface CartCheckoutProps {
  products: ICartProduct[];
  total: ICartTotal | undefined;
  tokenBalances: {
    systemBalance: string;
    selfBalance: string;
  };
  userAddress: string;
}

/**
 * CartCheckout - Modular checkout flow
 * - Lazy loads heavy transaction components
 * - Step-by-step checkout process
 * - Optimized for performance
 */
const CartCheckout = memo(
  ({ products, total, tokenBalances, userAddress }: CartCheckoutProps) => {
    const [currentStep, setCurrentStep] = useState<'payment' | 'transaction'>(
      'payment',
    );
    const [selectedToken, setSelectedToken] = useState<Token | null>(null);

    const handlePaymentSelection = useCallback((token: Token) => {
      setSelectedToken(token);
      setCurrentStep('transaction');
    }, []);

    const handleBackToPayment = useCallback(() => {
      setCurrentStep('payment');
    }, []);

    const totalSystemPrice = total?.totalSystemPrice ?? 0;
    const totalSelfPrice = total?.totalSelfPrice ?? 0;

    return (
      <CheckoutContainer>
        {/* Step 1: Payment Method Selection */}
        <CheckoutStep isActive={currentStep === 'payment'}>
          <StepHeader>
            <StepNumber>1</StepNumber>
            Select Payment Method
          </StepHeader>

          <Suspense fallback={<LoadingSkeleton />}>
            <PaymentOptions
              totalSystemPrice={totalSystemPrice}
              totalSelfPrice={totalSelfPrice}
              tokenBalances={tokenBalances}
              onTokenSelect={handlePaymentSelection}
              disabled={currentStep !== 'payment'}
            />
          </Suspense>
        </CheckoutStep>

        {/* Step 2: Transaction Processing */}
        {selectedToken && (
          <CheckoutStep isActive={currentStep === 'transaction'}>
            <StepHeader>
              <StepNumber>2</StepNumber>
              Complete Purchase
            </StepHeader>

            <Suspense fallback={<LoadingSkeleton />}>
              <TransactionFlow
                products={products}
                selectedToken={selectedToken}
                totalSystemPrice={totalSystemPrice}
                totalSelfPrice={totalSelfPrice}
                userAddress={userAddress}
                onBack={handleBackToPayment}
              />
            </Suspense>
          </CheckoutStep>
        )}
      </CheckoutContainer>
    );
  },
);

CartCheckout.displayName = 'CartCheckout';

export default CartCheckout;

"use client";

import { memo, useState, useCallback, useEffect, lazy, Suspense } from "react";
import { usePublicClient } from "wagmi";
import styled from "styled-components";
import type { ICartProduct } from "../../../models";
import type { Token } from "./CartCheckout";

// Lazy load OnchainKit transaction components
const Transaction = lazy(() => import("@coinbase/onchainkit/transaction").then(m => ({ default: m.Transaction })));
const TransactionButton = lazy(() => import("@coinbase/onchainkit/transaction").then(m => ({ default: m.TransactionButton })));
const TransactionSponsor = lazy(() => import("@coinbase/onchainkit/transaction").then(m => ({ default: m.TransactionSponsor })));
const TransactionStatus = lazy(() => import("@coinbase/onchainkit/transaction").then(m => ({ default: m.TransactionStatus })));
const TransactionStatusLabel = lazy(() => import("@coinbase/onchainkit/transaction").then(m => ({ default: m.TransactionStatusLabel })));
const TransactionStatusAction = lazy(() => import("@coinbase/onchainkit/transaction").then(m => ({ default: m.TransactionStatusAction })));

// Import optimized transaction services
import {
  checkTokenAllowances,
  needsTokenApproval,
  buildApprovalCalls,
  type TokenAllowances,
  type ApprovalConfig
} from '../../../services/transaction/tokenApproval';

import {
  validatePaymasterSetup,
  buildPurchaseCall
} from '../../../services/transaction/purchaseRouter';

import {
  processAllOrders
} from '../../../services/transaction/orderCreation';

import {
  formatTokenAmount,
  logTransactionError
} from '../../../services/transaction/transactionStatus';

const TransactionContainer = styled.div`
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
`;

const BackButton = styled.button`
  background: none;
  border: none;
  color: #007bff;
  cursor: pointer;
  font-size: 0.8rem;
  margin-bottom: 1rem;
  padding: 0.25rem 0;
  
  &:hover {
    text-decoration: underline;
  }
`;

const TransactionStep = styled.div`
  margin-bottom: 1rem;
`;

const StepTitle = styled.h4`
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: #333;
`;

const AllowanceInfo = styled.div<{ needsApproval: boolean }>`
  padding: 0.75rem;
  background: ${props => props.needsApproval ? '#fff3cd' : '#d4edda'};
  border: 1px solid ${props => props.needsApproval ? '#ffeaa7' : '#c3e6cb'};
  border-radius: 4px;
  font-size: 0.8rem;
  margin-bottom: 1rem;
`;

const TransactionButtonStyled = styled.button`
  width: 100%;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background-color: #0056b3;
  }
  
  &:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
  }
`;

const LoadingSkeleton = styled.div`
  height: 120px;
  background: #e9ecef;
  border-radius: 4px;
  animation: pulse 1.5s ease-in-out infinite;
  
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
`;

const BASE_CHAIN_ID = 8453;

interface TransactionFlowProps {
  products: ICartProduct[];
  selectedToken: Token;
  totalSystemPrice: number;
  totalSelfPrice: number;
  userAddress: string;
  onBack: () => void;
}

/**
 * TransactionFlow - Optimized transaction processing
 * - Uses modular transaction services
 * - Lazy loads heavy OnchainKit components
 * - Handles approval and purchase in sequence
 */
const TransactionFlow = memo(({ 
  products, 
  selectedToken, 
  totalSystemPrice, 
  totalSelfPrice, 
  userAddress,
  onBack 
}: TransactionFlowProps) => {
  const publicClient = usePublicClient();
  
  const [allowances, setAllowances] = useState<TokenAllowances>({
    systemAllowance: 0n,
    selfAllowance: 0n,
    allowance: 0n
  });
  const [isLoadingAllowances, setIsLoadingAllowances] = useState(true);
  const [transactionState, setTransactionState] = useState<'preparing' | 'ready' | 'processing' | 'success' | 'error'>('preparing');

  // Calculate approval amounts
  const systemApprovalAmount = selectedToken.symbol === "$SYSTEM" ? formatTokenAmount(totalSystemPrice) : 0n;
  const selfApprovalAmount = selectedToken.symbol === "$SELF" ? formatTokenAmount(totalSelfPrice) : 0n;

  // Check allowances on mount
  useEffect(() => {
    const checkAllowances = async () => {
      if (!publicClient) return;
      
      setIsLoadingAllowances(true);
      try {
        const { contractAddress, isDecentralized } = validatePaymasterSetup();
        
        const config: ApprovalConfig = {
          tokenSymbol: selectedToken.symbol,
          systemApprovalAmount,
          selfApprovalAmount,
          contractAddress,
          isDecentralized
        };
        
        const allowanceData = await checkTokenAllowances(userAddress, publicClient, config);
        setAllowances(allowanceData);
        setTransactionState('ready');
      } catch (error) {
        console.error('Error checking allowances:', error);
        setTransactionState('error');
      } finally {
        setIsLoadingAllowances(false);
      }
    };

    checkAllowances();
  }, [publicClient, selectedToken, systemApprovalAmount, selfApprovalAmount, userAddress]);

  // Build transaction calls
  const buildTransactionCalls = useCallback(() => {
    try {
      const { contractAddress, isDecentralized } = validatePaymasterSetup();
      
      const config: ApprovalConfig = {
        tokenSymbol: selectedToken.symbol,
        systemApprovalAmount,
        selfApprovalAmount,
        contractAddress,
        isDecentralized
      };
      
      const { needsApproval } = needsTokenApproval(config, allowances);
      const approveCalls = needsApproval ? buildApprovalCalls(config, allowances) : [];
      
      const productId = products.map(p => p.id).join(",");
      const purchaseCalls = buildPurchaseCall({
        productId,
        selectedToken,
        systemAmount: systemApprovalAmount,
        selfAmount: selfApprovalAmount,
        address: userAddress,
        products,
        useFallbackRouting: false
      });
      
      return [...approveCalls, ...purchaseCalls];
    } catch (error) {
      logTransactionError(error);
      return [];
    }
  }, [selectedToken, systemApprovalAmount, selfApprovalAmount, allowances, products, userAddress]);

  // Handle transaction success
  const handleSuccess = useCallback(async (response: any) => {
    setTransactionState('success');
    
    try {
      await processAllOrders({
        products,
        address: userAddress,
        selectedToken,
        transactionHash: response?.transactionReceipts?.[0]?.transactionHash,
        receipt: response?.transactionReceipts?.[0]
      });
      
      // Navigate or close cart after delay
      setTimeout(() => {
        // This would typically clear cart and navigate
        console.log('Order processing complete');
      }, 2000);
    } catch (error) {
      console.error('Error processing orders:', error);
    }
  }, [products, userAddress, selectedToken]);

  // Handle transaction error
  const handleError = useCallback((error: any) => {
    console.error('Transaction error:', error);
    logTransactionError(error);
    setTransactionState('error');
  }, []);

  if (isLoadingAllowances) {
    return <LoadingSkeleton />;
  }

  const { contractAddress, isDecentralized } = validatePaymasterSetup();
  const config: ApprovalConfig = {
    tokenSymbol: selectedToken.symbol,
    systemApprovalAmount,
    selfApprovalAmount,
    contractAddress,
    isDecentralized
  };
  
  const { needsApproval } = needsTokenApproval(config, allowances);
  const calls = buildTransactionCalls();

  return (
    <TransactionContainer>
      <BackButton onClick={onBack}>
        ← Back to payment options
      </BackButton>

      <TransactionStep>
        <StepTitle>Payment Method: {selectedToken.symbol}</StepTitle>
        <AllowanceInfo needsApproval={needsApproval}>
          {needsApproval 
            ? `Token approval required for ${selectedToken.symbol}. This will be included in your transaction.`
            : `${selectedToken.symbol} is already approved for spending.`
          }
        </AllowanceInfo>
      </TransactionStep>

      <Suspense fallback={<LoadingSkeleton />}>
        <Transaction
          account={userAddress as `0x${string}`}
          chainId={BASE_CHAIN_ID}
          calls={calls}
          isSponsored={true}
          onSuccess={handleSuccess}
          onError={handleError}
        >
          <TransactionButtonStyled
            as={TransactionButton}
            text={
              transactionState === 'processing' ? "Processing..." :
              transactionState === 'success' ? "Success!" :
              transactionState === 'error' ? "Transaction Failed" :
              needsApproval ? "Approve & Purchase" : "Purchase"
            }
            disabled={transactionState === 'processing' || transactionState === 'success'}
          />
          
          <TransactionSponsor />
          <TransactionStatus>
            <TransactionStatusLabel />
            <TransactionStatusAction />
          </TransactionStatus>
        </Transaction>
      </Suspense>
    </TransactionContainer>
  );
});

TransactionFlow.displayName = 'TransactionFlow';

export default TransactionFlow;
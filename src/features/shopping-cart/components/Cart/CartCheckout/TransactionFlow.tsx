'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { useSendUserOperation, useCurrentUser, useEvmAddress } from '@coinbase/cdp-hooks';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import styled from 'styled-components';
import type { ICartProduct } from '../../../models';
import type { Token } from './CartCheckout';

// Import optimized transaction services
import {
  checkTokenAllowances,
  needsTokenApproval,
  buildApprovalCalls,
  type TokenAllowances,
  type ApprovalConfig,
} from '../../../services/transaction/tokenApproval';

import {
  validatePaymasterSetup,
  buildPurchaseCall,
} from '../../../services/transaction/purchaseRouter';

import { processAllOrders } from '../../../services/transaction/orderCreation';

import {
  formatTokenAmount,
  logTransactionError,
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
  background: ${(props) => (props.needsApproval ? '#fff3cd' : '#d4edda')};
  border: 1px solid ${(props) => (props.needsApproval ? '#ffeaa7' : '#c3e6cb')};
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
 * TransactionFlow - Optimized transaction processing using CDP
 * - Uses modular transaction services
 * - CDP Smart Account integration for gasless transactions
 * - Handles token approval and purchase in multi-call sequence
 */
const TransactionFlow = memo(
  ({
    products,
    selectedToken,
    totalSystemPrice,
    totalSelfPrice,
    userAddress,
    onBack,
  }: TransactionFlowProps) => {
    const publicClient = usePublicClient();
    const { evmAddress } = useEvmAddress();
    const { sendUserOperation } = useSendUserOperation();
    const { currentUser } = useCurrentUser();

    const [allowances, setAllowances] = useState<TokenAllowances>({
      systemAllowance: 0n,
      selfAllowance: 0n,
      allowance: 0n,
    });
    const [isLoadingAllowances, setIsLoadingAllowances] = useState(true);
    const [transactionState, setTransactionState] = useState<
      'preparing' | 'ready' | 'processing' | 'success' | 'error'
    >('preparing');
    const [isTransactionPending, setIsTransactionPending] = useState(false);

    // Calculate approval amounts
    const systemApprovalAmount =
      selectedToken.symbol === '$SYSTEM'
        ? formatTokenAmount(totalSystemPrice)
        : 0n;
    const selfApprovalAmount =
      selectedToken.symbol === '$SELF' ? formatTokenAmount(totalSelfPrice) : 0n;

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
            isDecentralized,
          };

          const allowanceData = await checkTokenAllowances(
            userAddress,
            publicClient,
            config,
          );
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
    }, [
      publicClient,
      selectedToken,
      systemApprovalAmount,
      selfApprovalAmount,
      userAddress,
    ]);

    // Build transaction calls
    const buildTransactionCalls = useCallback(() => {
      try {
        const { contractAddress, isDecentralized } = validatePaymasterSetup();

        const config: ApprovalConfig = {
          tokenSymbol: selectedToken.symbol,
          systemApprovalAmount,
          selfApprovalAmount,
          contractAddress,
          isDecentralized,
        };

        const { needsApproval } = needsTokenApproval(config, allowances);
        const approveCalls = needsApproval
          ? buildApprovalCalls(config, allowances)
          : [];

        const productId = products.map((p) => p.id).join(',');
        const purchaseCalls = buildPurchaseCall({
          productId,
          selectedToken,
          systemAmount: systemApprovalAmount,
          selfAmount: selfApprovalAmount,
          address: userAddress,
          products,
          useFallbackRouting: false,
        });

        return [...approveCalls, ...purchaseCalls];
      } catch (error) {
        logTransactionError(error);
        return [];
      }
    }, [
      selectedToken,
      systemApprovalAmount,
      selfApprovalAmount,
      allowances,
      products,
      userAddress,
    ]);

    // Handle purchase transaction via CDP
    const handlePurchaseTransaction = useCallback(async () => {
      if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
        console.error('❌ Missing CDP requirements:', {
          hasEvmAddress: !!evmAddress,
          hasCurrentUser: !!currentUser,
          hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
          evmAddress,
          smartAccount: currentUser?.evmSmartAccounts?.[0],
        });
        setTransactionState('error');
        return;
      }

      const smartAccount = currentUser.evmSmartAccounts[0];

      setIsTransactionPending(true);
      setTransactionState('processing');

      try {
        console.log('🚀 Initiating shopping cart purchase via CDP Smart Account');

        const calls = buildTransactionCalls();
        if (calls.length === 0) {
          throw new Error('Failed to build transaction calls');
        }

        console.log(`📦 Processing ${calls.length} transaction calls (approvals + purchase)`);

        const response = await sendUserOperation({
          evmSmartAccount: smartAccount,
          network: 'base',
          calls: calls.map((call: any) => ({
            to: call.address,
            data: call.data,
            value: call.value || 0n,
          })),
          useCdpPaymaster: true,
        });

        console.log('✅ User operation sent successfully!', response);

        // CDP SDK returns userOperationHash, not immediate receipt
        const resultWithHash = response as any;
        const txHash = resultWithHash?.userOperationHash;

        if (!txHash) {
          console.warn('⚠️ No userOperationHash found in result');
          throw new Error('Transaction submitted but no hash found');
        }

        console.log('✅ Purchase transaction submitted, userOperationHash:', txHash);
        setTransactionState('success');

        // Process orders in database
        // Note: For CDP, we use userOperationHash as the transaction identifier
        try {
          await processAllOrders({
            products,
            address: userAddress,
            selectedToken,
            transactionHash: txHash,
            receipt: null, // CDP doesn't provide immediate receipt
          });

          // Navigate or close cart after delay
          setTimeout(() => {
            console.log('✅ Order processing complete');
          }, 2000);
        } catch (error) {
          console.error('❌ Error processing orders after transaction:', error);
          // Transaction succeeded but order processing failed
        }

      } catch (error) {
        console.error('❌ Purchase transaction failed:', error);
        logTransactionError(error);
        setTransactionState('error');
      } finally {
        setIsTransactionPending(false);
      }
    }, [evmAddress, currentUser, sendUserOperation, buildTransactionCalls, products, userAddress, selectedToken]);

    if (isLoadingAllowances) {
      return <LoadingSkeleton />;
    }

    const { contractAddress, isDecentralized } = validatePaymasterSetup();
    const config: ApprovalConfig = {
      tokenSymbol: selectedToken.symbol,
      systemApprovalAmount,
      selfApprovalAmount,
      contractAddress,
      isDecentralized,
    };

    const { needsApproval } = needsTokenApproval(config, allowances);
    const calls = buildTransactionCalls();

    return (
      <TransactionContainer>
        <BackButton onClick={onBack}>← Back to payment options</BackButton>

        <TransactionStep>
          <StepTitle>Payment Method: {selectedToken.symbol}</StepTitle>
          <AllowanceInfo needsApproval={needsApproval}>
            {needsApproval
              ? `Token approval required for ${selectedToken.symbol}. This will be included in your transaction.`
              : `${selectedToken.symbol} is already approved for spending.`}
          </AllowanceInfo>
        </TransactionStep>

        <Button
          onClick={handlePurchaseTransaction}
          disabled={
            !evmAddress ||
            !currentUser?.evmSmartAccounts?.[0] ||
            isTransactionPending ||
            transactionState === 'processing' ||
            transactionState === 'success' ||
            calls.length === 0
          }
          className="w-full bg-[#007bff] hover:bg-[#0056b3] text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTransactionPending || transactionState === 'processing' ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin inline" />
              Processing...
            </>
          ) : transactionState === 'success' ? (
            '✅ Success!'
          ) : transactionState === 'error' ? (
            '❌ Transaction Failed'
          ) : needsApproval ? (
            'Approve & Purchase'
          ) : (
            'Purchase'
          )}
        </Button>

        {(!evmAddress || !currentUser?.evmSmartAccounts?.[0]) && (
          <div className="mt-2 text-sm text-red-600">
            Please ensure your CDP Smart Account is connected to complete the purchase
          </div>
        )}

        {transactionState === 'success' && (
          <div className="mt-2 text-sm text-green-600">
            ✅ Purchase successful! Processing your order...
          </div>
        )}

        {transactionState === 'error' && (
          <div className="mt-2 text-sm text-red-600">
            ❌ Transaction failed. Please try again.
          </div>
        )}
      </TransactionContainer>
    );
  },
);

TransactionFlow.displayName = 'TransactionFlow';

export default TransactionFlow;

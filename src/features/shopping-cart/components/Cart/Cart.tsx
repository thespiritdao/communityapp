// src/features/shopping-cart/components/Cart/Cart.tsx
'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { usePublicClient } from 'wagmi';
import { useRouter } from 'next/navigation';
import { keccak256, toBytes, type Log, encodeFunctionData } from 'viem';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
const purchaseBurnABI = require('src/abis/purchaseBurnABI.json');
const purchaseRouterABI = require('src/abis/PurchaseRouter.json');
const purchaseRouterDecentralizedABI = require('src/abis/PurchaseRouterDecentralized.json');
import useCart from '@/features/shopping-cart/contexts/cart-context/useCart';
import CartProducts from '@/features/shopping-cart/components/Cart/CartProducts';
import formatPrice from '@/utils/formatPrice';
import {
  useCartCalculations,
  useCartCalculationsDebug,
} from '../../hooks/useCartCalculations';
import {
  useCartValidation,
  validatePaymasterSetup,
  validatePaymasterConfig,
  parsedErc20ABI,
} from '../../hooks/useCartValidation';
import { TokenSelection } from '../TokenSelection';
import {
  DEFAULT_TOKEN_OPTIONS,
  getDefaultToken,
} from '../../utils/tokenConfig';
import { prepareTransactionData } from '../../services/transactionService';
import {
  useSelfPaymentFlow,
  isSelfPayment,
  type PreparedSelfPayment,
} from '../../hooks/useSelfPaymentFlow';
import { SelfPaymentConfirmModal } from './CartCheckout/SelfPaymentConfirmModal';
import debounce from 'lodash.debounce';
import { BaseError } from 'viem';
import { getPublicClient } from '@wagmi/core';
import { wagmiConfig } from '@/config/wagmi.client';
import { supabase } from '@/lib/supabase';
import { createSupabaseSession } from '@/utils/createSupabaseSession';
import { requestSupabaseSession } from '@/features/identity/lib/cdpSession';
import { getAuthHeaders } from '@/lib/authHeaders';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2 } from 'lucide-react';

import * as S from './style';

// CDP-native button styled component (replaces OnchainKit TransactionButton)
// Using SpiritDAO PRIMARY color (#2F5D50 - Dark Ritual Green)
const CDPTransactionButton = styled.button`
  background-color: #2F5D50 !important;
  color: #FFFFFF !important;
  border-radius: 6px !important;
  border: none !important;
  padding: 0.75rem 1.5rem !important;
  font-size: 1rem !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  transition: background-color 0.2s ease !important;
  width: 100%;
  margin-top: 1rem;

  &:hover:not(:disabled) {
    background-color: #254A40 !important;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

export type Token = {
  address: string;
  chainId: number;
  decimals: number;
  image: string;
  name: string;
  symbol: string;
};

const BASE_CHAIN_ID = 8453;

// Token options now imported from config

// Add error logging utility with rate limiting
const ERROR_LOG_KEY = 'commapp_error_logs';
const MAX_LOGS = 100; // Maximum number of logs to keep

const logError = async (error: unknown, context: string) => {
  try {
    const timestamp = new Date().toISOString();
    const errorLog = {
      timestamp,
      context,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
              ...(error instanceof BaseError && {
                details: error.details,
                shortMessage: error.shortMessage,
              }),
            }
          : error,
    };

    // Log to console with grouping
    console.group(`Error Log - ${context}`);
    console.log('Timestamp:', timestamp);
    console.log('Context:', context);
    console.log('Error Details:', errorLog.error);
    console.groupEnd();

    // Store in localStorage with rate limiting
    try {
      const existingLogsStr = localStorage.getItem(ERROR_LOG_KEY);
      const existingLogs = existingLogsStr ? JSON.parse(existingLogsStr) : [];

      // Add new log and maintain max size
      existingLogs.unshift(errorLog);
      if (existingLogs.length > MAX_LOGS) {
        existingLogs.length = MAX_LOGS;
      }

      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(existingLogs));
    } catch (storageError) {
      console.error('Failed to store error log:', storageError);
    }

    // Additional error details for debugging
    if (error instanceof Error) {
      console.error('Additional error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error instanceof BaseError && {
          details: error.details,
          shortMessage: error.shortMessage,
        }),
      });
    }
  } catch (e) {
    console.error('Error in logError:', e);
  }
};

// Add transaction data validation utility
const validateTransactionData = (data: any) => {
  const validation = {
    isValid: true,
    issues: [] as string[],
    data: {} as any,
  };

  try {
    // Deep clone the data to avoid modifying the original
    validation.data = JSON.parse(
      JSON.stringify(data, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      }),
    );

    // Validate required fields
    if (!validation.data.address) validation.issues.push('Missing address');
    if (!validation.data.chainId) validation.issues.push('Missing chainId');
    if (!validation.data.calls) validation.issues.push('Missing calls');

    // Validate calls array
    if (Array.isArray(validation.data.calls)) {
      validation.data.calls.forEach((call: any, index: number) => {
        if (!call.address)
          validation.issues.push(`Call ${index}: Missing address`);
        if (!call.abi) validation.issues.push(`Call ${index}: Missing ABI`);
        if (!call.functionName)
          validation.issues.push(`Call ${index}: Missing functionName`);
        if (!Array.isArray(call.args))
          validation.issues.push(`Call ${index}: Missing args array`);
      });
    } else {
      validation.issues.push('Calls is not an array');
    }

    validation.isValid = validation.issues.length === 0;
  } catch (e) {
    validation.isValid = false;
    validation.issues.push(
      `Serialization error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return validation;
};

// Add utility to retrieve logs
const getErrorLogs = () => {
  try {
    const logsStr = localStorage.getItem(ERROR_LOG_KEY);
    return logsStr ? JSON.parse(logsStr) : [];
  } catch (e) {
    console.error('Failed to retrieve error logs:', e);
    return [];
  }
};

// Add utility to clear logs
const clearErrorLogs = () => {
  try {
    localStorage.removeItem(ERROR_LOG_KEY);
    console.log('Error logs cleared');
  } catch (e) {
    console.error('Failed to clear error logs:', e);
  }
};

const logTransactionLifecycle = (stage: string, data: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Transaction ${stage}:`, {
    ...data,
    paymasterConfig: {
      endpoint: process.env.NEXT_PUBLIC_PAYMASTER,
      isValid: validatePaymasterConfig(),
    },
  });
};

const simulateTransaction = async (
  calls: any[],
  publicClient: any,
  userAddress: string,
) => {
  try {
    const simulation = await publicClient.simulateContract({
      ...calls[0],
      account: userAddress,
    });

    console.log('Transaction simulation successful:', {
      simulation,
      calls: calls[0],
      account: userAddress,
    });

    return true;
  } catch (error) {
    console.error('Transaction simulation failed:', {
      error,
      calls: calls[0],
      account: userAddress,
    });
    return false;
  }
};

const isCoinbaseWalletError = (error: any): boolean => {
  return (
    error?.message?.includes('scanTxTimeout') ||
    error?.message?.includes('api.wallet.coinbase.com')
  );
};

const checkETHBalance = async (address: string): Promise<boolean> => {
  try {
    const publicClient = getPublicClient(wagmiConfig);
    const balance = await publicClient.getBalance({
      address: address as `0x${string}`,
    });
    // We need at least 0.001 ETH for gas
    const minRequired = 1000000000000000n; // 0.001 ETH in wei
    return balance >= minRequired;
  } catch (error) {
    console.error('Error checking ETH balance:', error);
    return false;
  }
};

const logWalletState = async (userAddress: string) => {
  try {
    const publicClient = getPublicClient(wagmiConfig);
    const [balance, chainId, blockNumber] = await Promise.all([
      publicClient.getBalance({ address: userAddress as `0x${string}` }),
      publicClient.getChainId(),
      publicClient.getBlockNumber(),
    ]);

    console.log('Wallet State:', {
      address: userAddress,
      balance: balance.toString(),
      balanceInEth: Number(balance) / 1e18,
      network: {
        chainId,
        name: wagmiConfig.chains.find((c) => c.id === chainId)?.name || 'Unknown',
      },
      blockNumber: blockNumber.toString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error logging wallet state:', error);
  }
};

const logNetworkConditions = async () => {
  try {
    const publicClient = getPublicClient(wagmiConfig);
    const [gasPrice, block] = await Promise.all([
      publicClient.getGasPrice(),
      publicClient.getBlock(),
    ]);

    console.log('Network Conditions:', {
      gasPrice: gasPrice.toString(),
      gasPriceInGwei: Number(gasPrice) / 1e9,
      blockNumber: block.number.toString(),
      blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      baseFeePerGas: block.baseFeePerGas?.toString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error logging network conditions:', error);
  }
};

const logTransactionParameters = (calls: any[], isSponsored: boolean) => {
  console.log('Transaction Parameters:', {
    calls: calls.map((call) => ({
      address: call.address,
      functionName: call.functionName,
      args: call.args.map((arg: any) => {
        if (typeof arg === 'bigint') {
          return {
            value: arg.toString(),
            type: 'bigint',
          };
        }
        return arg;
      }),
    })),
    isSponsored,
    timestamp: new Date().toISOString(),
  });
};

const getTransactionConfig = async (userAddress: string) => {
  try {
    // Log initial state
    await logWalletState(userAddress);
    await logNetworkConditions();

    const hasETH = await checkETHBalance(userAddress);
    const paymasterStatus = validatePaymasterConfig();

    console.log('Transaction Configuration Decision:', {
      hasETH,
      paymasterStatus,
      address: userAddress,
      timestamp: new Date().toISOString(),
      decision:
        hasETH && !paymasterStatus
          ? 'non-sponsored'
          : hasETH && paymasterStatus
            ? 'sponsored-with-fallback'
            : !hasETH && paymasterStatus
              ? 'sponsored-only'
              : 'cannot-proceed',
    });

    // If we have ETH and paymaster is not working, use non-sponsored
    if (hasETH && !paymasterStatus) {
      console.log('Using non-sponsored transaction due to paymaster issues');
      return { isSponsored: false };
    }

    // If we have ETH but paymaster is working, try sponsored first
    if (hasETH && paymasterStatus) {
      console.log('Using sponsored transaction with ETH fallback available');
      return { isSponsored: true, hasFallback: true };
    }

    // If no ETH, we must use sponsored
    if (!hasETH && paymasterStatus) {
      console.log('Using sponsored transaction (no ETH available)');
      return { isSponsored: true, hasFallback: false };
    }

    // If no ETH and no paymaster, we can't proceed
    throw new Error('No ETH for gas and paymaster not available');
  } catch (error) {
    console.error('Error getting transaction config:', error);
    throw error;
  }
};

const handleTransactionError = async (
  error: Error,
  context: string,
  userAddress?: string,
) => {
  try {
    if (!userAddress) {
      throw new Error('No user address available');
    }

    // Log state before error handling
    await logWalletState(userAddress);
    await logNetworkConditions();

    // Get current transaction config
    const txConfig = await getTransactionConfig(userAddress);
    const isCoinbaseError = isCoinbaseWalletError(error);

    // Log transaction parameters
    logTransactionParameters([], txConfig.isSponsored);

    logTransactionLifecycle('Error', {
      type: context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        isCoinbaseError,
        ...(error instanceof BaseError && {
          details: error.details,
          shortMessage: error.shortMessage,
        }),
      },
      transactionData: {
        address: userAddress,
        chainId: BASE_CHAIN_ID,
        calls: [], // Empty calls for now
        ...txConfig,
        simulationSuccess: false, // No simulation for direct purchase
        walletType: 'coinbase',
        timestamp: new Date().toISOString(),
      },
    });

    // If it's a Coinbase Wallet error and we have a fallback available
    if (isCoinbaseError && txConfig.hasFallback) {
      console.warn(
        'Coinbase Wallet error detected with fallback available. Retrying with non-sponsored transaction...',
        {
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      );
      return { shouldRetry: true, useSponsored: false };
    }

    await logError(error, `${context} Transaction Error`);
    return { shouldRetry: false };
  } catch (e) {
    console.error(`Error in ${context} error handler:`, e);
    return { shouldRetry: false };
  }
};

// Add comprehensive UserOperation debugging
const debugUserOperation = (calls: any[], context: string) => {
  console.group(`ðŸ” UserOperation Debug - ${context}`);
  console.log('ðŸ“‹ Calls Array:', calls);
  console.log('ðŸ“‹ Calls Array Length:', calls.length);
  console.log(
    'ðŸ“‹ Contract Addresses:',
    calls.map((call) => call.address),
  );
  console.log(
    'ðŸ“‹ Function Names:',
    calls.map((call) => call.functionName),
  );
  console.log(
    'ðŸ“‹ Arguments:',
    calls.map((call) => call.args),
  );
  console.log(
    'ðŸ“‹ ABI Validation:',
    calls.map((call) => ({
      address: call.address,
      hasABI: Boolean(call.abi),
      abiLength: call.abi?.length || 0,
      hasFunction: call.abi?.some(
        (item: any) => item.name === call.functionName,
      ),
    })),
  );

  // Add detailed ABI inspection
  calls.forEach((call, index) => {
    console.log(`ðŸ“‹ Call ${index} Details:`, {
      address: call.address,
      functionName: call.functionName,
      args: call.args,
      abi: call.abi,
      abiFunctions: call.abi
        ?.filter((item: any) => item.type === 'function')
        .map((item: any) => item.name),
    });
  });

  console.log('ðŸ”§ Environment Variables:', {
    purchaseRouter: process.env.NEXT_PUBLIC_PURCHASE_ROUTER,
    purchaseBurn: process.env.NEXT_PUBLIC_PURCHASE_BURN,
    systemToken: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
    selfToken: process.env.NEXT_PUBLIC_SELF_TOKEN,
    paymaster: process.env.NEXT_PUBLIC_PAYMASTER?.substring(0, 30) + '...',
  });
  console.log('â° Timestamp:', new Date().toISOString());
  console.groupEnd();
};

// Add paymaster configuration validation

// Removed handlePaymasterError: no longer needed for direct purchase-only flow

// Add utility to verify contract events
const verifyContractEvents = async (
  transactionHash: string,
  contractAddress: string,
  useRouter: boolean,
  providedPublicClient?: any,
) => {
  let publicClientToUse = providedPublicClient;

  if (!publicClientToUse) {
    try {
      publicClientToUse = getPublicClient(wagmiConfig);
    } catch (error) {
      console.error(
        'Failed to get public client in verifyContractEvents:',
        error,
      );
      return false;
    }
  }

  if (!publicClientToUse) {
    console.error('publicClient is undefined in verifyContractEvents');
    return false;
  }
  try {
    // Get transaction receipt
    const receipt = await publicClientToUse.getTransactionReceipt({
      hash: transactionHash as `0x${string}`,
    });

    console.group('ðŸ” Contract Event Verification');
    console.log('ðŸ“‹ Transaction Hash:', transactionHash);
    console.log('ðŸ“‹ Contract Address:', contractAddress);
    console.log('ðŸ“‹ Use Router:', useRouter);
    console.log('ðŸ“‹ Total Logs:', receipt.logs.length);

    // Filter logs for our contract
    const contractLogs = receipt.logs.filter(
      (log: Log) => log.address.toLowerCase() === contractAddress.toLowerCase(),
    );

    console.log('ðŸ“‹ Contract Logs Found:', contractLogs.length);

    if (contractLogs.length > 0) {
      console.log('ðŸ“‹ Contract Events:', contractLogs);

      // Check for purchase events (different for router vs burn)
      const purchaseEvents = contractLogs.filter((log: Log) => {
        if (!('topics' in log) || !Array.isArray((log as any).topics))
          return false;
        try {
          if (useRouter) {
            // PurchaseCompleted event signature from PurchaseRouter
            const eventSignature =
              'PurchaseCompleted(address,string,uint256,uint256,uint8,address,uint256)';
            const eventTopic = keccak256(toBytes(eventSignature));
            console.log(
              'ðŸ“‹ Looking for PurchaseCompleted event topic:',
              eventTopic,
            );
            console.log('ðŸ“‹ Found event topic:', (log as any).topics[0]);
            return (log as any).topics[0] === eventTopic;
          } else {
            // PurchaseArtifact event signature from PurchaseBurn
            const eventSignature =
              'PurchaseArtifact(address,uint256,uint256,string,uint256)';
            const eventTopic = keccak256(toBytes(eventSignature));
            console.log(
              'ðŸ“‹ Looking for PurchaseArtifact event topic:',
              eventTopic,
            );
            console.log('ðŸ“‹ Found event topic:', (log as any).topics[0]);
            return (log as any).topics[0] === eventTopic;
          }
        } catch (error) {
          console.error('Error checking event signature:', error);
          return true; // Accept any event from the contract if signature check fails
        }
      });

      const eventName = useRouter ? 'PurchaseCompleted' : 'PurchaseArtifact';
      console.log(`ðŸ“‹ ${eventName} Events:`, purchaseEvents.length);

      if (purchaseEvents.length > 0) {
        console.log(`âœ… ${eventName} event found!`);
        console.log('ðŸ“‹ Event Details:', purchaseEvents[0]);
      } else {
        console.warn(`âš ï¸ No ${eventName} event found`);
      }
    } else {
      console.warn('âš ï¸ No logs found for purchase burn contract');
    }

    console.groupEnd();
    return contractLogs.length > 0;
  } catch (error) {
    console.error('âŒ Error verifying contract events:', error);
    return false;
  }
};

// Removed DebugTransaction - no longer using OnchainKit Transaction component

export default function Cart({
  tokenBalances,
}: {
  tokenBalances?: { systemBalance: string; selfBalance: string };
} = {}) {
  const { products = [], total, isOpen, closeCart, clearCart } = useCart();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const publicClient = usePublicClient();
  const router = useRouter();

  // Get address from CDP Smart Account (not EOA)
  const address = currentUser?.evmSmartAccounts?.[0] as `0x${string}` | undefined;

  const [selectedToken, setSelectedToken] = useState<Token>(getDefaultToken());
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [useFallbackRouting, setUseFallbackRouting] = useState(false);
  const [processedTransactions, setProcessedTransactions] = useState<
    Set<string>
  >(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProcessingOrders, setIsProcessingOrders] = useState(false);
  // Visible checkout failure. Every failure path used to be console-only, so a
  // reverted purchase looked like nothing had happened at all.
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  // podId → treasury address, read from the router's own factory. The stored
  // products.destination_address goes stale; the contract compares against the
  // live value, so we resolve it rather than trusting the database.
  const [treasuryOverrides, setTreasuryOverrides] = useState<Record<string, string>>({});

  // Resolve each pod-treasury product's treasury from the router's own factory
  // as soon as the cart has contents, so the purchase call is built with the
  // address the contract will actually compare against.
  useEffect(() => {
    const pods = [
      ...new Set(
        (products || [])
          .filter((p: any) => p.fund_destination_type === 'pod_treasury' && p.pod_id)
          .map((p: any) => String(p.pod_id)),
      ),
    ];
    if (pods.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const routerAddress = process.env
          .NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED as `0x${string}` | undefined;
        const client = getPublicClient(wagmiConfig);
        if (!routerAddress || !client) return;

        const factory = (await client.readContract({
          address: routerAddress,
          abi: [{ name: 'treasuryFactory', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] }] as const,
          functionName: 'treasuryFactory',
        })) as `0x${string}`;

        const next: Record<string, string> = {};
        for (const podId of pods) {
          const addr = (await client.readContract({
            address: factory,
            abi: [{ name: 'getTreasuryForPod', type: 'function', stateMutability: 'view', inputs: [{ name: 'podId', type: 'string' }], outputs: [{ name: '', type: 'address' }] }] as const,
            functionName: 'getTreasuryForPod',
            args: [podId],
          })) as string;
          if (addr && addr !== '0x0000000000000000000000000000000000000000') {
            next[podId] = addr;
          }
        }
        if (!cancelled && Object.keys(next).length > 0) setTreasuryOverrides(next);
      } catch (err) {
        console.warn('[cart] could not resolve pod treasuries:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [products]);
  const [showPurchaseConfirmation, setShowPurchaseConfirmation] = useState(false);
  const [purchaseDetails, setPurchaseDetails] = useState<{
    itemCount: number;
    totalAmount: string;
    token: string;
    productOwner?: {
      wallet_address: string;
      first_name?: string;
      last_name?: string;
      profile_picture?: string;
    };
  } | null>(null);
  const MAX_RETRIES = 3;

  // Add ref to prevent duplicate onSuccess callbacks during React re-renders
  const onSuccessCallbackRef = useRef<Set<string>>(new Set());

  // Use the extracted cart calculations hook
  const calculations = useCartCalculations(products, selectedToken, total);
  const {
    systemApprovalAmount,
    selfApprovalAmount,
    totalSystemPrice,
    totalSelfPrice,
  } = calculations;

  // Use the extracted debug logging hook
  useCartCalculationsDebug(calculations, selectedToken, products);

  // Use the extracted cart validation hook
  const validation = useCartValidation(
    selectedToken,
    systemApprovalAmount,
    selfApprovalAmount,
  );
  const {
    allowance,
    systemAllowance,
    selfAllowance,
    isCheckingAllowance,
    needsApproval,
    needsBothTokenApprovals,
    systemNeedsApproval,
    selfNeedsApproval,
    contractAddress,
    isDecentralized,
    paymasterValid,
  } = validation;

  // Clear processed transactions only when products array changes (new purchase session)
  // Don't clear on price changes as they may happen during transaction processing
  useEffect(() => {
    if (products && products.length > 0) {
      setProcessedTransactions(new Set());
      console.log(
        'ðŸ”„ Cleared processed transactions for new purchase session (products changed)',
      );
    }
  }, [products]);

  // Keep only the approval transaction state (not moved to hook)
  const [isApproving, setIsApproving] = useState(false);
  const [approveTxSuccess, setApproveTxSuccess] = useState(false);

  useEffect(() => {
    console.log('Approval Amounts:', {
      system: systemApprovalAmount.toString(),
      self: selfApprovalAmount.toString(),
    });
  }, [systemApprovalAmount, selfApprovalAmount]);

  useEffect(() => {
    const debouncedCheckBalances = debounce(async () => {
      if (!address || !publicClient) return;

      try {
        const systemToken = process.env
          .NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;

        // $SELF is a soulbound ERC-1155 (SelfEpochs) with no ERC-20 balanceOf;
        // its balance comes from /api/self/holdings (decay-aware), not a read
        // here. Only $SYSTEM has a meaningful ERC-20 balance to debug-log.
        const systemBalance = (await publicClient.readContract({
          address: systemToken,
          abi: parsedErc20ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        })) as bigint;

        console.log('Token balances:', {
          system: systemBalance.toString(),
          requiredSystem: systemApprovalAmount.toString(),
          requiredSelf: selfApprovalAmount.toString(),
        });
      } catch (error) {
        console.error('Error checking balances:', error);
      }
    }, 5000);

    debouncedCheckBalances();

    return () => {
      debouncedCheckBalances.cancel();
    };
  }, [address, publicClient, systemApprovalAmount, selfApprovalAmount]);

  useEffect(() => {
    async function debugContractState() {
      if (!address || !publicClient) return;
      try {
        const blockNumber = await publicClient.getBlockNumber();
        console.log('Debug:', {
          systemToken: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
          chainId: BASE_CHAIN_ID,
          blockNumber,
        });
      } catch (error) {
        console.error('Debug check failed:', error);
      }
    }
    debugContractState();
  }, [address, publicClient]);

  // Reset fallback routing when cart is opened
  useEffect(() => {
    if (isOpen && useFallbackRouting) {
      console.log(
        'ðŸ”„ Cart opened - resetting fallback routing state for fresh transaction',
      );
      setUseFallbackRouting(false);
    }
  }, [isOpen, useFallbackRouting]);

  // Debug sponsorship config
  useEffect(() => {
    console.log(
      'âœ… CART FIXED: Infinite console loop should be resolved - if you see this once, the fix worked!',
    );
    console.group('ðŸš€ Cart Component Initialization');
    console.log('ðŸ“‹ Component Mounted:', new Date().toISOString());

    // Validate paymaster setup
    const paymasterConfig = validatePaymasterSetup();
    console.log('ðŸ“‹ Paymaster Config:', paymasterConfig);

    // Validate contract addresses
    const { contractAddress, useRouter } = validatePaymasterSetup();
    console.log('ðŸ“‹ Contract Addresses:', {
      purchaseRouter: process.env.NEXT_PUBLIC_PURCHASE_ROUTER,
      purchaseBurn: process.env.NEXT_PUBLIC_PURCHASE_BURN,
      systemToken: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
      selfToken: process.env.NEXT_PUBLIC_SELF_TOKEN,
      activeContract: contractAddress,
      usingRouter: useRouter,
    });

    // Validate ABI
    console.log('ðŸ“‹ ABI Validation:', {
      purchaseRouterABI: {
        length: purchaseRouterABI.length,
        hasPurchaseWithRouting: purchaseRouterABI.some(
          (item: any) => item.name === 'purchaseWithRouting',
        ),
        functions: purchaseRouterABI
          .filter((item: any) => item.type === 'function')
          .map((item: any) => item.name),
      },
      purchaseBurnABI: {
        length: purchaseBurnABI.length,
        hasPurchaseArtifact: purchaseBurnABI.some(
          (item: any) => item.name === 'purchaseArtifact',
        ),
        functions: purchaseBurnABI
          .filter((item: any) => item.type === 'function')
          .map((item: any) => item.name),
      },
    });

    // Validate user state
    console.log('ðŸ“‹ User State:', {
      address: address,
      chainId: BASE_CHAIN_ID,
      selectedToken: selectedToken?.symbol,
    });

    console.groupEnd();

    console.log('Transaction sponsorship config:', {
      isPaymasterConfigured: Boolean(process.env.NEXT_PUBLIC_PAYMASTER),
      paymasterEndpoint:
        process.env.NEXT_PUBLIC_PAYMASTER?.substring(0, 20) + '...',
      isSponsored: true,
      chainId: BASE_CHAIN_ID,
      contracts: {
        system: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
        self: process.env.NEXT_PUBLIC_SELF_TOKEN,
        purchaseRouter: process.env.NEXT_PUBLIC_PURCHASE_ROUTER,
        purchaseBurn: process.env.NEXT_PUBLIC_PURCHASE_BURN,
        activeContract: contractAddress,
        usingRouter: useRouter,
      },
    });
  }, []);

  useEffect(() => {
    if (address) {
      console.log('CDP Wallet State:', {
        smartAccount: address,
        chainId: BASE_CHAIN_ID,
        network: 'Base',
        isConnected: Boolean(currentUser),
      });
    }
  }, [currentUser, address]);

  const productId =
    products && products.length > 0 ? products.map((p) => p.id).join(',') : '';

  // Extract transaction data using the extracted service
  const transactionData = useMemo(() => {
    console.log('ðŸ”„ TransactionData useMemo executing:', {
      hasProducts: products && products.length > 0,
      productsLength: products?.length || 0,
      hasAddress: !!address,
      productId,
      selectedToken: selectedToken.symbol,
      systemApprovalAmount: systemApprovalAmount.toString(),
      selfApprovalAmount: selfApprovalAmount.toString(),
      needsApproval,
    });

    if (!products || products.length === 0 || !address) {
      console.log(
        'âš ï¸ TransactionData returning empty due to missing requirements:',
        {
          products: products
            ? products.length === 0
              ? 'empty'
              : 'has items'
            : 'null',
          address: address ? 'has address' : 'null',
        },
      );
      return {
        approveCalls: [],
        purchaseCalls: [],
        totalCalls: [],
        needsApproval: false,
      };
    }

    try {
      const result = prepareTransactionData(
        selectedToken,
        systemApprovalAmount,
        selfApprovalAmount,
        needsApproval,
        productId,
        address,
        products,
        useFallbackRouting,
        treasuryOverrides,
      );
      console.log('âœ… TransactionData prepared successfully:', {
        totalCallsLength: result.totalCalls.length,
        approveCallsLength: result.approveCalls.length,
        purchaseCallsLength: result.purchaseCalls.length,
      });
      return result;
    } catch (error) {
      console.error('âŒ TransactionData preparation failed:', error);
      logError(error, 'prepareTransactionData');
      return {
        approveCalls: [],
        purchaseCalls: [],
        totalCalls: [],
        needsApproval: false,
      };
    }
  }, [
    selectedToken,
    systemApprovalAmount,
    selfApprovalAmount,
    needsApproval,
    productId,
    address,
    products,
    useFallbackRouting,
    treasuryOverrides,
  ]);

  // Extract calls from prepared transaction data
  const { approveCalls, purchaseCalls, totalCalls } = transactionData;

  // $SELF burn-to-pay flow (soulbound ERC-1155 via SelfPaymentV2.payWithSelf,
  // not the ERC-20 PurchaseRouter). Shared with TransactionFlow.tsx.
  const selfPay = useSelfPaymentFlow();

  // Encode + send a set of {address, abi, functionName, args} calls as one
  // sponsored userOp. Reused by both the router path and the $SELF path.
  const executeCalls = useCallback(async (callsToRun: any[]) => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      console.error('âŒ No Smart Account found');
      setIsLoading(false);
      return;
    }

    if (!callsToRun || callsToRun.length === 0) {
      console.error('âŒ No transaction calls to execute');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsSuccess(false);

    try {
      const smartAccount = currentUser.evmSmartAccounts[0];

      console.group('ðŸš€ CDP Transaction: Approve & Purchase');
      console.log('ðŸ“‹ Smart Account:', smartAccount);
      console.log('ðŸ“‹ Total Calls:', totalCalls.length);
      console.log('ðŸ“‹ Calls to execute:', totalCalls);

      // Encode all transaction calls
      const cdpCalls = callsToRun.map((call: any) => {
        const encodedData = encodeFunctionData({
          abi: call.abi,
          functionName: call.functionName,
          args: call.args,
        });

        console.log('ðŸ“‹ Encoding call:', {
          to: call.address,
          functionName: call.functionName,
          args: call.args,
          encodedData,
        });

        return {
          to: call.address as `0x${string}`,
          value: 0n,
          data: encodedData,
        };
      });

      console.log('ðŸ“‹ CDP Calls prepared:', cdpCalls);
      console.log('â›½ Paymaster: ENABLED (gasless transaction)');
      console.groupEnd();

      // Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: cdpCalls,
        useCdpPaymaster: true,
      });

      console.log('âœ… User operation sent successfully!', result);

      // Transaction successful - handle success
      await handleTransactionSuccess(result);
    } catch (error) {
      console.error('âŒ Transaction failed:', error);
      await handleTransactionFailure(error);
    }
  }, [currentUser, sendUserOperation, products, address, useFallbackRouting]);

  // Entry point for the Purchase button. $SELF routes through SelfPaymentV2
  // (with a confirmation modal showing what gets burned); every other token
  // uses the existing router calls.
  const handleCDPTransaction = useCallback(async () => {
    setCheckoutError(null);

    // Pre-flight: a product that pays into a pod treasury only works if the
    // router's treasury factory can resolve that pod. When it cannot, the
    // user operation reverts with "Treasury not deployed" during gas
    // estimation — opaque and indistinguishable from a balance problem.
    try {
      const treasuryProducts = (products || []).filter(
        (p: any) => p.fund_destination_type === 'pod_treasury' && p.pod_id,
      );
      if (treasuryProducts.length > 0 && !useFallbackRouting) {
        const routerAddress = process.env
          .NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED as `0x${string}` | undefined;
        const client = getPublicClient(wagmiConfig);
        if (routerAddress && client) {
          const factory = (await client.readContract({
            address: routerAddress,
            abi: [{ name: 'treasuryFactory', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] }] as const,
            functionName: 'treasuryFactory',
          })) as `0x${string}`;
          for (const p of treasuryProducts) {
            const deployed = (await client.readContract({
              address: factory,
              abi: [{ name: 'isPodTreasuryDeployed', type: 'function', stateMutability: 'view', inputs: [{ name: 'podId', type: 'string' }], outputs: [{ name: '', type: 'bool' }] }] as const,
              functionName: 'isPodTreasuryDeployed',
              args: [String(p.pod_id)],
            })) as boolean;
            if (!deployed) {
              console.error('[cart] router factory cannot resolve treasury for pod', p.pod_id, 'factory', factory);
              setCheckoutError(
                `"${p.title || 'An item in your cart'}" pays into a pod treasury the store cannot resolve, so this purchase would be rejected on-chain. This is a configuration problem on our side — please let an admin know.`,
              );
              return;
            }
          }
        }
      }
    } catch (preflightErr) {
      console.warn('[cart] treasury pre-flight skipped:', preflightErr);
    }

    if (isSelfPayment(selectedToken?.symbol)) {
      // Prepare the burn (fetch holdings + select ids); modal opens on success.
      await selfPay.prepare(products, address as string);
      return;
    }
    await executeCalls(totalCalls);
  }, [selectedToken, selfPay, products, address, executeCalls, totalCalls, useFallbackRouting]);

  // Confirm handler for the $SELF modal — sends the prepared payWithSelf call.
  const handleConfirmSelfPayment = useCallback(async () => {
    if (!selfPay.prepared) return;
    const call = selfPay.prepared.call;
    selfPay.clear();
    await executeCalls([call]);
  }, [selfPay, executeCalls]);

  // Success handler (extracted from OnchainKit onSuccess callback)
  const handleTransactionSuccess = useCallback(async (response: any) => {
    const txHash = response?.userOperationHash;
    const transactionId = txHash || `fallback-${Date.now()}-${Math.random()}`;

    // CRITICAL: Prevent duplicate onSuccess callbacks using ref
    if (onSuccessCallbackRef.current.has(transactionId)) {
      console.log('ðŸš« onSuccess callback already executed for transaction:', transactionId);
      return;
    }
    onSuccessCallbackRef.current.add(transactionId);

    console.log('ðŸŽ¯ Transaction success handler triggered:', {
      transactionId,
      userOperationHash: txHash,
    });

    // Reset fallback routing for fresh transactions
    if (useFallbackRouting) {
      console.log('ðŸ”„ Resetting fallback routing after successful transaction');
      setUseFallbackRouting(false);
    }

    setIsLoading(false);
    setIsSuccess(true);
    setApproveTxSuccess(true);

    console.group('âœ… Combined Transaction Success');
    console.log('ðŸ"‹ UserOperation Hash:', txHash);
    console.log('ðŸ"‹ Approval + Purchase executed together');
    console.groupEnd();

    // ✅ FEATURE: Fetch product owner info for success modal
    let productOwnerInfo = null;
    if (products.length > 0 && products[0].creator_wallet) {
      try {
        const { data: ownerProfile } = await supabase
          .from('public_profiles')
          .select('wallet_address, first_name, last_name, profile_picture')
          .eq('wallet_address', products[0].creator_wallet.toLowerCase())
          .single();

        if (ownerProfile) {
          productOwnerInfo = ownerProfile;
        }
      } catch (error) {
        console.log('Could not fetch product owner profile:', error);
      }
    }

    // ✅ FEATURE: Show purchase confirmation modal
    setPurchaseDetails({
      itemCount: products.length,
      totalAmount: formatPrice(calculations.selectedTokenPrice, selectedToken.symbol),
      token: selectedToken.symbol,
      productOwner: productOwnerInfo,
    });

    // ✅ Show modal immediately - it's rendered outside CartOverlay so it will appear on top
    setShowPurchaseConfirmation(true);

    // Get transaction receipt for order creation
    // Note: For user operations, we may need to wait for the bundler transaction
    // For now, we'll use the userOperationHash as the transaction identifier

    const orderProcessingKey = `order-processing-${transactionId}`;

    // Create order records and send notifications
    try {
      console.log('ðŸ” Transaction success handler called:', {
        transactionId,
        isProcessingOrders,
        processedTransactions: Array.from(processedTransactions),
        timestamp: new Date().toISOString(),
      });

      // CRITICAL: Early exit to prevent recursive loops
      if (isProcessingOrders) {
        console.log('â³ Order creation already in progress, EXITING to prevent duplicates');
        return;
      }

      // Check if we've already processed this transaction
      if (processedTransactions.has(transactionId)) {
        console.log('â­ï¸ Transaction already processed, EXITING:', transactionId);
        return;
      }

      // Mark this transaction as being processed IMMEDIATELY
      setProcessedTransactions((prev) => {
        const newSet = new Set(prev).add(transactionId);
        console.log('ðŸ“ Added transaction to processed list. New set:', Array.from(newSet));
        return newSet;
      });
      setIsProcessingOrders(true);

      // CRITICAL: Add transaction-specific flag to prevent duplicate processing
      if ((window as any)[orderProcessingKey]) {
        console.log('âš ï¸ Orders already being processed for this transaction, skipping duplicate');
        return;
      }
      (window as any)[orderProcessingKey] = true;

      console.log('ðŸš€ STARTING ORDER CREATION AND NOTIFICATION PROCESS');
      console.log('ðŸ›’ Processing', products.length, 'products');

      // Ensure user is authenticated with Supabase before creating orders
      console.log('ðŸ” Ensuring Supabase authentication for order creation...');
      try {
        const authResponse = await requestSupabaseSession({
          address: address!.toLowerCase(),
        });

        if (!authResponse.ok) {
          throw new Error(`Auth API failed: ${authResponse.status}`);
        }

        const authData = await authResponse.json();
        console.log('âœ… Auth API response received:', {
          hasToken: !!authData.supabaseToken,
        });

        await createSupabaseSession(
          authData.supabaseToken,
          authData.supabaseRefreshToken,
        );
        console.log('âœ… Supabase session established for order creation');
      } catch (authError) {
        console.error('âŒ Failed to establish Supabase session:', authError);
        throw new Error(`Authentication failed: ${(authError as any).message}`);
      }

      const orderPromises = products.map(async (product) => {
        console.log('ðŸ“¦ Creating order record for product:', {
          productName: product.name || product.title,
          productId: product.id.toString(),
          requiredToken: product.required_token,
          buyerAddress: address,
          quantity: product.quantity || 1,
        });

        // Calculate the price paid for this specific product
        const productSelfPrice =
          selectedToken.symbol === '$SELF'
            ? (product.price_self || 0) * (product.quantity || 1)
            : 0;
        const productSystemPrice =
          selectedToken.symbol === '$SYSTEM'
            ? (product.price_system || 0) * (product.quantity || 1)
            : 0;

        console.log('ðŸ’° Cart order price calculation:', {
          token: selectedToken.symbol,
          price_self: product.price_self,
          price_system: product.price_system,
          quantity: product.quantity || 1,
          calculatedSelfPrice: productSelfPrice,
          calculatedSystemPrice: productSystemPrice,
        });

        // Create order record in database
        const { data: orderData, error: orderError } = await supabase
          .from('marketplace_orders')
          .insert({
            buyer_address: address!.toLowerCase(),
            product_id: product.id.toString(),
            product_name: product.name || product.title,
            quantity: product.quantity || 1,
            price_paid_self: productSelfPrice,
            price_paid_system: productSystemPrice,
            transaction_hash: txHash, // Use userOperationHash
            status: 'processing',
          })
          .select()
          .single();

        if (orderError) {
          console.error('Failed to create order record:', orderError);
          return null;
        }

        console.log('âœ… Order record created:', orderData);

        // Send purchase notification
        console.log('📧 [CART] Sending notification for product:', {
          productName: product.name || product.title,
          creatorWallet: product.creator_wallet,
          buyerAddress: address,
          orderId: orderData.id,
        });

        const notificationResponse = await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
          body: JSON.stringify({
            type: 'purchase_completed',
            buyerAddress: address,
            productName: product.name || product.title,
            productId: product.id.toString(),
            orderId: orderData.id,
            requiredToken: product.required_token,
            transactionHash: txHash,
            creatorWallet: product.creator_wallet, // ✅ Added: Notify product creator
            podId: product.pod_id, // ✅ Added: For pod-specific fulfillment
          }),
        });

        console.log('📧 [CART] Notification response status:', notificationResponse.status);

        if (!notificationResponse.ok) {
          const errorData = await notificationResponse.json();
          console.error('❌ [CART] Failed to create notification:', errorData);
          return null;
        }

        const notificationResult = await notificationResponse.json();
        console.log('✅ [CART] Notification result:', notificationResult);
        return notificationResult;
      });

      await Promise.all(orderPromises);
      console.log('âœ… All orders created and notifications sent successfully - TransactionID:', transactionId);
    } catch (orderError) {
      console.error('âŒ Failed to create orders or send notifications:', orderError);
    } finally {
      setIsProcessingOrders(false);
      if ((window as any)[orderProcessingKey]) {
        delete (window as any)[orderProcessingKey];
      }
    }

    // Cart already cleared and closed earlier (before order processing)

    console.log('ðŸ” Purchase complete - page refresh disabled for debugging');
  }, [
    products,
    address,
    selectedToken,
    isProcessingOrders,
    processedTransactions,
    useFallbackRouting,
    clearCart,
    closeCart,
  ]);

  // Error handler (extracted from OnchainKit onError callback)
  const handleTransactionFailure = useCallback(async (error: any) => {
    setIsLoading(false);
    setIsSuccess(false);
    setApproveTxSuccess(false);

    // Surface something the buyer can act on. The bundler reports every
    // on-chain revert as "useroperation reverted: <reason>", so map the
    // reasons we know and fall back to the raw reason otherwise.
    const raw = String(error?.message || '');
    const reason = (raw.match(/useroperation reverted:\s*([^\n"]+)/i)?.[1] || '').trim();
    let friendly: string;
    if (/Treasury not deployed/i.test(raw)) {
      friendly =
        'This item pays into a pod treasury that the store cannot resolve, so the purchase was rejected. This is a configuration problem on our side, not with your wallet or balance — please let an admin know.';
    } else if (/transfer amount exceeds balance|insufficient|exceeds balance/i.test(raw)) {
      friendly = `You don't have enough ${selectedToken?.symbol || 'tokens'} to complete this purchase.`;
    } else if (/allowance|exceeds allowance/i.test(raw)) {
      friendly = 'Token approval was missing or too small. Try the purchase again.';
    } else if (/User rejected|Request denied|user denied/i.test(raw)) {
      friendly = 'You cancelled the transaction.';
    } else if (/No permission to manage|permission|unauthorized/i.test(raw)) {
      friendly = 'This purchase routes funds to a pod treasury you are not permitted to route to.';
    } else if (reason) {
      friendly = `The network rejected this purchase: ${reason}`;
    } else {
      friendly = error?.message || 'The purchase failed. Please try again.';
    }
    setCheckoutError(friendly);

    console.group('âŒ Combined Transaction Error');
    console.error('ðŸ“‹ Error Details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    // Enhanced error analysis
    if (error.message?.includes('Request denied') || error.message?.includes('User rejected')) {
      console.warn('ðŸš« Transaction was denied by user or wallet');
      console.log('ðŸ’¡ This could be due to:');
      console.log('  - User manually rejected transaction');
      console.log('  - Wallet automatically rejected due to security concerns');
      console.log('  - Smart contract validation failed');
      console.log('  - Pod treasury permission issue');

      // Check if this might be a pod treasury permission issue
      const hasActivePodRouting = products?.some(
        (p) => p.fund_destination_type === 'pod_treasury' && !useFallbackRouting,
      );

      const isPermissionError =
        error.message?.includes('No pod management permission') ||
        error.message?.includes('permission') ||
        error.message?.includes('unauthorized');

      if (hasActivePodRouting && !useFallbackRouting && isPermissionError) {
        console.warn('ðŸŽ¯ Detected specific pod treasury permission issue');
        console.log('ðŸ”„ Will retry with fallback routing to creator wallet');
        setUseFallbackRouting(true);

        // Trigger a retry after a short delay
        setTimeout(() => {
          console.log('ðŸ”„ Retrying transaction with creator wallet routing...');
        }, 1000);
        console.groupEnd();
        return;
      } else if (useFallbackRouting) {
        console.warn('âš ï¸ Fallback routing also failed. This might be a different issue.');
        console.log('ðŸ”„ Resetting fallback routing state');
        setUseFallbackRouting(false);
      }
    }

    console.log('ðŸ“‹ Transaction Parameters:', {
      needsApproval,
      totalCalls: totalCalls.length,
      approveCalls: approveCalls.length,
      purchaseCalls: purchaseCalls.length,
      account: address?.toLowerCase(),
      chainId: BASE_CHAIN_ID,
      isSponsored: true,
    });

    console.groupEnd();

    await logError(error, 'Cart Transaction Error');
  }, [
    products,
    address,
    useFallbackRouting,
    needsApproval,
    totalCalls,
    approveCalls,
    purchaseCalls,
  ]);

  // Hardcoded test call for approve flow
  const testApproveCall = [
    {
      to:
        process.env.NEXT_PUBLIC_SELF_TOKEN ||
        '0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21', // $SELF token address
      abi: [
        {
          name: 'approve',
          type: 'function',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'approve',
      args: [
        process.env.NEXT_PUBLIC_PURCHASE_BURN ||
          '0x5CaD68445feAb8d96a8535B60CC3758B3139B3F7', // purchaseBurn contract
        '500000000000000000', // 0.5 $SELF
      ],
    },
  ];

  // Transaction call generation has been moved to transactionService.ts
  // The transactionData variable now contains: { approveCalls, purchaseCalls, totalCalls, needsApproval }

  return (
    <>
    <S.CartOverlay onClick={closeCart}>
      <S.CartContent onClick={(e) => e.stopPropagation()}>
        <S.CartContentHeader>
          <S.HeaderTitle>Artifacts</S.HeaderTitle>
        </S.CartContentHeader>

        {products && products.length > 0 ? (
          <CartProducts products={products} />
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
            No Artifacts in Cart
          </div>
        )}

        <S.CartFooter>
          {products && products.length > 0 && (
            <>
              <S.Sub>SUBTOTAL</S.Sub>
              <S.SubPrice>
                {selectedToken.symbol === '$SYSTEM'
                  ? formatPrice(totalSystemPrice, '$SYSTEM')
                  : formatPrice(totalSelfPrice, '$SELF')}
              </S.SubPrice>
            </>
          )}

          {products && products.length > 0 && (
            <>
              <TokenSelection
                selectedToken={selectedToken}
                onTokenChange={setSelectedToken}
                tokenOptions={DEFAULT_TOKEN_OPTIONS}
              />

              {checkoutError && (
                <div
                  role="alert"
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem 0.9rem',
                    borderRadius: 8,
                    border: '1px solid #f3c2bd',
                    background: '#fdeceb',
                    color: '#8a2318',
                    fontSize: '0.875rem',
                    lineHeight: 1.45,
                  }}
                >
                  {checkoutError}
                </div>
              )}

              {/* CDP-native transaction button (replaces OnchainKit Transaction) */}
              {totalCalls && totalCalls.length > 0 ? (
                <div style={{ marginTop: '1rem' }}>
                  <CDPTransactionButton
                    onClick={handleCDPTransaction}
                    disabled={isLoading || isSuccess || !currentUser?.evmSmartAccounts?.[0]}
                  >
                    {isLoading
                      ? 'Processing...'
                      : isSuccess
                        ? 'Success!'
                        : needsApproval
                          ? 'Approve & Purchase'
                          : 'Purchase'}
                  </CDPTransactionButton>
                  {isLoading && (
                    <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                      Sending user operation...
                    </div>
                  )}
                  {isSuccess && (
                    <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.875rem', color: '#22c55e' }}>
                      Transaction successful! Orders created.
                    </div>
                  )}
                  {selfPay.preparing && (
                    <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                      Checking your $SELF…
                    </div>
                  )}
                  {selfPay.error && (
                    <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.875rem', color: '#dc2626' }}>
                      {selfPay.error}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  Preparing transaction...
                </div>
              )}
              {selfPay.prepared && (
                <SelfPaymentConfirmModal
                  selection={selfPay.prepared.selection}
                  priceHours={selfPay.prepared.priceSelfHours}
                  onConfirm={handleConfirmSelfPayment}
                  onCancel={selfPay.clear}
                  isProcessing={isLoading}
                />
              )}
            </>
          )}
        </S.CartFooter>
      </S.CartContent>
    </S.CartOverlay>

      {/* Purchase Confirmation Modal - Outside cart overlay for proper z-index */}
      <Dialog
        open={showPurchaseConfirmation}
        onOpenChange={setShowPurchaseConfirmation}
        modal={true}
      >
        <DialogContent className="sm:max-w-md z-[9999]">
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="text-6xl">🎉</div>
            </div>
            <DialogTitle className="text-center text-2xl">Purchase Complete!</DialogTitle>
            <DialogDescription className="text-center">
              Your order has been successfully processed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Product Owner Card */}
            {purchaseDetails?.productOwner && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {purchaseDetails.productOwner.profile_picture ? (
                      <img
                        src={purchaseDetails.productOwner.profile_picture}
                        alt="Product Owner"
                        className="w-12 h-12 rounded-full object-cover border-2 border-green-300"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-green-200 flex items-center justify-center border-2 border-green-300">
                        <span className="text-green-700 font-semibold text-lg">
                          {(purchaseDetails.productOwner.first_name?.[0] ||
                            purchaseDetails.productOwner.wallet_address?.[2] || '?').toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {purchaseDetails.productOwner.first_name && purchaseDetails.productOwner.last_name
                        ? `${purchaseDetails.productOwner.first_name} ${purchaseDetails.productOwner.last_name}`
                        : `${purchaseDetails.productOwner.wallet_address.slice(0, 6)}...${purchaseDetails.productOwner.wallet_address.slice(-4)}`}
                    </p>
                    <p className="text-xs text-green-700 font-medium">
                      ✓ has been notified
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </div>
            )}

            {/* Order Details */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Items:</span>
                <span className="font-medium">{purchaseDetails?.itemCount || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Amount:</span>
                <span className="font-medium">{purchaseDetails?.totalAmount || '0'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Payment Method:</span>
                <span className="font-medium">{purchaseDetails?.token || ''}</span>
              </div>
            </div>

            <p className="text-sm text-center text-gray-600">
              The product owner will fulfill your order and you'll receive tracking updates.
            </p>
          </div>
          <div className="flex gap-2">
            <CDPTransactionButton
              onClick={() => {
                setShowPurchaseConfirmation(false);
                clearCart();
                closeCart();
              }}
              className="flex-1"
            >
              Continue Shopping
            </CDPTransactionButton>
            <CDPTransactionButton
              onClick={() => {
                setShowPurchaseConfirmation(false);
                clearCart();
                closeCart();
                router.push('/marketplace/my-orders');
              }}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              View My Orders
            </CDPTransactionButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

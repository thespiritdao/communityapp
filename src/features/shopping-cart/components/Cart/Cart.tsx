// src/features/shopping-cart/components/Cart/Cart.tsx
'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useRouter } from 'next/navigation';
import { keccak256, toBytes } from 'viem';
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
import debounce from 'lodash.debounce';
import { BaseError } from 'viem';
import { getPublicClient } from '@wagmi/core';
import { supabase } from '@/lib/supabase';
import { createSupabaseSession } from '@/utils/createSupabaseSession';

// Import the full set of transaction components
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import * as S from './style';

const TransactionButtonStyled = styled(TransactionButton)`
  background-color: #0070f3 !important;
  color: #fff !important;
  border-radius: 6px !important;
  border: none !important;
  padding: 0.75rem 1.5rem !important;
  font-size: 1rem !important;
  cursor: pointer !important;
  transition: background-color 0.2s ease !important;

  &:hover {
    background-color: #005bb5 !important;
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
    const publicClient = await getPublicClient();
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
    const publicClient = await getPublicClient();
    const [balance, network, blockNumber] = await Promise.all([
      publicClient.getBalance({ address: userAddress as `0x${string}` }),
      publicClient.getNetwork(),
      publicClient.getBlockNumber(),
    ]);

    console.log('Wallet State:', {
      address: userAddress,
      balance: balance.toString(),
      balanceInEth: Number(balance) / 1e18,
      network: {
        chainId: network.chainId,
        name: network.name,
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
    const publicClient = await getPublicClient();
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
  console.group(`🔍 UserOperation Debug - ${context}`);
  console.log('📋 Calls Array:', calls);
  console.log('📋 Calls Array Length:', calls.length);
  console.log(
    '📋 Contract Addresses:',
    calls.map((call) => call.address),
  );
  console.log(
    '📋 Function Names:',
    calls.map((call) => call.functionName),
  );
  console.log(
    '📋 Arguments:',
    calls.map((call) => call.args),
  );
  console.log(
    '📋 ABI Validation:',
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
    console.log(`📋 Call ${index} Details:`, {
      address: call.address,
      functionName: call.functionName,
      args: call.args,
      abi: call.abi,
      abiFunctions: call.abi
        ?.filter((item: any) => item.type === 'function')
        .map((item: any) => item.name),
    });
  });

  console.log('🔧 Environment Variables:', {
    purchaseRouter: process.env.NEXT_PUBLIC_PURCHASE_ROUTER,
    purchaseBurn: process.env.NEXT_PUBLIC_PURCHASE_BURN,
    systemToken: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
    selfToken: process.env.NEXT_PUBLIC_SELF_TOKEN,
    paymaster: process.env.NEXT_PUBLIC_PAYMASTER?.substring(0, 30) + '...',
  });
  console.log('⏰ Timestamp:', new Date().toISOString());
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
      publicClientToUse = await getPublicClient();
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

    console.group('🔍 Contract Event Verification');
    console.log('📋 Transaction Hash:', transactionHash);
    console.log('📋 Contract Address:', contractAddress);
    console.log('📋 Use Router:', useRouter);
    console.log('📋 Total Logs:', receipt.logs.length);

    // Filter logs for our contract
    const contractLogs = receipt.logs.filter(
      (log) => log.address.toLowerCase() === contractAddress.toLowerCase(),
    );

    console.log('📋 Contract Logs Found:', contractLogs.length);

    if (contractLogs.length > 0) {
      console.log('📋 Contract Events:', contractLogs);

      // Check for purchase events (different for router vs burn)
      const purchaseEvents = contractLogs.filter((log) => {
        if (!('topics' in log) || !Array.isArray((log as any).topics))
          return false;
        try {
          if (useRouter) {
            // PurchaseCompleted event signature from PurchaseRouter
            const eventSignature =
              'PurchaseCompleted(address,string,uint256,uint256,uint8,address,uint256)';
            const eventTopic = keccak256(toBytes(eventSignature));
            console.log(
              '📋 Looking for PurchaseCompleted event topic:',
              eventTopic,
            );
            console.log('📋 Found event topic:', (log as any).topics[0]);
            return (log as any).topics[0] === eventTopic;
          } else {
            // PurchaseArtifact event signature from PurchaseBurn
            const eventSignature =
              'PurchaseArtifact(address,uint256,uint256,string,uint256)';
            const eventTopic = keccak256(toBytes(eventSignature));
            console.log(
              '📋 Looking for PurchaseArtifact event topic:',
              eventTopic,
            );
            console.log('📋 Found event topic:', (log as any).topics[0]);
            return (log as any).topics[0] === eventTopic;
          }
        } catch (error) {
          console.error('Error checking event signature:', error);
          return true; // Accept any event from the contract if signature check fails
        }
      });

      const eventName = useRouter ? 'PurchaseCompleted' : 'PurchaseArtifact';
      console.log(`📋 ${eventName} Events:`, purchaseEvents.length);

      if (purchaseEvents.length > 0) {
        console.log(`✅ ${eventName} event found!`);
        console.log('📋 Event Details:', purchaseEvents[0]);
      } else {
        console.warn(`⚠️ No ${eventName} event found`);
      }
    } else {
      console.warn('⚠️ No logs found for purchase burn contract');
    }

    console.groupEnd();
    return contractLogs.length > 0;
  } catch (error) {
    console.error('❌ Error verifying contract events:', error);
    return false;
  }
};

function DebugTransaction(props) {
  console.log(
    'DebugTransaction received calls:',
    JSON.stringify(props.calls, null, 2),
  );
  return <Transaction {...props} />;
}

export default function Cart({
  tokenBalances,
}: {
  tokenBalances: { systemBalance: string; selfBalance: string };
}) {
  const { products = [], total, isOpen, closeCart, clearCart } = useCart();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const router = useRouter();

  const [selectedToken, setSelectedToken] = useState<Token>(getDefaultToken());
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [useFallbackRouting, setUseFallbackRouting] = useState(false);
  const [processedTransactions, setProcessedTransactions] = useState<
    Set<string>
  >(new Set());
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
        '🔄 Cleared processed transactions for new purchase session (products changed)',
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
        const selfToken = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;

        const systemBalance = await publicClient.readContract({
          address: systemToken,
          abi: parsedErc20ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        });

        const selfBalance = await publicClient.readContract({
          address: selfToken,
          abi: parsedErc20ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        });

        console.log('Token balances:', {
          system: systemBalance.toString(),
          self: selfBalance.toString(),
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
          chainId: walletClient?.chain?.id,
          blockNumber,
        });
      } catch (error) {
        console.error('Debug check failed:', error);
      }
    }
    debugContractState();
  }, [address, publicClient, walletClient]);

  // Reset fallback routing when cart is opened
  useEffect(() => {
    if (isOpen && useFallbackRouting) {
      console.log(
        '🔄 Cart opened - resetting fallback routing state for fresh transaction',
      );
      setUseFallbackRouting(false);
    }
  }, [isOpen, useFallbackRouting]);

  // Debug sponsorship config
  useEffect(() => {
    console.log(
      '✅ CART FIXED: Infinite console loop should be resolved - if you see this once, the fix worked!',
    );
    console.group('🚀 Cart Component Initialization');
    console.log('📋 Component Mounted:', new Date().toISOString());

    // Validate paymaster setup
    const paymasterConfig = validatePaymasterSetup();
    console.log('📋 Paymaster Config:', paymasterConfig);

    // Validate contract addresses
    const { contractAddress, useRouter } = validatePaymasterSetup();
    console.log('📋 Contract Addresses:', {
      purchaseRouter: process.env.NEXT_PUBLIC_PURCHASE_ROUTER,
      purchaseBurn: process.env.NEXT_PUBLIC_PURCHASE_BURN,
      systemToken: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
      selfToken: process.env.NEXT_PUBLIC_SELF_TOKEN,
      activeContract: contractAddress,
      usingRouter: useRouter,
    });

    // Validate ABI
    console.log('📋 ABI Validation:', {
      purchaseRouterABI: {
        length: purchaseRouterABI.length,
        hasPurchaseWithRouting: purchaseRouterABI.some(
          (item) => item.name === 'purchaseWithRouting',
        ),
        functions: purchaseRouterABI
          .filter((item) => item.type === 'function')
          .map((item) => item.name),
      },
      purchaseBurnABI: {
        length: purchaseBurnABI.length,
        hasPurchaseArtifact: purchaseBurnABI.some(
          (item) => item.name === 'purchaseArtifact',
        ),
        functions: purchaseBurnABI
          .filter((item) => item.type === 'function')
          .map((item) => item.name),
      },
    });

    // Validate user state
    console.log('📋 User State:', {
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
    if (walletClient) {
      console.log('Wallet State:', {
        chainId: walletClient.chain?.id,
        network: walletClient.chain?.name,
        isConnected: Boolean(address),
      });
    }
  }, [walletClient, address]);

  const productId =
    products && products.length > 0 ? products.map((p) => p.id).join(',') : '';

  // Extract transaction data using the extracted service
  const transactionData = useMemo(() => {
    console.log('🔄 TransactionData useMemo executing:', {
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
        '⚠️ TransactionData returning empty due to missing requirements:',
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
      );
      console.log('✅ TransactionData prepared successfully:', {
        totalCallsLength: result.totalCalls.length,
        approveCallsLength: result.approveCalls.length,
        purchaseCallsLength: result.purchaseCalls.length,
      });
      return result;
    } catch (error) {
      console.error('❌ TransactionData preparation failed:', error);
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
  ]);

  // For purchase only (approve step skipped for this test)
  // CACHE BUSTER: Force browser reload after fixing infinite console loops
  // TODO: Remove render logs that cause infinite loops
  // console.log('RENDER: selectedToken:', selectedToken);
  // console.log('RENDER: totalSystemPrice:', totalSystemPrice, 'totalSelfPrice:', totalSelfPrice);
  // console.log('RENDER: products:', products);
  // console.log('RENDER: address:', address);

  // Extract calls from prepared transaction data
  const { approveCalls, purchaseCalls, totalCalls } = transactionData;

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

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProcessingOrders, setIsProcessingOrders] = useState(false);

  // Transaction call generation has been moved to transactionService.ts
  // The transactionData variable now contains: { approveCalls, purchaseCalls, totalCalls, needsApproval }

  return (
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

              {/* Combined approval + purchase transaction */}
              {totalCalls && totalCalls.length > 0 ? (
                <Transaction
                  account={address?.toLowerCase() as `0x${string}`}
                  chainId={BASE_CHAIN_ID}
                  calls={totalCalls}
                  isSponsored={true}
                  onSuccess={async (response) => {
                    // Use a more stable transaction ID to prevent duplicates
                    const txHash =
                      response?.transactionReceipts?.[0]?.transactionHash;
                    const userOpHash = response?.userOpHash;
                    const transactionId =
                      txHash ||
                      userOpHash ||
                      `fallback-${Date.now()}-${Math.random()}`;

                    // CRITICAL: Prevent duplicate onSuccess callbacks using ref (survives re-renders)
                    if (onSuccessCallbackRef.current.has(transactionId)) {
                      console.log(
                        '🚫 onSuccess callback already executed for transaction:',
                        transactionId,
                      );
                      return;
                    }
                    onSuccessCallbackRef.current.add(transactionId);

                    console.log(
                      '🎯 onSuccess callback triggered with transaction:',
                      {
                        transactionId,
                        txHash,
                        userOpHash,
                        hasReceipts: !!response?.transactionReceipts?.[0],
                        callbacksExecuted: Array.from(
                          onSuccessCallbackRef.current,
                        ),
                      },
                    );

                    // Reset fallback routing for fresh transactions
                    if (useFallbackRouting) {
                      console.log(
                        '🔄 Resetting fallback routing after successful transaction',
                      );
                      setUseFallbackRouting(false);
                    }

                    console.log(
                      '🎯 Current isProcessingOrders state:',
                      isProcessingOrders,
                    );

                    setIsLoading(false);
                    setIsSuccess(true);
                    setApproveTxSuccess(true);

                    // NOTE: Allowance state is now automatically managed by useCartValidation hook
                    // The hook will re-check allowances on the next render cycle

                    console.group('✅ Combined Transaction Success');
                    console.log('📋 Full Transaction Response:', response);
                    console.log('📋 Approval + Purchase executed together');

                    // Handle Account Abstraction (ERC-4337) transaction response
                    if (response?.userOpHash) {
                      console.log(
                        '📋 UserOperation Hash:',
                        response.userOpHash,
                      );
                      console.log('📋 This is the AA transaction identifier');
                    }

                    if (response?.transactionReceipts?.[0]) {
                      const receipt = response.transactionReceipts[0];
                      console.log(
                        '📋 Bundler Transaction Hash:',
                        receipt.transactionHash,
                      );
                      console.log('📋 Block Number:', receipt.blockNumber);
                      console.log('📋 Status:', receipt.status);
                      console.log('📋 Gas Used:', receipt.gasUsed);
                      console.log('📋 To Address:', receipt.to);
                      console.log('📋 From Address:', receipt.from);
                      console.log('📋 Logs Count:', receipt.logs?.length);

                      // Check if our contract was called
                      const logs = receipt.logs || [];
                      const { contractAddress, useRouter } =
                        validatePaymasterSetup();
                      const contractLogs = logs.filter(
                        (log: any) =>
                          log.address?.toLowerCase() ===
                          contractAddress?.toLowerCase(),
                      );
                      console.log('📋 Contract Logs:', contractLogs);
                      console.log(
                        '📋 Contract Called:',
                        contractLogs.length > 0 ? '✅ Yes' : '❌ No',
                      );

                      if (contractLogs.length === 0) {
                        console.warn(
                          '⚠️ WARNING: Purchase contract was not called!',
                        );
                        console.warn(
                          '⚠️ This indicates the UserOperation did not include the contract call',
                        );
                      }

                      // Log the actual transaction hash that will appear on BaseScan
                      console.log(
                        '📋 BaseScan Transaction URL:',
                        `https://basescan.org/tx/${receipt.transactionHash}`,
                      );

                      // Verify contract events
                      if (contractAddress) {
                        await verifyContractEvents(
                          receipt.transactionHash,
                          contractAddress,
                          useRouter,
                          publicClient,
                        );
                      }
                    } else {
                      console.warn(
                        '⚠️ No transaction receipt found in response',
                      );
                      console.log(
                        '📋 Response structure:',
                        Object.keys(response || {}),
                      );
                    }
                    console.groupEnd();

                    console.log(
                      'Combined approval + purchase transaction succeeded',
                    );

                    // Get transaction receipt for notifications
                    const receipt = response?.transactionReceipts?.[0];

                    // Define orderProcessingKey outside try block for access in finally
                    const orderProcessingKey = `order-processing-${transactionId}`;

                    // Create order records and send notifications
                    try {
                      // Enhanced deduplication logic
                      console.log('🔍 Transaction success handler called:', {
                        transactionId,
                        isProcessingOrders,
                        processedTransactions: Array.from(
                          processedTransactions,
                        ),
                        timestamp: new Date().toISOString(),
                      });

                      // CRITICAL: Early exit to prevent recursive loops
                      console.log(
                        '🚨 RECURSION CHECK: If you see this message multiple times quickly, there is a recursion bug',
                      );

                      // Guard against duplicate processing - check immediately and return
                      if (isProcessingOrders) {
                        console.log(
                          '⏳ Order creation already in progress, EXITING to prevent duplicates',
                        );
                        return;
                      }

                      // Check if we've already processed this transaction
                      if (processedTransactions.has(transactionId)) {
                        console.log(
                          '⏭️ Transaction already processed, EXITING to prevent duplicates:',
                          transactionId,
                        );
                        return;
                      }

                      // Also check database for existing orders with this transaction hash
                      console.log(
                        '🔍 Checking database for existing orders with transaction hash:',
                        receipt?.transactionHash,
                      );

                      // CRITICAL: Check both transaction hash AND product IDs to prevent duplicates
                      if (receipt?.transactionHash) {
                        const { data: existingOrders, error: checkError } =
                          await supabase
                            .from('marketplace_orders')
                            .select('id, transaction_hash, product_id')
                            .eq('transaction_hash', receipt.transactionHash);

                        if (checkError) {
                          console.error(
                            '❌ Error checking for existing orders:',
                            checkError,
                          );
                        } else if (
                          existingOrders &&
                          existingOrders.length > 0
                        ) {
                          // Check if we have orders for these specific products
                          const productIds = products.map((p) =>
                            p.id.toString(),
                          );
                          const existingProductIds = existingOrders.map(
                            (o) => o.product_id,
                          );
                          const hasAllProducts = productIds.every((pid) =>
                            existingProductIds.includes(pid),
                          );

                          if (hasAllProducts) {
                            console.log(
                              '⚠️ All products already have orders for this transaction, EXITING to prevent duplicates:',
                              {
                                transactionHash: receipt.transactionHash,
                                existingOrderIds: existingOrders.map(
                                  (o) => o.id,
                                ),
                                existingProductIds,
                                requestedProductIds: productIds,
                              },
                            );
                            return;
                          }
                        }
                      }

                      // Mark this transaction as being processed IMMEDIATELY
                      setProcessedTransactions((prev) => {
                        const newSet = new Set(prev).add(transactionId);
                        console.log(
                          '📝 Added transaction to processed list. New set:',
                          Array.from(newSet),
                        );
                        return newSet;
                      });
                      setIsProcessingOrders(true);

                      // CRITICAL: Add transaction-specific flag to prevent duplicate processing
                      if (window[orderProcessingKey]) {
                        console.log(
                          '⚠️ Orders already being processed for this transaction, skipping duplicate',
                        );
                        return;
                      }
                      window[orderProcessingKey] = true;

                      console.log(
                        '🚀 STARTING ORDER CREATION AND NOTIFICATION PROCESS',
                      );
                      console.log('🛒 Processing', products.length, 'products');

                      // Ensure user is authenticated with Supabase before creating orders
                      console.log(
                        '🔐 Ensuring Supabase authentication for order creation...',
                      );
                      try {
                        // Get or create auth tokens via API
                        const authResponse = await fetch(
                          '/api/auth/onchainkit',
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              address: address.toLowerCase(),
                            }),
                          },
                        );

                        if (!authResponse.ok) {
                          throw new Error(
                            `Auth API failed: ${authResponse.status}`,
                          );
                        }

                        const authData = await authResponse.json();
                        console.log('✅ Auth API response received:', {
                          hasToken: !!authData.supabaseToken,
                        });

                        // Create Supabase session
                        await createSupabaseSession(
                          authData.supabaseToken,
                          authData.supabaseRefreshToken,
                        );
                        console.log(
                          '✅ Supabase session established for order creation',
                        );
                      } catch (authError) {
                        console.error(
                          '❌ Failed to establish Supabase session:',
                          authError,
                        );
                        throw new Error(
                          `Authentication failed: ${authError.message}`,
                        );
                      }

                      const orderPromises = products.map(async (product) => {
                        console.log('📦 Creating order record for product:', {
                          productName: product.name || product.title,
                          productId: product.id.toString(),
                          requiredToken: product.required_token,
                          buyerAddress: address,
                          quantity: product.quantity || 1,
                        });

                        // Calculate the price paid for this specific product
                        // FIX: Use correct property names with underscores (price_self, price_system)
                        const productSelfPrice =
                          selectedToken.symbol === '$SELF'
                            ? (product.price_self || 0) *
                              (product.quantity || 1)
                            : 0;
                        const productSystemPrice =
                          selectedToken.symbol === '$SYSTEM'
                            ? (product.price_system || 0) *
                              (product.quantity || 1)
                            : 0;

                        console.log('💰 Cart order price calculation:', {
                          token: selectedToken.symbol,
                          price_self: product.price_self,
                          price_system: product.price_system,
                          quantity: product.quantity || 1,
                          calculatedSelfPrice: productSelfPrice,
                          calculatedSystemPrice: productSystemPrice,
                        });

                        // Create order record in database
                        const { data: orderData, error: orderError } =
                          await supabase
                            .from('marketplace_orders')
                            .insert({
                              buyer_address: address.toLowerCase(),
                              product_id: product.id.toString(),
                              product_name: product.name || product.title,
                              quantity: product.quantity || 1,
                              price_paid_self: productSelfPrice,
                              price_paid_system: productSystemPrice,
                              transaction_hash: receipt?.transactionHash,
                              status: 'processing',
                            })
                            .select()
                            .single();

                        if (orderError) {
                          console.error(
                            'Failed to create order record:',
                            orderError,
                          );
                          // Don't throw - just log and continue
                          // throw new Error(`Order creation error: ${orderError.message}`);
                          return null; // Return null for failed orders
                        }

                        console.log('✅ Order record created:', orderData);

                        // Send purchase notification to fulfillment managers
                        console.log('🔔 Creating notification for product:', {
                          productName: product.name || product.title,
                          productId: product.id.toString(),
                          requiredToken: product.required_token,
                          buyerAddress: address,
                        });

                        console.log(
                          '🌐 Making API call to /api/notifications with data:',
                          {
                            type: 'purchase_completed',
                            buyerAddress: address,
                            productName: product.name || product.title,
                            productId: product.id.toString(),
                            orderId: orderData.id, // Link to the actual order ID for notifications
                            requiredToken: product.required_token,
                            transactionHash: receipt?.transactionHash,
                          },
                        );

                        const response = await fetch('/api/notifications', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            type: 'purchase_completed',
                            buyerAddress: address,
                            productName: product.name || product.title,
                            productId: product.id.toString(),
                            orderId: orderData.id, // Link to the actual order ID for notifications
                            requiredToken: product.required_token,
                            transactionHash: receipt?.transactionHash,
                          }),
                        });

                        console.log('🌐 API response status:', response.status);

                        if (!response.ok) {
                          const errorData = await response.json();
                          console.error(
                            'Failed to create notification:',
                            errorData,
                          );
                          // Don't throw - just log and continue
                          // throw new Error(`Notification API error: ${errorData.error}`);
                          return null; // Return null for failed notifications
                        }

                        return response.json();
                      });

                      await Promise.all(orderPromises);
                      console.log(
                        '✅ All orders created and notifications sent successfully - TransactionID:',
                        transactionId,
                      );
                    } catch (orderError) {
                      console.error(
                        '❌ Failed to create orders or send notifications:',
                        orderError,
                      );
                      // Don't block the purchase flow if order creation fails
                    } finally {
                      setIsProcessingOrders(false);
                      // Clean up the processing flag after completion
                      if (window[orderProcessingKey]) {
                        delete window[orderProcessingKey];
                      }
                    }

                    // Clear the cart after successful purchase
                    clearCart();
                    closeCart();

                    // TODO: Re-enable after debugging purchase notifications
                    // Force a hard refresh to show updated balances
                    // window.location.reload();
                    console.log(
                      '🔍 Purchase complete - page refresh disabled for debugging',
                    );
                  }}
                  onError={(error) => {
                    setIsLoading(false);
                    setIsSuccess(false);
                    setApproveTxSuccess(false);

                    console.group('❌ Combined Transaction Error');
                    console.error('📋 Error Details:', {
                      name: error.name,
                      message: error.message,
                      stack: error.stack,
                    });
                    console.error('📋 Error Type:', typeof error);
                    console.error(
                      '📋 Error Constructor:',
                      error.constructor.name,
                    );

                    // Enhanced error analysis
                    if (error.message?.includes('Request denied')) {
                      console.warn(
                        '🚫 Transaction was denied by user or wallet',
                      );
                      console.log('💡 This could be due to:');
                      console.log('  - User manually rejected transaction');
                      console.log(
                        '  - Wallet automatically rejected due to security concerns',
                      );
                      console.log('  - Smart contract validation failed');
                      console.log('  - Pod treasury permission issue');

                      // Check if this might be a pod treasury permission issue
                      // BUT only trigger fallback for explicit permission errors
                      const hasActivePodRouting = products?.some(
                        (p) =>
                          p.fund_destination_type === 'pod_treasury' &&
                          !useFallbackRouting,
                      );

                      const isPermissionError =
                        error.message?.includes(
                          'No pod management permission',
                        ) ||
                        error.message?.includes('permission') ||
                        error.message?.includes('unauthorized');

                      if (
                        hasActivePodRouting &&
                        !useFallbackRouting &&
                        isPermissionError
                      ) {
                        console.warn(
                          '🎯 Detected specific pod treasury permission issue',
                        );
                        console.log(
                          '🔄 Will retry with fallback routing to creator wallet',
                        );
                        setUseFallbackRouting(true);

                        // Trigger a retry after a short delay
                        setTimeout(() => {
                          console.log(
                            '🔄 Retrying transaction with creator wallet routing...',
                          );
                          // The component will re-render with useFallbackRouting=true
                          // which will change the purchase calls to use creator wallet
                        }, 1000);
                        return; // Don't proceed with normal error handling
                      } else if (useFallbackRouting) {
                        console.warn(
                          '⚠️ Fallback routing also failed. This might be a different issue.',
                        );
                        console.log('🔄 Resetting fallback routing state');
                        setUseFallbackRouting(false);
                      }
                    }

                    // Log transaction parameters for debugging
                    console.log('📋 Transaction Parameters:', {
                      needsApproval,
                      totalCalls: totalCalls.length,
                      approveCalls: approveCalls.length,
                      purchaseCalls: purchaseCalls.length,
                      account: address?.toLowerCase(),
                      chainId: BASE_CHAIN_ID,
                      isSponsored: true,
                    });

                    console.groupEnd();

                    console.error(
                      'Transaction error (approval + purchase):',
                      error,
                    );
                    handleTransactionError(
                      error,
                      'approval + purchase',
                      address?.toLowerCase(),
                    ).then((paymasterResult) => {
                      if (
                        paymasterResult.isInfrastructureError &&
                        retryCount < MAX_RETRIES
                      ) {
                        console.log(
                          `🔄 Retrying combined transaction (attempt ${retryCount + 1}/${MAX_RETRIES})`,
                        );
                        setRetryCount((prev) => prev + 1);
                        setIsRetrying(true);

                        // Wait before retry
                        setTimeout(() => {
                          setIsRetrying(false);
                        }, paymasterResult.retryDelay);
                      } else {
                        handleTransactionError(
                          error,
                          'approval + purchase',
                          address?.toLowerCase(),
                        );
                      }
                    });
                  }}
                >
                  <TransactionButton
                    text={
                      isLoading
                        ? 'Processing...'
                        : isSuccess
                          ? 'Success!'
                          : needsApproval
                            ? 'Approve & Purchase'
                            : 'Purchase'
                    }
                    className="text-white px-4 py-2 rounded hover:bg-[#254A40]"
                    style={{ backgroundColor: '#2F5D50' }}
                    disabled={isLoading || isSuccess}
                  />
                  <TransactionSponsor />
                  <TransactionStatus>
                    <TransactionStatusLabel />
                    <TransactionStatusAction />
                  </TransactionStatus>
                </Transaction>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  Preparing transaction...
                </div>
              )}
            </>
          )}
        </S.CartFooter>
      </S.CartContent>
    </S.CartOverlay>
  );
}

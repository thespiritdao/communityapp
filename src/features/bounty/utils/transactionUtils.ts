/**
 * Transaction Utilities for Bounty System
 *
 * Provides reusable utilities for handling on-chain transactions with:
 * - Comprehensive logging
 * - Error handling with fallback
 * - Transaction monitoring and polling
 * - State validation
 * - Deduplication protection
 *
 * @module transactionUtils
 */

import type { PublicClient, TransactionReceipt } from 'viem';
import { BaseError } from 'viem';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TransactionConfig {
  isSponsored: boolean;
  hasFallback?: boolean;
  chainId: number;
}

export interface TransactionLifecycleLog {
  stage: string;
  timestamp: string;
  data: any;
  paymasterConfig?: {
    endpoint: string | undefined;
    isValid: boolean;
  };
}

export interface TransactionValidation {
  isValid: boolean;
  issues: string[];
  data: any;
}

export interface TransactionCallData {
  address: `0x${string}`;
  abi: any;
  functionName: string;
  args: any[];
}

export interface WalletState {
  address: string;
  balance: string;
  balanceInEth: number;
  blockNumber: string;
  timestamp: string;
}

export interface NetworkConditions {
  gasPrice: string;
  gasPriceInGwei: number;
  blockNumber: string;
  blockTimestamp: string;
  baseFeePerGas?: string;
  timestamp: string;
}

export interface TransactionErrorResult {
  shouldRetry: boolean;
  useSponsored?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const BASE_CHAIN_ID = 8453; // Base mainnet
const MIN_ETH_FOR_GAS = BigInt('1000000000000000'); // 0.001 ETH in wei
const TRANSACTION_POLL_INTERVAL = 3000; // 3 seconds
const TRANSACTION_POLL_TIMEOUT = 60000; // 60 seconds

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validates paymaster endpoint configuration
 */
export const validatePaymasterConfig = (): boolean => {
  const paymasterEndpoint = process.env.NEXT_PUBLIC_PAYMASTER;
  if (!paymasterEndpoint) {
    console.error('❌ Paymaster endpoint not configured');
    return false;
  }

  try {
    new URL(paymasterEndpoint);
    return true;
  } catch (e) {
    console.error('❌ Invalid paymaster endpoint URL:', paymasterEndpoint);
    return false;
  }
};

/**
 * Validates transaction data structure before submission
 */
export const validateTransactionData = (data: any): TransactionValidation => {
  const validation: TransactionValidation = {
    isValid: true,
    issues: [],
    data: {}
  };

  try {
    // Deep clone with BigInt handling
    validation.data = JSON.parse(JSON.stringify(data, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }));

    // Validate required fields
    if (!validation.data.address) validation.issues.push('Missing address');
    if (!validation.data.chainId) validation.issues.push('Missing chainId');
    if (!validation.data.calls) validation.issues.push('Missing calls');

    // Validate calls array
    if (Array.isArray(validation.data.calls)) {
      validation.data.calls.forEach((call: any, index: number) => {
        if (!call.address) validation.issues.push(`Call ${index}: Missing address`);
        if (!call.abi) validation.issues.push(`Call ${index}: Missing ABI`);
        if (!call.functionName) validation.issues.push(`Call ${index}: Missing functionName`);
        if (!Array.isArray(call.args)) validation.issues.push(`Call ${index}: Missing args array`);
      });
    } else {
      validation.issues.push('Calls is not an array');
    }

    validation.isValid = validation.issues.length === 0;
  } catch (e) {
    validation.isValid = false;
    validation.issues.push(`Serialization error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return validation;
};

// ============================================================================
// WALLET & NETWORK STATE
// ============================================================================

/**
 * Checks if wallet has sufficient ETH balance for gas
 */
export const checkETHBalance = async (
  address: string,
  publicClient: PublicClient
): Promise<boolean> => {
  try {
    const balance = await publicClient.getBalance({ address: address as `0x${string}` });
    return balance >= MIN_ETH_FOR_GAS;
  } catch (error) {
    console.error('❌ Error checking ETH balance:', error);
    return false;
  }
};

/**
 * Logs current wallet state for debugging
 */
export const logWalletState = async (
  userAddress: string,
  publicClient: PublicClient
): Promise<WalletState | null> => {
  try {
    const [balance, blockNumber] = await Promise.all([
      publicClient.getBalance({ address: userAddress as `0x${string}` }),
      publicClient.getBlockNumber()
    ]);

    const state: WalletState = {
      address: userAddress,
      balance: balance.toString(),
      balanceInEth: Number(balance) / 1e18,
      blockNumber: blockNumber.toString(),
      timestamp: new Date().toISOString()
    };

    console.log('💼 Wallet State:', state);
    return state;
  } catch (error) {
    console.error('❌ Error logging wallet state:', error);
    return null;
  }
};

/**
 * Logs current network conditions for debugging
 */
export const logNetworkConditions = async (
  publicClient: PublicClient
): Promise<NetworkConditions | null> => {
  try {
    const [gasPrice, block] = await Promise.all([
      publicClient.getGasPrice(),
      publicClient.getBlock()
    ]);

    const conditions: NetworkConditions = {
      gasPrice: gasPrice.toString(),
      gasPriceInGwei: Number(gasPrice) / 1e9,
      blockNumber: block.number.toString(),
      blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      baseFeePerGas: block.baseFeePerGas?.toString(),
      timestamp: new Date().toISOString()
    };

    console.log('🌐 Network Conditions:', conditions);
    return conditions;
  } catch (error) {
    console.error('❌ Error logging network conditions:', error);
    return null;
  }
};

// ============================================================================
// TRANSACTION CONFIGURATION
// ============================================================================

/**
 * Determines optimal transaction configuration based on wallet and network state
 */
export const getTransactionConfig = async (
  userAddress: string,
  publicClient: PublicClient
): Promise<TransactionConfig> => {
  try {
    // Log initial state
    await logWalletState(userAddress, publicClient);
    await logNetworkConditions(publicClient);

    const hasETH = await checkETHBalance(userAddress, publicClient);
    const paymasterStatus = validatePaymasterConfig();

    console.log('⚙️ Transaction Configuration Decision:', {
      hasETH,
      paymasterStatus,
      address: userAddress,
      timestamp: new Date().toISOString(),
      decision: hasETH && !paymasterStatus ? 'non-sponsored' :
                hasETH && paymasterStatus ? 'sponsored-with-fallback' :
                !hasETH && paymasterStatus ? 'sponsored-only' : 'cannot-proceed'
    });

    // If we have ETH and paymaster is not working, use non-sponsored
    if (hasETH && !paymasterStatus) {
      console.log('💰 Using non-sponsored transaction (paymaster unavailable)');
      return {
        isSponsored: false,
        chainId: BASE_CHAIN_ID
      };
    }

    // If we have ETH but paymaster is working, try sponsored first
    if (hasETH && paymasterStatus) {
      console.log('🎁 Using sponsored transaction with ETH fallback');
      return {
        isSponsored: true,
        hasFallback: true,
        chainId: BASE_CHAIN_ID
      };
    }

    // If no ETH, we must use sponsored
    if (!hasETH && paymasterStatus) {
      console.log('🎁 Using sponsored transaction (no ETH available)');
      return {
        isSponsored: true,
        hasFallback: false,
        chainId: BASE_CHAIN_ID
      };
    }

    // If no ETH and no paymaster, we can't proceed
    throw new Error('No ETH for gas and paymaster not available');
  } catch (error) {
    console.error('❌ Error getting transaction config:', error);
    throw error;
  }
};

// ============================================================================
// TRANSACTION LOGGING
// ============================================================================

/**
 * Logs transaction lifecycle events with comprehensive context
 */
export const logTransactionLifecycle = (
  stage: string,
  data: any
): TransactionLifecycleLog => {
  const timestamp = new Date().toISOString();
  const log: TransactionLifecycleLog = {
    stage,
    timestamp,
    data,
    paymasterConfig: {
      endpoint: process.env.NEXT_PUBLIC_PAYMASTER,
      isValid: validatePaymasterConfig()
    }
  };

  console.log(`[${timestamp}] 📊 Transaction ${stage}:`, log);
  return log;
};

/**
 * Logs transaction parameters in a readable format
 */
export const logTransactionParameters = (
  calls: TransactionCallData[],
  isSponsored: boolean
): void => {
  console.log('📋 Transaction Parameters:', {
    calls: calls.map(call => ({
      address: call.address,
      functionName: call.functionName,
      args: call.args.map((arg: any) => {
        if (typeof arg === 'bigint') {
          return {
            value: arg.toString(),
            type: 'bigint'
          };
        }
        return arg;
      })
    })),
    isSponsored,
    timestamp: new Date().toISOString()
  });
};

// ============================================================================
// TRANSACTION SIMULATION
// ============================================================================

/**
 * Simulates transaction execution to catch errors before submitting
 */
export const simulateTransaction = async (
  calls: TransactionCallData[],
  publicClient: PublicClient,
  userAddress: string
): Promise<boolean> => {
  try {
    const simulation = await publicClient.simulateContract({
      ...calls[0],
      account: userAddress as `0x${string}`,
    });

    console.log('✅ Transaction simulation successful:', {
      simulation,
      calls: calls[0],
      account: userAddress
    });

    return true;
  } catch (error) {
    console.error('❌ Transaction simulation failed:', {
      error,
      calls: calls[0],
      account: userAddress
    });
    return false;
  }
};

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Checks if error is from Coinbase Wallet infrastructure
 */
export const isCoinbaseWalletError = (error: any): boolean => {
  return error?.message?.includes('scanTxTimeout') ||
         error?.message?.includes('api.wallet.coinbase.com');
};

/**
 * Comprehensive transaction error handler with fallback logic
 */
export const handleTransactionError = async (
  error: Error,
  context: string,
  calls: TransactionCallData[],
  userAddress: string,
  publicClient: PublicClient
): Promise<TransactionErrorResult> => {
  try {
    if (!userAddress) {
      throw new Error('No user address available');
    }

    // Log state before error handling
    await logWalletState(userAddress, publicClient);
    await logNetworkConditions(publicClient);

    const simulationSuccess = await simulateTransaction(calls, publicClient, userAddress);

    // Get current transaction config
    const txConfig = await getTransactionConfig(userAddress, publicClient);
    const isCoinbaseError = isCoinbaseWalletError(error);

    // Log transaction parameters
    logTransactionParameters(calls, txConfig.isSponsored);

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
        })
      },
      transactionData: {
        address: userAddress,
        chainId: BASE_CHAIN_ID,
        calls,
        ...txConfig,
        simulationSuccess,
        walletType: 'coinbase',
        timestamp: new Date().toISOString()
      }
    });

    // If it's a Coinbase Wallet error and we have a fallback available
    if (isCoinbaseError && txConfig.hasFallback) {
      console.warn('⚠️ Coinbase Wallet error detected with fallback available', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      return { shouldRetry: true, useSponsored: false };
    }

    return { shouldRetry: false };
  } catch (e) {
    console.error(`❌ Error in ${context} error handler:`, e);
    return { shouldRetry: false };
  }
};

// ============================================================================
// TRANSACTION MONITORING
// ============================================================================

/**
 * Polls for transaction receipt with timeout
 * Used as fallback when onStatus callback doesn't fire
 */
export const pollForTransactionReceipt = async (
  transactionHash: string,
  publicClient: PublicClient,
  onSuccess: (receipt: TransactionReceipt) => void,
  onTimeout: () => void,
  pollInterval: number = TRANSACTION_POLL_INTERVAL,
  timeout: number = TRANSACTION_POLL_TIMEOUT
): Promise<() => void> => {
  console.log('⏱️ Starting transaction receipt polling:', {
    transactionHash,
    pollInterval,
    timeout
  });

  let isActive = true;

  const poll = async () => {
    if (!isActive) return;

    try {
      console.log('🔍 Polling for transaction receipt:', transactionHash);

      const receipt = await publicClient.getTransactionReceipt({
        hash: transactionHash as `0x${string}`
      });

      if (receipt && receipt.status === 'success') {
        console.log('✅ Transaction receipt found:', receipt.transactionHash);
        isActive = false;
        onSuccess(receipt);
        return;
      }
    } catch (error) {
      console.error('❌ Error polling for receipt:', error);
    }

    // Continue polling if still active
    if (isActive) {
      setTimeout(poll, pollInterval);
    }
  };

  // Start polling
  setTimeout(poll, pollInterval);

  // Set timeout
  const timeoutId = setTimeout(() => {
    if (isActive) {
      console.log('⏱️ Transaction polling timed out');
      isActive = false;
      onTimeout();
    }
  }, timeout);

  // Return cleanup function
  return () => {
    isActive = false;
    clearTimeout(timeoutId);
  };
};

// ============================================================================
// TRANSACTION STATUS HANDLER
// ============================================================================

export interface TransactionStatusHandlers {
  onInit?: () => void;
  onPending?: () => void;
  onSuccess?: (receipt: TransactionReceipt) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

/**
 * Standardized transaction status handler
 * Provides consistent handling across all transaction components
 */
export const createTransactionStatusHandler = (
  handlers: TransactionStatusHandlers,
  context: string
) => {
  return (status: any) => {
    logTransactionLifecycle(`${context} Status`, {
      statusName: status.statusName,
      hasReceipts: !!(status.transactionReceipts || status.statusData?.transactionReceipts),
      timestamp: new Date().toISOString()
    });

    if (status.statusName === 'init' && handlers.onInit) {
      console.log(`🔄 ${context}: Transaction initialized`);
      handlers.onInit();
    }

    if (status.statusName === 'transactionPending' && handlers.onPending) {
      console.log(`⏳ ${context}: Transaction pending`);
      handlers.onPending();
    }

    if (status.statusName === 'success') {
      console.log(`✅ ${context}: Transaction succeeded`);

      const receipts = status.transactionReceipts || status.statusData?.transactionReceipts;
      if (receipts && receipts.length > 0 && handlers.onSuccess) {
        handlers.onSuccess(receipts[0] as TransactionReceipt);
      }
    }

    if (status.statusName === 'error' && handlers.onError) {
      console.error(`❌ ${context}: Transaction failed`);
      handlers.onError(status.error);
    }

    // Call onComplete for any terminal state
    if ((status.statusName === 'success' || status.statusName === 'error') && handlers.onComplete) {
      handlers.onComplete();
    }
  };
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Validation
  validatePaymasterConfig,
  validateTransactionData,

  // Wallet & Network
  checkETHBalance,
  logWalletState,
  logNetworkConditions,

  // Configuration
  getTransactionConfig,

  // Logging
  logTransactionLifecycle,
  logTransactionParameters,

  // Simulation & Testing
  simulateTransaction,

  // Error Handling
  isCoinbaseWalletError,
  handleTransactionError,

  // Monitoring
  pollForTransactionReceipt,
  createTransactionStatusHandler,

  // Constants
  BASE_CHAIN_ID,
  MIN_ETH_FOR_GAS,
  TRANSACTION_POLL_INTERVAL,
  TRANSACTION_POLL_TIMEOUT,
};

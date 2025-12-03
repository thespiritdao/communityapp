import { publicClient } from '@/config/wagmi.client';
import { BaseError } from 'viem';

const ERROR_LOG_KEY = 'purchase-errors';

export interface TransactionValidation {
  isValid: boolean;
  issues: string[];
  data: any;
}

export function formatTokenAmount(amount: number): bigint {
  if (isNaN(amount) || amount < 0) {
    throw new Error('Invalid amount: must be a non-negative number');
  }
  if (amount === 0) {
    return 0n;
  }
  const amountStr = amount.toFixed(18);
  const parts = amountStr.split('.');
  const wholePart = parts[0];
  const decimalPart = (parts[1] || '').padEnd(18, '0').substring(0, 18);
  const combined = wholePart + decimalPart;
  return BigInt(combined);
}

export async function checkETHBalance(address: string): Promise<boolean> {
  try {
    const balance = await publicClient.getBalance({
      address: address as `0x${string}`,
    });
    const minRequired = 1000000000000000n; // 0.001 ETH in wei
    return balance >= minRequired;
  } catch (error) {
    console.error('Error checking ETH balance:', error);
    return false;
  }
}

export function validatePaymasterConfig(): boolean {
  const paymasterEndpoint = process.env.NEXT_PUBLIC_PAYMASTER;
  if (!paymasterEndpoint) {
    console.error('Paymaster endpoint not configured');
    return false;
  }

  try {
    new URL(paymasterEndpoint);
    return true;
  } catch (e) {
    console.error('Invalid paymaster endpoint URL:', paymasterEndpoint);
    return false;
  }
}

export async function logWalletState(userAddress: string): Promise<void> {
  try {
    const [balance, blockNumber] = await Promise.all([
      publicClient.getBalance({ address: userAddress as `0x${string}` }),
      publicClient.getBlockNumber(),
    ]);

    console.log('Wallet State:', {
      address: userAddress,
      balance: balance.toString(),
      balanceInEth: Number(balance) / 1e18,
      network: {
        chainId: publicClient.chain.id,
        name: publicClient.chain.name,
      },
      blockNumber: blockNumber.toString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error logging wallet state:', error);
  }
}

export async function logNetworkConditions(): Promise<void> {
  try {
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
}

export function logTransactionError(error: unknown): void {
  const timestamp = new Date().toISOString();
  const errorData = {
    timestamp,
    error:
      error instanceof Error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : String(error),
    type: error instanceof BaseError ? 'BaseError' : 'Unknown',
  };

  try {
    const existingLogs = localStorage.getItem(ERROR_LOG_KEY);
    const logs = existingLogs ? JSON.parse(existingLogs) : [];
    logs.push(errorData);
    if (logs.length > 50) logs.shift();
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to store error log:', e);
  }

  console.error(`[${timestamp}] Transaction Error:`, errorData);
}

export function getErrorLogs(): any[] {
  try {
    const logsStr = localStorage.getItem(ERROR_LOG_KEY);
    return logsStr ? JSON.parse(logsStr) : [];
  } catch (e) {
    console.error('Failed to retrieve error logs:', e);
    return [];
  }
}

export function clearErrorLogs(): void {
  try {
    localStorage.removeItem(ERROR_LOG_KEY);
    console.log('Error logs cleared');
  } catch (e) {
    console.error('Failed to clear error logs:', e);
  }
}

export function validateTransactionData(data: any): TransactionValidation {
  const validation: TransactionValidation = {
    isValid: false,
    issues: [],
    data: null,
  };

  try {
    const serialized = JSON.stringify(data);
    validation.data = JSON.parse(serialized);

    if (!validation.data.address) validation.issues.push('Missing address');
    if (!validation.data.chainId) validation.issues.push('Missing chainId');
    if (!validation.data.calls) validation.issues.push('Missing calls');

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
}

export async function getTransactionConfig(userAddress: string): Promise<{
  hasETH: boolean;
  paymasterStatus: boolean;
  decision: string;
}> {
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

  return {
    hasETH,
    paymasterStatus,
    decision:
      hasETH && !paymasterStatus
        ? 'non-sponsored'
        : hasETH && paymasterStatus
          ? 'sponsored-with-fallback'
          : !hasETH && paymasterStatus
            ? 'sponsored-only'
            : 'cannot-proceed',
  };
}

export function isCoinbaseWalletError(error: any): boolean {
  return (
    error?.message?.includes('scanTxTimeout') ||
    error?.message?.includes('api.wallet.coinbase.com')
  );
}

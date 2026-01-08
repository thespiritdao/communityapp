/**
 * Paymaster Utilities for Gas Sponsorship
 *
 * Integrates Coinbase Paymaster with CDP Embedded Wallet transactions.
 * The paymaster RPC endpoint provides gas sponsorship data that must be
 * included in the transaction for it to be sponsored.
 */

import { encodeFunctionData, type Abi, type Hex } from 'viem';

interface PaymasterDataResponse {
  paymasterAndData: Hex;
  preVerificationGas: Hex;
  verificationGasLimit: Hex;
  callGasLimit: Hex;
}

/**
 * Fetch paymaster sponsorship data from Coinbase Paymaster RPC
 *
 * This allows gas-free transactions by having Coinbase pay for gas fees.
 * Contracts must be whitelisted in the paymaster configuration.
 */
export async function fetchPaymasterData(params: {
  userAddress: `0x${string}`;
  contractAddress: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}): Promise<PaymasterDataResponse | null> {
  const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER;

  if (!paymasterUrl) {
    console.warn('⚠️ NEXT_PUBLIC_PAYMASTER not configured');
    return null;
  }

  try {
    // Encode the contract call data
    const callData = encodeFunctionData({
      abi: params.abi,
      functionName: params.functionName,
      args: params.args || [],
    });

    // Request paymaster data from Coinbase RPC
    const response = await fetch(paymasterUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'pm_getPaymasterData',
        params: [{
          sender: params.userAddress,
          to: params.contractAddress,
          data: callData,
          value: params.value ? `0x${params.value.toString(16)}` : '0x0',
        }],
      }),
    });

    if (!response.ok) {
      console.error('❌ Paymaster RPC error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    if (data.error) {
      console.error('❌ Paymaster returned error:', data.error);
      return null;
    }

    console.log('✅ Paymaster data fetched:', {
      paymasterAndData: data.result.paymasterAndData?.substring(0, 20) + '...',
      hasGasLimits: !!(data.result.callGasLimit && data.result.verificationGasLimit),
    });

    return data.result;
  } catch (error) {
    console.error('❌ Failed to fetch paymaster data:', error);
    return null;
  }
}

/**
 * Check if paymaster is configured and available
 */
export function isPaymasterConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_PAYMASTER;
}

/**
 * Get paymaster info for display
 */
export function getPaymasterInfo() {
  const url = process.env.NEXT_PUBLIC_PAYMASTER;

  if (!url) {
    return {
      configured: false,
      network: null,
    };
  }

  // Extract network from URL (e.g., "base" or "base-sepolia")
  const networkMatch = url.match(/\/rpc\/v1\/([^\/]+)\//);
  const network = networkMatch ? networkMatch[1] : 'unknown';

  return {
    configured: true,
    network,
    endpoint: url.substring(0, 50) + '...',
  };
}

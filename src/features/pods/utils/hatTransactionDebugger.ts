/**
 * Transaction Debugger for Hat Operations
 *
 * Helps debug the gas estimation failure in changeHatDetails transactions.
 */

import { type PublicClient, encodeFunctionData } from 'viem';
import { convertHatIdForViem } from './viemHatIdFix';

export interface TransactionDebugInfo {
  hatId: string;
  hatIdBigInt: string;
  userAddress: string;
  ipfsUri: string;
  encodedData: string;
  estimatedGas?: bigint;
  simulationResult?: any;
  error?: string;
}

/**
 * Debug the changeHatDetails transaction to identify gas estimation issues
 */
export async function debugChangeHatDetailsTransaction(
  publicClient: PublicClient,
  hatsProtocolAddress: `0x${string}`,
  hatId: string,
  userAddress: string,
  ipfsUri: string,
): Promise<TransactionDebugInfo> {
  console.group('🔍 DEBUGGING CHANGE HAT DETAILS TRANSACTION');

  try {
    const hatIdBigInt = convertHatIdForViem(hatId);

    // Encode the function data
    const encodedData = encodeFunctionData({
      abi: [
        {
          name: 'changeHatDetails',
          type: 'function',
          inputs: [
            { name: '_hatId', type: 'uint256' },
            { name: '_newDetails', type: 'string' },
          ],
          outputs: [],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'changeHatDetails',
      args: [hatIdBigInt, ipfsUri],
    });

    console.log('📋 Transaction Parameters:', {
      to: hatsProtocolAddress,
      hatId,
      hatIdBigInt: hatIdBigInt.toString(),
      userAddress,
      ipfsUri,
      encodedDataLength: encodedData.length,
    });

    const debugInfo: TransactionDebugInfo = {
      hatId,
      hatIdBigInt: hatIdBigInt.toString(),
      userAddress,
      ipfsUri,
      encodedData,
    };

    // Try to simulate the transaction
    try {
      console.log('🧪 Simulating transaction...');

      const simulationResult = await publicClient.simulateContract({
        address: hatsProtocolAddress,
        abi: [
          {
            name: 'changeHatDetails',
            type: 'function',
            inputs: [
              { name: '_hatId', type: 'uint256' },
              { name: '_newDetails', type: 'string' },
            ],
            outputs: [],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'changeHatDetails',
        args: [hatIdBigInt, ipfsUri],
        account: userAddress as `0x${string}`,
      });

      debugInfo.simulationResult = simulationResult;
      console.log('✅ Simulation successful:', simulationResult);
    } catch (simulationError: any) {
      debugInfo.error = simulationError.message;
      console.error('❌ Simulation failed:', simulationError);

      // Analyze the error
      if (simulationError.message?.includes('NotAdmin')) {
        console.log('🚫 Error indicates user is not an admin of this hat');
      } else if (simulationError.message?.includes('Immutable')) {
        console.log('🔒 Error indicates hat is immutable');
      } else if (simulationError.message?.includes('Inactive')) {
        console.log('😴 Error indicates hat is inactive');
      }
    }

    // Try to estimate gas
    try {
      console.log('⛽ Estimating gas...');

      const gasEstimate = await publicClient.estimateGas({
        to: hatsProtocolAddress,
        data: encodedData,
        account: userAddress as `0x${string}`,
        value: 0n,
      });

      debugInfo.estimatedGas = gasEstimate;
      console.log('✅ Gas estimation successful:', gasEstimate);
    } catch (gasError: any) {
      console.error('❌ Gas estimation failed:', gasError);
      debugInfo.error = gasError.message;
    }

    return debugInfo;
  } catch (error: any) {
    console.error('❌ Debug failed:', error);
    return {
      hatId,
      hatIdBigInt: '0',
      userAddress,
      ipfsUri,
      encodedData: '0x',
      error: error.message,
    };
  } finally {
    console.groupEnd();
  }
}

/**
 * Quick debug function to run from console
 */
export async function quickDebugExecutiveHat(
  publicClient: PublicClient,
  userAddress: string,
) {
  const hatsProtocolAddress =
    '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as `0x${string}`;
  const executiveHatId =
    '0x0000008800010000000000000000000000000000000000000000000000000000';
  const testIpfsUri =
    'ipfs://bafkreibbuu6dghupp44np23iddoy7grduzmqze26cuhpronr5n5ba5dz2u';

  console.log('🚀 Quick Debug - Executive Hat Transaction');

  const transactionDebug = await debugChangeHatDetailsTransaction(
    publicClient,
    hatsProtocolAddress,
    executiveHatId,
    userAddress,
    testIpfsUri,
  );

  return { transactionDebug };
}

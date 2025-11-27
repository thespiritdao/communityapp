import { parseUnits } from 'viem';

/**
 * Prepare direct distribution transaction (bypassing proxy)
 * This avoids the tx.origin issue with Smart Wallets
 */
export function prepareDirectDistribution(
  treasuryAddress: string,
  tokenAddress: string,
  recipients: string[],
  amounts: string[],
  decimals: number,
  reason: string
) {
  const amountsBigInt = amounts.map(amount => parseUnits(amount, decimals));

  return {
    address: treasuryAddress as `0x${string}`,
    abi: [
      {
        name: 'distributeTokens',
        type: 'function',
        inputs: [
          { name: 'token', type: 'address' },
          { name: 'recipients', type: 'address[]' },
          { name: 'amounts', type: 'uint256[]' },
          { name: 'reason', type: 'string' }
        ],
        outputs: [],
        stateMutability: 'nonpayable'
      }
    ],
    functionName: 'distributeTokens',
    args: [
      tokenAddress as `0x${string}`,
      recipients as `0x${string}`[],
      amountsBigInt,
      reason
    ]
  };
}

export function prepareDirectEqualDistribution(
  treasuryAddress: string,
  tokenAddress: string,
  recipients: string[],
  totalAmount: string,
  decimals: number,
  reason: string
) {
  const totalAmountBigInt = parseUnits(totalAmount, decimals);

  return {
    address: treasuryAddress as `0x${string}`,
    abi: [
      {
        name: 'distributeTokensEvenly',
        type: 'function',
        inputs: [
          { name: 'token', type: 'address' },
          { name: 'recipients', type: 'address[]' },
          { name: 'totalAmount', type: 'uint256' },
          { name: 'reason', type: 'string' }
        ],
        outputs: [],
        stateMutability: 'nonpayable'
      }
    ],
    functionName: 'distributeTokensEvenly',
    args: [
      tokenAddress as `0x${string}`,
      recipients as `0x${string}`[],
      totalAmountBigInt,
      reason
    ]
  };
}
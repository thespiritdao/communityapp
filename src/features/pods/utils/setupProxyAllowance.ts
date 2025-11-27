import { parseUnits } from 'viem';

/**
 * Setup proxy authorization for treasury to enable distributions
 * The treasury needs to authorize the proxy contract to call its functions
 */

const TREASURY_PROXY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_PROXY as string;

/**
 * Prepare transaction to authorize proxy in the treasury contract
 * UPDATED: This now goes through the proxy to maintain sponsorship
 * @param treasuryAddress - The treasury contract address (for reference)
 * @param podId - The pod ID for proxy routing
 */
export function prepareSetAuthorizedProxyTransaction(
  treasuryAddress: string,
  podId?: string,
) {
  console.log('🔧 Preparing proxy-routed setAuthorizedProxy transaction:', {
    treasury: treasuryAddress,
    proxy: TREASURY_PROXY_ADDRESS,
    podId,
  });

  // If we don't have a podId, fall back to direct call (won't be sponsored)
  if (!podId) {
    console.warn(
      '⚠️ No podId provided - falling back to direct treasury call (unsponsored)',
    );
    return {
      address: treasuryAddress as `0x${string}`,
      abi: [
        {
          name: 'setAuthorizedProxy',
          type: 'function',
          inputs: [{ name: '_proxy', type: 'address' }],
          outputs: [],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'setAuthorizedProxy',
      args: [TREASURY_PROXY_ADDRESS as `0x${string}`],
    };
  }

  // Use proxy for sponsored transaction
  // Note: This requires adding proxySetAuthorizedProxy to the TreasuryProxy contract
  return {
    address: TREASURY_PROXY_ADDRESS as `0x${string}`,
    abi: [
      {
        name: 'proxySetAuthorizedProxy',
        type: 'function',
        inputs: [
          { name: 'podId', type: 'string' },
          { name: 'proxyAddress', type: 'address' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
      },
    ],
    functionName: 'proxySetAuthorizedProxy',
    args: [podId, TREASURY_PROXY_ADDRESS as `0x${string}`],
  };
}

/**
 * Prepare emergency fix transaction that:
 * 1. Approves proxy to spend tokens
 * 2. Can be called by treasury managers
 */
export function prepareEmergencyProxySetup(
  treasuryAddress: string,
  tokenAddress: string,
) {
  console.log('🔧 Preparing emergency proxy setup:', {
    treasury: treasuryAddress,
    proxy: TREASURY_PROXY_ADDRESS,
    token: tokenAddress,
  });

  // This would need to be called FROM the treasury contract
  // Since the treasury needs to approve the proxy
  return {
    address: treasuryAddress as `0x${string}`,
    abi: [
      {
        name: 'emergencyApproveProxy',
        type: 'function',
        inputs: [
          { name: 'token', type: 'address' },
          { name: 'proxy', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
      },
    ],
    functionName: 'emergencyApproveProxy',
    args: [
      tokenAddress as `0x${string}`,
      TREASURY_PROXY_ADDRESS as `0x${string}`,
      parseUnits('1000000', 18), // Approve 1M tokens
    ],
  };
}

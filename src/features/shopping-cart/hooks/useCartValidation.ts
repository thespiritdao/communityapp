// src/features/shopping-cart/hooks/useCartValidation.ts
import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import type { Token } from './useCartCalculations';

// ERC20 ABI for allowance checks
const parsedErc20ABI = [
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
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
];

/**
 * Validate paymaster setup configuration
 * CRITICAL: This function must match the exact logic from Cart.tsx
 */
const validatePaymasterSetup = () => {
  const paymasterEndpoint = process.env.NEXT_PUBLIC_PAYMASTER;
  const purchaseRouterDecentralized =
    process.env.NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED;
  const purchaseRouterAddress = process.env.NEXT_PUBLIC_PURCHASE_ROUTER;
  const purchaseBurnAddress = process.env.NEXT_PUBLIC_PURCHASE_BURN;

  // Prefer decentralized contract, fallback to centralized, then burn
  const contractAddress =
    purchaseRouterDecentralized || purchaseRouterAddress || purchaseBurnAddress;
  const shouldUseRouter = Boolean(
    purchaseRouterDecentralized || purchaseRouterAddress,
  );

  return {
    paymasterConfigured: Boolean(paymasterEndpoint),
    contractConfigured: Boolean(contractAddress),
    isValid: Boolean(paymasterEndpoint && contractAddress),
    useRouter: shouldUseRouter,
    contractAddress,
    isDecentralized: Boolean(purchaseRouterDecentralized),
  };
};

/**
 * Validate paymaster configuration only
 * CRITICAL: This function must match the exact logic from Cart.tsx
 */
const validatePaymasterConfig = () => {
  const paymasterEndpoint = process.env.NEXT_PUBLIC_PAYMASTER;
  if (!paymasterEndpoint) {
    console.error('Paymaster endpoint not configured');
    return false;
  }

  // Validate paymaster endpoint format
  try {
    new URL(paymasterEndpoint);
    return true;
  } catch (e) {
    console.error('Invalid paymaster endpoint URL:', paymasterEndpoint);
    return false;
  }
};

export interface CartValidationState {
  // Allowance states
  allowance: bigint;
  systemAllowance: bigint;
  selfAllowance: bigint;
  isCheckingAllowance: boolean;

  // Approval validation
  needsApproval: boolean;
  needsBothTokenApprovals: boolean;
  systemNeedsApproval: boolean;
  selfNeedsApproval: boolean;

  // Contract validation
  contractAddress: string;
  isDecentralized: boolean;
  paymasterValid: boolean;
}

/**
 * Hook to handle cart validation logic including allowance checks and approval validation
 *
 * IMPORTANT: This hook extracts the exact validation logic from Cart.tsx
 * without changing any behavior. All validation must remain identical.
 */
export const useCartValidation = (
  selectedToken: Token,
  systemApprovalAmount: bigint,
  selfApprovalAmount: bigint,
): CartValidationState => {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  // Allowance state - matches Cart.tsx exactly
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [systemAllowance, setSystemAllowance] = useState<bigint>(BigInt(0));
  const [selfAllowance, setSelfAllowance] = useState<bigint>(BigInt(0));
  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false);

  // Get contract configuration
  const contractConfig = validatePaymasterSetup();
  const paymasterValid = validatePaymasterConfig();

  // Check allowance for tokens - CRITICAL: Must match Cart.tsx exactly
  useEffect(() => {
    const checkAllowances = async () => {
      if (!address || !publicClient) return;

      setIsCheckingAllowance(true);
      try {
        const { contractAddress: allowanceContractAddress, isDecentralized } =
          validatePaymasterSetup();

        if (isDecentralized) {
          // For decentralized router, check both token allowances
          const [systemResult, selfResult] = await Promise.all([
            publicClient.readContract({
              address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`,
              abi: parsedErc20ABI,
              functionName: 'allowance',
              args: [
                address as `0x${string}`,
                allowanceContractAddress as `0x${string}`,
              ],
            }),
            publicClient.readContract({
              address: process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`,
              abi: parsedErc20ABI,
              functionName: 'allowance',
              args: [
                address as `0x${string}`,
                allowanceContractAddress as `0x${string}`,
              ],
            }),
          ]);

          setSystemAllowance(BigInt(systemResult));
          setSelfAllowance(BigInt(selfResult));

          // For backwards compatibility, set allowance to the selected token's allowance
          setAllowance(
            selectedToken.symbol === '$SYSTEM'
              ? BigInt(systemResult)
              : BigInt(selfResult),
          );

          console.log('Current allowances (decentralized):', {
            systemAllowance: systemResult.toString(),
            selfAllowance: selfResult.toString(),
            systemRequired: systemApprovalAmount.toString(),
            selfRequired: selfApprovalAmount.toString(),
            allowanceContract: allowanceContractAddress,
          });
        } else {
          // For non-decentralized contracts, check only selected token
          const tokenAddress =
            selectedToken.symbol === '$SYSTEM'
              ? (process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`)
              : (process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`);

          const result = await publicClient.readContract({
            address: tokenAddress,
            abi: parsedErc20ABI,
            functionName: 'allowance',
            args: [
              address as `0x${string}`,
              allowanceContractAddress as `0x${string}`,
            ],
          });

          setAllowance(BigInt(result));
          // Set individual allowances for debugging
          if (selectedToken.symbol === '$SYSTEM') {
            setSystemAllowance(BigInt(result));
            setSelfAllowance(BigInt(0));
          } else {
            setSelfAllowance(BigInt(result));
            setSystemAllowance(BigInt(0));
          }

          console.log('Current allowance (non-decentralized):', {
            token: selectedToken.symbol,
            allowance: result.toString(),
            required: (selectedToken.symbol === '$SYSTEM'
              ? systemApprovalAmount
              : selfApprovalAmount
            ).toString(),
            allowanceContract: allowanceContractAddress,
            tokenAddress: tokenAddress,
          });
        }
      } catch (error) {
        console.error('Error checking allowance:', error);
        setAllowance(BigInt(0));
        setSystemAllowance(BigInt(0));
        setSelfAllowance(BigInt(0));
      } finally {
        setIsCheckingAllowance(false);
      }
    };

    checkAllowances();
  }, [
    address,
    publicClient,
    selectedToken,
    systemApprovalAmount,
    selfApprovalAmount,
  ]);

  // Calculate approval needs - CRITICAL: Must match Cart.tsx exactly
  const { isDecentralized: needsBothTokenApprovals } = validatePaymasterSetup();

  const systemNeedsApproval =
    systemApprovalAmount > BigInt(0) && systemAllowance < systemApprovalAmount;
  const selfNeedsApproval =
    selfApprovalAmount > BigInt(0) && selfAllowance < selfApprovalAmount;

  let needsApproval = false;
  if (needsBothTokenApprovals) {
    // For decentralized router, check if EITHER token needs approval (only if amount > 0)
    needsApproval = systemNeedsApproval || selfNeedsApproval;
  } else {
    // For non-decentralized contracts, check only selected token
    const requiredApprovalAmount =
      selectedToken.symbol === '$SYSTEM'
        ? systemApprovalAmount
        : selfApprovalAmount;
    needsApproval = allowance < requiredApprovalAmount;
  }

  return {
    // Allowance states
    allowance,
    systemAllowance,
    selfAllowance,
    isCheckingAllowance,

    // Approval validation
    needsApproval,
    needsBothTokenApprovals,
    systemNeedsApproval,
    selfNeedsApproval,

    // Contract validation
    contractAddress: contractConfig.contractAddress,
    isDecentralized: contractConfig.isDecentralized,
    paymasterValid,
  };
};

/**
 * Hook to update allowances after successful transaction
 * CRITICAL: Must match the exact update logic from Cart.tsx
 */
export const useUpdateAllowances = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const updateAllowancesAfterTransaction = useCallback(
    async (
      selectedToken: Token,
      setAllowance: (allowance: bigint) => void,
      setSystemAllowance: (allowance: bigint) => void,
      setSelfAllowance: (allowance: bigint) => void,
    ) => {
      if (!publicClient || !address) return;

      const { contractAddress: purchaseContractAddress, isDecentralized } =
        validatePaymasterSetup();
      try {
        if (isDecentralized) {
          // Update both token allowances
          const [systemResult, selfResult] = await Promise.all([
            publicClient.readContract({
              address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`,
              abi: parsedErc20ABI,
              functionName: 'allowance',
              args: [
                address as `0x${string}`,
                purchaseContractAddress as `0x${string}`,
              ],
            }),
            publicClient.readContract({
              address: process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`,
              abi: parsedErc20ABI,
              functionName: 'allowance',
              args: [
                address as `0x${string}`,
                purchaseContractAddress as `0x${string}`,
              ],
            }),
          ]);
          setSystemAllowance(BigInt(systemResult));
          setSelfAllowance(BigInt(selfResult));
          setAllowance(
            selectedToken.symbol === '$SYSTEM'
              ? BigInt(systemResult)
              : BigInt(selfResult),
          );
        } else {
          // Update only selected token allowance
          const tokenAddress =
            selectedToken.symbol === '$SYSTEM'
              ? (process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`)
              : (process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`);
          const result = await publicClient.readContract({
            address: tokenAddress,
            abi: parsedErc20ABI,
            functionName: 'allowance',
            args: [
              address as `0x${string}`,
              purchaseContractAddress as `0x${string}`,
            ],
          });
          setAllowance(BigInt(result));
        }
      } catch (error) {
        console.error('Error updating allowance after transaction:', error);
      }
    },
    [address, publicClient],
  );

  return { updateAllowancesAfterTransaction };
};

// Export utility functions for use in other components
export { validatePaymasterSetup, validatePaymasterConfig, parsedErc20ABI };

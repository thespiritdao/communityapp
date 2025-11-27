import type { PublicClient } from 'viem';

const parsedErc20ABI = [
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

export interface TokenAllowances {
  systemAllowance: bigint;
  selfAllowance: bigint;
  allowance: bigint;
}

export interface ApprovalConfig {
  tokenSymbol: string;
  systemApprovalAmount: bigint;
  selfApprovalAmount: bigint;
  contractAddress: string;
  isDecentralized: boolean;
}

export async function checkTokenAllowances(
  address: string,
  publicClient: PublicClient,
  config: ApprovalConfig
): Promise<TokenAllowances> {
  try {
    if (config.isDecentralized) {
      const [systemResult, selfResult] = await Promise.all([
        publicClient.readContract({
          address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`,
          abi: parsedErc20ABI,
          functionName: 'allowance',
          args: [address as `0x${string}`, config.contractAddress as `0x${string}`],
        }),
        publicClient.readContract({
          address: process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`,
          abi: parsedErc20ABI,
          functionName: 'allowance',
          args: [address as `0x${string}`, config.contractAddress as `0x${string}`],
        })
      ]);
      
      return {
        systemAllowance: BigInt(systemResult),
        selfAllowance: BigInt(selfResult),
        allowance: config.tokenSymbol === "$SYSTEM" ? BigInt(systemResult) : BigInt(selfResult)
      };
    } else {
      const tokenAddress = config.tokenSymbol === "$SYSTEM" 
        ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`
        : process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;
      
      const result = await publicClient.readContract({
        address: tokenAddress,
        abi: parsedErc20ABI,
        functionName: 'allowance',
        args: [address as `0x${string}`, config.contractAddress as `0x${string}`],
      });
      
      const allowanceValue = BigInt(result);
      
      return {
        systemAllowance: config.tokenSymbol === "$SYSTEM" ? allowanceValue : 0n,
        selfAllowance: config.tokenSymbol === "$SELF" ? allowanceValue : 0n,
        allowance: allowanceValue
      };
    }
  } catch (error) {
    console.error('Error checking allowance:', error);
    return {
      systemAllowance: 0n,
      selfAllowance: 0n,
      allowance: 0n
    };
  }
}

export function needsTokenApproval(
  config: ApprovalConfig,
  allowances: TokenAllowances
): { needsSystemApproval: boolean; needsSelfApproval: boolean; needsApproval: boolean } {
  if (config.isDecentralized) {
    return {
      needsSystemApproval: config.systemApprovalAmount > 0n && allowances.systemAllowance < config.systemApprovalAmount,
      needsSelfApproval: config.selfApprovalAmount > 0n && allowances.selfAllowance < config.selfApprovalAmount,
      needsApproval: (config.systemApprovalAmount > 0n && allowances.systemAllowance < config.systemApprovalAmount) ||
                     (config.selfApprovalAmount > 0n && allowances.selfAllowance < config.selfApprovalAmount)
    };
  } else {
    const requiredAmount = config.tokenSymbol === "$SYSTEM" ? config.systemApprovalAmount : config.selfApprovalAmount;
    return {
      needsSystemApproval: config.tokenSymbol === "$SYSTEM" && allowances.allowance < requiredAmount,
      needsSelfApproval: config.tokenSymbol === "$SELF" && allowances.allowance < requiredAmount,
      needsApproval: allowances.allowance < requiredAmount
    };
  }
}

export function buildApprovalCalls(
  config: ApprovalConfig,
  allowances: TokenAllowances
): any[] {
  const calls = [];
  
  if (config.isDecentralized) {
    if (config.systemApprovalAmount > 0n && allowances.systemAllowance < config.systemApprovalAmount) {
      calls.push({
        address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`,
        abi: parsedErc20ABI,
        functionName: 'approve',
        args: [config.contractAddress as `0x${string}`, config.systemApprovalAmount],
      });
    }
    
    if (config.selfApprovalAmount > 0n && allowances.selfAllowance < config.selfApprovalAmount) {
      calls.push({
        address: process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`,
        abi: parsedErc20ABI,
        functionName: 'approve',
        args: [config.contractAddress as `0x${string}`, config.selfApprovalAmount],
      });
    }
  } else {
    const tokenAddress = config.tokenSymbol === "$SYSTEM" 
      ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`
      : process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;
    
    const requiredAmount = config.tokenSymbol === "$SYSTEM" ? config.systemApprovalAmount : config.selfApprovalAmount;
    
    if (allowances.allowance < requiredAmount) {
      calls.push({
        address: tokenAddress,
        abi: parsedErc20ABI,
        functionName: 'approve',
        args: [config.contractAddress as `0x${string}`, requiredAmount],
      });
    }
  }
  
  return calls;
}

export async function checkTokenBalances(
  address: string,
  publicClient: PublicClient
): Promise<{ systemBalance: bigint; selfBalance: bigint }> {
  try {
    const [systemBalance, selfBalance] = await Promise.all([
      publicClient.readContract({
        address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`,
        abi: parsedErc20ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      }),
      publicClient.readContract({
        address: process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`,
        abi: parsedErc20ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      })
    ]);
    
    return {
      systemBalance: BigInt(systemBalance),
      selfBalance: BigInt(selfBalance)
    };
  } catch (error) {
    console.error('Error checking token balances:', error);
    return {
      systemBalance: 0n,
      selfBalance: 0n
    };
  }
}
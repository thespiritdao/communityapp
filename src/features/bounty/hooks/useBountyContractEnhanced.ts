import { useAccount, usePublicClient } from 'wagmi';
import { parseUnits, parseEther } from 'viem';
import BountyManagerABI from '@/abis/BountyManagerV2.json';
import { CreateBountyParams, PaymentStructure } from '@/types/bounty';
import { CONTRACT_ADDRESSES, CHAIN_CONFIG } from '@/config/contracts';

const BASE_CHAIN_ID = CHAIN_CONFIG.CHAIN_ID;

// Re-export from types for compatibility
export { PaymentStructure } from '@/types/bounty';

export enum BountyStatus {
  Open = 0,
  InProgress = 1,
  Completed = 2,
  Cancelled = 3,
}

export enum MilestoneStatus {
  Pending = 0,
  Completed = 1,
  Overdue = 2,
}

export const useBountyContractEnhanced = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const preflightCheck = () => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    if (!publicClient) {
      throw new Error('Public client not available');
    }

    const contractAddress = CONTRACT_ADDRESSES.BOUNTY_MANAGER;
    if (!contractAddress) {
      throw new Error('Bounty manager contract address not configured');
    }

    return {
      contractAddress,
      account: address,
      chain: { id: BASE_CHAIN_ID },
      publicClient,
    };
  };

  const createBountyOnChain = async (
    params: CreateBountyParams,
  ): Promise<{ hash: `0x${string}`; bountyId: bigint }> => {
    const { contractAddress, account } = preflightCheck();

    console.log('🔍 createBountyOnChain received params:', params);

    const calls = [
      {
        address: contractAddress,
        abi: BountyManagerABI,
        functionName: 'createBounty',
        args: [params], // Single struct parameter
      },
    ];

    console.log('🔍 Transaction calls:', calls);

    // For now, return a placeholder since we're using Transaction component
    return { hash: '0x' as `0x${string}`, bountyId: BigInt(0) };
  };

  // Helper function to convert form data to contract params
  const prepareCreateBountyParams = (
    title: string,
    category: string,
    value: string,
    token: 'SYSTEM' | 'SELF',
    paymentStructure: PaymentStructure,
    upfrontAmount = '0',
    completionAmount = '0',
  ): CreateBountyParams => {
    const decimals = 18; // Standard for both SYSTEM and SELF tokens

    const tokenAddress =
      token === 'SYSTEM'
        ? CONTRACT_ADDRESSES.SYSTEM_TOKEN
        : CONTRACT_ADDRESSES.SELF_TOKEN;

    return {
      title,
      category,
      value: parseUnits(String(value), decimals),
      token: tokenAddress,
      paymentStructure,
      upfrontAmount: parseUnits(String(upfrontAmount), decimals),
      completionAmount: parseUnits(String(completionAmount), decimals),
    };
  };

  const createMilestonesOnChain = async (
    bountyId: number,
    descriptions: string[],
    dueDates: number[],
    paymentAmounts: string[],
  ): Promise<{ hash: `0x${string}` }> => {
    const { contractAddress, account } = preflightCheck();

    // Convert payment amounts to strings and parse them
    const parsedPaymentAmounts = paymentAmounts.map((amount) =>
      parseEther(String(amount)),
    );

    const calls = [
      {
        address: contractAddress,
        abi: BountyManagerABI,
        functionName: 'createMilestones',
        args: [bountyId, descriptions, dueDates, parsedPaymentAmounts],
      },
    ];

    // For now, return a placeholder since we're using Transaction component
    return { hash: '0x' as `0x${string}` };
  };

  const placeBidOnChain = async (bountyId: number) => {
    const { contractAddress, account, chain } = preflightCheck();
    // Implementation of placeBidOnChain
  };

  const assignBountyOnChain = async (
    bountyId: number,
    bidder: string,
    technicalReviewer: string,
    finalApprover: string,
  ) => {
    const { contractAddress, account, chain } = preflightCheck();
    // Implementation of assignBountyOnChain
  };

  const approveMilestoneOnChain = async (
    bountyId: number,
    milestoneId: number,
  ): Promise<{ hash: `0x${string}` }> => {
    const { contractAddress, account } = preflightCheck();

    const calls = [
      {
        address: contractAddress,
        abi: BountyManagerABI,
        functionName: 'approveMilestone',
        args: [bountyId, milestoneId],
      },
    ];

    // For now, return a placeholder since we're using Transaction component
    return { hash: '0x' as `0x${string}` };
  };

  const approveCompletionOnChain = async (
    bountyId: number,
  ): Promise<{ hash: `0x${string}` }> => {
    const { contractAddress, account } = preflightCheck();

    const calls = [
      {
        address: contractAddress,
        abi: BountyManagerABI,
        functionName: 'approveCompletion',
        args: [bountyId],
      },
    ];

    // For now, return a placeholder since we're using Transaction component
    return { hash: '0x' as `0x${string}` };
  };

  const cancelBountyOnChain = async (bountyId: number) => {
    const { contractAddress, account, chain } = preflightCheck();
    // Implementation of cancelBountyOnChain
  };

  return {
    createBountyOnChain,
    prepareCreateBountyParams,
    createMilestonesOnChain,
    placeBidOnChain,
    assignBountyOnChain,
    approveMilestoneOnChain,
    approveCompletionOnChain,
    cancelBountyOnChain,
    PaymentStructure,
    BountyStatus,
    MilestoneStatus,
  };
};

import { useAccount, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';
import BountyManagerABI from '../../../contracts/BountyManager.json';

const BASE_CHAIN_ID = 8453;

export enum PaymentStructure {
  Completion = 0,
  Milestones = 1,
  Split = 2,
}

export enum BountyStatus {
  Open = 0,
  InProgress = 1,
  Completed = 2,
  Cancelled = 3
}

export enum MilestoneStatus {
  Pending = 0,
  Completed = 1,
  Overdue = 2
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
    
    const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;
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
    title: string,
    category: string,
    value: string,
    token: 'SYSTEM' | 'SELF',
    paymentStructure: PaymentStructure,
    upfrontAmount: string = '0',
    completionAmount: string = '0'
  ): Promise<{hash: `0x${string}`, bountyId: bigint}> => {
    const { contractAddress, account } = preflightCheck();
    
    console.log('🔍 createBountyOnChain received parameters:');
    console.log('title:', title, 'type:', typeof title);
    console.log('category:', category, 'type:', typeof category);
    console.log('value:', value, 'type:', typeof value);
    console.log('token:', token, 'type:', typeof token);
    console.log('paymentStructure:', paymentStructure, 'type:', typeof paymentStructure);
    console.log('upfrontAmount:', upfrontAmount, 'type:', typeof upfrontAmount);
    console.log('completionAmount:', completionAmount, 'type:', typeof completionAmount);
    
    // Ensure all numeric parameters are strings
    const valueString = String(value);
    const upfrontAmountString = String(upfrontAmount);
    const completionAmountString = String(completionAmount);
    
    console.log('🔍 After string conversion:');
    console.log('valueString:', valueString, 'type:', typeof valueString);
    console.log('upfrontAmountString:', upfrontAmountString, 'type:', typeof upfrontAmountString);
    console.log('completionAmountString:', completionAmountString, 'type:', typeof completionAmountString);
    
    const tokenAddress =
      token === 'SYSTEM'
        ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN
        : process.env.NEXT_PUBLIC_SELF_TOKEN;

    console.log('🔍 About to call parseEther on value:', valueString);
    const parsedValue = parseEther(valueString);
    console.log('🔍 parseEther result:', parsedValue);
    
    console.log('🔍 About to call parseEther on upfrontAmount:', upfrontAmountString);
    const parsedUpfrontAmount = parseEther(upfrontAmountString);
    console.log('🔍 parseEther result for upfrontAmount:', parsedUpfrontAmount);
    
    console.log('🔍 About to call parseEther on completionAmount:', completionAmountString);
    const parsedCompletionAmount = parseEther(completionAmountString);
    console.log('🔍 parseEther result for completionAmount:', parsedCompletionAmount);

    const calls = [{
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'createBounty',
      args: [
        title,
        category,
        parsedValue,
        tokenAddress,
        paymentStructure,
        parsedUpfrontAmount,
        parsedCompletionAmount,
      ],
    }];

    console.log('🔍 Transaction calls:', calls);

    // For now, return a placeholder since we're using Transaction component
    return { hash: '0x' as `0x${string}`, bountyId: BigInt(0) };
  };

  const createMilestonesOnChain = async (
    bountyId: number,
    descriptions: string[],
    dueDates: number[],
    paymentAmounts: string[]
  ): Promise<{hash: `0x${string}`}> => {
    const { contractAddress, account } = preflightCheck();

    // Convert payment amounts to strings and parse them
    const parsedPaymentAmounts = paymentAmounts.map(amount => parseEther(String(amount)));

    const calls = [{
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'createMilestones',
      args: [bountyId, descriptions, dueDates, parsedPaymentAmounts],
    }];

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
    finalApprover: string
  ) => {
    const { contractAddress, account, chain } = preflightCheck();
    // Implementation of assignBountyOnChain
  };

  const approveMilestoneOnChain = async (
    bountyId: number,
    milestoneId: number
  ): Promise<{hash: `0x${string}`}> => {
    const { contractAddress, account } = preflightCheck();

    const calls = [{
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'approveMilestone',
      args: [bountyId, milestoneId],
    }];

    // For now, return a placeholder since we're using Transaction component
    return { hash: '0x' as `0x${string}` };
  };

  const approveCompletionOnChain = async (
    bountyId: number
  ): Promise<{hash: `0x${string}`}> => {
    const { contractAddress, account } = preflightCheck();

    const calls = [{
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'approveCompletion',
      args: [bountyId],
    }];

    // For now, return a placeholder since we're using Transaction component
    return { hash: '0x' as `0x${string}` };
  };

  const cancelBountyOnChain = async (bountyId: number) => {
    const { contractAddress, account, chain } = preflightCheck();
    // Implementation of cancelBountyOnChain
  };

  return {
    createBountyOnChain,
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
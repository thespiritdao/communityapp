import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { parseEther, isAddress, getContract, Abi } from 'viem';
import BountyManagerABI from '../../../contracts/BountyManager.json';

const BOUNTY_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS;

const getBountyManagerAddress = (): `0x${string}` => {
  const address = BOUNTY_MANAGER_ADDRESS;
  if (!address || !isAddress(address)) {
    const errorMsg = 'Bounty Manager contract address is not configured or invalid. Please check the NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS environment variable.';
    console.error(errorMsg);
    alert(errorMsg); // Also alert the user directly
    throw new Error(errorMsg);
  }
  return address as `0x${string}`;
}

export enum PaymentStructure {
  Completion = 0,
  Milestones = 1,
  Split = 2
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
  const { address: account, chain } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const preflightCheck = () => {
    const contractAddress = getBountyManagerAddress();
    if (!account || !chain || !publicClient) {
      const errorMsg = "Wallet or public client not available. Please connect your wallet.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }
    return { contractAddress, account, chain, publicClient };
  }

  const createBountyOnChain = async (
    title: string,
    category: string,
    value: string,
    token: 'SYSTEM' | 'SELF',
    paymentStructure: PaymentStructure,
    upfrontAmount: string = '0',
    completionAmount: string = '0'
  ): Promise<{hash: `0x${string}`, bountyId: bigint}> => {
    const { contractAddress, account, chain, publicClient } = preflightCheck();
    const tokenAddress =
      token === 'SYSTEM'
        ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN
        : process.env.NEXT_PUBLIC_SELF_TOKEN;

    const hash = await writeContractAsync({
      address: contractAddress,
      abi: BountyManagerABI as Abi,
      functionName: 'createBounty',
      args: [
        title,
        category,
        parseEther(value),
        tokenAddress,
        paymentStructure,
        parseEther(upfrontAmount),
        parseEther(completionAmount),
      ],
      account,
      chain,
    });
    
    // For now, return a placeholder bountyId since we can't easily decode the event
    // The frontend can handle this by waiting for the transaction and then querying the contract
    return { hash, bountyId: BigInt(0) };
  };

  const createMilestonesOnChain = async (
    bountyId: number,
    dueDates: number[],
    paymentAmounts: string[]
  ) => {
    const { contractAddress, account, chain } = preflightCheck();
    const parsedAmounts = paymentAmounts.map(amount => parseEther(amount));
    await writeContractAsync({
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'createMilestones',
      args: [bountyId, dueDates, parsedAmounts],
      account,
      chain,
    });
  };

  const placeBidOnChain = async (bountyId: number) => {
    const { contractAddress, account, chain } = preflightCheck();
    await writeContractAsync({
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'placeBid',
      args: [bountyId],
      account,
      chain,
    });
  };

  const assignBountyOnChain = async (
    bountyId: number, 
    bidder: string,
    technicalReviewer: string,
    finalApprover: string
  ) => {
    const { contractAddress, account, chain } = preflightCheck();
    await writeContractAsync({
      address: contractAddress,
      abi: BountyManagerABI as Abi,
      functionName: 'assignBounty',
      args: [bountyId, bidder, technicalReviewer, finalApprover],
      account,
      chain,
    });
  };

  const approveMilestoneOnChain = async (bountyId: number, milestoneId: number) => {
    const { contractAddress, account, chain } = preflightCheck();
    await writeContractAsync({
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'approveMilestone',
      args: [bountyId, milestoneId],
      account,
      chain,
    });
  };

  const approveCompletionOnChain = async (bountyId: number) => {
    const { contractAddress, account, chain } = preflightCheck();
    await writeContractAsync({
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'approveCompletion',
      args: [bountyId],
      account,
      chain,
    });
  };

  const cancelBountyOnChain = async (bountyId: number) => {
    const { contractAddress, account, chain } = preflightCheck();
    await writeContractAsync({
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'cancelBounty',
      args: [bountyId],
      account,
      chain,
    });
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
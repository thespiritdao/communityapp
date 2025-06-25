import { useContractRead, useContractWrite, usePrepareContractWrite } from 'wagmi';
import { parseEther } from 'viem';
import BountyManagerABI from '@/contracts/BountyManager.json';

const BOUNTY_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS;

export const useBountyContract = () => {
  const { config: createBountyConfig } = usePrepareContractWrite({
    address: BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'createBounty',
  });

  const { write: createBounty } = useContractWrite(createBountyConfig);

  const { config: placeBidConfig } = usePrepareContractWrite({
    address: BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'placeBid',
  });

  const { write: placeBid } = useContractWrite(placeBidConfig);

  const { config: assignBountyConfig } = usePrepareContractWrite({
    address: BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'assignBounty',
  });

  const { write: assignBounty } = useContractWrite(assignBountyConfig);

  const { config: approveCompletionConfig } = usePrepareContractWrite({
    address: BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'approveCompletion',
  });

  const { write: approveCompletion } = useContractWrite(approveCompletionConfig);

  const { config: cancelBountyConfig } = usePrepareContractWrite({
    address: BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'cancelBounty',
  });

  const { write: cancelBounty } = useContractWrite(cancelBountyConfig);

  const { data: bountyBasicInfo } = useContractRead({
    address: BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'getBountyBasicInfo',
  });

  const { data: bountyFinancialInfo } = useContractRead({
    address: BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'getBountyFinancialInfo',
  });

  const { data: bountyParticipants } = useContractRead({
    address: BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'getBountyParticipants',
  });

  const { data: hasApproved } = useContractRead({
    address: BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'hasApproved',
  });

  const createBountyOnChain = async (
    title: string,
    description: string,
    category: string,
    value: string,
    token: 'SYSTEM' | 'SELF',
    reviewers: string[]
  ) => {
    if (!createBounty) return;

    const tokenAddress =
      token === 'SYSTEM'
        ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN
        : process.env.NEXT_PUBLIC_SELF_TOKEN;

    await createBounty({
      args: [
        title,
        description,
        category,
        parseEther(value),
        tokenAddress,
        reviewers,
      ],
    });
  };

  const placeBidOnChain = async (bountyId: number) => {
    if (!placeBid) return;
    await placeBid({
      args: [bountyId],
    });
  };

  const assignBountyOnChain = async (bountyId: number, bidder: string) => {
    if (!assignBounty) return;
    await assignBounty({
      args: [bountyId, bidder],
    });
  };

  const approveCompletionOnChain = async (bountyId: number) => {
    if (!approveCompletion) return;
    await approveCompletion({
      args: [bountyId],
    });
  };

  const cancelBountyOnChain = async (bountyId: number) => {
    if (!cancelBounty) return;
    await cancelBounty({
      args: [bountyId],
    });
  };

  return {
    createBountyOnChain,
    placeBidOnChain,
    assignBountyOnChain,
    approveCompletionOnChain,
    cancelBountyOnChain,
    bountyBasicInfo,
    bountyFinancialInfo,
    bountyParticipants,
    hasApproved,
  };
}; 
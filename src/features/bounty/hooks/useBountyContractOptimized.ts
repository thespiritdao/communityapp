import { useContractRead, useContractWrite, usePrepareContractWrite, useWaitForTransaction } from 'wagmi';
import { parseEther } from 'viem';
import { BountyIPFSService } from '../services/BountyIPFSService';
import type { BountyFormV2Data } from '../components/BountyFormV2';

// Import the ABI - you'll need to generate this from the compiled contract
import BountyManagerOptimizedABI from '@/abis/BountyManagerOptimized.json';

interface UseBountyContractOptimizedReturn {
  createBounty: (data: BountyFormV2Data) => Promise<string>;
  getBounty: (bountyId: string) => Promise<any>;
  placeBid: (bountyId: string) => Promise<boolean>;
  assignBounty: (bountyId: string, bidder: string, reviewer: string, approver: string) => Promise<boolean>;
  releasePayment: (bountyId: string, amount: string) => Promise<boolean>;
  setTokenGates: (bountyId: string, hatIds: string[], minBalances: string[]) => Promise<boolean>;
  canViewBounty: (bountyId: string, userAddress: string) => Promise<boolean>;
  isLoading: boolean;
  error: Error | null;
}

export const useBountyContractOptimized = (): UseBountyContractOptimizedReturn => {
  const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;
  
  if (!contractAddress) {
    console.error('Bounty Manager contract address not configured');
  }

  /**
   * Create a new bounty with IPFS metadata storage
   */
  const createBounty = async (data: BountyFormV2Data): Promise<string> => {
    try {
      // Step 1: Prepare metadata for IPFS
      const metadata = {
        title: data.title,
        description: data.description,
        category: data.category,
        requirements: data.requirements || [],
        questions: data.questions || [],
        work_requirements: data.work_requirements || [],
        token_gating: data.token_gating || { restriction_level: 'public' },
        creator_address: data.creator_address,
        funding_source: data.funding_source
      };

      console.log('📤 Uploading metadata to IPFS...');
      
      // Step 2: Upload to IPFS via API route (server-side for security)
      const ipfsResponse = await fetch('/api/bounty/ipfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload',
          metadata
        })
      });

      if (!ipfsResponse.ok) {
        throw new Error('Failed to upload metadata to IPFS');
      }

      const { ipfsHash } = await ipfsResponse.json();
      console.log('✅ Metadata uploaded to IPFS:', ipfsHash);

      // Step 3: Determine token address
      const tokenAddress = data.value.token === 'SYSTEM'
        ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN
        : process.env.NEXT_PUBLIC_SELF_TOKEN;

      if (!tokenAddress) {
        throw new Error(`Token address not configured for ${data.value.token}`);
      }

      // Step 4: Determine payment type
      const paymentType = 0; // 0=Completion, 1=Milestones, 2=Split
      // You can extend this based on your requirements

      // Step 5: Prepare contract write
      const { config } = await prepareContractWrite({
        address: contractAddress,
        abi: BountyManagerOptimizedABI,
        functionName: 'createBounty',
        args: [
          parseEther(data.value.amount), // value as uint128
          tokenAddress, // token address
          paymentType, // payment type
          ipfsHash // IPFS hash
        ]
      });

      // Step 6: Execute contract write
      const { hash, wait } = await writeContract(config);
      console.log('📝 Transaction sent:', hash);

      // Step 7: Wait for confirmation
      const receipt = await wait();
      console.log('✅ Transaction confirmed:', receipt);

      // Step 8: Extract bounty ID from events
      const bountyCreatedEvent = receipt.logs.find(
        log => log.topics[0] === '0x...' // Add the actual event signature
      );
      
      const bountyId = bountyCreatedEvent?.topics[1]; // Bounty ID is first indexed param
      
      if (!bountyId) {
        throw new Error('Failed to get bounty ID from transaction');
      }

      console.log('🎉 Bounty created with ID:', bountyId);

      // Step 9: Set token gates if needed (separate transaction)
      if (data.token_gating?.required_tokens && data.token_gating.required_tokens.length > 0) {
        console.log('🔐 Setting token gates...');
        
        const hatIds = data.token_gating.required_tokens.map(t => t.token_id);
        const minBalances = data.token_gating.required_tokens.map(
          t => t.minimum_balance || '1'
        );
        
        await setTokenGates(bountyId.toString(), hatIds, minBalances);
      }

      // Step 10: Store in database for faster queries
      await storeBountyInDatabase(bountyId.toString(), ipfsHash, data);

      return bountyId.toString();
    } catch (error) {
      console.error('Error creating bounty:', error);
      throw error;
    }
  };

  /**
   * Get bounty data including IPFS metadata
   */
  const getBounty = async (bountyId: string): Promise<any> => {
    try {
      // Step 1: Get on-chain data
      const { data: onChainData } = await readContract({
        address: contractAddress,
        abi: BountyManagerOptimizedABI,
        functionName: 'getBounty',
        args: [bountyId]
      });

      if (!onChainData) {
        throw new Error('Bounty not found');
      }

      const [creator, value, token, status, ipfsHash] = onChainData;

      // Step 2: Fetch metadata from IPFS
      const ipfsResponse = await fetch(`/api/bounty/ipfs?hash=${ipfsHash}`);
      
      if (!ipfsResponse.ok) {
        console.warn('Failed to fetch IPFS metadata, using on-chain data only');
        return {
          id: bountyId,
          creator,
          value: value.toString(),
          token,
          status,
          ipfsHash
        };
      }

      const { metadata } = await ipfsResponse.json();

      // Step 3: Get token gates
      const { data: tokenGates } = await readContract({
        address: contractAddress,
        abi: BountyManagerOptimizedABI,
        functionName: 'getTokenGates',
        args: [bountyId]
      });

      // Step 4: Combine all data
      return {
        id: bountyId,
        creator,
        value: value.toString(),
        token,
        status,
        ipfsHash,
        ...metadata,
        tokenGates: tokenGates || []
      };
    } catch (error) {
      console.error('Error fetching bounty:', error);
      throw error;
    }
  };

  /**
   * Place a bid on a bounty
   */
  const placeBid = async (bountyId: string): Promise<boolean> => {
    try {
      const { config } = await prepareContractWrite({
        address: contractAddress,
        abi: BountyManagerOptimizedABI,
        functionName: 'placeBid',
        args: [bountyId]
      });

      const { hash, wait } = await writeContract(config);
      const receipt = await wait();
      
      return receipt.status === 'success';
    } catch (error) {
      console.error('Error placing bid:', error);
      throw error;
    }
  };

  /**
   * Assign bounty to a bidder
   */
  const assignBounty = async (
    bountyId: string,
    bidder: string,
    reviewer: string,
    approver: string
  ): Promise<boolean> => {
    try {
      const { config } = await prepareContractWrite({
        address: contractAddress,
        abi: BountyManagerOptimizedABI,
        functionName: 'assignBounty',
        args: [bountyId, bidder, reviewer, approver]
      });

      const { hash, wait } = await writeContract(config);
      const receipt = await wait();
      
      return receipt.status === 'success';
    } catch (error) {
      console.error('Error assigning bounty:', error);
      throw error;
    }
  };

  /**
   * Release payment for a bounty
   */
  const releasePayment = async (bountyId: string, amount: string): Promise<boolean> => {
    try {
      const { config } = await prepareContractWrite({
        address: contractAddress,
        abi: BountyManagerOptimizedABI,
        functionName: 'releasePayment',
        args: [bountyId, parseEther(amount)]
      });

      const { hash, wait } = await writeContract(config);
      const receipt = await wait();
      
      return receipt.status === 'success';
    } catch (error) {
      console.error('Error releasing payment:', error);
      throw error;
    }
  };

  /**
   * Set token gates for a bounty
   */
  const setTokenGates = async (
    bountyId: string,
    hatIds: string[],
    minBalances: string[]
  ): Promise<boolean> => {
    try {
      const { config } = await prepareContractWrite({
        address: contractAddress,
        abi: BountyManagerOptimizedABI,
        functionName: 'setTokenGates',
        args: [
          bountyId,
          hatIds.map(id => BigInt(id)),
          minBalances.map(b => BigInt(b))
        ]
      });

      const { hash, wait } = await writeContract(config);
      const receipt = await wait();
      
      console.log('✅ Token gates set for bounty:', bountyId);
      return receipt.status === 'success';
    } catch (error) {
      console.error('Error setting token gates:', error);
      throw error;
    }
  };

  /**
   * Check if a user can view a bounty
   */
  const canViewBounty = async (bountyId: string, userAddress: string): Promise<boolean> => {
    try {
      const { data } = await readContract({
        address: contractAddress,
        abi: BountyManagerOptimizedABI,
        functionName: 'canViewBounty',
        args: [bountyId, userAddress]
      });

      return data as boolean;
    } catch (error) {
      console.error('Error checking bounty access:', error);
      return false;
    }
  };

  /**
   * Helper function to store bounty in database
   */
  const storeBountyInDatabase = async (
    bountyId: string,
    ipfsHash: string,
    data: BountyFormV2Data
  ) => {
    try {
      // Store in your database for faster queries
      // This is optional but recommended for performance
      const response = await fetch('/api/bounty/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onchain_id: bountyId,
          ipfs_hash: ipfsHash,
          ...data
        })
      });

      if (!response.ok) {
        console.warn('Failed to store bounty in database, but on-chain creation succeeded');
      }
    } catch (error) {
      console.warn('Database storage failed:', error);
      // Don't throw - this is not critical
    }
  };

  // Placeholder implementations for wagmi hooks
  // You'll need to properly implement these with actual wagmi hooks
  const prepareContractWrite = usePrepareContractWrite as any;
  const writeContract = useContractWrite as any;
  const readContract = useContractRead as any;

  return {
    createBounty,
    getBounty,
    placeBid,
    assignBounty,
    releasePayment,
    setTokenGates,
    canViewBounty,
    isLoading: false, // Implement from wagmi hooks
    error: null // Implement from wagmi hooks
  };
};
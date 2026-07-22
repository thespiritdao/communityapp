'use client';

import { useState, useCallback } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useReadContract } from 'wagmi';
import { parseEther, formatEther, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import type { BountyFormV2Data } from '../components/BountyFormV2';

// Import the contract ABI
import BountyManagerV5Artifact from '@/abis/BountyManagerV5.json';
import PodBountyServiceABI from '@/abis/PodBountyService.json';

const BountyManagerV5ABI = BountyManagerV5Artifact.abi;

const BOUNTY_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS ||
  '0x8Af29E57A962216C4661c36737CbF33510356DAD') as `0x${string}`;

const BOUNTY_MANAGER_ABI = BountyManagerV5ABI;

const SYSTEM_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_SYSTEM_TOKEN ||
  '0xd67e460ce56be18b573aB434b3DC962c657D8Bb5') as `0x${string}`;
const SELF_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_SELF_TOKEN ||
  '0x1b8d424695E63ABca04E94bA46c03f1D83e14020') as `0x${string}`;
const HATS_PROTOCOL_ADDRESS = (process.env.NEXT_PUBLIC_HATS_CONTRACT ||
  '0x3bc1a0ad72417f2d411118085256fc53cbddd137') as `0x${string}`;

console.log(`🎯 Bounty System: Using V4 at ${BOUNTY_MANAGER_ADDRESS}`);

export interface BountyV2 {
  id: string;
  title: string;
  creator: string;
  value: string;
  token: string;
  status: number;
  podId: string;
  category: string;
  ipfsHash: string;
  createdAt: number;
  deadline: number;
  fundingSource: string;
}

export interface Assignment {
  bidder: string;
  reviewer: string;
  escrowAmount: string;
  paidAmount: string;
}

export interface Bid {
  bidder: string;
  proposal: string;
  submittedAt: number;
  status: number;
}

export interface UseBountyV2Return {
  // Transaction call generators for OnchainKit
  registerPodCall: (podId: string, leaderHatId: string, treasuryAddress: string) => any;
  isPodRegistered: (podId: string) => Promise<boolean>;
  createBountyCall: (data: BountyFormV2Data, funderHatId?: string) => any;
  placeBidCall: (bountyId: string, proposalIpfsHash: string) => any;
  assignBountyCall: (
    bountyId: string,
    bidIndex: number,
    reviewer: string,
    approver: string,
  ) => any;
  releasePaymentCall: (bountyId: string, amount: string) => any;
  cancelBountyCall: (bountyId: string) => any;

  // Data fetching
  getBounty: (bountyId: string) => Promise<BountyV2 | null>;
  getBounties: (podId?: string) => Promise<BountyV2[]>;
  getBountyDetails: (bountyId: string) => Promise<BountyV2 | null>;
  getAssignment: (bountyId: string) => Promise<Assignment | null>;
  getBids: (bountyId: string) => Promise<Bid[]>;

  // Permission checks
  canManageBounties: (podId: string) => Promise<boolean>;
  canUsePodTreasury: (podId: string) => Promise<boolean>;

  // State
  isLoading: boolean;
  error: string | null;
}

export const useBountyV2 = (): UseBountyV2Return => {
  const { evmAddress: address } = useEvmAddress();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to upload metadata to IPFS
  const uploadToIPFS = async (metadata: any): Promise<string> => {
    const response = await fetch('/api/bounty/ipfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', metadata }),
    });

    if (!response.ok) {
      throw new Error('Failed to upload to IPFS');
    }

    const { ipfsHash } = await response.json();
    return ipfsHash;
  };

  /**
   * V5: Generate the one-time registerPodMetadata call. Must run (once per pod)
   * before the pod's first treasury-funded bounty — V5 no longer auto-registers.
   * The caller must wear leaderHatId on-chain.
   */
  const registerPodCall = useCallback(
    (podId: string, leaderHatId: string, treasuryAddress: string) => {
      if (!BOUNTY_MANAGER_ADDRESS) {
        throw new Error('Bounty Manager address not configured');
      }
      return {
        address: BOUNTY_MANAGER_ADDRESS,
        abi: BOUNTY_MANAGER_ABI,
        functionName: 'registerPodMetadata' as const,
        args: [podId, BigInt(leaderHatId), treasuryAddress as `0x${string}`],
      };
    },
    [],
  );

  /**
   * V5: read whether a pod is already registered with BountyManager on-chain.
   */
  const isPodRegistered = useCallback(async (podId: string): Promise<boolean> => {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
      });
      const result = await client.readContract({
        address: BOUNTY_MANAGER_ADDRESS,
        abi: BOUNTY_MANAGER_ABI,
        functionName: 'isValidPod',
        args: [podId],
      });
      return result as boolean;
    } catch (e) {
      console.error('isPodRegistered read failed:', e);
      return false;
    }
  }, []);

  /**
   * Generate createBounty transaction call for OnchainKit
   * @param data Bounty form data
   * @param funderHatId Hat the caller funds under (leader hat, or a hat
   *   authorized via setAuthorizedFunderHat). Ignored for wallet funding.
   */
  const createBountyCall = useCallback(
    (
      data: BountyFormV2Data,
      funderHatId?: string,
    ) => {
      if (!BOUNTY_MANAGER_ADDRESS) {
        throw new Error('Bounty Manager address not configured');
      }

      const useTreasuryFunding = data.funding_source === 'pod_treasury';

      // V5: createBounty no longer accepts a caller-supplied treasury address —
      // treasury funds are always pulled from the pod's REGISTERED treasury
      // (podMetadata[podId].treasuryAddress), which fixes BM-001. The pod must
      // be registered first via registerPodMetadata. For treasury funding the
      // caller must wear the pod leader hat OR a hat authorized via
      // setAuthorizedFunderHat; funderHatId is the hat they claim authority
      // under (ignored for wallet-funded bounties).
      const v5Args = [
        parseEther(data.value.amount), // value (uint128)
        data.value.token === 'SYSTEM'
          ? SYSTEM_TOKEN_ADDRESS
          : SELF_TOKEN_ADDRESS, // token
        0, // paymentType (0=Completion)
        data.podId, // podId
        `temp_${Date.now()}`, // ipfsHash (temporary, will be updated)
        BigInt(funderHatId || '0'), // funderHatId (the hat the caller funds under)
        useTreasuryFunding,          // pull from registered treasury vs caller wallet
      ];

      return {
        address: BOUNTY_MANAGER_ADDRESS,
        abi: BOUNTY_MANAGER_ABI,
        functionName: 'createBounty' as const,
        args: v5Args,
      };
    },
    [address],
  );

  /**
   * Generate placeBid transaction call for OnchainKit
   */
  const placeBidCall = useCallback(
    (bountyId: string, proposalIpfsHash: string) => {
      if (!BOUNTY_MANAGER_ADDRESS) {
        throw new Error('Bounty Manager address not configured');
      }

      return {
        address: BOUNTY_MANAGER_ADDRESS,
        abi: BOUNTY_MANAGER_ABI,
        functionName: 'placeBid' as const,
        args: [BigInt(bountyId), proposalIpfsHash],
      };
    },
    [],
  );

  /**
   * Generate assignBounty transaction call for OnchainKit
   */
  const assignBountyCall = useCallback(
    (
      bountyId: string,
      bidIndex: number,
      reviewer: string,
      approver: string,
    ) => {
      if (!BOUNTY_MANAGER_ADDRESS) {
        throw new Error('Bounty Manager address not configured');
      }

      return {
        address: BOUNTY_MANAGER_ADDRESS,
        abi: BOUNTY_MANAGER_ABI,
        functionName: 'assignBounty' as const,
        args: [
          BigInt(bountyId),
          BigInt(bidIndex),
          reviewer as `0x${string}`,
          approver as `0x${string}`,
        ],
      };
    },
    [],
  );

  /**
   * Generate releasePayment transaction call for OnchainKit
   */
  const releasePaymentCall = useCallback((bountyId: string, amount: string) => {
    if (!BOUNTY_MANAGER_ADDRESS) {
      throw new Error('Bounty Manager address not configured');
    }

    return {
      address: BOUNTY_MANAGER_ADDRESS,
      abi: BOUNTY_MANAGER_ABI,
      functionName: 'releasePayment' as const,
      args: [BigInt(bountyId), parseEther(amount)],
    };
  }, []);

  /**
   * Generate cancelBounty transaction call for OnchainKit
   */
  const cancelBountyCall = useCallback((bountyId: string) => {
    if (!BOUNTY_MANAGER_ADDRESS) {
      throw new Error('Bounty Manager address not configured');
    }

    return {
      address: BOUNTY_MANAGER_ADDRESS,
      abi: BOUNTY_MANAGER_ABI,
      functionName: 'cancelBounty' as const,
      args: [BigInt(bountyId)],
    };
  }, []);

  /**
   * Fetch bounty data from contract
   */
  const getBounty = useCallback(
    async (bountyId: string): Promise<BountyV2 | null> => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/bounty/get?id=${bountyId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch bounty');
        }

        const bountyData = await response.json();
        return bountyData;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Fetch all bounties for a pod (or all if no podId)
   */
  const getBounties = useCallback(
    async (podId?: string): Promise<BountyV2[]> => {
      try {
        setIsLoading(true);
        setError(null);

        const url = podId
          ? `/api/bounty/list?podId=${podId}`
          : '/api/bounty/list';
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch bounties');
        }

        const bountiesData = await response.json();
        return bountiesData;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Fetch detailed bounty data (alias for getBounty)
   */
  const getBountyDetails = useCallback(
    async (bountyId: string): Promise<BountyV2 | null> => {
      return getBounty(bountyId);
    },
    [getBounty],
  );

  /**
   * Fetch assignment data from contract
   */
  const getAssignment = useCallback(
    async (bountyId: string): Promise<Assignment | null> => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/bounty/assignment?id=${bountyId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch assignment');
        }

        const assignmentData = await response.json();
        return assignmentData;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Fetch bids for a bounty
   */
  const getBids = useCallback(async (bountyId: string): Promise<Bid[]> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/bounty/bids?id=${bountyId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch bids');
      }

      const bidsData = await response.json();
      return bidsData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Check if user can manage bounties for a pod
   * V3: Reads directly from BountyManagerV3 (Hats-based)
   * V2: Falls back to API call
   */
  const canManageBounties = useCallback(
    async (podId: string): Promise<boolean> => {
      if (!address) return false;

      try {
        const response = await fetch(
          `/api/bounty/permissions?user=${address}&pod=${podId}&action=manage`,
        );
        if (!response.ok) return false;
        const { canManage } = await response.json();
        return canManage;
      } catch (err) {
        console.error('Error checking bounty management permission:', err);
        return false;
      }
    },
    [address],
  );

  /**
   * Check if user can use pod treasury
   * V3: Reads from pod metadata via BountyManagerV3
   * V2: Falls back to API call
   */
  const canUsePodTreasury = useCallback(
    async (podId: string): Promise<boolean> => {
      if (!address) return false;

      try {
        return canManageBounties(podId);
      } catch (err) {
        console.error('Error checking treasury permission:', err);
        return false;
      }
    },
    [address, canManageBounties],
  );

  return {
    // Transaction calls for OnchainKit
    registerPodCall,
    isPodRegistered,
    createBountyCall,
    placeBidCall,
    assignBountyCall,
    releasePaymentCall,
    cancelBountyCall,

    // Data fetching
    getBounty,
    getBounties,
    getBountyDetails,
    getAssignment,
    getBids,

    // Permission checks
    canManageBounties,
    canUsePodTreasury,

    // State
    isLoading,
    error,
  };
};

/**
 * Hook for reading contract data with useReadContract
 */
export const useBountyReader = (bountyId?: string) => {
  // Read bounty core data
  const { data: bountyData } = useReadContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BOUNTY_MANAGER_ABI,
    functionName: 'getBounty',
    args: bountyId ? [BigInt(bountyId)] : undefined,
    query: {
      enabled: !!bountyId && !!BOUNTY_MANAGER_ADDRESS,
    },
  });

  // Read bounty metadata
  const { data: bountyMetadata } = useReadContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BOUNTY_MANAGER_ABI,
    functionName: 'getBountyMetadata',
    args: bountyId ? [BigInt(bountyId)] : undefined,
    query: {
      enabled: !!bountyId && !!BOUNTY_MANAGER_ADDRESS,
    },
  });

  // Read assignment data
  const { data: assignmentData } = useReadContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BOUNTY_MANAGER_ABI,
    functionName: 'getAssignment',
    args: bountyId ? [BigInt(bountyId)] : undefined,
    query: {
      enabled: !!bountyId && !!BOUNTY_MANAGER_ADDRESS,
    },
  });

  return {
    bountyData,
    bountyMetadata,
    assignmentData,
  };
};

// Note: usePodPermissions hook moved to usePodFactoryPermissions.ts to avoid conflicts

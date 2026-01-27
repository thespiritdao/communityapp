'use client';

import { useState, useCallback } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useReadContract } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import type { BountyFormV2Data } from '../components/BountyFormV2';

// Import the contract ABIs
import BountyManagerV2ABI from '@/abis/BountyManagerV2.json'; // Raw ABI array
import BountyManagerV3Artifact from '@/abis/BountyManagerV3.json'; // Hardhat artifact (V3)
import BountyManagerV4Artifact from '@/abis/BountyManagerV4.json'; // Hardhat artifact (V4)
import PodBountyServiceABI from '@/abis/PodBountyService.json';

// Extract ABI arrays from Hardhat artifacts (V2 is already an array)
const BountyManagerV3ABI = BountyManagerV3Artifact.abi;
const BountyManagerV4ABI = BountyManagerV4Artifact.abi;

// AUTO-DETECT: Use V3/V4 if deployed, otherwise fallback to V2
const BOUNTY_MANAGER_V3_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS as `0x${string}` | undefined;
const BOUNTY_MANAGER_V2_ADDRESS = (process.env
  .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS ||
  '0xc2Ac53e7C869Ed9Bcd21b72C7aE747Abb788A8e5') as `0x${string}`;

// V3/V4 is preferred (decentralized, Hats-integrated)
const USE_V3 = !!BOUNTY_MANAGER_V3_ADDRESS &&
  process.env.NEXT_PUBLIC_USE_BOUNTY_V3 !== 'false';

const SYSTEM_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_SYSTEM_TOKEN ||
  '0xd67e460ce56be18b573aB434b3DC962c657D8Bb5') as `0x${string}`;
const SELF_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_SELF_TOKEN ||
  '0x1b8d424695E63ABca04E94bA46c03f1D83e14020') as `0x${string}`;
const HATS_PROTOCOL_ADDRESS = (process.env.NEXT_PUBLIC_HATS_CONTRACT ||
  '0x3bc1a0ad72417f2d411118085256fc53cbddd137') as `0x${string}`;

// Determine which contract to use
const BOUNTY_MANAGER_ADDRESS = USE_V3 && BOUNTY_MANAGER_V3_ADDRESS
  ? BOUNTY_MANAGER_V3_ADDRESS
  : BOUNTY_MANAGER_V2_ADDRESS;

// Use V4 ABI if V3/V4 is enabled (V4 has same functions as V3, just configurable tokens)
const BOUNTY_MANAGER_ABI = USE_V3 && BOUNTY_MANAGER_V3_ADDRESS
  ? BountyManagerV4ABI  // Using V4 ABI (deployed contract)
  : BountyManagerV2ABI;

console.log(`🎯 Bounty System: Using ${USE_V3 ? 'V4 (Configurable Tokens)' : 'V2 (Legacy)'} at ${BOUNTY_MANAGER_ADDRESS}`);

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
  createBountyCall: (data: BountyFormV2Data) => any;
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
   * Generate createBounty transaction call for OnchainKit
   * @param data Bounty form data
   * @param leaderHatId Optional leader HAT ID (required for V3 if pod not registered)
   * @param treasuryAddress Optional treasury address (required for V3 if pod not registered)
   */
  const createBountyCall = useCallback(
    (
      data: BountyFormV2Data,
      leaderHatId?: string,
      treasuryAddress?: string
    ) => {
      if (!BOUNTY_MANAGER_ADDRESS) {
        throw new Error('Bounty Manager address not configured');
      }

      const baseArgs = [
        parseEther(data.value.amount), // value (uint128)
        data.value.token === 'SYSTEM'
          ? SYSTEM_TOKEN_ADDRESS
          : SELF_TOKEN_ADDRESS, // token
        0, // paymentType (0=Completion)
        data.podId, // podId
        `temp_${Date.now()}`, // ipfsHash (temporary, will be updated)
      ];

      // V3/V4 requires additional parameters for auto-registration
      if (USE_V3 && BOUNTY_MANAGER_V3_ADDRESS) {
        // V4 contract REQUIRES a valid treasury address (cannot be zero address)
        if (!treasuryAddress || treasuryAddress === '0x0000000000000000000000000000000000000000') {
          throw new Error('Treasury address is required for V4 bounty creation. Please deploy a treasury first.');
        }

        const v4Args = [
          ...baseArgs,
          BigInt(leaderHatId || '0'), // leaderHatId (0 if pod already registered)
          treasuryAddress as `0x${string}`, // treasuryAddress (REQUIRED, cannot be zero)
        ];

        console.log('🎯 V4 createBounty args (7 params):', {
          value: v4Args[0].toString(),
          token: v4Args[1],
          paymentType: v4Args[2],
          podId: v4Args[3],
          ipfsHash: v4Args[4],
          leaderHatId: v4Args[5].toString(),
          treasuryAddress: v4Args[6],
        });

        return {
          address: BOUNTY_MANAGER_ADDRESS,
          abi: BOUNTY_MANAGER_ABI,
          functionName: 'createBounty' as const,
          args: v4Args,
        };
      }

      // V2 original format
      console.log('📦 V2 createBounty args (5 params):', baseArgs);
      return {
        address: BOUNTY_MANAGER_ADDRESS,
        abi: BOUNTY_MANAGER_ABI,
        functionName: 'createBounty' as const,
        args: baseArgs,
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
        if (USE_V3 && BOUNTY_MANAGER_V3_ADDRESS) {
          // V3: Direct contract read (decentralized)
          const response = await fetch(
            `/api/bounty/permissions?user=${address}&pod=${podId}&action=manage`,
          );
          if (!response.ok) return false;
          const { canManage } = await response.json();
          return canManage;
        } else {
          // V2: Legacy API call
          const response = await fetch(
            `/api/pod/permissions?user=${address}&pod=${podId}&action=manage_bounties`,
          );
          if (!response.ok) return false;
          const { canManage } = await response.json();
          return canManage;
        }
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
        if (USE_V3 && BOUNTY_MANAGER_V3_ADDRESS) {
          // V3: Same as manage (leader HAT holders control both)
          return canManageBounties(podId);
        } else {
          // V2: Legacy API call
          const response = await fetch(
            `/api/pod/permissions?user=${address}&pod=${podId}&action=use_treasury`,
          );
          if (!response.ok) return false;
          const { canUse } = await response.json();
          return canUse;
        }
      } catch (err) {
        console.error('Error checking treasury permission:', err);
        return false;
      }
    },
    [address, canManageBounties],
  );

  return {
    // Transaction calls for OnchainKit
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
    address: BOUNTY_MANAGER_V2_ADDRESS,
    abi: BountyManagerV2ABI,
    functionName: 'getBounty',
    args: bountyId ? [BigInt(bountyId)] : undefined,
    query: {
      enabled: !!bountyId && !!BOUNTY_MANAGER_V2_ADDRESS,
    },
  });

  // Read bounty metadata
  const { data: bountyMetadata } = useReadContract({
    address: BOUNTY_MANAGER_V2_ADDRESS,
    abi: BountyManagerV2ABI,
    functionName: 'getBountyMetadata',
    args: bountyId ? [BigInt(bountyId)] : undefined,
    query: {
      enabled: !!bountyId && !!BOUNTY_MANAGER_V2_ADDRESS,
    },
  });

  // Read assignment data
  const { data: assignmentData } = useReadContract({
    address: BOUNTY_MANAGER_V2_ADDRESS,
    abi: BountyManagerV2ABI,
    functionName: 'getAssignment',
    args: bountyId ? [BigInt(bountyId)] : undefined,
    query: {
      enabled: !!bountyId && !!BOUNTY_MANAGER_V2_ADDRESS,
    },
  });

  return {
    bountyData,
    bountyMetadata,
    assignmentData,
  };
};

// Note: usePodPermissions hook moved to usePodFactoryPermissions.ts to avoid conflicts

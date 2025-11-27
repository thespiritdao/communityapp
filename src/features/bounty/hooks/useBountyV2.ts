'use client';

import { useState, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import type { BountyFormV2Data } from '../components/BountyFormV2';

// Import the new contract ABIs (you'll need to generate these)
import BountyManagerV2ABI from '@/abis/BountyManagerV2.json';
import PodBountyServiceABI from '@/abis/PodBountyService.json';

const BOUNTY_MANAGER_V2_ADDRESS = (process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS || '0x29e653502083442B8B6C7c969557022F6a3CC64C') as `0x${string}`;
const POD_BOUNTY_SERVICE_ADDRESS = (process.env.NEXT_PUBLIC_POD_BOUNTY_SERVICE || '0xbccee13f13Ca4f97758c79C8FF05ff7EB9290396') as `0x${string}`;
const SYSTEM_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_SYSTEM_TOKEN || '0x1317Ae277266D38C4E492558f8693F14143a6A65') as `0x${string}`;
const SELF_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_SELF_TOKEN || '0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21') as `0x${string}`;

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
  assignBountyCall: (bountyId: string, bidIndex: number, reviewer: string, approver: string) => any;
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
  const { address } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to upload metadata to IPFS
  const uploadToIPFS = async (metadata: any): Promise<string> => {
    const response = await fetch('/api/bounty/ipfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', metadata })
    });

    if (!response.ok) {
      throw new Error('Failed to upload to IPFS');
    }

    const { ipfsHash } = await response.json();
    return ipfsHash;
  };

  /**
   * Generate createBounty transaction call for OnchainKit
   */
  const createBountyCall = useCallback((data: BountyFormV2Data) => {
    if (!BOUNTY_MANAGER_V2_ADDRESS) {
      throw new Error('Bounty Manager V2 address not configured');
    }

    return {
      address: BOUNTY_MANAGER_V2_ADDRESS,
      abi: BountyManagerV2ABI,
      functionName: 'createBounty' as const,
      args: [
        parseEther(data.value.amount), // value (uint128)
        data.value.token === 'SYSTEM' ? SYSTEM_TOKEN_ADDRESS : SELF_TOKEN_ADDRESS, // token
        0, // paymentType (0=Completion)
        data.podId, // podId
        `temp_${Date.now()}` // ipfsHash (temporary, will be updated)
      ]
    };
  }, [address]);

  /**
   * Generate placeBid transaction call for OnchainKit
   */
  const placeBidCall = useCallback((bountyId: string, proposalIpfsHash: string) => {
    if (!BOUNTY_MANAGER_V2_ADDRESS) {
      throw new Error('Bounty Manager V2 address not configured');
    }

    return {
      address: BOUNTY_MANAGER_V2_ADDRESS,
      abi: BountyManagerV2ABI,
      functionName: 'placeBid' as const,
      args: [BigInt(bountyId), proposalIpfsHash]
    };
  }, []);

  /**
   * Generate assignBounty transaction call for OnchainKit
   */
  const assignBountyCall = useCallback((
    bountyId: string, 
    bidIndex: number, 
    reviewer: string, 
    approver: string
  ) => {
    if (!BOUNTY_MANAGER_V2_ADDRESS) {
      throw new Error('Bounty Manager V2 address not configured');
    }

    return {
      address: BOUNTY_MANAGER_V2_ADDRESS,
      abi: BountyManagerV2ABI,
      functionName: 'assignBounty' as const,
      args: [BigInt(bountyId), BigInt(bidIndex), reviewer as `0x${string}`, approver as `0x${string}`]
    };
  }, []);

  /**
   * Generate releasePayment transaction call for OnchainKit
   */
  const releasePaymentCall = useCallback((bountyId: string, amount: string) => {
    if (!BOUNTY_MANAGER_V2_ADDRESS) {
      throw new Error('Bounty Manager V2 address not configured');
    }

    return {
      address: BOUNTY_MANAGER_V2_ADDRESS,
      abi: BountyManagerV2ABI,
      functionName: 'releasePayment' as const,
      args: [BigInt(bountyId), parseEther(amount)]
    };
  }, []);

  /**
   * Generate cancelBounty transaction call for OnchainKit
   */
  const cancelBountyCall = useCallback((bountyId: string) => {
    if (!BOUNTY_MANAGER_V2_ADDRESS) {
      throw new Error('Bounty Manager V2 address not configured');
    }

    return {
      address: BOUNTY_MANAGER_V2_ADDRESS,
      abi: BountyManagerV2ABI,
      functionName: 'cancelBounty' as const,
      args: [BigInt(bountyId)]
    };
  }, []);

  /**
   * Fetch bounty data from contract
   */
  const getBounty = useCallback(async (bountyId: string): Promise<BountyV2 | null> => {
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
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch all bounties for a pod (or all if no podId)
   */
  const getBounties = useCallback(async (podId?: string): Promise<BountyV2[]> => {
    try {
      setIsLoading(true);
      setError(null);

      const url = podId ? `/api/bounty/list?podId=${podId}` : '/api/bounty/list';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch bounties');
      }

      const bountiesData = await response.json();
      return bountiesData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch detailed bounty data (alias for getBounty)
   */
  const getBountyDetails = useCallback(async (bountyId: string): Promise<BountyV2 | null> => {
    return getBounty(bountyId);
  }, [getBounty]);

  /**
   * Fetch assignment data from contract
   */
  const getAssignment = useCallback(async (bountyId: string): Promise<Assignment | null> => {
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
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

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
   */
  const canManageBounties = useCallback(async (podId: string): Promise<boolean> => {
    if (!address || !POD_BOUNTY_SERVICE_ADDRESS) return false;

    try {
      // This would use useReadContract in a real implementation
      const response = await fetch(`/api/pod/permissions?user=${address}&pod=${podId}&action=manage_bounties`);
      if (!response.ok) return false;

      const { canManage } = await response.json();
      return canManage;
    } catch (err) {
      console.error('Error checking bounty management permission:', err);
      return false;
    }
  }, [address]);

  /**
   * Check if user can use pod treasury
   */
  const canUsePodTreasury = useCallback(async (podId: string): Promise<boolean> => {
    if (!address || !POD_BOUNTY_SERVICE_ADDRESS) return false;

    try {
      const response = await fetch(`/api/pod/permissions?user=${address}&pod=${podId}&action=use_treasury`);
      if (!response.ok) return false;

      const { canUse } = await response.json();
      return canUse;
    } catch (err) {
      console.error('Error checking treasury permission:', err);
      return false;
    }
  }, [address]);

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
    error
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
      enabled: !!bountyId && !!BOUNTY_MANAGER_V2_ADDRESS
    }
  });

  // Read bounty metadata
  const { data: bountyMetadata } = useReadContract({
    address: BOUNTY_MANAGER_V2_ADDRESS,
    abi: BountyManagerV2ABI,
    functionName: 'getBountyMetadata',
    args: bountyId ? [BigInt(bountyId)] : undefined,
    query: {
      enabled: !!bountyId && !!BOUNTY_MANAGER_V2_ADDRESS
    }
  });

  // Read assignment data
  const { data: assignmentData } = useReadContract({
    address: BOUNTY_MANAGER_V2_ADDRESS,
    abi: BountyManagerV2ABI,
    functionName: 'getAssignment',
    args: bountyId ? [BigInt(bountyId)] : undefined,
    query: {
      enabled: !!bountyId && !!BOUNTY_MANAGER_V2_ADDRESS
    }
  });

  return {
    bountyData,
    bountyMetadata,
    assignmentData
  };
};

// Note: usePodPermissions hook moved to usePodFactoryPermissions.ts to avoid conflicts
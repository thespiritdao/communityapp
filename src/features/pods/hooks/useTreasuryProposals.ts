/**
 * Treasury Proposal Hooks
 *
 * Multi-sig treasury operations using majority voting system
 * Integrates with TreasuryProxy for sponsored transactions
 */

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { CONTRACT_ADDRESSES } from '@/config/contracts';
import { parseUnits } from 'viem';
import TreasuryProxyABI from '@/abis/TreasuryProxy.json';

export interface TreasuryProposal {
  id: number;
  proposalType: 'Distribution' | 'EmergencyWithdraw' | 'AddToken';
  status: 'Pending' | 'Executed' | 'Cancelled';
  proposer: string;
  createdAt: number;
  executedAt?: number;
  token: string;
  recipients: string[];
  amounts: string[];
  reason: string;
  approvalCount: number;
  requiredApprovals: number;
}

export interface CreateProposalParams {
  podId: string;
  token: string;
  recipients: string[];
  amounts: string[]; // In token units (will be converted to wei)
  reason: string;
}

/**
 * Hook for managing treasury proposals with majority voting
 */
export function useTreasuryProposals() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create a proposal for token distribution
   * Returns calls array for Transaction component
   */
  const getCreateProposalCalls = useCallback(
    (params: CreateProposalParams) => {
      if (!address) {
        throw new Error('Wallet not connected');
      }

      // Validate inputs
      if (!params.podId || !params.token) {
        throw new Error('Pod ID and token address required');
      }

      if (params.recipients.length === 0) {
        throw new Error('At least one recipient required');
      }

      if (params.recipients.length !== params.amounts.length) {
        throw new Error('Recipients and amounts arrays must match');
      }

      if (!params.reason || params.reason.trim() === '') {
        throw new Error('Reason is required');
      }

      // Convert amounts to wei (assuming 18 decimals for now)
      const amountsInWei = params.amounts.map((amount) =>
        parseUnits(amount, 18),
      );

      return [
        {
          address: CONTRACT_ADDRESSES.TREASURY_PROXY as `0x${string}`,
          abi: TreasuryProxyABI,
          functionName: 'proxyProposeDistribution',
          args: [
            params.podId,
            params.token as `0x${string}`,
            params.recipients as `0x${string}`[],
            amountsInWei,
            params.reason,
          ],
        },
      ];
    },
    [address],
  );

  /**
   * Approve a proposal
   * Returns calls array for Transaction component
   */
  const getApproveProposalCalls = useCallback(
    (podId: string, proposalId: number) => {
      if (!address) {
        throw new Error('Wallet not connected');
      }

      return [
        {
          address: CONTRACT_ADDRESSES.TREASURY_PROXY as `0x${string}`,
          abi: TreasuryProxyABI,
          functionName: 'proxyApproveProposal',
          args: [podId, BigInt(proposalId)],
        },
      ];
    },
    [address],
  );

  /**
   * Cancel a proposal (proposer only)
   * Returns calls array for Transaction component
   */
  const getCancelProposalCalls = useCallback(
    (podId: string, proposalId: number) => {
      if (!address) {
        throw new Error('Wallet not connected');
      }

      return [
        {
          address: CONTRACT_ADDRESSES.TREASURY_PROXY as `0x${string}`,
          abi: TreasuryProxyABI,
          functionName: 'proxyCancelProposal',
          args: [podId, BigInt(proposalId)],
        },
      ];
    },
    [address],
  );

  return {
    loading,
    error,
    getCreateProposalCalls,
    getApproveProposalCalls,
    getCancelProposalCalls,
    isConnected: !!address,
    userAddress: address,
  };
}

/**
 * Hook for reading proposal data
 */
export function useTreasuryProposalData(podId: string) {
  // This would integrate with your Supabase or subgraph indexer
  // For now, returning placeholder structure

  const getRequiredApprovals = useCallback(async () => {
    // Call contract to get required approvals
    // This is a view function, no gas required
    return 2; // Placeholder
  }, [podId]);

  const checkIfApproved = useCallback(
    async (proposalId: number, approver: string) => {
      // Call contract to check if address has approved
      return false; // Placeholder
    },
    [podId],
  );

  return {
    getRequiredApprovals,
    checkIfApproved,
  };
}

/**
 * Helper to format proposal for display
 */
export function formatProposalForDisplay(proposal: TreasuryProposal) {
  return {
    ...proposal,
    statusBadge:
      proposal.status === 'Pending'
        ? 'warning'
        : proposal.status === 'Executed'
          ? 'success'
          : 'error',
    progress: `${proposal.approvalCount}/${proposal.requiredApprovals}`,
    isExecutable:
      proposal.approvalCount >= proposal.requiredApprovals &&
      proposal.status === 'Pending',
  };
}

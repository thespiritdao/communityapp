// src/features/governance/components/VoteButton.tsx
'use client';
import type React from 'react';
import { useState, useCallback } from 'react';
import { usePublicClient } from 'wagmi';
import type { Abi } from 'viem';
import { encodeFunctionData } from 'viem';
import { useToast } from '@/components/ui/use-toast';
import { useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import DAOGovernorABIJson from '@/abis/DAO_GovernorABI.json';

const DAOGovernorABI = DAOGovernorABIJson as Abi;
import { useGovernancePermission } from '@/hooks/useGovernancePermission';

interface VoteButtonProps {
  proposalId: number;
  choice: number;
  approvingPodId?: string; // Optional: which pod should approve (defaults to Executive Pod)
}

const BASE_CHAIN_ID = 8453;

const VoteButton: React.FC<VoteButtonProps> = ({
  proposalId,
  choice,
  approvingPodId,
}) => {
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const publicClient = usePublicClient();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSponsoredProcessing, setIsSponsoredProcessing] = useState(false);
  const GOVERNOR_ADDRESS = process.env
    .NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;

  // Get address from CDP Smart Account
  const address = currentUser?.evmSmartAccounts?.[0] as `0x${string}` | undefined;

  // ✅ ARCHITECTURE FIX: Check governance permission for correct pod
  // On-chain governance proposals typically require Executive Pod permission
  const { canParticipate: hasGovernancePermission } = useGovernancePermission(
    approvingPodId,
    'dao-wide',
  );

  // ✅ FIX: Block voting if no permission
  if (!hasGovernancePermission) {
    return (
      <button
        disabled
        className="px-4 py-2 bg-gray-300 text-gray-500 rounded cursor-not-allowed"
        title="You do not have governance participation permission in the required pod"
      >
        Vote (No Permission)
      </button>
    );
  }

  // CDP transaction handler (non-sponsored)
  const handleVote = useCallback(async (usePaymaster: boolean) => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      toast({
        title: 'Error',
        description: 'Smart Account not found',
        variant: 'destructive',
      });
      return;
    }

    const setLoading = usePaymaster ? setIsSponsoredProcessing : setIsProcessing;
    setLoading(true);

    try {
      console.log(
        `Attempting CDP vote on proposal ${proposalId} with choice ${choice}, paymaster: ${usePaymaster}`,
      );

      const smartAccount = currentUser.evmSmartAccounts[0];

      // Encode the vote call
      const callData = encodeFunctionData({
        abi: DAOGovernorABI,
        functionName: 'castVote',
        args: [BigInt(proposalId), Number(choice)],
      });

      console.log('Sending user operation:', {
        smartAccount,
        functionName: 'castVote',
        args: [proposalId, choice],
        usePaymaster,
      });

      // Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: GOVERNOR_ADDRESS,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: usePaymaster,
      });

      console.log('✅ Vote submitted successfully:', result);

      toast({
        title: 'Vote submitted',
        description: `Your vote was cast on-chain${usePaymaster ? ' (gasless)' : ''}!`,
        variant: 'success',
      });
    } catch (error: any) {
      console.error('Vote transaction failed:', error);

      let errorMessage = 'Unknown error occurred';
      if (error.shortMessage) errorMessage = error.shortMessage;
      else if (error.message) errorMessage = error.message;

      toast({
        title: 'Vote failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [currentUser, proposalId, choice, sendUserOperation, GOVERNOR_ADDRESS, toast]);

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex space-x-4">
        {/* CDP Non-Sponsored Vote Button */}
        <button
          onClick={() => handleVote(false)}
          disabled={isProcessing || !address}
          className={`px-4 py-2 text-white rounded ${isProcessing ? 'opacity-50' : ''} newProposalButton`}
          style={{ backgroundColor: '#2F5D50' }}
          onMouseEnter={(e) => {
            if (!isProcessing)
              e.currentTarget.style.backgroundColor = '#1F453A';
          }}
          onMouseLeave={(e) => {
            if (!isProcessing)
              e.currentTarget.style.backgroundColor = '#2F5D50';
          }}
        >
          {isProcessing ? 'Processing...' : 'Vote (Pay Gas)'}
        </button>

        {/* CDP Sponsored (Gasless) Vote Button */}
        <button
          onClick={() => handleVote(true)}
          disabled={isSponsoredProcessing || !address}
          className={`px-4 py-2 text-white rounded ${isSponsoredProcessing ? 'opacity-50' : ''} newProposalButton`}
          style={{ backgroundColor: '#2F5D50' }}
          onMouseEnter={(e) => {
            if (!isSponsoredProcessing)
              e.currentTarget.style.backgroundColor = '#1F453A';
          }}
          onMouseLeave={(e) => {
            if (!isSponsoredProcessing)
              e.currentTarget.style.backgroundColor = '#2F5D50';
          }}
        >
          {isSponsoredProcessing ? 'Processing...' : 'Vote (Gasless)'}
        </button>
      </div>

      {/* Debug information */}
      <div className="mt-4 p-4 bg-gray-100 rounded text-xs">
        <div>Debug Info:</div>
        <div>Proposal ID: {proposalId}</div>
        <div>Choice: {choice}</div>
        <div>Smart Account: {address || 'Not connected'}</div>
        <div>Governor: {GOVERNOR_ADDRESS || 'Not configured'}</div>
      </div>
    </div>
  );
};

export default VoteButton;

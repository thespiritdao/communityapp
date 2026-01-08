'use client';

import { useState } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { encodeFunctionData } from 'viem';
import { supabase } from '@/utils/supabaseClient';
import PodApplicationVotingABI from '@/abis/PodApplicationVotingABI.json';

interface VoteOnApplicationButtonProps {
  applicationId: string;
  currentVotes: number;
  requiredVotes: number;
  votingLeaders: string[];
  podId: string; // Added to determine which pod's leader HAT to check
  onSuccess: () => void;
}

// Contract address (will be set after deployment)
const POD_APPLICATION_VOTING_CONTRACT = process.env.NEXT_PUBLIC_POD_APPLICATION_VOTING as `0x${string}`;

// Hats Protocol - Executive Pod Leader HAT (required to vote)
const EXECUTIVE_POD_LEADER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER as string;

/**
 * Convert UUID string to bytes32 for contract call
 * UUIDs are 128-bit (16 bytes), we pad with zeros to get 32 bytes
 */
function uuidToBytes32(uuid: string): `0x${string}` {
  // Remove hyphens from UUID
  const hex = uuid.replace(/-/g, '');
  // Pad to 64 characters (32 bytes)
  const padded = hex.padStart(64, '0');
  return `0x${padded}` as `0x${string}`;
}

/**
 * Onchain voting button for pod membership application approvals
 * Uses PodApplicationVoting contract for gasless, HAT-verified voting
 */
export const VoteOnApplicationButton: React.FC<
  VoteOnApplicationButtonProps
> = ({
  applicationId,
  currentVotes,
  requiredVotes,
  votingLeaders,
  podId,
  onSuccess,
}) => {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();

  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // CDP Smart Account transaction handler - Contract Call Pattern
  const handleVoteTransaction = async (voteType: 'approve' | 'reject') => {
    // Validation
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for vote recording:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your Smart Wallet to record your vote.',
        variant: 'destructive',
      });
      return;
    }

    if (!POD_APPLICATION_VOTING_CONTRACT) {
      toast({
        title: 'Contract Not Configured',
        description: 'PodApplicationVoting contract address not set. Please contact support.',
        variant: 'destructive',
      });
      return;
    }

    if (!EXECUTIVE_POD_LEADER_HAT) {
      toast({
        title: 'HAT Not Configured',
        description: 'Executive Pod Leader HAT ID not set. Please contact support.',
        variant: 'destructive',
      });
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0];

    setIsTransactionPending(true);
    setIsProcessing(true);

    try {
      console.log('🚀 Building Smart Account User Operation for vote recording...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Transaction: PodApplicationVoting.castVote()');
      console.log(`📝 Vote Type: ${voteType}`);
      console.log('🏠 Contract:', POD_APPLICATION_VOTING_CONTRACT);
      console.log('🎩 Required HAT:', EXECUTIVE_POD_LEADER_HAT);
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // Convert UUID to bytes32 for contract
      const applicationIdBytes32 = uuidToBytes32(applicationId);
      console.log('📋 Application ID (bytes32):', applicationIdBytes32);

      // Encode the contract call: castVote(bytes32 applicationId, uint256 podLeaderHatId, bool approved)
      const callData = encodeFunctionData({
        abi: PodApplicationVotingABI,
        functionName: 'castVote',
        args: [
          applicationIdBytes32,
          BigInt(EXECUTIVE_POD_LEADER_HAT),
          voteType === 'approve', // true for approve, false for reject
        ],
      });

      console.log('📝 Encoded call data:', callData);

      // Send user operation with paymaster sponsorship
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base', // Base mainnet
        calls: [{
          to: POD_APPLICATION_VOTING_CONTRACT,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true, // Gasless transaction!
      });

      console.log('✅ User operation sent successfully!', result);

      // Handle success with receipt
      // Type assertion needed due to incomplete CDP SDK types
      const resultWithReceipt = result as any;
      if (resultWithReceipt?.receipt) {
        const txHash = resultWithReceipt.receipt.transactionHash;
        const blockNumber = resultWithReceipt.receipt.blockNumber;

        console.log(`✅ ${voteType} vote transaction successful:`, txHash);

        // For approve votes, increment vote count
        // For reject votes, mark application as rejected
        if (voteType === 'approve') {
          const newVoteCount = currentVotes + 1;
          const newVotingLeaders = [...votingLeaders, evmAddress.toLowerCase()];

          await supabase
            .from('pod_membership_applications')
            .update({
              current_votes: newVoteCount,
              voting_leaders: newVotingLeaders,
            })
            .eq('id', applicationId);
        } else {
          // Rejection immediately changes status
          await supabase
            .from('pod_membership_applications')
            .update({
              status: 'rejected',
            })
            .eq('id', applicationId);
        }

        // Record the vote with transaction hash
        await supabase.from('pod_application_votes').insert({
          application_id: applicationId,
          voter_address: evmAddress.toLowerCase(),
          vote_type: voteType,
          transaction_hash: txHash,
          block_number: blockNumber ? Number(blockNumber) : null,
        });

        console.log(`📊 ${voteType} vote recorded successfully`);

        toast({
          title: voteType === 'approve' ? 'Approval Recorded!' : 'Rejection Recorded!',
          description: voteType === 'approve'
            ? `Your approval vote has been recorded. ${requiredVotes - currentVotes - 1} more vote(s) needed.`
            : 'Application has been rejected.',
          duration: 5000,
        });

        onSuccess();
      } else {
        console.warn('⚠️ No receipt found in result');
        toast({
          title: 'Transaction Completed',
          description: 'Vote transaction completed but receipt not found. Please refresh.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('❌ Vote recording failed:', error);
      toast({
        title: 'Transaction Failed',
        description: error.message || 'Failed to record vote. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600">
        Cast your vote on-chain (gasless via smart contract).{' '}
        {requiredVotes - currentVotes - 1} more vote(s) needed after yours.
      </div>

      {/* CDP Smart Account Transaction Buttons */}
      {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
        <div className="flex gap-3">
          {/* Approve Button - PRIMARY Intent */}
          <Button
            onClick={() => handleVoteTransaction('approve')}
            disabled={isTransactionPending || isProcessing}
            className="flex-1 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: '#2F5D50',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isTransactionPending && !isProcessing) {
                e.currentTarget.style.backgroundColor = '#1F453A';
              }
            }}
            onMouseLeave={(e) => {
              if (!isTransactionPending && !isProcessing) {
                e.currentTarget.style.backgroundColor = '#2F5D50';
              }
            }}
          >
            {isTransactionPending || isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                Recording...
              </>
            ) : (
              'Approve'
            )}
          </Button>

          {/* Reject Button - DESTRUCTIVE Intent */}
          <Button
            onClick={() => handleVoteTransaction('reject')}
            disabled={isTransactionPending || isProcessing}
            className="flex-1 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: '#8B3A3A',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isTransactionPending && !isProcessing) {
                e.currentTarget.style.backgroundColor = '#6B2A2A';
              }
            }}
            onMouseLeave={(e) => {
              if (!isTransactionPending && !isProcessing) {
                e.currentTarget.style.backgroundColor = '#8B3A3A';
              }
            }}
          >
            {isTransactionPending || isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                Recording...
              </>
            ) : (
              'Reject'
            )}
          </Button>
        </div>
      ) : (
        <div className="p-3 border rounded-lg bg-gray-50 text-sm">
          <p className="text-red-600 font-medium">
            Wallet Not Connected
          </p>
          <p className="text-gray-600 mt-1">
            Please connect your Smart Wallet to record your vote.
          </p>
        </div>
      )}
    </div>
  );
};

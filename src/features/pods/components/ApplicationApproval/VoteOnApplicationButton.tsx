'use client';

import { useState } from 'react';
import { Transaction, TransactionButton, TransactionStatus, TransactionStatusLabel } from '@coinbase/onchainkit/transaction';
import type { LifecycleStatus } from '@coinbase/onchainkit/transaction';
import { base } from 'viem/chains';
import { useAccount } from 'wagmi';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/utils/supabaseClient';

interface VoteOnApplicationButtonProps {
  applicationId: string;
  currentVotes: number;
  requiredVotes: number;
  votingLeaders: string[];
  onSuccess: () => void;
}

/**
 * Onchain voting button for intermediate application approvals
 * Records vote as blockchain transaction with passkey
 */
export const VoteOnApplicationButton: React.FC<VoteOnApplicationButtonProps> = ({
  applicationId,
  currentVotes,
  requiredVotes,
  votingLeaders,
  onSuccess
}) => {
  const { address } = useAccount();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  // Encode application ID in transaction data for onchain record
  // This creates a unique transaction signature for this vote
  const voteData = `0x${Buffer.from(`VOTE:${applicationId}:${address}`).toString('hex')}`;

  const handleSuccess = async (response: { transactionReceipts: any[] }) => {
    try {
      setIsProcessing(true);

      const txHash = response.transactionReceipts?.[0]?.transactionHash;
      const blockNumber = response.transactionReceipts?.[0]?.blockNumber;

      console.log('✅ Vote transaction successful:', txHash);

      // Update application vote count
      const newVoteCount = currentVotes + 1;
      const newVotingLeaders = [...votingLeaders, address?.toLowerCase() || ''];

      await supabase
        .from('pod_membership_applications')
        .update({
          current_votes: newVoteCount,
          voting_leaders: newVotingLeaders
        })
        .eq('id', applicationId);

      // Record the vote with transaction hash
      await supabase
        .from('pod_application_votes')
        .insert({
          application_id: applicationId,
          voter_address: address?.toLowerCase() || '',
          vote_type: 'approve',
          transaction_hash: txHash,
          block_number: blockNumber ? Number(blockNumber) : null
        });

      console.log(`📊 Vote recorded: ${newVoteCount}/${requiredVotes}`);

      toast({
        title: "Vote Recorded Onchain!",
        description: `Your approval vote has been recorded. ${requiredVotes - newVoteCount} more vote(s) needed.`,
        duration: 5000
      });

      onSuccess();
    } catch (error) {
      console.error('❌ Failed to record vote:', error);
      toast({
        title: "Vote Recorded, Database Update Failed",
        description: "Your vote was recorded onchain but database update failed. Please refresh.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleError = (error: Error) => {
    console.error('Transaction error:', error);
    toast({
      title: "Transaction Failed",
      description: error.message || "Failed to record vote. Please try again.",
      variant: "destructive"
    });
  };

  const handleStatusChange = (status: LifecycleStatus) => {
    console.log('Vote transaction status:', status);
  };

  return (
    <Transaction
      chainId={base.id}
      isSponsored={true}
      capabilities={{
        paymasterService: {
          url: process.env.NEXT_PUBLIC_PAYMASTER || ''
        }
      }}
      calls={[{
        to: address || '0x0000000000000000000000000000000000000000', // Self-send (creates onchain record)
        data: voteData as `0x${string}`, // Application ID + voter address as data
        value: BigInt(0) // 0 value transaction
      }]}
      onSuccess={handleSuccess}
      onError={handleError}
      onStatus={handleStatusChange}
    >
      <div className="space-y-2">
        <div className="text-sm text-gray-600">
          This will record your approval vote onchain. {requiredVotes - currentVotes - 1} more vote(s) needed after yours.
        </div>
        <TransactionButton
          text="Record Approval Vote (Onchain)"
          disabled={isProcessing || !address}
          className="w-full text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#2F5D50' }}
          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => !isProcessing && !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#1F453A')}
          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => !isProcessing && !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#2F5D50')}
        />
        <TransactionStatus>
          <div className="flex flex-col gap-2 p-3 border rounded-lg bg-gray-50 text-sm">
            <TransactionStatusLabel />
          </div>
        </TransactionStatus>
      </div>
    </Transaction>
  );
};

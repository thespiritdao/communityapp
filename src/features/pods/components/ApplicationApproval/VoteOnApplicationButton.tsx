'use client';

import { useState } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
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
export const VoteOnApplicationButton: React.FC<
  VoteOnApplicationButtonProps
> = ({
  applicationId,
  currentVotes,
  requiredVotes,
  votingLeaders,
  onSuccess,
}) => {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();

  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // CDP Smart Account transaction handler - EXACT FAUCET PATTERN
  const handleVoteTransaction = async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
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

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN
    setIsProcessing(true);

    try {
      console.log('🚀 Building Smart Account User Operation for vote recording...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Transaction: Self-send with vote data');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // Encode application ID in transaction data for onchain record
      // This creates a unique transaction signature for this vote
      const voteData = `0x${Buffer.from(`VOTE:${applicationId}:${evmAddress}`).toString('hex')}` as `0x${string}`;

      // EXACT FAUCET PATTERN: Send user operation (self-send with data)
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: [{
          to: evmAddress,                // ← Self-send!
          value: 0n,                     // ← Zero ETH (bigint)
          data: voteData,                // ← Vote data
        }],
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);

      // Handle success with receipt
      // Type assertion needed due to incomplete CDP SDK types
      const resultWithReceipt = result as any;
      if (resultWithReceipt?.receipt) {
        const txHash = resultWithReceipt.receipt.transactionHash;
        const blockNumber = resultWithReceipt.receipt.blockNumber;

        console.log('✅ Vote transaction successful:', txHash);

        // Update application vote count
        const newVoteCount = currentVotes + 1;
        const newVotingLeaders = [...votingLeaders, evmAddress.toLowerCase()];

        await supabase
          .from('pod_membership_applications')
          .update({
            current_votes: newVoteCount,
            voting_leaders: newVotingLeaders,
          })
          .eq('id', applicationId);

        // Record the vote with transaction hash
        await supabase.from('pod_application_votes').insert({
          application_id: applicationId,
          voter_address: evmAddress.toLowerCase(),
          vote_type: 'approve',
          transaction_hash: txHash,
          block_number: blockNumber ? Number(blockNumber) : null,
        });

        console.log(`📊 Vote recorded: ${newVoteCount}/${requiredVotes}`);

        toast({
          title: 'Vote Recorded Onchain!',
          description: `Your approval vote has been recorded. ${requiredVotes - newVoteCount} more vote(s) needed.`,
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
    <div className="space-y-2">
      <div className="text-sm text-gray-600">
        This will record your approval vote onchain.{' '}
        {requiredVotes - currentVotes - 1} more vote(s) needed after yours.
      </div>

      {/* CDP Smart Account Transaction Button */}
      {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
        <Button
          onClick={handleVoteTransaction}
          disabled={isTransactionPending || isProcessing}
          className="w-full text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-[#2F5D50] hover:bg-[#1F453A]"
        >
          {isTransactionPending || isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
              Recording Vote...
            </>
          ) : (
            'Record Approval Vote (Gasless)'
          )}
        </Button>
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

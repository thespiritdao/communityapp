// src/features/governance/components/VoteButton.tsx
'use client';
import React, { useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useToast } from 'src/components/ui/use-toast';
import { getWalletClient } from 'wagmi/actions'; 
import DAOGovernorABI from 'src/abis/DAO_GovernorABI.json';
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionSponsor,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';

interface VoteButtonProps {
  proposalId: number;
  choice: number;
}

const BASE_CHAIN_ID = 8453;

const VoteButton: React.FC<VoteButtonProps> = ({ proposalId, choice }) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
  
  // Handle direct transaction (no smart wallet)
  const handleDirectVote = async () => {
    if (!address || !publicClient) {
      toast({
        title: "Error",
        description: "Wallet not connected",
        variant: "destructive"
      });
      return;
    }
    
    setIsProcessing(true);
    
    try {
      console.log(`Attempting direct vote on proposal ${proposalId} with choice ${choice}`);
      
      // Simulate first
	  const { request } = await publicClient.simulateContract({
		chainId: BASE_CHAIN_ID,
		account: address,
		address: GOVERNOR_ADDRESS,
		abi: DAOGovernorABI,
		functionName: 'castVote',
		args: [BigInt(proposalId), Number(choice)],
	  });
	  
      
      console.log("Simulation successful, executing transaction");
      
      // Execute the transaction
      const walletClient = await getWalletClient({ chainId: BASE_CHAIN_ID });
	  const hash = await walletClient.writeContract(request);
      
      console.log(`Transaction submitted: ${hash}`);
      
      toast({
        title: "Vote submitted",
        description: `Transaction sent: ${hash.substring(0, 8) ?? hash}`,
        variant: "success"
      });
      
    } catch (error: any) {
      console.error("Vote transaction failed:", error);
      
      let errorMessage = "Unknown error occurred";
      if (error.shortMessage) errorMessage = error.shortMessage;
      else if (error.message) errorMessage = error.message;
      
      toast({
        title: "Vote failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const voteCall = [
    {
      address: GOVERNOR_ADDRESS,
      abi: DAOGovernorABI,
      functionName: 'castVote',
      args: [BigInt(proposalId), Number(choice)],
    },
  ];

  const handleSuccess = (txHash: string) => {
    console.log('[VoteButton] Vote submitted successfully:', txHash);
    toast({
      title: 'Vote submitted',
      description: `Your vote was cast on-chain (tx: ${txHash.substring(0, 10)}...).`,
      variant: 'success',
    });
  };

  const handleError = (error: any) => {
    console.error('[VoteButton] Error during vote submission:', error);
    toast({
      title: 'Vote failed',
      description: error?.shortMessage || error?.message || 'Unknown failure.',
      variant: 'destructive',
    });
  };

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex space-x-4">
        {/* Direct transaction button */}
        <button 
          onClick={handleDirectVote}
          disabled={isProcessing || !address}
          className={`px-4 py-2 bg-blue-600 text-white rounded ${isProcessing ? 'opacity-50' : ''}`}
        >
          {isProcessing ? 'Processing...' : 'Vote Directly (No Smart Wallet)'}
        </button>
        
        {/* Smart wallet transaction button */}
        <Transaction
          isSponsored={false} // Try without sponsorship first
          address={address}
          chainId={BASE_CHAIN_ID}
          calls={voteCall}
          onTransactionStarted={() => {
            console.group('🚀 Vote Transaction Started (Non-Sponsored)');
            console.log('📋 Proposal ID:', proposalId);
            console.log('📋 Choice:', choice);
            console.log('📋 Contract Address:', GOVERNOR_ADDRESS);
            console.log('📋 User Address:', address);
            console.log('📋 Chain ID:', BASE_CHAIN_ID);
            console.log('📋 Timestamp:', new Date().toISOString());
            console.groupEnd();
          }}
          onSuccess={(response) => {
            console.group('✅ Vote Transaction Success (Non-Sponsored)');
            console.log('📋 Transaction Response:', response);
            console.log('📋 Transaction Hash:', response?.transactionReceipts?.[0]?.transactionHash);
            console.log('📋 Block Number:', response?.transactionReceipts?.[0]?.blockNumber);
            console.log('📋 Status:', response?.transactionReceipts?.[0]?.status);
            console.groupEnd();
            handleSuccess(response?.transactionReceipts?.[0]?.transactionHash || '');
          }}
          onError={(error) => {
            console.group('❌ Vote Transaction Error (Non-Sponsored)');
            console.error('📋 Error Details:', {
              name: error.name,
              message: error.message,
              stack: error.stack
            });
            console.groupEnd();
            handleError(error);
          }}
        >
          <TransactionButton
            text="Vote with Smart Wallet (No Sponsorship)"
            className="newProposalButton"
            disabled={!address}
          />
          <TransactionStatus>
            <TransactionStatusLabel />
            <TransactionStatusAction />
          </TransactionStatus>
        </Transaction>
      </div>
      
      {/* Sponsored transaction button */}
		<Transaction
		  isSponsored={true}
		  address={address}
		  chainId={BASE_CHAIN_ID}
		  calls={voteCall}
		  onTransactionStarted={() => {
            console.group('🚀 Vote Transaction Started (Sponsored)');
            console.log('📋 Proposal ID:', proposalId);
            console.log('📋 Choice:', choice);
            console.log('📋 Contract Address:', GOVERNOR_ADDRESS);
            console.log('📋 User Address:', address);
            console.log('📋 Chain ID:', BASE_CHAIN_ID);
            console.log('📋 Timestamp:', new Date().toISOString());
            console.groupEnd();
          }}
          onSuccess={(response) => {
            console.group('✅ Vote Transaction Success (Sponsored)');
            console.log('📋 Transaction Response:', response);
            console.log('📋 Transaction Hash:', response?.transactionReceipts?.[0]?.transactionHash);
            console.log('📋 Block Number:', response?.transactionReceipts?.[0]?.blockNumber);
            console.log('📋 Status:', response?.transactionReceipts?.[0]?.status);
            console.groupEnd();
            handleSuccess(response?.transactionReceipts?.[0]?.transactionHash || '');
          }}
          onError={(error) => {
            console.group('❌ Vote Transaction Error (Sponsored)');
            console.error('📋 Error Details:', {
              name: error.name,
              message: error.message,
              stack: error.stack
            });
            console.groupEnd();
            handleError(error);
          }}
		>
		  <TransactionButton
			text="Vote with Smart Wallet (Sponsored)"
			className="newProposalButton"
			disabled={!address}
		  />
		  <TransactionSponsor />           
		  <TransactionStatus>
			<TransactionStatusLabel />
			<TransactionStatusAction />
		  </TransactionStatus>
		</Transaction>


      
      {/* Debug information */}
      <div className="mt-4 p-4 bg-gray-100 rounded text-xs">
        <div>Debug Info:</div>
        <div>Proposal ID: {proposalId}</div>
        <div>Choice: {choice}</div>
        <div>Wallet: {address || 'Not connected'}</div>
        <div>Governor: {GOVERNOR_ADDRESS || 'Not configured'}</div>
      </div>
    </div>
  );
};

export default VoteButton;
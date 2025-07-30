'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { 
  Transaction, 
  TransactionButton, 
  TransactionSponsor, 
  TransactionStatus, 
  TransactionStatusLabel, 
  TransactionStatusAction 
} from "@coinbase/onchainkit/transaction";

import { useEventTransactions } from '../hooks/useEventTransactions';
import { useNFTMetadata } from '../hooks/useEventContracts';
import { EventWithStats, EventRegistration } from '../types/event';

interface EventCompletionButtonProps {
  event: EventWithStats;
  completedRegistrations: EventRegistration[];
  onSuccess?: () => void;
  className?: string;
}

export const EventCompletionButton: React.FC<EventCompletionButtonProps> = ({
  event,
  completedRegistrations,
  onSuccess,
  className
}) => {
  const { address } = useAccount();
  const { getBatchMintCompletionCall, getTransactionConfig, isConnected } = useEventTransactions();
  const { generateCompletionMetadata } = useNFTMetadata();
  
  const [isTransactionPending, setIsTransactionPending] = useState(false);

  if (!isConnected) {
    return (
      <TransactionButton
        text="Connect Wallet"
        disabled={true}
        className={className}
      />
    );
  }

  if (completedRegistrations.length === 0) {
    return (
      <TransactionButton
        text="No Completions to Process"
        disabled={true}
        className={className}
      />
    );
  }

  // Prepare batch minting data
  const prepareBatchMintData = () => {
    const recipients = completedRegistrations.map(reg => reg.user_address);
    const tokenURIs = completedRegistrations.map((_, index) => 
      `${process.env.NEXT_PUBLIC_EVENT_BASE_URI}completion/${event.id}/${index + 1}`
    );
    const metadataArray = completedRegistrations.map(reg => 
      JSON.stringify(generateCompletionMetadata(
        event, 
        reg.user_address, 
        new Date(reg.completed_at!)
      ))
    );

    return { recipients, tokenURIs, metadataArray };
  };

  const { recipients, tokenURIs, metadataArray } = prepareBatchMintData();

  return (
    <Transaction
      {...getTransactionConfig()}
      calls={getBatchMintCompletionCall({
        eventId: event.id,
        recipients,
        tokenURIs,
        metadataArray
      })}
      onStatus={(status) => {
        console.log('Batch completion NFT minting status:', status);
        setIsTransactionPending(status.statusName === 'buildingTransaction');
      }}
      onSuccess={async (response) => {
        console.log('Batch completion NFT minting successful:', response);
        
        try {
          // You could update completion status in Supabase here if needed
          console.log(`Successfully minted ${recipients.length} completion NFTs`);
          
          if (onSuccess) {
            onSuccess();
          }
        } catch (error) {
          console.error('Failed to update completion status:', error);
        }
      }}
      onError={(error) => {
        console.error('Batch completion NFT minting failed:', error);
        setIsTransactionPending(false);
      }}
    >
      <TransactionButton
        text={isTransactionPending ? 
          'Minting NFTs...' : 
          `Mint ${recipients.length} Completion NFT${recipients.length > 1 ? 's' : ''}`
        }
        disabled={isTransactionPending}
        className={className || "bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"}
      />
      <TransactionSponsor />
      <TransactionStatus>
        <TransactionStatusLabel />
        <TransactionStatusAction />
      </TransactionStatus>
    </Transaction>
  );
};
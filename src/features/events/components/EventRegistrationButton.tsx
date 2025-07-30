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
import { useEventRegistration } from '../hooks/useEvents';
import { EventWithStats } from '../types/event';

interface EventRegistrationButtonProps {
  event: EventWithStats;
  onSuccess?: () => void;
  className?: string;
}

export const EventRegistrationButton: React.FC<EventRegistrationButtonProps> = ({
  event,
  onSuccess,
  className
}) => {
  const { address } = useAccount();
  const { getRegisterForEventCall, getTransactionConfig, isConnected } = useEventTransactions();
  const { registerForEvent } = useEventRegistration();
  
  const [isTransactionPending, setIsTransactionPending] = useState(false);

  if (!isConnected) {
    return (
      <TransactionButton
        text="Connect Wallet to Register"
        disabled={true}
        className={className}
      />
    );
  }

  // Check if event is full
  if (event.max_attendees && event.stats.registered_count >= event.max_attendees) {
    return (
      <TransactionButton
        text="Event Full"
        disabled={true}
        className={className}
      />
    );
  }

  // Check if registration period is open
  const now = new Date();
  const eventDate = new Date(event.event_date);
  if (eventDate < now) {
    return (
      <TransactionButton
        text="Event Has Passed"
        disabled={true}
        className={className}
      />
    );
  }

  return (
    <Transaction
      {...getTransactionConfig()}
      calls={getRegisterForEventCall({
        escrowAddress: process.env.NEXT_PUBLIC_EVENT_ESCROW_CONTRACT as string,
        eventId: event.id
      })}
      onStatus={(status) => {
        console.log('Event registration status:', status);
        setIsTransactionPending(status.statusName === 'buildingTransaction');
      }}
      onSuccess={async (response) => {
        console.log('Event registration successful:', response);
        
        try {
          // Update local registration state
          await registerForEvent(event.id);
          
          if (onSuccess) {
            onSuccess();
          }
          
          console.log('Registration completed successfully');
        } catch (error) {
          console.error('Failed to update registration state:', error);
        }
      }}
      onError={(error) => {
        console.error('Event registration failed:', error);
        setIsTransactionPending(false);
      }}
    >
      <TransactionButton
        text={isTransactionPending ? 'Registering...' : 
              event.price_system > 0 || event.price_self > 0 ? 
              `Register (${event.price_system > 0 ? `${event.price_system} $SYSTEM` : `${event.price_self} $SELF`})` :
              'Register (Free)'}
        disabled={isTransactionPending}
        className={className || "bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"}
      />
      <TransactionSponsor />
      <TransactionStatus>
        <TransactionStatusLabel />
        <TransactionStatusAction />
      </TransactionStatus>
    </Transaction>
  );
};
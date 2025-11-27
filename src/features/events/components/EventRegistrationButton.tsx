'use client';

import type React from 'react';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';

import { useSimplifiedEventTransactions } from '../hooks/useSimplifiedEventTransactions';
import { TokenApprovalFlow } from './TokenApprovalFlow';
import type { EventWithStats } from '../types/event';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EventRegistrationButtonProps {
  event: EventWithStats;
  onSuccess?: () => void;
  className?: string;
}

const BASE_CHAIN_ID = 8453;

export const EventRegistrationButton: React.FC<
  EventRegistrationButtonProps
> = ({ event, onSuccess, className }) => {
  const { address, isConnected } = useAccount();
  const { getRegisterEventCall } = useSimplifiedEventTransactions();

  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [isApprovalComplete, setIsApprovalComplete] = useState(false);

  // Determine token amounts from event pricing
  const systemTokenAmount = (event.price_system || 0).toString();
  const selfTokenAmount = (event.price_self || 0).toString();
  const needsTokenApproval =
    Number.parseFloat(systemTokenAmount) > 0 ||
    Number.parseFloat(selfTokenAmount) > 0;

  // Handle basic validation states
  if (!isConnected) {
    return (
      <Button disabled={true} className={className}>
        Connect Wallet to Register
      </Button>
    );
  }

  // Check if event is full
  if (
    event.max_attendees &&
    event.stats?.registered_count >= event.max_attendees
  ) {
    return (
      <Button disabled={true} className={className}>
        Event Full
      </Button>
    );
  }

  // Check if registration period is open
  const now = new Date();
  const eventDate = new Date(event.event_date);
  if (eventDate < now) {
    return (
      <Button disabled={true} className={className}>
        Event Has Passed
      </Button>
    );
  }

  // For legacy events without blockchain_event_id, use the database id
  // All events in a DAO should support blockchain registration
  const blockchainEventId = event.blockchain_event_id || event.id;

  // Prepare registration transaction
  const prepareRegistration = () => {
    try {
      if (!blockchainEventId) {
        console.error('Event missing both blockchain_event_id and id:', event);
        return null;
      }

      return getRegisterEventCall({
        eventId: blockchainEventId,
      });
    } catch (error) {
      console.error('Error preparing registration:', error);
      return null;
    }
  };

  return (
    <>
      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Token Approval Required</DialogTitle>
          </DialogHeader>
          <TokenApprovalFlow
            systemTokenAmount={systemTokenAmount}
            selfTokenAmount={selfTokenAmount}
            onApprovalComplete={() => {
              setIsApprovalComplete(true);
              setShowApprovalDialog(false);
            }}
            onCancel={() => {
              setShowApprovalDialog(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Main Registration Button */}
      {needsTokenApproval && !isApprovalComplete ? (
        <Button
          onClick={() => setShowApprovalDialog(true)}
          className={
            className ||
            'font-medium py-2 px-4 rounded transition-colors hover:opacity-90'
          }
          style={{
            backgroundColor: '#8FAAA1',
            color: '#FFFFFF',
            border: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#6F8F86';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#8FAAA1';
          }}
        >
          Approve Tokens & Register
        </Button>
      ) : (
        (() => {
          const calls = prepareRegistration();

          if (!calls) {
            return (
              <Button disabled={true} className={className}>
                Unable to Register
              </Button>
            );
          }

          return (
            <Transaction
              account={address?.toLowerCase() as `0x${string}`}
              chainId={BASE_CHAIN_ID}
              calls={calls}
              isSponsored={true} // ✅ Ensure sponsorship is enabled
              onStatus={(status) => {
                console.log('📋 Event registration status:', status);
                if (status.statusName === 'buildingTransaction') {
                  setIsTransactionPending(true);
                }
              }}
              onSuccess={async (response) => {
                console.log('✅ Event registration successful:', response);
                setIsTransactionPending(false);

                if (onSuccess) {
                  onSuccess();
                }
              }}
              onError={(error) => {
                console.error('❌ Event registration failed:', error);
                setIsTransactionPending(false);
              }}
            >
              <TransactionButton
                text={
                  isTransactionPending
                    ? 'Registering...'
                    : needsTokenApproval
                      ? `Register (${systemTokenAmount !== '0' ? `${systemTokenAmount} SYSTEM` : ''}${systemTokenAmount !== '0' && selfTokenAmount !== '0' ? ' + ' : ''}${selfTokenAmount !== '0' ? `${selfTokenAmount} SELF` : ''})`
                      : 'Register (Free)'
                }
                disabled={isTransactionPending}
                className={
                  className ||
                  'font-medium py-2 px-4 rounded transition-colors hover:opacity-90'
                }
                style={{
                  backgroundColor: '#8FAAA1',
                  color: '#FFFFFF',
                  border: 'none',
                }}
              />
              <TransactionSponsor />{' '}
              {/* ✅ This ensures sponsorship UI is shown */}
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
          );
        })()
      )}
    </>
  );
};

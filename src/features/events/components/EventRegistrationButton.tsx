'use client';

import type React from 'react';
import { useState, useCallback } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { encodeFunctionData } from 'viem';
import { usePublicClient } from 'wagmi';

import { useSimplifiedEventTransactions } from '../hooks/useSimplifiedEventTransactions';
import {
  buildEventSelfBurn,
  extractReceiptId,
} from '../services/eventSelfPayment';
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
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const { getRegisterEventCall } = useSimplifiedEventTransactions();
  const publicClient = usePublicClient();

  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [isApprovalComplete, setIsApprovalComplete] = useState(false);

  // Get address from CDP Smart Account
  const address = currentUser?.evmSmartAccounts?.[0] as `0x${string}` | undefined;
  const isConnected = Boolean(currentUser);

  // Determine token amounts from event pricing
  const systemTokenAmount = (
    event.price_token === 'SYSTEM' || event.price_token === 'dual'
      ? event.price_amount
      : '0'
  );
  const selfTokenAmount = (event.price_self_amount || '0');
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
    event.registration_count >= event.max_attendees
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

  const encodeCall = (call: any) => ({
    to: call.address as `0x${string}`,
    value: 0n,
    data: encodeFunctionData({
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
    }),
  });

  // CDP transaction handler for event registration.
  // $SELF events: burn $SELF via SelfPaymentV2.payWithSelf FIRST (mints a
  // SelfReceipt), read the receiptId, then registerForEvent(eventId, receiptId).
  // $SYSTEM/free: register directly with receiptId 0 (SYSTEM handled by approval).
  const handleCDPRegistration = useCallback(async () => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      console.error('Smart Account not found');
      return;
    }
    if (!blockchainEventId) {
      console.error('Event missing both blockchain_event_id and id:', event);
      return;
    }

    setIsTransactionPending(true);

    try {
      const smartAccount = currentUser.evmSmartAccounts[0];
      let selfReceiptId = 0n;

      // --- Step 1: burn $SELF (only for $SELF-priced events) ---
      const priceSelfHours = Number.parseFloat(selfTokenAmount || '0');
      if (priceSelfHours > 0) {
        if (!address) throw new Error('No wallet address');
        const podId =
          event.fund_recipient_pod_id || event.organizing_pod_id || '';
        const burn = await buildEventSelfBurn({
          walletAddress: address,
          podId,
          eventId: blockchainEventId,
          priceSelfHours,
        });
        if (!burn) {
          throw new Error('Insufficient $SELF for this event, or $SELF not configured');
        }

        const burnRes = await sendUserOperation({
          evmSmartAccount: smartAccount,
          network: 'base',
          calls: [encodeCall(burn.call)],
          useCdpPaymaster: true,
        });

        // Need the receiptId from the burn before we can register — read logs.
        const burnHash = (burnRes as any)?.userOperationHash;
        if (!burnHash || !publicClient) {
          throw new Error('Could not confirm $SELF burn');
        }
        const burnReceipt = await publicClient.waitForTransactionReceipt({
          hash: burnHash as `0x${string}`,
        });
        const receiptId = extractReceiptId(burnReceipt.logs);
        if (!receiptId) {
          throw new Error('Could not read $SELF payment receipt');
        }
        selfReceiptId = receiptId;
      }

      // --- Step 2: register (with the burn receipt id, or 0) ---
      const calls = getRegisterEventCall({
        eventId: blockchainEventId,
        selfReceiptId,
      });

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: calls.map(encodeCall),
        useCdpPaymaster: true,
      });

      console.log('✅ Event registration successful:', result);
      setIsTransactionPending(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('❌ Event registration failed:', error);
      setIsTransactionPending(false);
    }
  }, [
    currentUser,
    blockchainEventId,
    event,
    address,
    selfTokenAmount,
    getRegisterEventCall,
    sendUserOperation,
    publicClient,
    onSuccess,
  ]);

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
            backgroundColor: '#2F5D50',
            color: '#FFFFFF',
            border: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1F453A';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#2F5D50';
          }}
        >
          Approve Tokens & Register
        </Button>
      ) : (
        (() => {
          if (!blockchainEventId) {
            return (
              <Button disabled={true} className={className}>
                Unable to Register
              </Button>
            );
          }

          return (
            <Button
              onClick={handleCDPRegistration}
              disabled={isTransactionPending}
              className={
                className ||
                'font-medium py-2 px-4 rounded transition-colors hover:opacity-90'
              }
              style={{
                backgroundColor: '#2F5D50',
                color: '#FFFFFF',
                border: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1F453A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2F5D50';
              }}
            >
              {isTransactionPending
                ? 'Registering...'
                : needsTokenApproval
                  ? `Register (${systemTokenAmount !== '0' ? `${systemTokenAmount} SYSTEM` : ''}${systemTokenAmount !== '0' && selfTokenAmount !== '0' ? ' + ' : ''}${selfTokenAmount !== '0' ? `${selfTokenAmount} SELF` : ''})`
                  : 'Register (Free)'}
            </Button>
          );
        })()
      )}
    </>
  );
};

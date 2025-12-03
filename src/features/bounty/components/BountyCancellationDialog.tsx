'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import type { Abi } from 'viem';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import type { LifecycleStatus } from '@coinbase/onchainkit/transaction';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, XCircle, ArrowLeft } from 'lucide-react';
import type { FrontendBounty } from '../types/bounty';
import BountyManagerABIJson from '@/abis/BountyManagerV2.json';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';

const BountyManagerABI = BountyManagerABIJson as Abi;

interface BountyCancellationDialogProps {
  bounty: FrontendBounty;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const BOUNTY_MANAGER_ADDRESS = process.env
  .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

export const BountyCancellationDialog: React.FC<
  BountyCancellationDialogProps
> = ({ bounty, open, onOpenChange, onSuccess }) => {
  const { address } = useAccount();
  const [cancellationReason, setCancellationReason] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string>('');
  const [showTransaction, setShowTransaction] = useState(false);

  // Sync database AFTER successful on-chain cancellation
  const syncDatabaseAfterCancellation = async (transactionHash: string) => {
    if (!address) return;

    try {
      setIsSyncing(true);
      console.log('🔄 Syncing cancellation to database...', {
        transactionHash,
      });

      const response = await fetch('/api/bounty/cancel/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bountyId: bounty.id,
          onchainId: bounty.onchain_id,
          cancelerAddress: address,
          cancellationReason: cancellationReason.trim(),
          transactionHash,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'Failed to sync cancellation to database',
        );
      }

      console.log('✅ Database sync successful:', data);
      return true;
    } catch (err) {
      console.error('❌ Error syncing cancellation to database:', err);
      setError(
        `Transaction succeeded but database sync failed: ${err instanceof Error ? err.message : 'Unknown error'}. Please refresh the page.`,
      );
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle transaction status from OnChainKit
  const handleTransactionStatus = async (status: LifecycleStatus) => {
    console.log('🔄 Transaction status:', status);

    if (status.statusName === 'success') {
      console.log('✅ Cancellation transaction successful:', status.statusData);

      // Get transaction hash from status data
      const txHash =
        status.statusData?.transactionReceipts?.[0]?.transactionHash;

      if (txHash) {
        // Sync database with blockchain state
        const syncSuccess = await syncDatabaseAfterCancellation(txHash);

        if (syncSuccess) {
          // Close dialog and notify parent
          setTimeout(() => {
            onOpenChange(false);
            onSuccess?.();
            resetDialog();
          }, 2000); // Give user time to see success message
        }
      } else {
        console.warn(
          '⚠️ Transaction succeeded but no hash found in status data',
        );
        setError(
          'Transaction succeeded but could not sync database. Please refresh the page.',
        );
      }
    }

    if (status.statusName === 'error') {
      console.error('❌ Cancellation transaction failed:', status.statusData);
      setError(
        'Transaction failed. You can try again - no changes were made to the database.',
      );
    }
  };

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellationReason.trim()) {
      setError('Please provide a reason for cancellation');
      return;
    }
    // Go directly to transaction (no database update yet)
    setShowTransaction(true);
  };

  const resetDialog = () => {
    setShowTransaction(false);
    setCancellationReason('');
    setError('');
    setIsSyncing(false);
  };

  console.log('🎨 Rendering dialog with state:', {
    showTransaction,
    isSyncing,
    open,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          resetDialog();
        }
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg focus:outline-none max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <div
              className="flex flex-nowrap items-center gap-2 whitespace-nowrap"
              style={{ color: '#8B3A3A' }}
            >
              <XCircle className="w-5 h-5 shrink-0" />
              Cancel Bounty
            </div>
          </DialogTitle>

          <DialogDescription>{bounty.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {!showTransaction ? (
            // Step 1: Enter cancellation reason and proceed to transaction
            <form onSubmit={handleInitialSubmit} className="space-y-4">
              <Alert
                style={{
                  backgroundColor: '#FAF4EC',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: '#E8D7B8',
                }}
              >
                <AlertTriangle
                  className="w-4 h-4"
                  style={{ color: '#C6933F' }}
                />
                <AlertDescription className="ml-2" style={{ color: '#8F6B2F' }}>
                  <strong>Warning:</strong> Cancelling this bounty will:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Archive all pending bids</li>
                    <li>Notify all bidders</li>
                    <li>Mark the bounty as cancelled</li>
                    <li>Prevent new bids from being submitted</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="cancellationReason">
                  Reason for Cancellation *
                </Label>
                <Textarea
                  id="cancellationReason"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Explain why you're cancelling this bounty. This will be sent to all bidders..."
                  rows={5}
                  required
                  className="resize-none"
                />
                <p className="text-xs text-gray-500">
                  This reason will be visible to all users who placed bids.
                </p>
              </div>

              {/* Bounty Summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-2">Bounty Details</h4>
                <div className="text-sm space-y-1">
                  <p>
                    <strong>Title:</strong> {bounty.title}
                  </p>
                  <p>
                    <strong>Value:</strong> {bounty.value.amount}{' '}
                    {bounty.value.token}
                  </p>
                  <p>
                    <strong>Status:</strong> {bounty.status}
                  </p>
                  <p>
                    <strong>Category:</strong> {bounty.category}
                  </p>
                </div>
              </div>

              {error && (
                <Alert
                  style={{
                    backgroundColor: '#F5E6E6',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: '#D9B3B3',
                  }}
                >
                  <AlertDescription style={{ color: '#5C1F1F' }}>
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" className="flex-1">
                  Proceed to Cancel
                </Button>
              </div>
            </form>
          ) : (
            // Step 2: Execute on-chain cancellation transaction (then sync database)
            <div className="space-y-4">
              <Alert
                style={{
                  backgroundColor: '#E8F1EE',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: '#B8D9CA',
                }}
              >
                <AlertDescription style={{ color: '#1F453A' }}>
                  <strong>Step 2 of 2: Execute Cancellation Transaction</strong>
                  <p className="mt-2">
                    🔄 Click button below to cancel the bounty on-chain and
                    refund the escrow...
                    <br />
                    {isSyncing && '⏳ Syncing cancellation to database...'}
                  </p>
                </AlertDescription>
              </Alert>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-2">
                  Cancellation Reason
                </h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {cancellationReason}
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-2">Refund Details</h4>
                <div className="space-y-3">
                  <div className="text-sm space-y-1">
                    <p>
                      <strong>Amount:</strong> {bounty.value.amount}{' '}
                      {bounty.value.token}
                    </p>
                    {bounty.onchain_id && (
                      <p>
                        <strong>Bounty ID:</strong> {bounty.onchain_id}
                      </p>
                    )}
                    <p>
                      <strong>Funding Source:</strong>{' '}
                      <span
                        className={
                          bounty.funding_source === 'pod_treasury'
                            ? 'font-semibold'
                            : ''
                        }
                        style={{
                          color:
                            bounty.funding_source === 'pod_treasury'
                              ? '#574C66'
                              : '#2F5D50',
                        }}
                      >
                        {bounty.funding_source === 'pod_treasury'
                          ? 'Pod Treasury'
                          : 'Personal Wallet'}
                      </span>
                    </p>
                  </div>

                  {bounty.funding_source === 'pod_treasury' && (
                    <Alert
                      style={{
                        backgroundColor: '#EDEAF0',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: '#D1CAD9',
                      }}
                    >
                      <AlertDescription
                        className="text-sm"
                        style={{ color: '#574C66' }}
                      >
                        <strong>Pod-Funded Bounty:</strong> This bounty was
                        funded by the pod treasury. The refund will be
                        automatically returned to the pod treasury address, not
                        your personal wallet.
                      </AlertDescription>
                    </Alert>
                  )}

                  {bounty.creator_address && (
                    <div>
                      <p className="text-sm font-semibold mb-2">
                        {bounty.funding_source === 'pod_treasury'
                          ? 'Refund Destination (Pod Treasury):'
                          : 'Refund Destination:'}
                      </p>
                      <UserProfileDisplay
                        walletAddress={bounty.creator_address}
                        size="md"
                        showModal={true}
                      />
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <Alert
                  style={{
                    backgroundColor: '#F5E6E6',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: '#D9B3B3',
                  }}
                >
                  <AlertDescription style={{ color: '#5C1F1F' }}>
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              {!BOUNTY_MANAGER_ADDRESS && (
                <Alert
                  className="mb-4"
                  style={{
                    backgroundColor: '#F5E6E6',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: '#D9B3B3',
                  }}
                >
                  <AlertDescription style={{ color: '#5C1F1F' }}>
                    ⚠️ Contract address not configured. Please set
                    NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS in your environment
                    variables.
                  </AlertDescription>
                </Alert>
              )}

              {BOUNTY_MANAGER_ADDRESS && address && (
                <Transaction
                  calls={[
                    {
                      address: BOUNTY_MANAGER_ADDRESS,
                      abi: BountyManagerABI,
                      functionName: 'cancelBounty',
                      args: [BigInt(bounty.onchain_id || 0)],
                    },
                  ]}
                  isSponsored={true}
                  onStatus={handleTransactionStatus}
                >
                  <div className="space-y-4">
                    <TransactionButton
                      text="Execute Refund"
                      className="w-full font-semibold py-3"
                    />
                    <TransactionSponsor />
                    <TransactionStatus>
                      <TransactionStatusLabel />
                      <TransactionStatusAction />
                    </TransactionStatus>
                  </div>
                </Transaction>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowTransaction(false)}
                  disabled={isSyncing}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

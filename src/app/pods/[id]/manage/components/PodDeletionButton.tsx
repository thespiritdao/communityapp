'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { PodDeletionService } from '@/features/pods/services/PodDeletionService';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import { base } from 'viem/chains';

interface ExtendedPod {
  id: string;
  name: string;
  description: string;
  status?: string;
  pod_leads?: string[];
  created_by_address?: string;
  management_hat_id?: string;
  membership_hat_id?: string;
  treasury_contract_address?: string;
  pod_metadata?: any;
  pod_image_url?: string;
}

interface PodDeletionButtonProps {
  pod: ExtendedPod;
  canManage: boolean;
  onDeleteProposal?: () => void;
}

export const PodDeletionButton: React.FC<PodDeletionButtonProps> = ({
  pod,
  canManage,
  onDeleteProposal,
}) => {
  const router = useRouter();
  const { evmAddress: address } = useEvmAddress();
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [deleteCheckMessage, setDeleteCheckMessage] = useState<string>('');
  const [leaderInfo, setLeaderInfo] = useState<{
    current: number;
    required: number;
  }>({ current: 0, required: 3 });
  const [processingHats, setProcessingHats] = useState(false);
  const [hatTransactionConfig, setHatTransactionConfig] = useState<any>(null);
  const publicClient = usePublicClient();

  // Check if pod can be deleted when component mounts or pod changes
  useEffect(() => {
    const checkDeletionEligibility = async () => {
      if (!address || !pod?.id) return;

      const result = await PodDeletionService.canDeletePod(pod.id, address);
      setCanDelete(result.canDelete);
      setDeleteCheckMessage(result.reason || '');
      setLeaderInfo({
        current: result.leaderCount || 0,
        required: result.requiredLeaders || 3,
      });
    };

    checkDeletionEligibility();
  }, [pod?.id, address]);

  const handlePodDeletion = async () => {
    if (!canManage || deleteConfirmText !== pod.name || !address) return;

    try {
      setDeleting(true);

      // Check if pod has hats that need deactivation
      const hasHats =
        (pod.management_hat_id && pod.management_hat_id !== 'placeholder') ||
        (pod.membership_hat_id && pod.membership_hat_id !== 'placeholder');

      if (hasHats && publicClient) {
        setProcessingHats(true);

        console.log('🎩 Preparing Hat deactivation transactions...', {
          pod_name: pod.name,
          management_hat_id: pod.management_hat_id,
          membership_hat_id: pod.membership_hat_id,
          user_address: address,
          hats_contract: process.env.NEXT_PUBLIC_HATS_CONTRACT,
        });

        // Prepare hat deactivation transactions using OnchainKit
        const transactionConfig =
          await PodDeletionService.prepareHatDeactivationTransactions(
            pod,
            address,
            publicClient,
          );

        console.log('📦 Transaction config prepared:', {
          hasConfig: !!transactionConfig,
          callsLength: transactionConfig?.calls?.length || 0,
          calls: transactionConfig?.calls || [],
          sponsored: true,
        });

        if (transactionConfig && transactionConfig.calls.length > 0) {
          console.log(
            '✅ Setting transaction config for OnchainKit:',
            transactionConfig,
          );
          setHatTransactionConfig(transactionConfig);
          toast({
            title: 'Hat Deactivation Required',
            description:
              'Please approve the transaction to deactivate Hat tokens',
          });
          setShowDeleteConfirm(false); // Close the delete modal to show transaction UI
          return; // Exit here, transaction will complete the deletion
        } else {
          console.warn(
            '⚠️ No transaction config generated - proceeding with database deletion only',
          );
          setProcessingHats(false);
        }
      }

      // If no hats to deactivate, proceed with database deletion
      const result = await PodDeletionService.deletePodDatabase(
        pod.id,
        address,
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete pod');
      }

      toast({
        title: 'Pod Deleted',
        description: `${pod.name} has been permanently deleted.`,
      });

      // Redirect to pods list
      router.push('/pods');
    } catch (error) {
      console.error('Failed to delete pod:', error);
      toast({
        title: 'Deletion Failed',
        description:
          error instanceof Error ? error.message : 'Failed to delete pod',
        variant: 'destructive',
      });
      setDeleting(false);
      setProcessingHats(false);
    }
  };

  const handleHatTransactionSuccess = async () => {
    if (!address) {
      toast({
        title: 'Error',
        description: 'Wallet not connected',
        variant: 'destructive',
      });
      return;
    }

    try {
      // After successful hat deactivation, complete the database deletion
      const result = await PodDeletionService.deletePodDatabase(
        pod.id,
        address,
      );

      if (result.success) {
        toast({
          title: 'Pod Deleted Successfully',
          description: `${pod.name} and its Hat tokens have been permanently deleted.`,
        });
        router.push('/pods');
      } else {
        throw new Error(result.error || 'Failed to delete pod from database');
      }
    } catch (error) {
      console.error('Failed to complete pod deletion:', error);
      toast({
        title: 'Database Deletion Failed',
        description:
          'Hat tokens were deactivated but pod data could not be removed',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setProcessingHats(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
      setHatTransactionConfig(null);
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="border-red-300 text-red-600 hover:bg-red-100"
        onClick={() => {
          if (onDeleteProposal) {
            onDeleteProposal();
          } else {
            setShowDeleteConfirm(true);
          }
        }}
      >
        <Trash2 className="h-3 w-3 mr-1" />
        Delete Pod
      </Button>

      {/* OnchainKit Transaction Component for Hat Deactivation - Render OUTSIDE modal */}
      {hatTransactionConfig &&
        hatTransactionConfig.calls &&
        hatTransactionConfig.calls.length > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold mb-4">
                Deactivate Pod Hats
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                This will deactivate {hatTransactionConfig.calls.length} Hat
                token(s) on the blockchain before deleting the pod.
              </p>

              <Transaction
                chainId={base.id}
                calls={hatTransactionConfig.calls}
                isSponsored={true}
                onSuccess={async (response) => {
                  console.log('✅ Hat deactivation successful:', response);
                  await handleHatTransactionSuccess();
                }}
                onError={(error) => {
                  console.error('❌ Hat deactivation failed:', error);
                  toast({
                    title: 'Hat Deactivation Failed',
                    description:
                      error instanceof Error
                        ? error.message
                        : 'Transaction failed',
                    variant: 'destructive',
                  });
                  // Reset all state properly on error
                  setProcessingHats(false);
                  setDeleting(false);
                  setHatTransactionConfig(null);
                  setDeleteConfirmText('');
                  // Don't re-open delete modal automatically
                }}
              >
                <TransactionButton
                  text="Confirm Hat Deactivation"
                  className="w-full bg-red-600 text-white hover:bg-red-700 py-2 rounded"
                />
                <TransactionSponsor />
                <TransactionStatus>
                  <TransactionStatusLabel />
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>

              <button
                onClick={() => {
                  // Reset all state properly when canceling hat transaction
                  setHatTransactionConfig(null);
                  setProcessingHats(false);
                  setDeleting(false);
                  setDeleteConfirmText('');
                  // Don't re-open delete modal, just cancel everything
                }}
                className="text-gray-500 hover:text-gray-700 text-sm mt-3 w-full"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      {/* Deletion Confirmation Modal */}
      {showDeleteConfirm && !hatTransactionConfig && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto my-auto">
            <h3 className="text-lg font-semibold text-red-800 mb-4">
              Delete Pod
            </h3>

            <div className="space-y-4">
              {/* Show leader requirement warning if not met */}
              {!canDelete && deleteCheckMessage && (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">
                        Cannot Delete Pod
                      </p>
                      <p className="text-sm text-yellow-700 mt-1">
                        {deleteCheckMessage}
                      </p>
                      {leaderInfo.current < leaderInfo.required && (
                        <p className="text-xs text-yellow-600 mt-2">
                          Current leaders: {leaderInfo.current} / Required:{' '}
                          {leaderInfo.required}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <p className="text-sm text-gray-700">
                This action will permanently delete the{' '}
                <strong>{pod.name}</strong> pod and cannot be undone.
              </p>

              <div className="bg-red-50 p-3 rounded-lg">
                <p className="text-sm text-red-700">
                  <strong>Warning:</strong> This will:
                </p>
                <ul className="text-sm text-red-600 mt-2 list-disc list-inside">
                  <li>
                    Deactivate all Hats Protocol tokens on-chain{' '}
                    {address
                      ? '(requires transaction approval)'
                      : '(manual deactivation required - wallet not connected)'}
                  </li>
                  <li>Remove all pod data from the database</li>
                  <li>Revoke access for all pod members</li>
                  <li>Clean up treasury contracts</li>
                  <li>Cancel any ongoing activities</li>
                  <li>This action cannot be reversed</li>
                </ul>
              </div>

              {/* Show hat deactivation details if hats exist */}
              {(pod.management_hat_id || pod.membership_hat_id) && (
                <div className="bg-[#E8F1EE] p-3 rounded-lg">
                  <p className="text-sm text-[#2F5D50]">
                    <strong>Hat Deactivation:</strong>
                  </p>
                  <ul className="text-sm text-[#3A3A3A] mt-2 list-disc list-inside">
                    {pod.management_hat_id &&
                      pod.management_hat_id !== 'placeholder' && (
                        <li className="break-all">
                          Management Hat ID:{' '}
                          <span className="font-mono text-xs">
                            {pod.management_hat_id}
                          </span>
                        </li>
                      )}
                    {pod.membership_hat_id &&
                      pod.membership_hat_id !== 'placeholder' && (
                        <li className="break-all">
                          Membership Hat ID:{' '}
                          <span className="font-mono text-xs">
                            {pod.membership_hat_id}
                          </span>
                        </li>
                      )}
                  </ul>
                  <p className="text-xs text-[#3A3A3A] mt-2">
                    {walletClient
                      ? '✅ Wallet connected - Hats will be deactivated on-chain'
                      : '⚠️ Connect wallet to enable automatic hat deactivation'}
                  </p>
                </div>
              )}

              {/* Show leader count info */}
              {canDelete && (
                <div className="bg-[#D4E5DF] p-3 rounded-lg">
                  <p className="text-sm text-[#2F5D50]">
                    <strong>Deletion Authorized:</strong> This pod has{' '}
                    {leaderInfo.current} leaders (minimum {leaderInfo.required}{' '}
                    required)
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label
                  htmlFor="delete-confirm-input"
                  className="text-sm font-medium text-gray-700"
                >
                  Type{' '}
                  <span className="font-mono bg-gray-100 px-1 rounded">
                    {pod.name}
                  </span>{' '}
                  to confirm deletion:
                </Label>
                <Input
                  id="delete-confirm-input"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDeleteConfirmText(value);
                    console.log(
                      `Delete confirmation text: "${value}" vs expected: "${pod.name}" (match: ${value === pod.name})`,
                    );
                  }}
                  onPaste={(e) => {
                    // Allow paste for convenience
                    e.stopPropagation();
                  }}
                  onKeyDown={(e) => {
                    // Allow Enter to submit if text matches
                    if (
                      e.key === 'Enter' &&
                      deleteConfirmText === pod.name &&
                      canDelete
                    ) {
                      handlePodDeletion();
                    }
                  }}
                  placeholder={pod.name}
                  className="font-mono"
                  disabled={!canDelete}
                  autoComplete="off"
                  autoFocus={true}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
                disabled={deleting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  console.log('Delete button clicked:', {
                    canDelete,
                    deleteConfirmText,
                    podName: pod.name,
                    matches: deleteConfirmText === pod.name,
                    deleting,
                  });
                  handlePodDeletion();
                }}
                disabled={
                  !canDelete ||
                  deleteConfirmText !== pod.name ||
                  deleting ||
                  hatTransactionConfig !== null
                }
                className="flex-1"
                title={
                  canDelete
                    ? deleteConfirmText !== pod.name
                      ? 'Type the pod name exactly as shown'
                      : deleting
                        ? 'Deletion in progress'
                        : 'Click to delete pod'
                    : 'Cannot delete - requirements not met'
                }
              >
                {processingHats ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deactivating Hats...
                  </>
                ) : deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Pod'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PodDeletionButton;

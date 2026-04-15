'use client';

import type React from 'react';
import { useState } from 'react';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { usePublicClient } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Trash2,
  Shield,
  AlertTriangle,
  Users,
  CheckCircle,
  XCircle,
  Crown,
  Loader2,
} from 'lucide-react';
import { PodDeletionService } from '../services/PodDeletionService';
import type { Pod } from '../types';

interface PodDeletionManagerProps {
  pod: Pod;
  onPodDeleted?: () => void;
  className?: string;
}

export const PodDeletionManager: React.FC<PodDeletionManagerProps> = ({
  pod,
  onPodDeleted,
  className = '',
}) => {
  const { evmAddress: address } = useEvmAddress();
  const publicClient = usePublicClient();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();

  const [isChecking, setIsChecking] = useState(false);
  const [canDelete, setCanDelete] = useState<{
    canDelete: boolean;
    reason?: string;
    leaderCount?: number;
    requiredLeaders?: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionStep, setDeletionStep] = useState<
    'checking' | 'preparing' | 'hats' | 'database' | 'complete'
  >('checking');
  const [isExecutingTransaction, setIsExecutingTransaction] = useState(false);

  // Check deletion permissions
  const checkDeletionPermissions = async () => {
    if (!address) return;

    setIsChecking(true);
    try {
      const result = await PodDeletionService.canDeletePod(pod.id, address);
      setCanDelete(result);

      if (!result.canDelete) {
        toast({
          title: 'Cannot Delete Pod',
          description: result.reason,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to check deletion permissions:', error);
      toast({
        title: 'Error',
        description: 'Failed to check deletion permissions',
        variant: 'destructive',
      });
    } finally {
      setIsChecking(false);
    }
  };

  // Prepare Hat deactivation transactions for OnchainKit
  const prepareHatDeactivationTransactions = async () => {
    if (!address || !publicClient) return null;

    setDeletionStep('preparing');
    return await PodDeletionService.prepareHatDeactivationTransactions(
      pod,
      address,
      publicClient,
    );
  };

  // Handle successful hat deactivation
  const handleHatDeactivationSuccess = async (response: any) => {
    const txHash = response?.transactionReceipts?.[0]?.transactionHash || '';
    console.log('✅ Hat deactivation successful:', txHash);
    setDeletionStep('database');

    // Now delete from database
    if (!address) return;

    try {
      const result = await PodDeletionService.deletePodDatabase(
        pod.id,
        address,
      );

      if (result.success) {
        setDeletionStep('complete');
        toast({
          title: 'Pod Deleted Successfully',
          description: `${pod.name} has been completely removed with all Hats deactivated.`,
        });
        onPodDeleted?.();
      } else {
        throw new Error(result.error || 'Database deletion failed');
      }
    } catch (error) {
      console.error('Database deletion failed:', error);
      toast({
        title: 'Partial Deletion',
        description:
          'Hats were deactivated but database cleanup failed. Contact admin.',
        variant: 'destructive',
      });
    }
  };

  // Handle hat deactivation error
  const handleHatDeactivationError = (error: any) => {
    console.error('❌ Hat deactivation failed:', error);
    toast({
      title: 'Hat Deactivation Failed',
      description: `Failed to deactivate Hats: ${error}. Pod data preserved.`,
      variant: 'destructive',
    });
    setIsDeleting(false);
    setDeletionStep('checking');
  };

  // Legacy deletion fallback (for pods without valid Hat IDs)
  const handleLegacyDeletion = async () => {
    if (!address) return;

    setIsDeleting(true);
    setDeletionStep('database');

    try {
      const result = await PodDeletionService.deletePodDatabase(
        pod.id,
        address,
      );

      if (result.success) {
        setDeletionStep('complete');
        toast({
          title: 'Pod Deleted',
          description: `${pod.name} has been removed from database.`,
        });
        onPodDeleted?.();
      } else {
        throw new Error(result.error || 'Deletion failed');
      }
    } catch (error) {
      console.error('Legacy deletion failed:', error);
      toast({
        title: 'Deletion Failed',
        description:
          error instanceof Error ? error.message : 'Failed to delete pod',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeletionStep('checking');
    }
  };

  // Get status indicators
  const getStatusIcon = () => {
    switch (deletionStep) {
      case 'checking':
        return <Shield className="h-4 w-4" />;
      case 'preparing':
        return <Crown className="h-4 w-4 animate-pulse" />;
      case 'hats':
        return <Shield className="h-4 w-4 animate-pulse" />;
      case 'database':
        return <Users className="h-4 w-4 animate-pulse" />;
      case 'complete':
        return <CheckCircle className="h-4 w-4" style={{ color: '#3F7A5A' }} />;
      default:
        return <Trash2 className="h-4 w-4" />;
    }
  };

  const getStatusText = () => {
    switch (deletionStep) {
      case 'preparing':
        return 'Preparing Hat deactivation...';
      case 'hats':
        return 'Deactivating Hats on-chain...';
      case 'database':
        return 'Cleaning up database...';
      case 'complete':
        return 'Pod deleted successfully';
      default:
        return 'Check deletion permissions';
    }
  };

  // Check if pod has valid Hat IDs that need on-chain deactivation
  const hasValidHats = Boolean(
    (pod.management_hat_id && pod.management_hat_id !== 'extracted_from_tx') ||
      (pod.membership_hat_id && pod.membership_hat_id !== 'extracted_from_tx'),
  );

  if (!address) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Pod Deletion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect your wallet to manage pod deletion.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Pod Deletion Manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pod Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Pod: {pod.name}</span>
            <Badge variant={pod.status === 'active' ? 'default' : 'secondary'}>
              {pod.status}
            </Badge>
          </div>

          {/* Hat Status */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <Crown className="h-3 w-3" />
              <span>Management Hat:</span>
              <code className="text-xs bg-muted px-1 rounded">
                {pod.management_hat_id || 'N/A'}
              </code>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span>Member Hat:</span>
              <code className="text-xs bg-muted px-1 rounded">
                {pod.membership_hat_id || 'N/A'}
              </code>
            </div>
          </div>
        </div>

        {/* Check Permissions */}
        {!canDelete && (
          <Button
            onClick={checkDeletionPermissions}
            disabled={isChecking}
            variant="outline"
            className="w-full"
          >
            {isChecking ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                Checking...
              </>
            ) : (
              <>
                {getStatusIcon()}
                {getStatusText()}
              </>
            )}
          </Button>
        )}

        {/* Permission Status */}
        {canDelete && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {canDelete.canDelete ? (
                <CheckCircle className="h-4 w-4" style={{ color: '#3F7A5A' }} />
              ) : (
                <XCircle className="h-4 w-4" style={{ color: '#8B3A3A' }} />
              )}
              <span className="text-sm">
                {canDelete.canDelete ? 'Deletion authorized' : 'Cannot delete'}
              </span>
            </div>

            {canDelete.reason && !canDelete.canDelete && (
              <div
                className="p-2 border rounded text-sm"
                style={{
                  backgroundColor: '#F5E6E6',
                  borderColor: '#D9B3B3',
                  color: '#5C1F1F',
                }}
              >
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                {canDelete.reason}
              </div>
            )}

            {canDelete.canDelete && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  Leaders: {canDelete.leaderCount}/{canDelete.requiredLeaders}{' '}
                  required
                </div>

                {/* Hat-based Deletion */}
                {hasValidHats ? (
                  <Button
                    onClick={async () => {
                      if (!currentUser) {
                        toast({
                          title: 'Error',
                          description: 'Wallet not connected',
                          variant: 'destructive',
                        });
                        return;
                      }

                      setIsDeleting(true);
                      setIsExecutingTransaction(true);
                      setDeletionStep('hats');

                      try {
                        console.log('🚀 Deactivating HATs and deleting pod via CDP Smart Account');

                        const result = await prepareHatDeactivationTransactions();

                        if (!result?.calls || result.calls.length === 0) {
                          throw new Error('Failed to prepare Hat deactivation transactions');
                        }

                        const response = await sendUserOperation({
                          calls: result.calls.map((call: any) => ({
                            to: call.to,
                            data: call.data,
                            value: call.value || 0n,
                          })),
                        });

                        console.log('✅ Hat deactivation transaction submitted:', response.hash);
                        await response.wait();
                        console.log('✅ Hat deactivation successful');

                        await handleHatDeactivationSuccess({
                          transactionReceipts: [{
                            transactionHash: response.hash,
                          }],
                        });

                      } catch (error) {
                        console.error('❌ Hat deactivation failed:', error);
                        handleHatDeactivationError(error);
                      } finally {
                        setIsExecutingTransaction(false);
                      }
                    }}
                    disabled={isDeleting || isExecutingTransaction || !currentUser}
                    className="w-full bg-[#8B3A3A] hover:bg-[#5C1F1F]"
                  >
                    {isExecutingTransaction ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {getStatusText()}
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Pod & Deactivate Hats
                      </>
                    )}
                  </Button>
                ) : (
                  /* Legacy Deletion */
                  <Button
                    onClick={handleLegacyDeletion}
                    disabled={isDeleting}
                    variant="destructive"
                    className="w-full"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {isDeleting
                      ? getStatusText()
                      : 'Delete Pod (Database Only)'}
                  </Button>
                )}

                <div className="text-xs text-muted-foreground">
                  {hasValidHats ? (
                    <>
                      ⚠️ This will deactivate all pod Hats on-chain and remove
                      all data.
                    </>
                  ) : (
                    <>
                      ⚠️ This will remove pod data from database. No valid Hats
                      found.
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Deletion Complete */}
        {deletionStep === 'complete' && (
          <div
            className="p-3 border rounded"
            style={{ backgroundColor: '#D1E6DC', borderColor: '#B8D9CA' }}
          >
            <div
              className="flex items-center gap-2"
              style={{ color: '#1F453A' }}
            >
              <CheckCircle className="h-4 w-4" style={{ color: '#3F7A5A' }} />
              <span className="text-sm font-medium">
                Pod deletion completed successfully
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PodDeletionManager;

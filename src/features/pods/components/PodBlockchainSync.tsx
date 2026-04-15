'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { Loader2 } from 'lucide-react';
import { PodBlockchainSyncService } from '../services/PodBlockchainSyncService';

interface PodBlockchainSyncProps {
  onSyncComplete?: () => void;
}

export const PodBlockchainSync: React.FC<PodBlockchainSyncProps> = ({
  onSyncComplete,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const [loading, setLoading] = useState(false);
  const [syncData, setSyncData] = useState<{
    toRegister: any[];
    toUpdate: any[];
  }>({ toRegister: [], toUpdate: [] });
  const [currentTransactionCalls, setCurrentTransactionCalls] = useState<any[]>(
    [],
  );
  const [showTransaction, setShowTransaction] = useState(false);
  const [isExecutingTransaction, setIsExecutingTransaction] = useState(false);

  useEffect(() => {
    if (address) {
      checkSyncStatus();
    }
  }, [address]);

  const checkSyncStatus = async () => {
    try {
      setLoading(true);
      const data = await PodBlockchainSyncService.getPodsNeedingSync();
      setSyncData(data);
    } catch (error) {
      console.error('Error checking sync status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPods = async () => {
    try {
      const calls: any[] = [];

      // Generate registration calls
      syncData.toRegister.forEach((pod) => {
        const call = PodBlockchainSyncService.generateRegisterPodCall(pod);
        calls.push(call);
      });

      // Generate update calls
      syncData.toUpdate.forEach((pod) => {
        const call = PodBlockchainSyncService.generateUpdatePodCall(pod);
        calls.push(call);
      });

      if (calls.length > 0) {
        setCurrentTransactionCalls(calls);
        setShowTransaction(true);
      }
    } catch (error) {
      console.error('Error preparing sync transactions:', error);
    }
  };

  const handleTransactionSuccess = () => {
    setShowTransaction(false);
    setCurrentTransactionCalls([]);
    checkSyncStatus();
    onSyncComplete?.();
  };

  const totalPodsToSync = syncData.toRegister.length + syncData.toUpdate.length;

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pod Blockchain Sync</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">
            Please connect your wallet to sync pod data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pod Blockchain Sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-center py-4">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-2"
              style={{ borderColor: '#2F5D50' }}
            ></div>
            <p className="text-gray-600">Checking sync status...</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Pods to register:</span>
                <span className="font-medium">
                  {syncData.toRegister.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Pods to update:</span>
                <span className="font-medium">{syncData.toUpdate.length}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Total to sync:</span>
                <span>{totalPodsToSync}</span>
              </div>
            </div>

            {totalPodsToSync > 0 && (
              <Alert>
                <AlertDescription>
                  <strong>Sync Required:</strong> Your pod data needs to be
                  synchronized to the blockchain for bounty management to work
                  properly.
                </AlertDescription>
              </Alert>
            )}

            {syncData.toRegister.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Pods to Register:</h4>
                <ul className="text-sm space-y-1">
                  {syncData.toRegister.map((pod) => (
                    <li key={pod.id} className="flex justify-between">
                      <span>{pod.name}</span>
                      <span className="text-gray-500">New</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {syncData.toUpdate.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Pods to Update:</h4>
                <ul className="text-sm space-y-1">
                  {syncData.toUpdate.map((pod) => (
                    <li key={pod.id} className="flex justify-between">
                      <span>{pod.name}</span>
                      <span className="text-gray-500">Update</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!showTransaction ? (
              <div className="space-y-2">
                <Button
                  onClick={handleSyncPods}
                  disabled={totalPodsToSync === 0}
                  className="w-full"
                >
                  {totalPodsToSync === 0
                    ? 'All Pods Synced'
                    : `Sync ${totalPodsToSync} Pod${totalPodsToSync !== 1 ? 's' : ''}`}
                </Button>

                <Button
                  variant="outline"
                  onClick={checkSyncStatus}
                  className="w-full"
                >
                  Refresh Status
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert
                  className="border"
                  style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
                >
                  <AlertDescription style={{ color: '#1F453A' }}>
                    <strong>Ready to Sync:</strong> This will register/update{' '}
                    {totalPodsToSync} pod{totalPodsToSync !== 1 ? 's' : ''} on
                    the blockchain for bounty management.
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={async () => {
                    if (!currentUser) {
                      console.error('❌ Wallet not connected');
                      return;
                    }

                    setIsExecutingTransaction(true);
                    try {
                      console.log('🚀 Syncing pods to blockchain via CDP Smart Account');

                      const response = await sendUserOperation({
                        calls: currentTransactionCalls.map((call: any) => ({
                          to: call.to,
                          data: call.data,
                          value: call.value || 0n,
                        })),
                      });

                      console.log('✅ Blockchain sync transaction submitted:', response.hash);
                      await response.wait();
                      console.log('✅ Blockchain sync successful');

                      handleTransactionSuccess();

                    } catch (error) {
                      console.error('❌ Blockchain sync failed:', error);
                    } finally {
                      setIsExecutingTransaction(false);
                    }
                  }}
                  disabled={isExecutingTransaction || !currentUser}
                  className="w-full"
                >
                  {isExecutingTransaction ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    `Sync ${totalPodsToSync} Pod${totalPodsToSync !== 1 ? 's' : ''} to Blockchain`
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setShowTransaction(false)}
                  className="w-full"
                >
                  Cancel Sync
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

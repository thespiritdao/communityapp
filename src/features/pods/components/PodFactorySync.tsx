'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { Loader2 } from 'lucide-react';
import { PodFactorySyncService } from '../services/PodFactorySyncService';

interface PodFactorySyncProps {
  onSyncComplete?: () => void;
}

export const PodFactorySync: React.FC<PodFactorySyncProps> = ({
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
      const data = await PodFactorySyncService.getPodsNeedingSync();
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

      // Generate creation calls for new pods
      syncData.toRegister.forEach((pod) => {
        const call = PodFactorySyncService.generateCreatePodCall(pod);
        calls.push(call);
      });

      // Generate update calls for existing pods
      syncData.toUpdate.forEach((pod) => {
        const call = PodFactorySyncService.generateUpdatePodCall(pod);
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
          <CardTitle>Pod Factory Sync</CardTitle>
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
        <CardTitle>Pod Factory Sync</CardTitle>
        <p className="text-sm text-gray-600 mt-2">
          Sync pods using the factory pattern for scalable authorization
        </p>
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
                <span>Pods to create:</span>
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
              <Alert
                className="border"
                style={{ backgroundColor: '#D1E6DC', borderColor: '#B8D9CA' }}
              >
                <AlertDescription style={{ color: '#1F453A' }}>
                  <strong>Factory Authorization:</strong> This factory pattern
                  allows any pod leader to sync their pod data without manual
                  whitelist approval. More scalable for community apps!
                </AlertDescription>
              </Alert>
            )}

            {syncData.toRegister.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">
                  Pods to Create (Factory Proxies):
                </h4>
                <ul className="text-sm space-y-1">
                  {syncData.toRegister.map((pod) => (
                    <li key={pod.id} className="flex justify-between">
                      <span>{pod.name}</span>
                      <span style={{ color: '#3F7A5A' }}>New Proxy</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {syncData.toUpdate.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">
                  Pods to Update (Existing Proxies):
                </h4>
                <ul className="text-sm space-y-1">
                  {syncData.toUpdate.map((pod) => (
                    <li key={pod.id} className="flex justify-between">
                      <span>{pod.name}</span>
                      <span style={{ color: '#2F5D50' }}>Update Proxy</span>
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
                    : `Sync ${totalPodsToSync} Pod${totalPodsToSync !== 1 ? 's' : ''} via Factory`}
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
                    <strong>Ready to Sync:</strong> This will create/update{' '}
                    {totalPodsToSync} pod proxy
                    {totalPodsToSync !== 1 ? 'ies' : 'y'} using the factory
                    pattern. No manual authorization required!
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
                      console.log('🚀 Syncing pods via CDP Smart Account');

                      const response = await sendUserOperation({
                        calls: currentTransactionCalls.map((call: any) => ({
                          to: call.to,
                          data: call.data,
                          value: call.value || 0n,
                        })),
                      });

                      console.log('✅ Pod sync transaction submitted:', response.hash);
                      await response.wait();
                      console.log('✅ Pod sync successful');

                      handleTransactionSuccess();

                    } catch (error) {
                      console.error('❌ Pod sync failed:', error);
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
                    `Sync ${totalPodsToSync} Pod${totalPodsToSync !== 1 ? 's' : ''} via Factory`
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

            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              <h5 className="font-medium mb-2">Factory Pattern Benefits:</h5>
              <ul className="text-gray-600 space-y-1">
                <li>• No manual whitelist management required</li>
                <li>• Each pod gets its own authorization proxy</li>
                <li>• Pod leaders can manage their own pods</li>
                <li>• Scales infinitely without contract owner intervention</li>
                <li>• Based on Hats Protocol's proven factory pattern</li>
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

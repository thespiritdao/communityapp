'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useEvmAddress } from '@coinbase/cdp-hooks';

/**
 * Admin Utility: Sync Pod Members
 *
 * Manually triggers member indexing for pods to sync on-chain HAT ownership
 * with the pod_members database table.
 *
 * Use this when:
 * - A user receives a HAT token but it's not reflected in permissions
 * - The automatic indexer hasn't run yet
 * - Manual verification is needed
 */
export default function SyncPodMembersPage() {
  const { evmAddress: address } = useEvmAddress();
  const [podId, setPodId] = useState('e35c9e25-d29f-4988-b1e8-2902e960b94c'); // Default to Executive Pod
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    if (!podId) {
      setError('Please enter a Pod ID');
      return;
    }

    setSyncing(true);
    setError(null);
    setResult(null);

    try {
      console.log(`🔄 Triggering member sync for pod: ${podId}`);

      const response = await fetch('/api/pods/sync-members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ podId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      console.log('✅ Sync completed:', data);
      setResult(data);
    } catch (err) {
      console.error('❌ Sync failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSyncing(false);
    }
  };

  const quickSyncExecutivePod = () => {
    setPodId('e35c9e25-d29f-4988-b1e8-2902e960b94c');
    setTimeout(handleSync, 100);
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Sync Pod Members</h1>
          <p className="text-gray-600">
            Manually trigger member indexing to sync on-chain HAT ownership with the database.
          </p>
        </div>

        {!address && (
          <Card className="p-6 bg-yellow-50 border-yellow-200">
            <p className="text-yellow-800">
              Please connect your wallet to use this utility.
            </p>
          </Card>
        )}

        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Pod ID
              </label>
              <input
                type="text"
                value={podId}
                onChange={(e) => setPodId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="e.g., e35c9e25-d29f-4988-b1e8-2902e960b94c"
                disabled={syncing}
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleSync}
                disabled={syncing || !address}
                className="flex-1"
              >
                {syncing ? 'Syncing...' : 'Sync Pod Members'}
              </Button>
              <Button
                onClick={quickSyncExecutivePod}
                disabled={syncing || !address}
                variant="outline"
              >
                Quick: Sync Executive Pod
              </Button>
            </div>
          </div>
        </Card>

        {error && (
          <Card className="p-6 bg-red-50 border-red-200">
            <h3 className="font-semibold text-red-800 mb-2">Error</h3>
            <p className="text-red-700">{error}</p>
          </Card>
        )}

        {result && (
          <Card className="p-6 bg-green-50 border-green-200">
            <h3 className="font-semibold text-green-800 mb-2">
              Sync Completed Successfully
            </h3>
            <div className="space-y-2 text-sm text-green-700">
              <p>
                <strong>Pod ID:</strong> {result.podId}
              </p>
              <p>
                <strong>Members Added:</strong> {result.membersAdded}
              </p>
              <p>
                <strong>Members Removed:</strong> {result.membersRemoved}
              </p>
              {result.errors && result.errors.length > 0 && (
                <div>
                  <strong>Errors:</strong>
                  <ul className="list-disc list-inside mt-1">
                    {result.errors.map((err: string, idx: number) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        )}

        <Card className="p-6 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-blue-800 mb-2">How it works</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-blue-700">
            <li>Enter a Pod ID (or use the quick button for Executive Pod)</li>
            <li>Click "Sync Pod Members" to trigger indexing</li>
            <li>The system will read on-chain HAT ownership from the blockchain</li>
            <li>Pod members are updated in the database</li>
            <li>Permissions will be refreshed automatically</li>
          </ol>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-2">Common Pod IDs</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span className="font-medium">Executive Pod</span>
              <code className="text-xs bg-gray-200 px-2 py-1 rounded">
                e35c9e25-d29f-4988-b1e8-2902e960b94c
              </code>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

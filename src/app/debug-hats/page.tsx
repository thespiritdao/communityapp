'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { debugHatsBalance, findUserHats } from '@/utils/debugHatsBalance';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function DebugHatsPage() {
  const { address } = useAccount();
  const [debugResults, setDebugResults] = useState<any>(null);
  const [tokenBalances, setTokenBalances] = useState<any>(null);
  const [userHats, setUserHats] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scanRange, setScanRange] = useState({ start: 1, end: 500 });

  const runDebug = async () => {
    if (!address) {
      alert('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    try {
      // Run debug
      const results = await debugHatsBalance(address);
      setDebugResults(results);

      // Also check regular token balances
      const balances = await fetchTokenBalances(address);
      setTokenBalances(balances);
    } catch (error) {
      console.error('Debug failed:', error);
    }
    setIsLoading(false);
  };

  const scanForHats = async () => {
    if (!address) {
      alert('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    try {
      const hats = await findUserHats(address, scanRange.start, scanRange.end);
      setUserHats(hats);
    } catch (error) {
      console.error('Scan failed:', error);
    }
    setIsLoading(false);
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">🎩 Hats Protocol Debug Tool</h1>

      <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <p className="text-sm">
          <strong>Connected Address:</strong> {address || 'Not connected'}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          This tool helps debug why executive pod and bounty management
          permissions aren't working.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Debug Token Balances */}
        <Card>
          <CardHeader>
            <CardTitle>1. Check Configured Hat Balances</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={runDebug} disabled={isLoading || !address}>
              {isLoading ? 'Checking...' : 'Run Hat Balance Check'}
            </Button>

            {debugResults && (
              <div className="mt-4 space-y-2">
                <h3 className="font-semibold">Results:</h3>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                  {JSON.stringify(debugResults, null, 2)}
                </pre>
              </div>
            )}

            {tokenBalances && (
              <div className="mt-4">
                <h3 className="font-semibold">Token Balance Check:</h3>
                <div className="bg-gray-100 p-3 rounded text-sm space-y-1 mt-2">
                  <div>
                    ✅ hasProofOfCuriosity:{' '}
                    {tokenBalances.hasProofOfCuriosity ? 'YES' : 'NO'}
                  </div>
                  <div>
                    🎯 hasExecutivePod:{' '}
                    {tokenBalances.hasExecutivePod ? 'YES' : 'NO'}
                  </div>
                  <div>
                    💻 hasDevPod: {tokenBalances.hasDevPod ? 'YES' : 'NO'}
                  </div>
                  <div>
                    💰 hasBountyHat: {tokenBalances.hasBountyHat ? 'YES' : 'NO'}
                  </div>
                  <div>
                    🛍️ hasMarketManagement:{' '}
                    {tokenBalances.hasMarketManagement ? 'YES' : 'NO'}
                  </div>
                  <div>
                    📅 hasEventManagement:{' '}
                    {tokenBalances.hasEventManagement ? 'YES' : 'NO'}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scan for Hats */}
        <Card>
          <CardHeader>
            <CardTitle>2. Scan for Actual Hats You Own</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <input
                type="number"
                placeholder="Start ID"
                value={scanRange.start}
                onChange={(e) =>
                  setScanRange((prev) => ({
                    ...prev,
                    start: parseInt(e.target.value) || 1,
                  }))
                }
                className="px-3 py-2 border rounded w-32"
              />
              <span className="py-2">to</span>
              <input
                type="number"
                placeholder="End ID"
                value={scanRange.end}
                onChange={(e) =>
                  setScanRange((prev) => ({
                    ...prev,
                    end: parseInt(e.target.value) || 500,
                  }))
                }
                className="px-3 py-2 border rounded w-32"
              />
              <Button onClick={scanForHats} disabled={isLoading || !address}>
                {isLoading ? 'Scanning...' : 'Scan Range'}
              </Button>
            </div>

            {userHats.length > 0 && (
              <div className="mt-4">
                <h3 className="font-semibold">Found {userHats.length} Hats:</h3>
                <div className="bg-green-50 p-3 rounded mt-2">
                  <p className="text-sm">Hat IDs: {userHats.join(', ')}</p>
                  <p className="text-xs text-gray-600 mt-2">
                    💡 Update your .env file with these Hat IDs to fix
                    permissions!
                  </p>
                </div>
              </div>
            )}

            {userHats.length === 0 && debugResults && (
              <div className="mt-4 p-3 bg-red-50 rounded">
                <p className="text-sm text-red-800">
                  No hats found in range {scanRange.start}-{scanRange.end}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Fix Guide */}
        <Card>
          <CardHeader>
            <CardTitle>3. Quick Fix Guide</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="p-3 bg-blue-50 rounded">
                <strong>Option A: Use Hat ID 182</strong>
                <p className="text-xs mt-1">
                  The BountyManagerOptimized contract has Hat ID 182 hardcoded.
                </p>
                <code className="block mt-2 text-xs bg-white p-2 rounded">
                  NEXT_PUBLIC_BOUNTY_MANAGEMENT=182
                </code>
              </div>

              <div className="p-3 bg-blue-50 rounded">
                <strong>Option B: Update Contract</strong>
                <p className="text-xs mt-1">
                  If you have different Hat IDs, update the contract's
                  BOUNTY_MANAGER_HAT constant.
                </p>
              </div>

              <div className="p-3 bg-blue-50 rounded">
                <strong>Option C: Grant Hat to User</strong>
                <p className="text-xs mt-1">
                  Visit{' '}
                  <a
                    href="https://app.hatsprotocol.xyz/"
                    target="_blank"
                    className="underline"
                  >
                    Hats Protocol App
                  </a>{' '}
                  to grant the necessary hat to your address.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current .env Values */}
        <Card>
          <CardHeader>
            <CardTitle>4. Current Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-100 p-3 rounded text-xs font-mono space-y-1">
              <div>
                EXECUTIVE_POD_LEADER=
                {process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER || 'not set'}
              </div>
              <div>
                EXECUTIVE_POD_MEMBER=
                {process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER || 'not set'}
              </div>
              <div>
                BOUNTY_MANAGEMENT=
                {process.env.NEXT_PUBLIC_BOUNTY_MANAGEMENT || 'not set'}
              </div>
              <div>
                DEV_POD_HAT_ID=
                {process.env.NEXT_PUBLIC_DEV_POD_HAT_ID || 'not set'}
              </div>
              <div>
                MARKET_MANAGEMENT=
                {process.env.NEXT_PUBLIC_MARKET_MANAGEMENT || 'not set'}
              </div>
              <div>
                EVENT_MANAGEMENT=
                {process.env.NEXT_PUBLIC_EVENT_MANAGEMENT || 'not set'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

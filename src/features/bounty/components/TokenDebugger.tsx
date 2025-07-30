"use client"

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { fetchTokenBalances } from 'src/utils/fetchTokenBalances';
import { Card, CardContent, CardHeader, CardTitle } from 'src/components/ui/card';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';

export const TokenDebugger: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [tokenBalances, setTokenBalances] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkTokenBalances = async () => {
    if (!address) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const balances = await fetchTokenBalances(address);
      setTokenBalances(balances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      checkTokenBalances();
    }
  }, [isConnected, address]);

  if (!isConnected) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-6">
          <p className="text-center text-gray-600">Please connect your wallet to check token balances.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          Token Balance Debugger
          <Button onClick={checkTokenBalances} disabled={loading} size="sm">
            {loading ? 'Checking...' : 'Refresh'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Wallet Address */}
        <div>
          <h3 className="font-semibold mb-2">Wallet Address</h3>
          <p className="text-sm font-mono bg-gray-100 p-2 rounded">{address}</p>
        </div>

        {/* Environment Variables */}
        <div>
          <h3 className="font-semibold mb-2">Environment Variables</h3>
          <div className="space-y-1 text-sm">
            <p><strong>HATS_CONTRACT:</strong> {process.env.NEXT_PUBLIC_HATS_CONTRACT || 'Not set'}</p>
            <p><strong>BOUNTY_MANAGEMENT:</strong> {process.env.NEXT_PUBLIC_BOUNTY_MANAGEMENT || 'Not set'}</p>
            <p><strong>EXECUTIVE_POD_HAT_ID:</strong> {process.env.NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID || 'Not set'}</p>
            <p><strong>DEV_POD_HAT_ID:</strong> {process.env.NEXT_PUBLIC_DEV_POD_HAT_ID || 'Not set'}</p>
            <p><strong>PROOF_OF_CURIOSITY:</strong> {process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY || 'Not set'}</p>
            <p><strong>MARKET_MANAGEMENT:</strong> {process.env.NEXT_PUBLIC_MARKET_MANAGEMENT || 'Not set'}</p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-red-800 text-sm"><strong>Error:</strong> {error}</p>
          </div>
        )}

        {/* Token Balances */}
        {tokenBalances && (
          <div>
            <h3 className="font-semibold mb-2">Token Balances</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={tokenBalances.hasBountyHat ? "default" : "secondary"}>
                  {tokenBalances.hasBountyHat ? "✅" : "❌"} Bounty Hat
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={tokenBalances.hasExecutivePod ? "default" : "secondary"}>
                  {tokenBalances.hasExecutivePod ? "✅" : "❌"} Executive Pod
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={tokenBalances.hasDevPod ? "default" : "secondary"}>
                  {tokenBalances.hasDevPod ? "✅" : "❌"} Dev Pod
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={tokenBalances.hasProofOfCuriosity ? "default" : "secondary"}>
                  {tokenBalances.hasProofOfCuriosity ? "✅" : "❌"} Proof of Curiosity
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={tokenBalances.hasMarketAdmin ? "default" : "secondary"}>
                  {tokenBalances.hasMarketAdmin ? "✅" : "❌"} Market Admin
                </Badge>
              </div>
            </div>
            
            {/* Token Amounts */}
            <div className="mt-4 space-y-1 text-sm">
              <p><strong>SYSTEM Balance:</strong> {tokenBalances.systemBalance}</p>
              <p><strong>SELF Balance:</strong> {tokenBalances.selfBalance}</p>
            </div>
          </div>
        )}

        {/* Bounty Access Status */}
        {tokenBalances && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
            <h3 className="font-semibold mb-2">Bounty Access Status</h3>
            <div className="space-y-1">
              <p className="text-sm">
                <strong>Can Create Bounties:</strong> 
                <Badge variant={tokenBalances.hasBountyHat ? "default" : "destructive"} className="ml-2">
                  {tokenBalances.hasBountyHat ? "YES" : "NO"}
                </Badge>
              </p>
              <p className="text-sm text-gray-600">
                Required: Bounty Hat Token (ID: {process.env.NEXT_PUBLIC_BOUNTY_MANAGEMENT || 'Not configured'})
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 
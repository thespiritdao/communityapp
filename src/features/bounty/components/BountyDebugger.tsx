"use client"

import React, { useState } from 'react';
import { Button } from 'src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'src/components/ui/card';
import { useReadContract } from 'wagmi';
import BountyManagerABI from '../../../contracts/BountyManager.json';

interface BountyDebuggerProps {
  bountyId: string;
  bidderAddress: string;
}

export const BountyDebugger: React.FC<BountyDebuggerProps> = ({
  bountyId,
  bidderAddress,
}) => {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const { data: bounty, refetch } = useReadContract({
    address: process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'getBounty',
    args: [parseInt(bountyId)]
  });

  const checkBountyState = async () => {
    setLoading(true);
    try {
      console.log('🔍 Checking bounty state...');
      
      // Refetch bounty data
      const result = await refetch();
      const bountyData = result.data;
      
      console.log('📋 Bounty data:', bountyData);
      
      if (!bountyData) {
        throw new Error('No bounty data returned');
      }
      
      // Check if bidder is in the list
      const isBidderInList = bountyData.bidders.includes(bidderAddress.toLowerCase());
      console.log('👤 Is bidder in list:', isBidderInList);
      console.log('📝 All bidders:', bountyData.bidders);
      console.log('🔍 Looking for:', bidderAddress.toLowerCase());
      
      // Check bounty status
      const statusNames = ['Open', 'InProgress', 'Completed', 'Cancelled'];
      const bountyStatus = statusNames[bountyData.status];
      console.log('📊 Bounty status:', bountyStatus);
      
      // Check if current user is creator
      console.log('👑 Bounty creator:', bountyData.creator);
      
      setDebugInfo({
        bounty: bountyData,
        isBidderInList,
        bountyStatus,
        allBidders: bountyData.bidders,
        lookingFor: bidderAddress.toLowerCase()
      });
      
    } catch (error) {
      console.error('❌ Error checking bounty state:', error);
      setDebugInfo({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto mb-4">
      <CardHeader>
        <CardTitle className="text-lg">🔧 Bounty Debugger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={checkBountyState} 
          disabled={loading}
          variant="outline"
        >
          {loading ? 'Checking...' : 'Check Bounty State'}
        </Button>
        
        {debugInfo && (
          <div className="bg-gray-50 p-4 rounded-lg text-sm">
            <h4 className="font-semibold mb-2">Debug Results:</h4>
            {debugInfo.error ? (
              <p className="text-red-600">Error: {debugInfo.error}</p>
            ) : (
              <div className="space-y-2">
                <p><strong>Bounty Status:</strong> {debugInfo.bountyStatus}</p>
                <p><strong>Is Bidder in List:</strong> {debugInfo.isBidderInList ? '✅ Yes' : '❌ No'}</p>
                <p><strong>Looking for:</strong> {debugInfo.lookingFor}</p>
                <p><strong>All Bidders:</strong></p>
                <ul className="ml-4">
                  {debugInfo.allBidders.map((bidder: string, index: number) => (
                    <li key={index} className={bidder === debugInfo.lookingFor ? 'text-green-600 font-bold' : ''}>
                      {bidder} {bidder === debugInfo.lookingFor ? '← MATCH!' : ''}
                    </li>
                  ))}
                </ul>
                <p><strong>Creator:</strong> {debugInfo.bounty.creator}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 
"use client"

import React from 'react';
import { Transaction, TransactionButton } from '@coinbase/onchainkit/transaction';
import { Button } from 'src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'src/components/ui/card';
import { Badge } from 'src/components/ui/badge';
import { useAccount } from 'wagmi';
import { parseEther } from 'viem';
import BountyManagerABI from '@/contracts/BountyManager.json';

interface BountyCompletionProps {
  bountyId: string;
  bountyTitle: string;
  bountyValue: {
    amount: string;
    token: 'SYSTEM' | 'SELF';
  };
  onComplete?: () => void;
}

export const BountyCompletion: React.FC<BountyCompletionProps> = ({
  bountyId,
  bountyTitle,
  bountyValue,
  onComplete,
}) => {
  const { address } = useAccount();

  // Contract configuration for approving bounty completion
  const completeBountyContract = {
    address: process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'approveCompletion',
    args: [parseInt(bountyId)],
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-lg">Complete Bounty</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Bounty: {bountyTitle}</p>
          <p className="text-sm text-gray-600">Value: {bountyValue.amount} {bountyValue.token}</p>
          <p className="text-sm text-gray-600">This will release payment to the bounty worker.</p>
        </div>

        <Transaction
          isSponsored={true}
          address={address}
          contracts={[completeBountyContract]}
          onSuccess={(receipt) => {
            console.log('✅ Bounty completed successfully:', receipt);
            onComplete?.();
          }}
          onError={(error) => {
            console.error('❌ Failed to complete bounty:', error);
          }}
          onTransactionStarted={() => {
            console.log('🚀 Completing bounty...');
          }}
        >
          <TransactionButton
            text="Complete Bounty"
            className="w-full"
          />
        </Transaction>
      </CardContent>
    </Card>
  );
}; 
'use client';

import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import BountyManagerABI from '@/abis/BountyManager.json';

const BOUNTY_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

export default function TestBountyRoleCheckPage() {
  const { address } = useAccount();

  // Check if contract has role-based access control
  const { data: adminRole } = useReadContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'DEFAULT_ADMIN_ROLE',
    args: []
  });

  const { data: bountyCreatorRole } = useReadContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'BOUNTY_CREATOR_ROLE',
    args: []
  });

  const { data: hasAdminRole } = useReadContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'hasRole',
    args: adminRole && address ? [adminRole, address] : undefined
  });

  const { data: hasBountyCreatorRole } = useReadContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'hasRole',
    args: bountyCreatorRole && address ? [bountyCreatorRole, address] : undefined
  });

  const { data: isPaused } = useReadContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'paused',
    args: []
  });

  const { data: bountyHatId } = useReadContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'bountyHatId',
    args: []
  });

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">🔍 Bounty Contract Role Diagnostics</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🔐 Role & Permission Checks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Contract Paused</p>
                <p className={`font-bold ${isPaused ? 'text-red-600' : 'text-green-600'}`}>
                  {isPaused ? '🚫 YES - Contract is paused!' : '✅ No - Contract is active'}
                </p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-600">Your Address</p>
                <p className="font-mono text-sm">{address}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">Role Constants</h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">DEFAULT_ADMIN_ROLE:</span>
                  <code className="ml-2 text-xs">{adminRole?.toString()}</code>
                </div>
                <div>
                  <span className="text-gray-600">BOUNTY_CREATOR_ROLE:</span>
                  <code className="ml-2 text-xs">{bountyCreatorRole?.toString()}</code>
                </div>
                <div>
                  <span className="text-gray-600">Bounty Hat ID:</span>
                  <code className="ml-2 text-xs">{bountyHatId?.toString()}</code>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">Your Role Status</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span>Has Admin Role:</span>
                  <span className={`font-bold ${hasAdminRole ? 'text-green-600' : 'text-red-600'}`}>
                    {hasAdminRole ? '✅ YES' : '❌ NO'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span>Has Bounty Creator Role:</span>
                  <span className={`font-bold ${hasBountyCreatorRole ? 'text-green-600' : 'text-red-600'}`}>
                    {hasBountyCreatorRole ? '✅ YES' : '❌ NO'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>📊 Diagnosis Results</CardTitle>
        </CardHeader>
        <CardContent>
          {isPaused && (
            <Alert className="bg-red-50 mb-4">
              <AlertDescription>
                🚫 <strong>Contract is PAUSED!</strong> This is likely why transactions are failing.
                Only admins can unpause the contract.
              </AlertDescription>
            </Alert>
          )}

          {!hasAdminRole && !hasBountyCreatorRole && (
            <Alert className="bg-yellow-50 mb-4">
              <AlertDescription>
                ⚠️ <strong>No contract roles detected.</strong> You may need specific roles to create bounties.
                Your Executive Pod permissions might not be sufficient for this contract.
              </AlertDescription>
            </Alert>
          )}

          {!isPaused && (hasAdminRole || hasBountyCreatorRole) && (
            <Alert className="bg-green-50">
              <AlertDescription>
                ✅ <strong>You have the required permissions.</strong> The issue is likely with the transaction parameters.
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium mb-2">Debugging Information</h4>
            <div className="text-sm space-y-1">
              <div>Contract Address: <code>{BOUNTY_MANAGER_ADDRESS}</code></div>
              <div>Admin Role: <code>{adminRole?.toString() || 'Loading...'}</code></div>
              <div>Creator Role: <code>{bountyCreatorRole?.toString() || 'Loading...'}</code></div>
              <div>Is Paused: <code>{isPaused?.toString()}</code></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
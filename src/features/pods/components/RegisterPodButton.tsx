'use client';

import React, { useState } from 'react';
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
} from '@coinbase/onchainkit/transaction';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PodBountyServiceABI from '@/abis/PodBountyService.json';

const POD_BOUNTY_SERVICE =
  '0xbccee13f13Ca4f97758c79C8FF05ff7EB9290396' as `0x${string}`;

interface RegisterPodButtonProps {
  pod: {
    id: string;
    name: string;
    created_by_address: string;
    pod_leads: string[];
    treasury_contract_address: string;
  };
  onSuccess?: () => void;
}

/**
 * Component to register a pod with PodBountyService
 * This is required before the pod can create bounties
 */
export const RegisterPodButton: React.FC<RegisterPodButtonProps> = ({
  pod,
  onSuccess,
}) => {
  const [showTransaction, setShowTransaction] = useState(false);

  const registerPodCall = {
    address: POD_BOUNTY_SERVICE,
    abi: PodBountyServiceABI,
    functionName: 'registerPod' as const,
    args: [
      pod.id, // podId (string - UUID)
      pod.created_by_address, // creator (address)
      pod.pod_leads || [], // leaders (address[])
      pod.treasury_contract_address ||
        '0x0000000000000000000000000000000000000000', // treasuryAddress
    ],
  };

  if (!showTransaction) {
    return (
      <div className="space-y-2">
        <Alert
          className="border"
          style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}
        >
          <AlertDescription>
            <strong>Pod Not Registered for Bounties</strong>
            <br />
            This pod must be registered with the bounty system before you can
            create bounties.
            <br />
            <span className="text-xs text-gray-600">
              This is a one-time setup step.
            </span>
          </AlertDescription>
        </Alert>

        <Button onClick={() => setShowTransaction(true)} className="w-full">
          Register Pod for Bounties
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          <strong>Registering: {pod.name}</strong>
          <div className="text-xs text-gray-600 mt-2 space-y-1">
            <div>Pod ID: {pod.id}</div>
            <div>Creator: {pod.created_by_address}</div>
            <div>Leaders: {pod.pod_leads?.length || 0}</div>
            <div>Treasury: {pod.treasury_contract_address || 'None'}</div>
          </div>
        </AlertDescription>
      </Alert>

      <Transaction
        chainId={8453} // Base mainnet
        calls={[registerPodCall]}
        onStatus={(status) => {
          console.log('Pod registration status:', status);
          if (status.statusName === 'success') {
            console.log('✅ Pod registered successfully!');
            onSuccess?.();
          }
        }}
      >
        <TransactionButton text="Register Pod" className="w-full" />
        <TransactionStatus>
          <TransactionStatusLabel />
          <TransactionStatusAction />
        </TransactionStatus>
      </Transaction>

      <Button
        variant="outline"
        onClick={() => setShowTransaction(false)}
        className="w-full"
      >
        Cancel
      </Button>
    </div>
  );
};

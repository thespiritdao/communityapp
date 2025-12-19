'use client';

import React, { useState, useCallback } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData, type Abi } from 'viem';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PodBountyServiceABIJson from '@/abis/PodBountyService.json';

const PodBountyServiceABI = PodBountyServiceABIJson as Abi;

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
 *
 * REFACTORED: Now uses CDP Smart Account pattern for gasless transactions
 */
export const RegisterPodButton: React.FC<RegisterPodButtonProps> = ({
  pod,
  onSuccess,
}) => {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();

  const [showTransaction, setShowTransaction] = useState(false);
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CDP Smart Account transaction handler - EXACT FAUCET PATTERN
  const handleRegisterPod = useCallback(async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for pod registration:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      setError('Smart Wallet not properly configured');
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN
    setError(null);

    try {
      console.log('🚀 Building Smart Account User Operation for pod registration...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: PodBountyService - registerPod');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // EXACT FAUCET PATTERN: Encode call data
      const callData = encodeFunctionData({
        abi: PodBountyServiceABI,
        functionName: 'registerPod',
        args: [
          pod.id, // podId (string - UUID)
          pod.created_by_address, // creator (address)
          pod.pod_leads || [], // leaders (address[])
          pod.treasury_contract_address ||
            '0x0000000000000000000000000000000000000000', // treasuryAddress
        ],
      });

      console.log('📝 Encoded call data for registerPod');

      // EXACT FAUCET PATTERN: Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: [{
          to: POD_BOUNTY_SERVICE,
          value: 0n,                     // ← Zero ETH (bigint)
          data: callData,
        }],
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);
      console.log('✅ Pod registered successfully for bounties:', pod.id);

      // Call success handler
      onSuccess?.();
      setShowTransaction(false);
    } catch (err: any) {
      console.error('❌ Pod registration failed:', err);
      setError(err.message || 'Failed to register pod. Please try again.');
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  }, [evmAddress, currentUser, sendUserOperation, pod, onSuccess]);

  if (!showTransaction) {
    return (
      <div className="space-y-2">
        <Alert
          className="border"
          style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}
        >
          <AlertDescription>
            <strong>🔧 Pod Not Registered for Bounties</strong>
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

      {error && (
        <Alert
          className="border"
          style={{ backgroundColor: '#F5E6E6', borderColor: '#D9B3B3' }}
        >
          <AlertDescription style={{ color: '#5C1F1F' }}>
            <strong>Error:</strong> {error}
          </AlertDescription>
        </Alert>
      )}

      {/* CDP Smart Account Transaction Button */}
      {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
        <Button
          onClick={handleRegisterPod}
          disabled={isTransactionPending}
          className="w-full disabled:bg-gray-400 disabled:cursor-not-allowed font-medium py-2 px-4 rounded transition-colors hover:opacity-90"
        >
          {isTransactionPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
              Registering Pod...
            </>
          ) : (
            'Register Pod (Gasless)'
          )}
        </Button>
      ) : (
        <Alert
          className="border"
          style={{ backgroundColor: '#F5E6E6', borderColor: '#D9B3B3' }}
        >
          <AlertDescription style={{ color: '#5C1F1F' }}>
            <strong>Configuration Error:</strong> Missing wallet connection or
            Smart Account. Please check your connection.
            <div className="mt-2 text-xs" style={{ color: '#8B3A3A' }}>
              Address: {evmAddress ? '✓' : '✗'} | Smart Account:{' '}
              {currentUser?.evmSmartAccounts?.[0] ? '✓' : '✗'}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Button
        variant="outline"
        onClick={() => setShowTransaction(false)}
        className="w-full"
        disabled={isTransactionPending}
      >
        Cancel
      </Button>
    </div>
  );
};

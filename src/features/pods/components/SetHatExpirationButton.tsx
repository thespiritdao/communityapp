'use client';

import { useState } from 'react';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/hooks/useSendUserOperationWithAttribution';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { encodeFunctionData } from 'viem';
import TimeBasedToggleModuleABI from '@/contracts/TimeBasedToggleModuleABI.json';

interface SetHatExpirationButtonProps {
  hatId: string; // Hex string like "0x000000010001000b000000000000000000000000000000000000000000000000"
  expirationTimestamp: number; // Unix timestamp in seconds
  onSuccess?: () => void;
}

const TOGGLE_MODULE_ADDRESS = process.env.NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE as `0x${string}`;

/**
 * CDP Smart Account button to set HAT expiration on-chain (gasless)
 *
 * Uses Coinbase paymaster for gas sponsorship - no ETH required!
 * Calls TimeBasedToggleModule.setHatExpiration()
 */
export function SetHatExpirationButton({
  hatId,
  expirationTimestamp,
  onSuccess,
}: SetHatExpirationButtonProps) {
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();

  const [isProcessing, setIsProcessing] = useState(false);

  const handleSetExpiration = async () => {
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for setting expiration:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your Smart Wallet to set expiration.',
        variant: 'destructive',
      });
      return;
    }

    if (!TOGGLE_MODULE_ADDRESS) {
      toast({
        title: 'Module Not Configured',
        description: 'TimeBasedToggleModule address not configured.',
        variant: 'destructive',
      });
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0];
    setIsProcessing(true);

    try {
      console.log('⏰ Setting HAT expiration on-chain (gasless)...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎩 HAT ID:', hatId);
      console.log('📅 Expiration:', new Date(expirationTimestamp * 1000).toISOString());
      console.log('🏠 Toggle Module:', TOGGLE_MODULE_ADDRESS);
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // Encode the contract call
      const callData = encodeFunctionData({
        abi: TimeBasedToggleModuleABI,
        functionName: 'setHatExpiration',
        args: [BigInt(hatId), BigInt(expirationTimestamp)],
      });

      console.log('📝 Encoded call data:', callData);

      // Send user operation with paymaster sponsorship
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base', // Base mainnet
        calls: [{
          to: TOGGLE_MODULE_ADDRESS,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true, // ← GASLESS!
      });

      console.log('✅ Expiration set successfully!', result);

      toast({
        title: 'Expiration Set On-Chain! (Gasless)',
        description: `Beta Tester HAT will expire on ${new Date(expirationTimestamp * 1000).toLocaleDateString()}`,
        duration: 5000,
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('❌ Failed to set expiration:', error);
      toast({
        title: 'Transaction Failed',
        description: error.message || 'Failed to set HAT expiration. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const expirationDate = new Date(expirationTimestamp * 1000).toLocaleDateString();

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-600">
        Commit expiration date to role token:
        <br />
        <strong>{expirationDate}</strong>
      </div>

      {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
        <Button
          onClick={handleSetExpiration}
          disabled={isProcessing}
          className="text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: '#2F5D50',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!isProcessing) {
              e.currentTarget.style.backgroundColor = '#1F453A';
            }
          }}
          onMouseLeave={(e) => {
            if (!isProcessing) {
              e.currentTarget.style.backgroundColor = '#2F5D50';
            }
          }}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
              Setting Expiration On-Chain...
            </>
          ) : (
            'Commit Change'
          )}
        </Button>
      ) : (
        <div className="p-3 border rounded-lg bg-gray-50 text-sm">
          <p className="text-red-600 font-medium">
            Wallet Not Connected
          </p>
          <p className="text-gray-600 mt-1">
            Please connect your Smart Wallet to set expiration.
          </p>
        </div>
      )}
    </div>
  );
}

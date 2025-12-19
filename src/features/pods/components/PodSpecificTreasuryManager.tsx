'use client';

import { useState, useEffect } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData } from 'viem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TreasuryManagement } from './TreasuryManagement';
import { Wallet, Plus, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

// Contract addresses from environment
const POD_TREASURY_FACTORY_ADDRESS = (process.env
  .NEXT_PUBLIC_POD_TREASURY_FACTORY ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;
const PODS_TESTING_MODE = process.env.NEXT_PUBLIC_PODS_TESTING === 'true';

// Default supported tokens (Your community currencies)
const DEFAULT_SUPPORTED_TOKENS = [
  '0x1317Ae277266D38C4E492558f8693F14143a6A65', // $SPIRIT (SYSTEM_TOKEN)
  '0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21', // $SELF (SELF_TOKEN)
] as `0x${string}`[];

// Factory ABI for treasury deployment
const TREASURY_FACTORY_ABI = [
  {
    name: 'deployTreasury',
    type: 'function',
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'managementHatId', type: 'uint256' },
      { name: 'supportedTokens', type: 'address[]' },
      { name: 'testingMode', type: 'bool' },
    ],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'nonpayable',
  },
] as const;

interface Pod {
  id: string;
  name: string;
  management_hat_id: string;
  treasury_contract_address?: string;
  is_active?: boolean;
}

interface PodSpecificTreasuryManagerProps {
  pod: Pod;
  canManageTreasury: boolean;
}

/**
 * Pod-specific treasury manager that shows deployment interface when no treasury exists
 * and regular treasury management when treasury is active
 */
export function PodSpecificTreasuryManager({
  pod,
  canManageTreasury,
}: PodSpecificTreasuryManagerProps) {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();
  const [localPod, setLocalPod] = useState(pod);
  const [isTransactionPending, setIsTransactionPending] = useState(false);

  // Update local pod when prop changes
  useEffect(() => {
    setLocalPod(pod);
  }, [pod]);

  // Check if pod has an active treasury
  const hasTreasury = !!localPod.treasury_contract_address;

  // Convert management hat ID to BigInt for contract calls
  const getManagementHatIdBigInt = (hatId: string): bigint => {
    if (!hatId) return BigInt(0);
    if (hatId.startsWith('0x')) {
      return BigInt(hatId);
    }
    // Handle decimal string
    return BigInt(hatId);
  };

  /**
   * CDP Smart Account transaction handler - Treasury Deployment
   */
  const handleDeployViaCDP = async () => {
    // EXACT FAUCET PATTERN: Simple validation
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for treasury deployment:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your Smart Wallet to deploy treasury.',
        variant: 'destructive',
      });
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for treasury deployment...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🏦 Pod ID:', localPod.id);
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // Prepare deployment call
      const callData = encodeFunctionData({
        abi: TREASURY_FACTORY_ABI,
        functionName: 'deployTreasury',
        args: [
          localPod.id,
          getManagementHatIdBigInt(localPod.management_hat_id),
          DEFAULT_SUPPORTED_TOKENS,
          PODS_TESTING_MODE,
        ],
      });

      // EXACT FAUCET PATTERN: Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: [{
          to: POD_TREASURY_FACTORY_ADDRESS,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);

      // Handle success with receipt
      // Type assertion needed due to incomplete CDP SDK types
      const resultWithReceipt = result as any;
      if (resultWithReceipt?.receipt) {
        console.log('🏦 Treasury deployment successful:', resultWithReceipt.receipt);

        // Extract treasury address from transaction logs
        // TreasuryDeployed event signature: keccak256("TreasuryDeployed(string,address,uint256,address[],address)")
        const TREASURY_DEPLOYED_EVENT =
          '0x494cf03e4055d4033e848ad013abd5a12efdf3143ccf97cd8514778840b10d36';

        let treasuryAddress = '';

        if (resultWithReceipt.receipt.logs) {
          // Find TreasuryDeployed event log
          const deploymentLog = resultWithReceipt.receipt.logs.find(
            (log: any) => log.topics?.[0] === TREASURY_DEPLOYED_EVENT,
          );

          if (deploymentLog) {
            // Treasury address is the second indexed parameter (topics[2])
            const addressFromTopic = deploymentLog.topics?.[2];
            if (addressFromTopic && addressFromTopic.length === 66) {
              treasuryAddress = '0x' + addressFromTopic.slice(-40);
            }
          }
        }

        console.log('🏦 Extracted treasury address:', treasuryAddress);

        // If we couldn't extract the address, show error
        if (!treasuryAddress) {
          console.error('Could not extract treasury address from logs');
          toast({
            title: 'Treasury Deployed!',
            description: `Treasury deployed but address extraction failed. Check tx: ${resultWithReceipt.receipt.transactionHash}`,
          });
          return;
        }

        // Update database with treasury address
        console.log('📝 Updating pod with treasury address:', treasuryAddress);
        const updateResponse = await fetch('/api/pods/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            podId: localPod.id,
            treasuryAddress: treasuryAddress,
            isActive: true,
          }),
        });

        if (!updateResponse.ok) {
          throw new Error('Failed to update pod with treasury address');
        }

        toast({
          title: 'Treasury Deployed Successfully!',
          description: `Treasury deployed at ${treasuryAddress.slice(0, 6)}...${treasuryAddress.slice(-4)}`,
        });

        // Update the local pod object to show the treasury
        setLocalPod({
          ...localPod,
          treasury_contract_address: treasuryAddress,
        });

        // Trigger parent component refresh
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('treasury-deployed', {
              detail: { podId: localPod.id, treasuryAddress },
            }),
          );
        }, 1000);
      } else {
        console.warn('⚠️ No receipt found in result');
        toast({
          title: 'Transaction Completed',
          description: 'Deployment completed but receipt not found. Please refresh.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('❌ Treasury deployment failed:', error);
      console.error('🏦 Full error details:', {
        message: error?.message,
        code: error?.code,
        data: error?.data,
      });

      // Extract specific error info
      let errorMessage = 'Treasury deployment encountered an error';
      if (error?.message?.includes('user rejected')) {
        errorMessage = 'Transaction was rejected by user.';
      } else if (error?.message?.includes('execution reverted')) {
        errorMessage = 'Transaction reverted. Check contract permissions.';
      }

      toast({
        title: 'Deployment Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  };

  // If pod has treasury, show regular treasury management
  if (hasTreasury) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-5 w-5" style={{ color: '#3F7A5A' }} />
          <span className="font-medium" style={{ color: '#1F453A' }}>
            Treasury Active
          </span>
          <Badge variant="secondary" className="ml-2">
            {localPod.treasury_contract_address?.slice(0, 6)}...
            {localPod.treasury_contract_address?.slice(-4)}
          </Badge>
        </div>

        <TreasuryManagement
          podId={localPod.id}
          treasuryAddress={localPod.treasury_contract_address}
          podName={localPod.name}
        />
      </div>
    );
  }

  // Show deployment interface when no treasury exists
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Wallet className="h-5 w-5" style={{ color: '#2F5D50' }} />
        <span className="font-medium">Treasury Deployment</span>
        <Badge variant="outline">Not Deployed</Badge>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          This pod doesn't have a treasury yet. Deploy a treasury contract to
          enable fund management, token distribution, and financial operations
          for <strong>{localPod.name}</strong>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Deploy Treasury for {localPod.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pod Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Pod ID</Label>
              <Input
                value={localPod.id}
                readOnly={true}
                className="bg-gray-50"
              />
            </div>
            <div>
              <Label>Management Hat ID</Label>
              <Input
                value={localPod.management_hat_id || 'Not set'}
                readOnly={true}
                className="bg-gray-50"
              />
            </div>
          </div>

          {/* Default Supported Tokens */}
          <div>
            <Label className="text-sm font-medium">
              Default Supported Tokens
            </Label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <img
                    src="/images/erc20tokens/SystemToken.png"
                    alt="SYSTEM"
                    className="w-6 h-6 rounded"
                  />
                  <span className="font-medium">$SYSTEM</span>
                </div>
                <Badge variant="secondary">0x1317...6A65</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <img
                    src="/images/erc20tokens/SelfToken.png"
                    alt="$SELF"
                    className="w-6 h-6 rounded"
                  />
                  <span className="font-medium">$SELF</span>
                </div>
                <Badge variant="secondary">0xe9b4...5D21</Badge>
              </div>
            </div>
          </div>

          {/* Deployment Transaction */}
          {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
            <div className="pt-4 border-t">
              <Button
                onClick={handleDeployViaCDP}
                disabled={isTransactionPending}
                className="w-full h-12 text-white font-semibold rounded-lg bg-[#3F7A5A] hover:bg-[#2F5D50] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTransactionPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deploying Treasury...
                  </>
                ) : (
                  `Deploy Treasury for ${localPod.name}`
                )}
              </Button>
            </div>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Please connect your Smart Wallet to deploy the treasury contract.
              </AlertDescription>
            </Alert>
          )}

          {!canManageTreasury && evmAddress && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You need treasury management permissions to deploy the treasury
                for this pod.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import { TreasuryManagement } from './TreasuryManagement';
import { Wallet, Plus, AlertTriangle, CheckCircle } from 'lucide-react';

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
  const { address } = useAccount();
  const { toast } = useToast();
  const [localPod, setLocalPod] = useState(pod);

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

  // Prepare treasury deployment transaction
  const prepareDeploymentTransaction = () => {
    return {
      address: POD_TREASURY_FACTORY_ADDRESS,
      abi: TREASURY_FACTORY_ABI,
      functionName: 'deployTreasury',
      args: [
        localPod.id,
        getManagementHatIdBigInt(localPod.management_hat_id),
        DEFAULT_SUPPORTED_TOKENS,
        PODS_TESTING_MODE,
      ],
    };
  };

  // Transaction calls for deployment
  const calls = [prepareDeploymentTransaction()];

  // Handle successful deployment
  const handleSuccess = async (response: any) => {
    console.log('🏦 Treasury deployment response:', response);

    try {
      // Extract treasury address from transaction logs
      const txReceipt = response?.transactionReceipts?.[0];

      // TreasuryDeployed event signature: keccak256("TreasuryDeployed(string,address,uint256,address[],address)")
      const TREASURY_DEPLOYED_EVENT =
        '0x494cf03e4055d4033e848ad013abd5a12efdf3143ccf97cd8514778840b10d36';

      let treasuryAddress = '';

      if (txReceipt?.logs) {
        // Find TreasuryDeployed event log
        const deploymentLog = txReceipt.logs.find(
          (log: any) => log.topics?.[0] === TREASURY_DEPLOYED_EVENT,
        );

        if (deploymentLog) {
          // Treasury address is the second indexed parameter (topics[2])
          // Remove '0x' and pad to get proper address format
          const addressFromTopic = deploymentLog.topics?.[2];
          if (addressFromTopic && addressFromTopic.length === 66) {
            treasuryAddress = '0x' + addressFromTopic.slice(-40);
          }
        }

        // If topic parsing fails, try getting from receipt contractAddress
        if (!treasuryAddress && txReceipt.contractAddress) {
          treasuryAddress = txReceipt.contractAddress;
        }
      }

      console.log('🏦 Extracted treasury address:', treasuryAddress);

      // If we couldn't extract the address, show a message with the tx hash
      if (!treasuryAddress) {
        console.error('Could not extract treasury address from logs');
        toast({
          title: 'Treasury Deployed!',
          description: `Treasury deployed but address extraction failed. Check tx: ${txReceipt?.transactionHash}`,
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
      // This will trigger a re-render showing the treasury management UI
      setLocalPod({
        ...localPod,
        treasury_contract_address: treasuryAddress,
      });

      // Force a small delay then trigger parent component refresh
      setTimeout(() => {
        // Trigger parent component refresh if needed
        window.dispatchEvent(
          new CustomEvent('treasury-deployed', {
            detail: { podId: localPod.id, treasuryAddress },
          }),
        );
      }, 1000);
    } catch (error) {
      console.error('Failed to process treasury deployment:', error);
      toast({
        title: 'Post-Deployment Error',
        description:
          'Treasury deployed but failed to update database. Please refresh the page.',
        variant: 'destructive',
      });
    }
  };

  // Handle deployment error
  const handleError = (error: Error) => {
    console.error('Treasury deployment failed:', error);
    toast({
      title: 'Deployment Failed',
      description: error.message || 'Treasury deployment encountered an error',
      variant: 'destructive',
    });
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
          {address && (
            <div className="pt-4 border-t">
              <Transaction
                account={address}
                chainId={8453} // Base mainnet
                calls={calls}
                isSponsored={true}
                onSuccess={handleSuccess}
                onError={handleError}
              >
                <TransactionButton
                  text={`Deploy Treasury for ${localPod.name}`}
                  className="w-full"
                />
                <TransactionSponsor />
                <TransactionStatus>
                  <TransactionStatusLabel />
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>
            </div>
          )}

          {!address && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Please connect your wallet to deploy the treasury contract.
              </AlertDescription>
            </Alert>
          )}

          {!canManageTreasury && address && (
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

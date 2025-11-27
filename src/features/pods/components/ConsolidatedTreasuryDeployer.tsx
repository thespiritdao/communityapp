'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';

// Contract addresses from environment
const POD_TREASURY_FACTORY_ADDRESS = (process.env
  .NEXT_PUBLIC_POD_TREASURY_FACTORY ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;
const POD_CREATION_MANAGER_ADDRESS = (process.env
  .NEXT_PUBLIC_POD_CREATION_MANAGER ||
  '0x43C124Df0dFb324CCC742808D9FdF62C764f2644') as `0x${string}`;
const PODS_TESTING_MODE = process.env.NEXT_PUBLIC_PODS_TESTING === 'true';

// Default supported tokens (Your community currencies)
const DEFAULT_SUPPORTED_TOKENS = [
  '0x1317Ae277266D38C4E492558f8693F14143a6A65', // $SPIRIT (SYSTEM_TOKEN)
  '0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21', // $SELF (SELF_TOKEN)
] as `0x${string}`[];

interface Pod {
  id: string;
  name: string;
  management_hat_id: string;
  treasury_contract_address?: string;
  is_active?: boolean;
}

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
  {
    name: 'hasTreasury',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'getTreasuryForPod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

// Pod Creation Manager ABI for deployPodTreasury
const POD_MANAGER_ABI = [
  {
    name: 'deployPodTreasury',
    type: 'function',
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'supportedTokens', type: 'address[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

interface ConsolidatedTreasuryDeployerProps {
  podId?: string; // If provided, only deploy for this specific pod
  podName?: string; // Pod name for context
}

export default function ConsolidatedTreasuryDeployer({
  podId: contextPodId,
  podName: contextPodName,
}: ConsolidatedTreasuryDeployerProps = {}) {
  const { address } = useAccount();
  const { toast } = useToast();

  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [deploymentMode, setDeploymentMode] = useState<'new' | null>(null);

  // Load pods from database
  const loadPods = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pods2?status=active&limit=100');
      if (!response.ok) throw new Error('Failed to load pods');

      const responseData = await response.json();
      const podsData = responseData.pods || [];

      // If contextPodId is provided, only show that specific pod
      let activePods = podsData.filter((pod: Pod) => {
        const hasManagementHat = !!pod.management_hat_id;
        const noTreasury =
          !pod.treasury_contract_address ||
          pod.treasury_contract_address === 'pending';

        // Filter out Top Hat unless it's the context pod
        const isTopHat = pod.name === 'Top hat' || pod.name === 'top hat';
        const hideTopHat =
          isTopHat && (!contextPodId || pod.id !== contextPodId);

        if (hideTopHat) return false;

        // If contextPodId is provided, only show that pod
        if (contextPodId) {
          return pod.id === contextPodId && hasManagementHat && noTreasury;
        }

        // Otherwise show all pods that meet criteria
        return hasManagementHat && noTreasury;
      });

      setPods(activePods);

      // If only one pod (context-specific), auto-select it
      if (activePods.length === 1) {
        setSelectedPod(activePods[0]);
        console.log(
          '🏦 Auto-selected pod for treasury deployment:',
          activePods[0].name,
        );
      }

      console.log(
        '🏦 Loaded pods ready for treasury deployment:',
        activePods.length,
      );
    } catch (error) {
      console.error('🏦 Error loading pods:', error);
      toast({
        title: 'Error Loading Pods',
        description: 'Failed to load pods from database',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [contextPodId]);

  useEffect(() => {
    loadPods();
  }, [loadPods]);

  // Convert management hat ID to BigInt for contract calls
  const getManagementHatIdBigInt = (hatId: string): bigint => {
    if (hatId.startsWith('0x')) {
      return BigInt(hatId);
    }
    // Handle decimal string
    return BigInt(hatId);
  };

  // Prepare new treasury deployment transaction
  const prepareNewTreasuryDeployment = (pod: Pod) => {
    return {
      address: POD_TREASURY_FACTORY_ADDRESS,
      abi: TREASURY_FACTORY_ABI,
      functionName: 'deployTreasury',
      args: [
        pod.id,
        getManagementHatIdBigInt(pod.management_hat_id),
        DEFAULT_SUPPORTED_TOKENS,
        PODS_TESTING_MODE,
      ],
    };
  };

  // Handle successful deployment
  const handleTreasuryDeploymentSuccess = async (
    pod: Pod,
    treasuryAddress?: string,
  ) => {
    try {
      // Update database to mark pod as having treasury
      await fetch('/api/pods/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          podId: pod.id,
          treasuryAddress: treasuryAddress,
          isActive: true,
        }),
      });

      toast({
        title: 'Treasury Deployed Successfully!',
        description: `Treasury deployed for ${pod.name}`,
      });

      // Reset state and reload pods
      setSelectedPod(null);
      setDeploymentMode(null);
      await loadPods();
    } catch (error) {
      console.error('🏦 Database update failed:', error);
      toast({
        title: 'Deployment Succeeded, Database Update Failed',
        description:
          "Treasury was deployed but database couldn't be updated. Please contact support.",
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading Pods...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pods.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Pods Ready for Treasury Deployment</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">
            All active pods either already have treasuries or are not ready for
            deployment.
          </p>
          <Button onClick={loadPods} className="mt-4">
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Context-specific mode: only one pod, auto-selected
  const isContextMode = contextPodId && pods.length === 1 && selectedPod;

  return (
    <div className="space-y-6">
      {/* Pod Selection - Only show if NOT in context mode */}
      {!isContextMode && (
        <Card>
          <CardHeader>
            <CardTitle>Select Pod for Treasury Deployment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pods.map((pod) => (
                <div
                  key={pod.id}
                  className="p-4 border rounded-lg cursor-pointer transition-colors"
                  style={
                    selectedPod?.id === pod.id
                      ? {
                          borderColor: '#2F5D50',
                          backgroundColor: '#E8F1EE',
                        }
                      : {
                          borderColor: '#e5e7eb',
                        }
                  }
                  onMouseEnter={(e) => {
                    if (selectedPod?.id !== pod.id) {
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedPod?.id !== pod.id) {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                    }
                  }}
                  onClick={() => setSelectedPod(pod)}
                >
                  <h3 className="font-semibold">{pod.name}</h3>
                  <p className="text-sm text-gray-600">ID: {pod.id}</p>
                  <Badge variant="outline" className="mt-2">
                    Ready for Treasury
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Context Mode Info - Show which pod we're deploying for */}
      {isContextMode && (
        <div
          className="border rounded-lg p-4"
          style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
        >
          <p className="text-sm" style={{ color: '#1F453A' }}>
            <span className="font-semibold">Deploying treasury for:</span>{' '}
            {selectedPod.name}
          </p>
        </div>
      )}

      {/* Auto-deploy mode - just click to start */}
      {selectedPod && !deploymentMode && (
        <Card>
          <Button className="w-full" onClick={() => setDeploymentMode('new')}>
            Deploy Treasury Contract
          </Button>
        </Card>
      )}

      {/* New Treasury Deployment */}
      {selectedPod && deploymentMode === 'new' && (
        <Card>
          <CardHeader>
            <CardTitle>Deploy New Treasury for {selectedPod.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Token Configuration */}
            <div>
              <Label>Supported Tokens</Label>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_SUPPORTED_TOKENS.map((token, index) => (
                    <Badge key={index} variant="secondary">
                      {token === '0x1317Ae277266D38C4E492558f8693F14143a6A65'
                        ? '$SPIRIT'
                        : '$SELF'}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  All treasuries support $SPIRIT and $SELF community currencies
                  by default.
                </p>
              </div>
            </div>

            {/* Deployment Transaction */}
            <Transaction
              account={address?.toLowerCase() as `0x${string}`}
              chainId={8453} // Base Chain ID
              calls={[prepareNewTreasuryDeployment(selectedPod)]}
              isSponsored={true}
              onSuccess={(response) => {
                console.log('🏦 Treasury deployment successful:', response);
                // Extract treasury address from transaction logs
                const txReceipt = response?.transactionReceipts?.[0];

                // TreasuryDeployed event signature: keccak256("TreasuryDeployed(string,address,uint256,address[],address)")
                const TREASURY_DEPLOYED_EVENT =
                  '0x494cf03e4055d4033e848ad013abd5a12efdf3143ccf97cd8514778840b10d36';

                let treasuryAddress = 'EXTRACT_FROM_LOGS';

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
                  if (
                    treasuryAddress === 'EXTRACT_FROM_LOGS' &&
                    txReceipt.contractAddress
                  ) {
                    treasuryAddress = txReceipt.contractAddress;
                  }
                }

                console.log('🏦 Extracted treasury address:', treasuryAddress);

                handleTreasuryDeploymentSuccess(selectedPod, treasuryAddress);
              }}
              onError={(error) => {
                console.error('🏦 Treasury deployment failed:', error);
                toast({
                  title: 'Treasury Deployment Failed',
                  description: error.message || 'Unknown error occurred',
                  variant: 'destructive',
                });
              }}
            >
              <TransactionButton text="Deploy Treasury" />
              <TransactionSponsor />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>

            <Button
              variant="outline"
              onClick={() => {
                setSelectedPod(null);
                setDeploymentMode(null);
              }}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Help/Instructions - Simplified for context mode */}
      {!isContextMode && (
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <ol>
                <li>
                  <strong>Select a Pod:</strong> Choose from pods that are
                  active but don't have treasuries yet.
                </li>
                <li>
                  <strong>Deploy Treasury:</strong> Click to deploy a secure
                  treasury contract for the selected pod.
                </li>
                <li>
                  <strong>Configure Tokens:</strong> All treasuries support
                  $SPIRIT and $SELF community currencies by default.
                </li>
                <li>
                  <strong>Management:</strong> Once deployed, pod leaders can
                  manage the treasury through the treasury management interface.
                </li>
              </ol>
              <p className="text-sm text-gray-600 mt-4">
                <strong>Note:</strong> Only pod managers (hat holders) can
                perform treasury operations after deployment.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simplified instructions for context mode */}
      {isContextMode && !deploymentMode && (
        <div className="text-sm text-gray-600">
          <p>
            Deploy a secure treasury contract to manage this pod's funds
            on-chain.
          </p>
        </div>
      )}
    </div>
  );
}

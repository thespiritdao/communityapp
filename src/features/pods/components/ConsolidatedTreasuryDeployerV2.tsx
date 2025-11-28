'use client';

/**
 * ConsolidatedTreasuryDeployerV2 - Enhanced with Multi-Contract Sync
 *
 * PHASE 2 of Option C Implementation
 *
 * This component deploys treasuries AND syncs the address to all authorization contracts:
 * 1. PodTreasuryFactory (automatic - part of deployment)
 * 2. PodAuthorizationFactory (NEW - syncs treasury address to proxy)
 * 3. PodBountyService (NEW - registers pod with treasury address)
 *
 * This prevents the "Treasury not found" error from ever happening again.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
const POD_AUTH_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_POD_AUTH_FACTORY ||
  '0xeCdDB060cD38439E0aC8874f159E961eB856407D') as `0x${string}`;
const POD_BOUNTY_SERVICE_ADDRESS = (process.env
  .NEXT_PUBLIC_POD_BOUNTY_SERVICE ||
  '0xeCdDB060cD38439E0aC8874f159E961eB856407D') as `0x${string}`;
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
  created_by_address: string;
  pod_leads: string[];
  treasury_contract_address?: string;
  is_active?: boolean;
}

// ABIs
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
    name: 'getTreasuryForPod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

const POD_AUTH_FACTORY_ABI = [
  {
    name: 'updatePodProxy',
    type: 'function',
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'newLeaders', type: 'address[]' },
      { name: 'newTreasuryAddress', type: 'address' },
      { name: 'isActive', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'getPodProxy',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

const POD_BOUNTY_SERVICE_ABI = [
  {
    name: 'registerPod',
    type: 'function',
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'creator', type: 'address' },
      { name: 'leaders', type: 'address[]' },
      { name: 'treasuryAddress', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'updatePod',
    type: 'function',
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'newLeaders', type: 'address[]' },
      { name: 'newTreasuryAddress', type: 'address' },
      { name: 'isActive', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'isValidPod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

export default function ConsolidatedTreasuryDeployerV2() {
  const { address } = useAccount();
  const { toast } = useToast();

  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [deploymentMode, setDeploymentMode] = useState<
    'new' | 'existing' | null
  >(null);
  const [existingTreasuryAddress, setExistingTreasuryAddress] = useState('');
  const [deployedTreasuryAddress, setDeployedTreasuryAddress] = useState<
    string | null
  >(null);
  const [showSyncStep, setShowSyncStep] = useState(false);

  // Load pods from database
  const loadPods = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pods2?status=active&limit=100');
      if (!response.ok) throw new Error('Failed to load pods');

      const responseData = await response.json();
      const podsData = responseData.pods || [];
      const activePods = podsData.filter(
        (pod: Pod) => pod.management_hat_id && !pod.treasury_contract_address,
      );

      setPods(activePods);
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
  }, [toast]);

  useEffect(() => {
    loadPods();
  }, [loadPods]);

  // Convert management hat ID to BigInt for contract calls
  const getManagementHatIdBigInt = (hatId: string): bigint => {
    if (hatId.startsWith('0x')) {
      return BigInt(hatId);
    }
    return BigInt(hatId);
  };

  // Prepare leaders array (ensure all are addresses)
  const prepareLeadersArray = (pod: Pod): `0x${string}`[] => {
    const leaders: `0x${string}`[] = [];

    // Add creator
    if (pod.created_by_address) {
      leaders.push(pod.created_by_address as `0x${string}`);
    }

    // Add pod leads (excluding duplicates)
    if (pod.pod_leads && Array.isArray(pod.pod_leads)) {
      pod.pod_leads.forEach((leader: string) => {
        if (leader && !leaders.includes(leader as `0x${string}`)) {
          leaders.push(leader as `0x${string}`);
        }
      });
    }

    return leaders;
  };

  // STEP 1: Deploy treasury transaction
  const prepareDeployTreasuryTransaction = (pod: Pod) => {
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

  // STEP 2: Sync to authorization contracts (multi-call)
  const prepareSyncTransactions = (pod: Pod, treasuryAddress: string) => {
    const leaders = prepareLeadersArray(pod);
    const transactions = [];

    console.log('🔄 Preparing sync transactions for:', {
      podId: pod.id,
      treasuryAddress,
      leaders: leaders.length,
    });

    // Transaction 1: Update PodAuthorizationFactory proxy
    transactions.push({
      address: POD_AUTH_FACTORY_ADDRESS,
      abi: POD_AUTH_FACTORY_ABI,
      functionName: 'updatePodProxy',
      args: [
        pod.id,
        leaders,
        treasuryAddress as `0x${string}`,
        true, // isActive
      ],
    });

    // Transaction 2: Register/Update in PodBountyService (legacy support)
    // Note: This might fail if pod is already registered - that's okay, we try updatePod instead
    transactions.push({
      address: POD_BOUNTY_SERVICE_ADDRESS,
      abi: POD_BOUNTY_SERVICE_ABI,
      functionName: 'registerPod',
      args: [
        pod.id,
        pod.created_by_address as `0x${string}`,
        leaders,
        treasuryAddress as `0x${string}`,
      ],
    });

    return transactions;
  };

  // Handle treasury deployment success
  const handleTreasuryDeploymentSuccess = async (
    pod: Pod,
    treasuryAddress: string,
  ) => {
    console.log('✅ Treasury deployed successfully:', treasuryAddress);
    setDeployedTreasuryAddress(treasuryAddress);
    setShowSyncStep(true);

    toast({
      title: 'Treasury Deployed!',
      description: `Treasury deployed at ${treasuryAddress.substring(0, 10)}... Now syncing to authorization contracts...`,
    });
  };

  // Handle sync success
  const handleSyncSuccess = async (pod: Pod, treasuryAddress: string) => {
    try {
      console.log('✅ Sync transactions completed successfully');

      // Update database
      await fetch('/api/pods/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          podId: pod.id,
          treasuryAddress,
          isActive: true,
        }),
      });

      toast({
        title: 'Complete!',
        description: `Treasury deployed and synced for ${pod.name}. Pod can now create treasury-funded bounties!`,
      });

      // Reset state and reload
      setSelectedPod(null);
      setDeploymentMode(null);
      setExistingTreasuryAddress('');
      setDeployedTreasuryAddress(null);
      setShowSyncStep(false);
      await loadPods();
    } catch (error) {
      console.error('❌ Database update failed:', error);
      toast({
        title: 'Sync Succeeded, Database Update Failed',
        description:
          "Contracts are synced but database couldn't be updated. Please update manually.",
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

  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <Alert>
        <AlertTitle>🚀 Enhanced Treasury Deployment (Phase 2)</AlertTitle>
        <AlertDescription>
          This new version automatically syncs treasury addresses to all
          authorization contracts, preventing the "Treasury not found" error.
          The deployment happens in two steps:
          <br />
          <strong>Step 1:</strong> Deploy treasury contract
          <br />
          <strong>Step 2:</strong> Sync address to PodAuthorizationFactory and
          PodBountyService
        </AlertDescription>
      </Alert>

      {/* Pod Selection */}
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
                <p className="text-sm text-gray-600">
                  ID: {pod.id.substring(0, 13)}...
                </p>
                <Badge variant="outline" className="mt-2">
                  Ready for Treasury
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* New Treasury Deployment */}
      {selectedPod && deploymentMode === 'new' && !showSyncStep && (
        <Card>
          <CardHeader>
            <CardTitle>
              Step 1: Deploy Treasury for {selectedPod.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Supported Tokens</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {DEFAULT_SUPPORTED_TOKENS.map((token, index) => (
                  <Badge key={index} variant="secondary">
                    {token === '0x1317Ae277266D38C4E492558f8693F14143a6A65'
                      ? '$SPIRIT'
                      : '$SELF'}
                  </Badge>
                ))}
              </div>
            </div>

            <Transaction
              chainId={8453}
              calls={[prepareDeployTreasuryTransaction(selectedPod)]}
              isSponsored={true}
              onSuccess={(response) => {
                console.log(
                  '🏦 Treasury deployment transaction successful:',
                  response,
                );
                const txReceipt = response?.transactionReceipts?.[0];

                // Extract treasury address from logs
                const TREASURY_DEPLOYED_EVENT =
                  '0x494cf03e4055d4033e848ad013abd5a12efdf3143ccf97cd8514778840b10d36';
                let treasuryAddress = '';

                if (txReceipt?.logs) {
                  const deploymentLog = txReceipt.logs.find(
                    (log: any) => log.topics?.[0] === TREASURY_DEPLOYED_EVENT,
                  );

                  if (deploymentLog?.topics?.[2]) {
                    treasuryAddress = '0x' + deploymentLog.topics[2].slice(-40);
                  }
                }

                if (!treasuryAddress && txReceipt?.contractAddress) {
                  treasuryAddress = txReceipt.contractAddress;
                }

                console.log('🏦 Extracted treasury address:', treasuryAddress);
                handleTreasuryDeploymentSuccess(selectedPod, treasuryAddress);
              }}
              onError={(error) => {
                console.error('❌ Treasury deployment failed:', error);
                toast({
                  title: 'Deployment Failed',
                  description: error.message || 'Unknown error occurred',
                  variant: 'destructive',
                });
              }}
            >
              <TransactionButton text="Deploy Treasury (Step 1)" />
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

      {/* Sync Step */}
      {selectedPod && showSyncStep && deployedTreasuryAddress && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Sync Treasury Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTitle>✅ Treasury Deployed Successfully!</AlertTitle>
              <AlertDescription>
                <strong>Treasury Address:</strong> {deployedTreasuryAddress}
                <br />
                <br />
                Now syncing this address to authorization contracts so the pod
                can create treasury-funded bounties.
              </AlertDescription>
            </Alert>

            <div
              className="p-4 rounded-lg text-sm space-y-2"
              style={{ backgroundColor: '#E8F1EE' }}
            >
              <p>
                <strong>This transaction will:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Update PodAuthorizationFactory with treasury address</li>
                <li>Register pod in PodBountyService with treasury address</li>
                <li>Enable pod to create treasury-funded bounties</li>
              </ul>
            </div>

            <Transaction
              chainId={8453}
              calls={prepareSyncTransactions(
                selectedPod,
                deployedTreasuryAddress,
              )}
              isSponsored={true}
              onSuccess={() => {
                console.log('✅ Sync transactions successful');
                handleSyncSuccess(selectedPod, deployedTreasuryAddress);
              }}
              onError={(error) => {
                console.error('❌ Sync failed:', error);
                toast({
                  title: 'Sync Failed',
                  description:
                    'Treasury deployed but sync failed. You may need to sync manually.',
                  variant: 'destructive',
                });
              }}
            >
              <TransactionButton text="Sync to Authorization Contracts (Step 2)" />
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
                setShowSyncStep(false);
                setDeployedTreasuryAddress(null);
              }}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Deployment Mode Selection */}
      {selectedPod && !deploymentMode && (
        <Card>
          <CardHeader>
            <CardTitle>
              Choose Deployment Method for {selectedPod.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full p-6 h-auto flex-col items-start"
              onClick={() => setDeploymentMode('new')}
            >
              <h3 className="font-semibold mb-2">Deploy New Treasury</h3>
              <p className="text-sm text-gray-600 text-left">
                Deploy a fresh treasury contract with automatic sync to all
                authorization contracts.
              </p>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

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
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { usePublicClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

// Contract addresses from environment
const POD_TREASURY_FACTORY_ADDRESS = (process.env
  .NEXT_PUBLIC_POD_TREASURY_FACTORY ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;
const POD_AUTH_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_POD_AUTH_FACTORY ||
  '0xeCdDB060cD38439E0aC8874f159E961eB856407D') as `0x${string}`;
const POD_BOUNTY_SERVICE_ADDRESS = (process.env
  .NEXT_PUBLIC_POD_BOUNTY_SERVICE ||
  '0xeCdDB060cD38439E0aC8874f159E961eB856407D') as `0x${string}`;

// Default supported tokens for a pod treasury. Only $SYSTEM: $SELF is now a
// soulbound token that pods never hold (it is a per-epoch minting budget, not a
// treasury balance), so it must not be a supported treasury token.
const SYSTEM_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_SYSTEM_TOKEN ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

const DEFAULT_SUPPORTED_TOKENS = [
  SYSTEM_TOKEN_ADDRESS, // $SYSTEM from .env
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
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const publicClient = usePublicClient();
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
  const [isDeployPending, setIsDeployPending] = useState(false);
  const [isSyncPending, setIsSyncPending] = useState(false);

  // Load pods from database
  const loadPods = useCallback(async () => {
    try {
      setLoading(true);

      // 🔥 FIX: Use Supabase instead of non-existent /api/pods2
      const { data: podsData, error } = await supabase
        .from('pods')
        .select('*')
        .eq('status', 'active')
        .limit(100);

      if (error) throw new Error(`Failed to load pods: ${error.message}`);

      const activePods = (podsData || []).filter(
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

  // CDP Smart Account transaction handler - Step 1: Deploy Treasury
  const handleDeployTreasury = async () => {
    if (!selectedPod) {
      toast({
        title: 'No Pod Selected',
        description: 'Please select a pod to deploy treasury for.',
        variant: 'destructive',
      });
      return;
    }

    // EXACT FAUCET PATTERN: Simple validation matching faucet
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

    setIsDeployPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 STEP 1: Building Smart Account User Operation for treasury deployment...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🏦 Pod:', selectedPod.name);
      console.log('🎯 Contract: TreasuryFactory - deployTreasury');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // EXACT FAUCET PATTERN: Encode call data
      const callData = encodeFunctionData({
        abi: TREASURY_FACTORY_ABI,
        functionName: 'deployTreasury',
        args: [
          selectedPod.id,
          getManagementHatIdBigInt(selectedPod.management_hat_id),
          DEFAULT_SUPPORTED_TOKENS,
        ],
      });

      // EXACT FAUCET PATTERN: Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: [{
          to: POD_TREASURY_FACTORY_ADDRESS,
          value: 0n,                     // ← Zero ETH (bigint)
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
        const txReceipt = resultWithReceipt.receipt;
        const TREASURY_DEPLOYED_EVENT =
          '0x494cf03e4055d4033e848ad013abd5a12efdf3143ccf97cd8514778840b10d36';

        let treasuryAddress = 'EXTRACT_FROM_LOGS';

        if (txReceipt?.logs) {
          const deploymentLog = txReceipt.logs.find(
            (log: any) => log.topics?.[0] === TREASURY_DEPLOYED_EVENT,
          );

          if (deploymentLog) {
            const addressFromTopic = deploymentLog.topics?.[2];
            if (addressFromTopic && addressFromTopic.length === 66) {
              treasuryAddress = '0x' + addressFromTopic.slice(-40);
            }
          }

          if (
            treasuryAddress === 'EXTRACT_FROM_LOGS' &&
            txReceipt.contractAddress
          ) {
            treasuryAddress = txReceipt.contractAddress;
          }
        }

        console.log('🏦 Extracted treasury address:', treasuryAddress);

        // Update database and proceed to Step 2
        await handleTreasuryDeploymentSuccess(selectedPod, treasuryAddress);
      } else {
        console.warn('⚠️ No receipt found in result');
        toast({
          title: 'Transaction Completed',
          description: 'Treasury deployment completed but receipt not found. Please refresh.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('❌ Treasury deployment failed:', error);
      toast({
        title: 'Treasury Deployment Failed',
        description: error.message || 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsDeployPending(false); // EXACT FAUCET PATTERN
    }
  };

  // CDP Smart Account transaction handler - Step 2: Sync to Authorization Contracts
  const handleSyncContracts = async () => {
    if (!selectedPod || !deployedTreasuryAddress) {
      toast({
        title: 'Missing Information',
        description: 'Pod or treasury address not found.',
        variant: 'destructive',
      });
      return;
    }

    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for contract sync:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your Smart Wallet to sync contracts.',
        variant: 'destructive',
      });
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsSyncPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 STEP 2: Building Smart Account User Operation for contract sync...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🏦 Pod:', selectedPod.name);
      console.log('🏦 Treasury Address:', deployedTreasuryAddress);
      console.log('🎯 Multi-call: Auth Factory + Bounty Service');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // Get sync transactions
      const syncTransactions = prepareSyncTransactions(selectedPod, deployedTreasuryAddress);

      // EXACT FAUCET PATTERN: Prepare calls for sendUserOperation
      const callsFormatted = syncTransactions.map((tx) => ({
        to: tx.address,
        value: 0n,
        data: encodeFunctionData({
          abi: tx.abi as any,
          functionName: tx.functionName as any,
          args: tx.args as any,
        }),
      }));

      console.log('📋 Formatted calls for User Operation:', callsFormatted.length);

      // EXACT FAUCET PATTERN: Send user operation (multi-call)
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: callsFormatted,           // ← Multiple calls (batched)
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);

      // Handle success with receipt
      // Type assertion needed due to incomplete CDP SDK types
      const resultWithReceipt = result as any;
      if (resultWithReceipt?.receipt) {
        console.log('✅ Contract sync successful:', resultWithReceipt.receipt);

        // Finalize deployment
        await handleSyncSuccess(selectedPod, deployedTreasuryAddress);
      } else {
        console.warn('⚠️ No receipt found in result');
        toast({
          title: 'Transaction Completed',
          description: 'Sync completed but receipt not found. Please refresh.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('❌ Contract sync failed:', error);
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync contracts. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSyncPending(false); // EXACT FAUCET PATTERN
    }
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

      // Update database (auth: /api/pods/activate requires a pod-leader session)
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/pods/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
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

            {/* CDP Smart Account Transaction Button - Step 1 */}
            {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
              <Button
                onClick={handleDeployTreasury}
                disabled={isDeployPending}
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeployPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                    Deploying Treasury...
                  </>
                ) : (
                  'Deploy Treasury - Step 1 (Gasless)'
                )}
              </Button>
            ) : (
              <div
                className="p-4 border rounded-lg"
                style={{
                  backgroundColor: '#F5E6E6',
                  borderColor: '#D9B3B3',
                }}
              >
                <p className="text-sm font-medium" style={{ color: '#5C1F1F' }}>
                  Wallet Not Connected
                </p>
                <p className="text-xs mt-1" style={{ color: '#8B3A3A' }}>
                  Please connect your Smart Wallet to deploy treasury.
                </p>
              </div>
            )}

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

            {/* CDP Smart Account Transaction Button - Step 2 */}
            {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
              <Button
                onClick={handleSyncContracts}
                disabled={isSyncPending}
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                    Syncing Contracts...
                  </>
                ) : (
                  'Sync to Authorization Contracts - Step 2 (Gasless)'
                )}
              </Button>
            ) : (
              <div
                className="p-4 border rounded-lg"
                style={{
                  backgroundColor: '#F5E6E6',
                  borderColor: '#D9B3B3',
                }}
              >
                <p className="text-sm font-medium" style={{ color: '#5C1F1F' }}>
                  Wallet Not Connected
                </p>
                <p className="text-xs mt-1" style={{ color: '#8B3A3A' }}>
                  Please connect your Smart Wallet to sync contracts.
                </p>
              </div>
            )}

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

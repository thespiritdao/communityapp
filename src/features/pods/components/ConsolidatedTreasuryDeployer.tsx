'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

// Contract addresses from environment
const POD_TREASURY_FACTORY_ADDRESS = (process.env
  .NEXT_PUBLIC_POD_TREASURY_FACTORY ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;
const POD_CREATION_MANAGER_ADDRESS = process.env
  .NEXT_PUBLIC_POD_CREATION_MANAGER as `0x${string}`;
const PODS_TESTING_MODE = process.env.NEXT_PUBLIC_PODS_TESTING === 'true';

// Default supported tokens from environment (Your community currencies)
const SYSTEM_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_SYSTEM_TOKEN ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;
const SELF_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_SELF_TOKEN ||
  '0x0000000000000000000000000000000000000000') as `0x${string}`;

const DEFAULT_SUPPORTED_TOKENS = [
  SYSTEM_TOKEN_ADDRESS, // $SYSTEM from .env
  SELF_TOKEN_ADDRESS,   // $SELF from .env
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
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const publicClient = usePublicClient();
  const { toast } = useToast();

  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [deploymentMode, setDeploymentMode] = useState<'new' | null>(null);
  const [isTransactionPending, setIsTransactionPending] = useState(false);

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

      console.log('🔍 Treasury Deployment Filter Debug:', {
        totalPodsFromDB: podsData?.length || 0,
        contextPodId,
        contextPodName,
      });

      // If contextPodId is provided, only show that specific pod
      let activePods = (podsData || []).filter((pod: Pod) => {
        const hasManagementHat = !!pod.management_hat_id;
        const noTreasury =
          !pod.treasury_contract_address ||
          pod.treasury_contract_address === 'pending';

        // Filter out Top Hat unless it's the context pod
        const isTopHat = pod.name === 'Top hat' || pod.name === 'top hat';
        const hideTopHat =
          isTopHat && (!contextPodId || pod.id !== contextPodId);

        const filterDebug = {
          podName: pod.name,
          podId: pod.id,
          managementHatId: pod.management_hat_id,
          treasuryAddress: pod.treasury_contract_address,
          hasManagementHat,
          noTreasury,
          hideTopHat,
        };

        if (hideTopHat) {
          console.log('❌ Filtered out (Top Hat):', filterDebug);
          return false;
        }

        // If contextPodId is provided, only show that pod
        if (contextPodId) {
          const matches = pod.id === contextPodId && hasManagementHat && noTreasury;
          console.log(
            matches ? '✅ Pod matches context filter:' : '❌ Pod rejected by context filter:',
            {
              ...filterDebug,
              matchesId: pod.id === contextPodId,
              reason: !matches
                ? pod.id !== contextPodId
                  ? 'ID mismatch'
                  : !hasManagementHat
                    ? 'No management HAT'
                    : 'Has treasury'
                : 'All checks passed',
            },
          );
          return matches;
        }

        // Otherwise show all pods that meet criteria
        const passes = hasManagementHat && noTreasury;
        if (!passes) {
          console.log('❌ Pod rejected by criteria:', filterDebug);
        }
        return passes;
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

  // CDP Smart Account transaction handler - EXACT FAUCET PATTERN
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

    setIsTransactionPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for treasury deployment...');
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
          PODS_TESTING_MODE,
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

        // Update database
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

      // 🔄 AUTOMATIC RECOVERY: If treasury already exists, fetch it from contract
      if (error?.message?.includes('Treasury already exists')) {
        console.log('🔄 Treasury already exists! Attempting automatic recovery...');

        try {
          // Query factory contract for existing treasury address
          const FACTORY_ABI = [
            {
              name: 'podTreasuries',
              type: 'function',
              inputs: [{ name: 'podId', type: 'string' }],
              outputs: [{ name: '', type: 'address' }],
              stateMutability: 'view',
            },
          ] as const;

          const existingTreasury = await publicClient.readContract({
            address: POD_TREASURY_FACTORY_ADDRESS,
            abi: FACTORY_ABI,
            functionName: 'podTreasuries',
            args: [selectedPod.id],
          });

          console.log('✅ Found existing treasury:', existingTreasury);

          if (
            existingTreasury &&
            existingTreasury !== '0x0000000000000000000000000000000000000000'
          ) {
            // Update database with existing treasury
            await handleTreasuryDeploymentSuccess(selectedPod, existingTreasury as string);

            toast({
              title: 'Treasury Recovered!',
              description:
                'Found and linked existing treasury: ' +
                existingTreasury.slice(0, 6) +
                '...' +
                existingTreasury.slice(-4),
            });

            return; // Exit successfully
          }
        } catch (recoveryError) {
          console.error('❌ Automatic recovery failed:', recoveryError);
          toast({
            title: 'Treasury Exists But Recovery Failed',
            description:
              'A treasury already exists on-chain. Please contact support to recover it.',
            variant: 'destructive',
          });
          return;
        }
      }

      toast({
        title: 'Treasury Deployment Failed',
        description: error.message || 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
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

            {/* CDP Smart Account Transaction Button */}
            {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
              <Button
                onClick={handleDeployTreasury}
                disabled={isTransactionPending}
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTransactionPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                    Deploying Treasury...
                  </>
                ) : (
                  'Deploy Treasury (Gasless)'
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

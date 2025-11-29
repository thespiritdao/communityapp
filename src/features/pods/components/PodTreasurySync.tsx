'use client';

import { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import type { LifecycleStatus } from '@coinbase/onchainkit/transaction';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Contract addresses from environment
const POD_AUTH_FACTORY_ADDRESS = process.env
  .NEXT_PUBLIC_POD_AUTH_FACTORY as `0x${string}`;
const POD_BOUNTY_SERVICE_ADDRESS = process.env
  .NEXT_PUBLIC_POD_BOUNTY_SERVICE as `0x${string}`;
const TREASURY_PROXY_ADDRESS = process.env
  .NEXT_PUBLIC_TREASURY_PROXY as `0x${string}`;

// ABIs
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
    name: 'podProxies',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

const POD_PROXY_ABI = [
  {
    name: 'treasuryAddress',
    type: 'function',
    inputs: [],
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

interface Pod {
  id: string;
  name: string;
  treasury_contract_address: string | null;
  pod_leads: string[];
  created_by_address: string;
  is_active: boolean;
}

interface SyncStatus {
  podAuthFactory: 'unknown' | 'synced' | 'unsynced' | 'error';
  podBountyService: 'unknown' | 'synced' | 'unsynced' | 'error';
}

export default function PodTreasurySync() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [pods, setPods] = useState<Pod[]>([]);
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    podAuthFactory: 'unknown',
    podBountyService: 'unknown',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<
    'idle' | 'auth-factory' | 'bounty-service' | 'complete'
  >('idle');

  // Fetch pods with treasuries
  useEffect(() => {
    fetchPodsWithTreasuries();
  }, []);

  const fetchPodsWithTreasuries = async () => {
    try {
      console.log('🔍 Starting fetchPodsWithTreasuries...');
      console.log('✅ Using Supabase client');

      const { data, error: fetchError } = await supabase
        .from('pods')
        .select(
          'id, name, treasury_contract_address, pod_leads, created_by_address, is_active',
        )
        .not('treasury_contract_address', 'is', null)
        .order('created_at', { ascending: false });

      console.log('📊 Query completed');
      console.log('   Error:', fetchError);
      console.log('   Data:', data);
      console.log(`   Found ${data?.length || 0} pods with treasury addresses`);

      if (fetchError) {
        console.error('❌ Fetch error:', fetchError);
        throw fetchError;
      }

      if (data && data.length > 0) {
        console.log('✅ Setting pods state with:', data);
        data.forEach((pod, idx) => {
          console.log(
            `   ${idx + 1}. ${pod.name} - ${pod.treasury_contract_address}`,
          );
        });
      } else {
        console.warn('⚠️ No pods returned from query');
      }

      setPods(data || []);

      // If no pods found, show helpful message
      if (!data || data.length === 0) {
        setError(
          'No pods found with treasury addresses. Make sure the Executive Pod has a treasury_contract_address set in the database.',
        );
      } else {
        setError(null);
      }
    } catch (err) {
      console.error('❌ Error fetching pods:', err);
      setError('Failed to load pods');
    }
  };

  const checkSyncStatus = async (pod: Pod) => {
    if (!pod.treasury_contract_address || !publicClient) return;

    setLoading(true);
    setSyncStatus({
      podAuthFactory: 'unknown',
      podBountyService: 'unknown',
    });

    try {
      console.log('🔍 Checking onchain sync status...');

      // First, get the proxy address from the factory
      const proxyAddress = (await publicClient.readContract({
        address: POD_AUTH_FACTORY_ADDRESS,
        abi: POD_AUTH_FACTORY_ABI,
        functionName: 'podProxies',
        args: [pod.id],
      })) as `0x${string}`;

      console.log(`  Proxy address: ${proxyAddress}`);

      if (proxyAddress === '0x0000000000000000000000000000000000000000') {
        console.log('  ❌ No proxy exists - pod needs to be created first');
        setSyncStatus({
          podAuthFactory: 'error',
          podBountyService: 'error',
        });
        setError(
          'Pod proxy does not exist in PodAuthorizationFactory. Contact admin.',
        );
        return;
      }

      // Get the current treasury address from the proxy
      const onchainTreasury = (await publicClient.readContract({
        address: proxyAddress,
        abi: POD_PROXY_ABI,
        functionName: 'treasuryAddress',
      })) as string;

      console.log(`  Onchain treasury: ${onchainTreasury}`);
      console.log(`  Expected treasury: ${pod.treasury_contract_address}`);

      // Compare addresses (case-insensitive)
      const isSynced =
        onchainTreasury.toLowerCase() ===
        pod.treasury_contract_address.toLowerCase();

      console.log(`  Is synced: ${isSynced}`);

      setSyncStatus({
        podAuthFactory: isSynced ? 'synced' : 'unsynced',
        podBountyService: 'unknown', // We'll skip this for now
      });

      if (isSynced) {
        setError(null);
      }
    } catch (err: any) {
      console.error('Error checking sync status:', err);
      setSyncStatus({
        podAuthFactory: 'error',
        podBountyService: 'error',
      });
      setError(`Failed to check sync status: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePodSelect = (pod: Pod) => {
    setSelectedPod(pod);
    setCurrentStep('idle');
    setError(null);
    checkSyncStatus(pod);
  };

  const prepareAuthFactoryTransaction = () => {
    if (!selectedPod || !selectedPod.treasury_contract_address) return [];

    return [
      {
        address: POD_AUTH_FACTORY_ADDRESS,
        abi: POD_AUTH_FACTORY_ABI,
        functionName: 'updatePodProxy',
        args: [
          selectedPod.id,
          selectedPod.pod_leads as `0x${string}`[],
          selectedPod.treasury_contract_address as `0x${string}`,
          true,
        ],
      },
    ];
  };

  const prepareBountyServiceTransaction = () => {
    if (!selectedPod || !selectedPod.treasury_contract_address) return [];

    // We'll try registerPod - if it fails due to already existing, user can try updatePod separately
    return [
      {
        address: POD_BOUNTY_SERVICE_ADDRESS,
        abi: POD_BOUNTY_SERVICE_ABI,
        functionName: 'registerPod',
        args: [
          selectedPod.id,
          selectedPod.created_by_address as `0x${string}`,
          selectedPod.pod_leads as `0x${string}`[],
          selectedPod.treasury_contract_address as `0x${string}`,
        ],
      },
    ];
  };

  const handleAuthFactoryStatus = (status: LifecycleStatus) => {
    console.log('Auth Factory Transaction Status:', status);

    if (status.statusName === 'success') {
      setSyncStatus((prev) => ({ ...prev, podAuthFactory: 'synced' }));
      setCurrentStep('complete');
    } else if (status.statusName === 'error') {
      setSyncStatus((prev) => ({ ...prev, podAuthFactory: 'error' }));
      setError('Failed to sync to PodAuthorizationFactory');
    }
  };

  const handleBountyServiceStatus = (status: LifecycleStatus) => {
    console.log('Bounty Service Transaction Status:', status);

    if (status.statusName === 'success') {
      setSyncStatus((prev) => ({ ...prev, podBountyService: 'synced' }));
      setCurrentStep('complete');
    } else if (status.statusName === 'error') {
      setSyncStatus((prev) => ({ ...prev, podBountyService: 'error' }));
      setError(
        'Failed to sync to PodBountyService (it may already be registered)',
      );
    }
  };

  const isUserPodLeader = () => {
    if (!address || !selectedPod) return false;
    return selectedPod.pod_leads.some(
      (leader) => leader.toLowerCase() === address.toLowerCase(),
    );
  };

  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'synced':
        return (
          <Badge className="text-white bg-[#3F7A5A]">
            <CheckCircle className="h-3 w-3 mr-1" /> Synced
          </Badge>
        );
      case 'unsynced':
        return (
          <Badge
            variant="outline"
            style={{
              borderColor: '#C6933F',
              color: '#8F6B2F',
              backgroundColor: '#FAF4EC',
            }}
          >
            <AlertCircle className="h-3 w-3 mr-1" /> Needs Sync
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" /> Error
          </Badge>
        );
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Pod Treasury Sync
          </CardTitle>
          <CardDescription>
            Sync pod treasury addresses to blockchain authorization contracts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connection Status */}
          {!isConnected && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please connect your wallet to sync pod treasuries.
              </AlertDescription>
            </Alert>
          )}

          {/* Pod Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Pod</label>
            <select
              className="w-full p-2 border rounded-md"
              value={selectedPod?.id || ''}
              onChange={(e) => {
                const pod = pods.find((p) => p.id === e.target.value);
                if (pod) handlePodSelect(pod);
              }}
              disabled={!isConnected || loading}
            >
              <option value="">-- Select a pod --</option>
              {pods.map((pod) => (
                <option key={pod.id} value={pod.id}>
                  {pod.name}
                </option>
              ))}
            </select>
          </div>

          {/* Selected Pod Info */}
          {selectedPod && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                <div>
                  <span className="text-sm font-medium">Pod Name:</span>
                  <p className="text-sm text-gray-600">{selectedPod.name}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Treasury Address:</span>
                  <p className="text-sm font-mono text-gray-600 break-all">
                    {selectedPod.treasury_contract_address}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium">Pod Leaders:</span>
                  <div className="space-y-1">
                    {selectedPod.pod_leads.map((leader, idx) => (
                      <p
                        key={idx}
                        className="text-sm font-mono text-gray-600 break-all"
                      >
                        {leader}
                        {address &&
                          leader.toLowerCase() === address.toLowerCase() && (
                            <Badge variant="outline" className="ml-2">
                              You
                            </Badge>
                          )}
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              {/* Authorization Check */}
              {!isUserPodLeader() && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You are not a pod leader. Only pod leaders can sync treasury
                    data.
                  </AlertDescription>
                </Alert>
              )}

              {/* Sync Status */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Sync Status:</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-white border rounded-lg">
                    <span className="text-sm">PodAuthorizationFactory</span>
                    <StatusBadge status={syncStatus.podAuthFactory} />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white border rounded-lg">
                    <span className="text-sm">PodBountyService</span>
                    <StatusBadge status={syncStatus.podBountyService} />
                  </div>
                </div>
              </div>

              {/* Sync Actions */}
              {isUserPodLeader() && (
                <div className="space-y-4">
                  {/* Step 1: Sync to PodAuthorizationFactory */}
                  {currentStep === 'idle' &&
                    syncStatus.podAuthFactory === 'unsynced' && (
                      <div className="space-y-3">
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>Step 1 of 2:</strong> Sync treasury to
                            PodAuthorizationFactory (required for bounty
                            creation)
                          </AlertDescription>
                        </Alert>

                        <Transaction
                          chainId={8453} // Base mainnet
                          calls={prepareAuthFactoryTransaction()}
                          onStatus={handleAuthFactoryStatus}
                        >
                          <TransactionButton
                            className="w-full"
                            text="Sync to PodAuthorizationFactory"
                          />
                          <TransactionStatus>
                            <TransactionStatusLabel />
                            <TransactionStatusAction />
                          </TransactionStatus>
                        </Transaction>
                      </div>
                    )}

                  {/* Step 2: Sync to PodBountyService */}
                  {currentStep === 'idle' &&
                    syncStatus.podBountyService === 'unsynced' && (
                      <div className="space-y-3">
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>Step 2 of 2 (Optional):</strong> Register
                            pod in PodBountyService for legacy support
                          </AlertDescription>
                        </Alert>

                        <Transaction
                          chainId={8453}
                          calls={prepareBountyServiceTransaction()}
                          onStatus={handleBountyServiceStatus}
                        >
                          <TransactionButton
                            className="w-full"
                            text="Register in PodBountyService"
                          />
                          <TransactionStatus>
                            <TransactionStatusLabel />
                            <TransactionStatusAction />
                          </TransactionStatus>
                        </Transaction>
                      </div>
                    )}

                  {/* Success State */}
                  {currentStep === 'complete' && (
                    <Alert
                      style={{
                        backgroundColor: '#D1E6DC',
                        borderColor: '#B8D9CA',
                      }}
                    >
                      <CheckCircle
                        className="h-4 w-4"
                        style={{ color: '#3F7A5A' }}
                      />
                      <AlertDescription style={{ color: '#1F453A' }}>
                        <strong>Success!</strong> Treasury sync complete. You
                        can now create pod-funded bounties.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {/* Error Display */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Helpful Links */}
              <div className="pt-4 border-t">
                <h3 className="text-sm font-medium mb-2">Helpful Links:</h3>
                <div className="space-y-1">
                  <a
                    href={`https://basescan.org/address/${POD_AUTH_FACTORY_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm hover:underline"
                    style={{ color: '#3F7A5A' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#2F5D50';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#3F7A5A';
                    }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View PodAuthorizationFactory on BaseScan
                  </a>
                  <a
                    href={`https://basescan.org/address/${POD_BOUNTY_SERVICE_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm hover:underline"
                    style={{ color: '#3F7A5A' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#2F5D50';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#3F7A5A';
                    }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View PodBountyService on BaseScan
                  </a>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p>
            1. <strong>Select a pod</strong> that has a treasury deployed
          </p>
          <p>
            2. <strong>Connect your wallet</strong> (must be a pod leader)
          </p>
          <p>
            3. <strong>Sync to PodAuthorizationFactory</strong> - This updates
            the authorization contract that BountyManager queries
          </p>
          <p>
            4. <strong>(Optional) Register in PodBountyService</strong> - For
            legacy support
          </p>
          <p>
            5. <strong>Done!</strong> Your pod can now create treasury-funded
            bounties
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Wallet, Building2, Flame } from 'lucide-react';
import { PodService } from '../../pods/services/PodService';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import { supabase } from '@/lib/supabase';
import type { Pod } from '../../pods/types';

export interface FundDestination {
  type: 'wallet' | 'pod_treasury';
  label: string;
  value: string;
  podId?: string;
  treasuryAddress?: string;
  description: string;
}

interface PodTreasurySelectorProps {
  value?: string;
  onValueChange: (destination: FundDestination) => void;
  className?: string;
}

export function PodTreasurySelector({ value, onValueChange, className }: PodTreasurySelectorProps) {
  const { address } = useAccount();
  const [fundDestinations, setFundDestinations] = useState<FundDestination[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDestination, setSelectedDestination] = useState<FundDestination | undefined>();

  useEffect(() => {
    loadAvailableDestinations();
  }, [address]);

  // Sync selectedDestination with incoming value prop
  useEffect(() => {
    if (value && fundDestinations.length > 0) {
      const destination = fundDestinations.find(d => d.value === value);
      if (destination) {
        console.log('🎯 Setting selected destination from prop value:', destination);
        setSelectedDestination(destination);
      }
    }
  }, [value, fundDestinations]);

  const loadAvailableDestinations = async () => {
    if (!address) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      console.log('🎯 Loading fund destinations for user:', address);

      // Get user's token balances to check pod permissions
      const tokenBalances = await fetchTokenBalances(address);
      console.log('🎯 User token balances:', tokenBalances);

      // Get all active pods
      const allPods = await PodService.getAllPods();
      console.log('🎯 All pods:', allPods);

      // ✅ UNIFIED PERMISSIONS: Query marketplace_enabled module
      const { data: podModules, error: modulesError } = await supabase
        .from('pod_modules')
        .select('pod_id, marketplace_enabled');

      if (modulesError) {
        console.error('🎯 Error fetching pod modules:', modulesError);
      }

      // Create a map of pod_id -> marketplace_enabled
      const moduleMap = new Map<string, boolean>();
      podModules?.forEach(module => {
        moduleMap.set(module.pod_id, module.marketplace_enabled ?? false);
      });

      console.log(`🎯 Loaded ${moduleMap.size} pod modules for fund destination check`);

      const destinations: FundDestination[] = [];

      // Check each pod for leader permissions
      for (const pod of allPods) {
        try {
          // ✅ UNIFIED PERMISSIONS: Two-tier check - module must be enabled
          const hasMarketplaceModule = moduleMap.get(pod.id) ?? false;

          if (!hasMarketplaceModule) {
            console.log(`🚫 [Fund Destination] Skipping ${pod.name} - marketplace module disabled`);
            continue;
          }

          // Check if user has management permissions for this pod
          const hasLeaderToken = await checkPodLeaderPermissions(pod, address, tokenBalances);

          if (hasLeaderToken && pod.treasury_contract_address) {
            destinations.push({
              type: 'pod_treasury',
              label: `${pod.name} Treasury`,
              value: `pod_${pod.id}`,
              podId: pod.id,
              treasuryAddress: pod.treasury_contract_address,
              description: `Route funds to ${pod.name} treasury for pod operations`
            });
            console.log(`✅ [Fund Destination] User can route to ${pod.name} treasury (Module: ON, Permission: YES)`);
          } else {
            console.log(`❌ [Fund Destination] User cannot route to ${pod.name} treasury - missing leader permissions (Module: ON, Permission: NO)`);
          }
        } catch (error) {
          console.error(`Error checking permissions for pod ${pod.name}:`, error);
        }
      }

      // Add personal wallet option
      destinations.push({
        type: 'wallet',
        label: 'My Wallet',
        value: 'my_wallet',
        description: 'Route funds directly to your personal wallet'
      });

      console.log('🎯 Available fund destinations:', destinations);
      setFundDestinations(destinations);

      // Set default to first pod treasury if available, otherwise wallet
      if (destinations.length > 0 && !value) {
        const defaultDestination = destinations.find(d => d.type === 'pod_treasury') || destinations[0];
        setSelectedDestination(defaultDestination);
        onValueChange(defaultDestination);
      }

    } catch (error) {
      console.error('Error loading fund destinations:', error);
      // Fallback to wallet only
      const fallbackDestinations: FundDestination[] = [
        {
          type: 'wallet',
          label: 'My Wallet',
          value: 'my_wallet',
          description: 'Route funds directly to your personal wallet'
        }
      ];
      setFundDestinations(fallbackDestinations);
    } finally {
      setIsLoading(false);
    }
  };

  const checkPodLeaderPermissions = async (pod: Pod, userAddress: string, tokenBalances: any): Promise<boolean> => {
    try {
      // Check if user has Executive Pod (can manage all treasuries)
      if (tokenBalances.hasExecutivePod) {
        console.log(`👑 User has Executive Pod - can manage ${pod.name} treasury`);
        return true;
      }

      // For specific pod leadership, we need to check management_hat_id
      if (pod.management_hat_id) {
        // Check if user has the management hat for this specific pod
        const { createPublicClient, http } = await import('viem');
        const { base } = await import('viem/chains');
        
        const publicClient = createPublicClient({
          chain: base,
          transport: http()
        });

        const hatsContract = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
        
        if (!hatsContract) {
          console.warn('🎩 HATS_CONTRACT not configured');
          return false;
        }

        const HATS_ABI = [
          {
            inputs: [
              { name: "account", type: "address" },
              { name: "hat", type: "uint256" }
            ],
            name: "balanceOf",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function"
          }
        ];

        const balance = await publicClient.readContract({
          address: hatsContract,
          abi: HATS_ABI,
          functionName: "balanceOf",
          args: [userAddress as `0x${string}`, pod.management_hat_id as `0x${string}`],
        });

        const hasManagementHat = Number(balance) > 0;
        console.log(`🎩 Management hat check for ${pod.name}:`, {
          hatId: pod.management_hat_id,
          balance: balance.toString(),
          hasHat: hasManagementHat
        });

        return hasManagementHat;
      }

      console.log(`❌ No management hat configured for ${pod.name}`);
      return false;

    } catch (error) {
      console.error(`Error checking pod permissions for ${pod.name}:`, error);
      return false;
    }
  };

  const handleValueChange = (value: string) => {
    const destination = fundDestinations.find(d => d.value === value);
    if (destination) {
      setSelectedDestination(destination);
      onValueChange(destination);
    }
  };

  const getDestinationIcon = (type: string) => {
    switch (type) {
      case 'pod_treasury':
        return <Building2 className="h-4 w-4" />;
      case 'wallet':
        return <Wallet className="h-4 w-4" />;
      case 'burn':
        return <Flame className="h-4 w-4" />;
      default:
        return <Wallet className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="space-y-2">
            <Label>Fund Destination</Label>
            <div className="animate-pulse bg-gray-200 h-10 rounded-md"></div>
            <p className="text-sm text-muted-foreground">Loading available destinations...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (fundDestinations.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="space-y-2">
            <Label>Fund Destination</Label>
            <p className="text-sm text-muted-foreground">
              No fund destinations available. Please connect your wallet and ensure you have pod permissions.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fund-destination">Fund Destination *</Label>
            <Select value={selectedDestination?.value} onValueChange={handleValueChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select where purchase funds should be sent" />
              </SelectTrigger>
              <SelectContent>
                {fundDestinations.map((destination) => (
                  <SelectItem key={destination.value} value={destination.value}>
                    <div className="flex items-center gap-2">
                      {getDestinationIcon(destination.type)}
                      <span>{destination.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedDestination && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-start gap-2">
                {getDestinationIcon(selectedDestination.type)}
                <div>
                  <p className="text-sm font-medium">{selectedDestination.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedDestination.description}
                  </p>
                  {selectedDestination.type === 'pod_treasury' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Treasury: {selectedDestination.treasuryAddress?.slice(0, 6)}...{selectedDestination.treasuryAddress?.slice(-4)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            You can only route funds to pods where you have leadership permissions. 
            Personal wallet and burn options are always available.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
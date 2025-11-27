'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Power,
  PowerOff,
  UserX,
  AlertTriangle,
  RefreshCw,
  Users,
  Crown,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  HatDeactivationService,
  type HatStatus,
  type HatWearer,
} from '../services/hatDeactivationService';

interface HatDeactivationControlsProps {
  hatId: string;
  hatType: 'management' | 'membership';
  podName: string;
  onHatStatusChanged?: () => void;
}

export const HatDeactivationControls: React.FC<
  HatDeactivationControlsProps
> = ({ hatId, hatType, podName, onHatStatusChanged }) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { toast } = useToast();

  const [hatStatus, setHatStatus] = useState<HatStatus | null>(null);
  const [hatWearers, setHatWearers] = useState<HatWearer[]>([]);
  const [hasAdminPermission, setHasAdminPermission] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingWearers, setLoadingWearers] = useState(false);
  const [operationInProgress, setOperationInProgress] = useState<string | null>(
    null,
  );

  // Load HAT status and permissions on mount
  useEffect(() => {
    if (publicClient && address && hatId) {
      loadHatData();
    }
  }, [publicClient, address, hatId]);

  const loadHatData = async () => {
    if (!publicClient || !address) return;

    try {
      setLoading(true);

      // Load HAT status and admin permissions in parallel
      const [status, adminPermission] = await Promise.all([
        HatDeactivationService.getHatStatus(publicClient, hatId),
        HatDeactivationService.checkAdminPermissions(
          publicClient,
          address,
          hatId,
        ),
      ]);

      setHatStatus(status);
      setHasAdminPermission(adminPermission);
    } catch (error) {
      console.error('Failed to load HAT data:', error);
      toast({
        title: 'Loading Error',
        description: 'Failed to load HAT status information',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadHatWearers = async () => {
    if (!publicClient || !hatStatus) return;

    try {
      setLoadingWearers(true);

      // In a real implementation, you'd want to query all HAT holders
      // For now, we'll check some known addresses (pod leads, creator, current user)
      const knownAddresses = [
        ...(address ? [address] : []),
        // Add more addresses from pod data if available
      ];

      const wearers = await HatDeactivationService.getHatWearers(
        publicClient,
        hatId,
        knownAddresses,
      );

      setHatWearers(wearers);
    } catch (error) {
      console.error('Failed to load HAT wearers:', error);
      toast({
        title: 'Loading Error',
        description: 'Failed to load HAT wearers',
        variant: 'destructive',
      });
    } finally {
      setLoadingWearers(false);
    }
  };

  const handleDeactivateHat = async () => {
    if (!publicClient || !walletClient || !address) return;

    try {
      setOperationInProgress('deactivating');

      const result = await HatDeactivationService.deactivateHat(
        publicClient,
        walletClient,
        address,
        hatId,
      );

      if (result.success) {
        toast({
          title: 'HAT Deactivated',
          description: `Successfully deactivated ${hatType} HAT for ${podName}`,
        });

        // Refresh HAT data
        await loadHatData();
        onHatStatusChanged?.();
      } else {
        toast({
          title: 'Deactivation Failed',
          description: result.error || 'Failed to deactivate HAT',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('HAT deactivation error:', error);
      toast({
        title: 'Deactivation Error',
        description:
          error instanceof Error ? error.message : 'Unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleReactivateHat = async () => {
    if (!publicClient || !walletClient || !address) return;

    try {
      setOperationInProgress('reactivating');

      const result = await HatDeactivationService.reactivateHat(
        publicClient,
        walletClient,
        address,
        hatId,
      );

      if (result.success) {
        toast({
          title: 'HAT Reactivated',
          description: `Successfully reactivated ${hatType} HAT for ${podName}`,
        });

        // Refresh HAT data
        await loadHatData();
        onHatStatusChanged?.();
      } else {
        toast({
          title: 'Reactivation Failed',
          description: result.error || 'Failed to reactivate HAT',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('HAT reactivation error:', error);
      toast({
        title: 'Reactivation Error',
        description:
          error instanceof Error ? error.message : 'Unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleRemoveWearer = async (wearerAddress: string) => {
    if (!publicClient || !walletClient || !address) return;

    try {
      setOperationInProgress(`removing-${wearerAddress}`);

      const result = await HatDeactivationService.removeHatFromWearer(
        publicClient,
        walletClient,
        address,
        hatId,
        wearerAddress,
      );

      if (result.success) {
        toast({
          title: 'HAT Removed',
          description: `Successfully removed HAT from ${wearerAddress.slice(0, 6)}...${wearerAddress.slice(-4)}`,
        });

        // Refresh wearer data
        await loadHatWearers();
        onHatStatusChanged?.();
      } else {
        toast({
          title: 'Removal Failed',
          description: result.error || 'Failed to remove HAT from wearer',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('HAT removal error:', error);
      toast({
        title: 'Removal Error',
        description:
          error instanceof Error ? error.message : 'Unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleRenounceHat = async () => {
    if (!walletClient) return;

    try {
      setOperationInProgress('renouncing');

      const result = await HatDeactivationService.renounceHat(
        walletClient,
        hatId,
      );

      if (result.success) {
        toast({
          title: 'HAT Renounced',
          description: `Successfully renounced your ${hatType} HAT for ${podName}`,
        });

        // Refresh data
        await loadHatData();
        await loadHatWearers();
        onHatStatusChanged?.();
      } else {
        toast({
          title: 'Renounce Failed',
          description: result.error || 'Failed to renounce HAT',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('HAT renounce error:', error);
      toast({
        title: 'Renounce Error',
        description:
          error instanceof Error ? error.message : 'Unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex justify-center items-center">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hatStatus) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-gray-500">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Failed to load HAT status</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getHatTypeIcon = () => {
    return hatType === 'management' ? (
      <Crown className="h-5 w-5" style={{ color: '#6A5F7A' }} />
    ) : (
      <Users className="h-5 w-5" style={{ color: '#2F5D50' }} />
    );
  };

  const canSelfRenounce = hatWearers.some(
    (wearer) => wearer.address.toLowerCase() === address?.toLowerCase(),
  );

  return (
    <div className="space-y-6">
      {/* HAT Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getHatTypeIcon()}
            {hatType === 'management' ? 'Management' : 'Membership'} HAT
            Controls
          </CardTitle>
          <p className="text-sm text-gray-600">
            Manage the {hatType} HAT activation status and wearer permissions
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Status */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: hatStatus.isActive ? '#3F7A5A' : '#8B3A3A',
                }}
              ></div>
              <div>
                <p className="font-medium">Current Status</p>
                <Badge variant={hatStatus.isActive ? 'default' : 'secondary'}>
                  {hatStatus.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Supply</p>
              <p className="font-medium">
                {hatStatus.supply}/
                {hatStatus.maxSupply === 0 ? '∞' : hatStatus.maxSupply}
              </p>
            </div>
          </div>

          {/* Admin Controls */}
          {hasAdminPermission && (
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Admin Controls
              </h4>

              <div className="flex gap-2">
                {hatStatus.isActive ? (
                  <Button
                    variant="outline"
                    onClick={handleDeactivateHat}
                    disabled={operationInProgress === 'deactivating'}
                    className="flex-1"
                    style={{ color: '#8B3A3A', borderColor: '#D9B3B3' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#F5E6E6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <PowerOff className="h-4 w-4 mr-2" />
                    {operationInProgress === 'deactivating'
                      ? 'Deactivating...'
                      : 'Deactivate HAT'}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleReactivateHat}
                    disabled={operationInProgress === 'reactivating'}
                    className="flex-1"
                    style={{ color: '#3F7A5A', borderColor: '#B8D9CA' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#D1E6DC';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <Power className="h-4 w-4 mr-2" />
                    {operationInProgress === 'reactivating'
                      ? 'Reactivating...'
                      : 'Reactivate HAT'}
                  </Button>
                )}

                <Button
                  variant="outline"
                  onClick={loadHatWearers}
                  disabled={loadingWearers}
                  size="sm"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loadingWearers ? 'animate-spin' : ''}`}
                  />
                </Button>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800">
                      Deactivation Impact
                    </p>
                    <p className="text-amber-700 mt-1">
                      Deactivating this HAT will prevent it from being worn by
                      anyone, effectively disabling all associated permissions
                      and access rights.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Self-Renounce Option */}
          {canSelfRenounce && (
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <UserX className="h-4 w-4" />
                Personal Actions
              </h4>

              <Button
                variant="outline"
                onClick={handleRenounceHat}
                disabled={operationInProgress === 'renouncing'}
                style={{ color: '#C6933F', borderColor: '#E8D7B8' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#FAF4EC';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <UserX className="h-4 w-4 mr-2" />
                {operationInProgress === 'renouncing'
                  ? 'Renouncing...'
                  : 'Renounce My HAT'}
              </Button>

              <p className="text-xs text-gray-500">
                You can voluntarily give up your HAT at any time
              </p>
            </div>
          )}

          {/* Permission Warning */}
          {!hasAdminPermission && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-gray-400 mt-0.5" />
                <div className="text-sm text-gray-600">
                  <p className="font-medium">Limited Access</p>
                  <p className="mt-1">
                    You need admin permissions for this HAT to perform
                    management operations.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* HAT Wearers Management */}
      {hasAdminPermission && hatWearers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Current Wearers ({hatWearers.length})
            </CardTitle>
            <p className="text-sm text-gray-600">
              Manage individual HAT holders and their access
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {hatWearers.map((wearer) => (
                <div
                  key={wearer.address}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium font-mono text-sm">
                      {wearer.address.slice(0, 6)}...{wearer.address.slice(-4)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Balance: {wearer.balance}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {wearer.address.toLowerCase() === address?.toLowerCase() ? (
                      <Badge
                        variant="outline"
                        style={{
                          backgroundColor: '#E8F1EE',
                          color: '#1F453A',
                          borderColor: '#B8D9CA',
                        }}
                      >
                        You
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRemoveWearer(wearer.address)}
                        disabled={
                          operationInProgress === `removing-${wearer.address}`
                        }
                        style={{ color: '#8B3A3A', borderColor: '#D9B3B3' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#F5E6E6';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <UserX className="h-3 w-3 mr-1" />
                        {operationInProgress === `removing-${wearer.address}`
                          ? 'Removing...'
                          : 'Remove'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default HatDeactivationControls;

'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  Settings,
  ExternalLink,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  HatsModuleSyncService,
  type SyncStatus,
} from '../services/HatsModuleSyncService';
import { HatsModuleDeploymentService } from '../services/HatsModuleDeploymentService';

interface HatsModuleManagerProps {
  podId: string;
  podName: string;
  onSyncComplete?: () => void;
}

export const HatsModuleManager: React.FC<HatsModuleManagerProps> = ({
  podId,
  podName,
  onSyncComplete,
}) => {
  const { address } = useAccount();
  const { toast } = useToast();

  const [syncStatus, setSyncStatus] = useState<SyncStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set(),
  );
  const [syncHealth, setSyncHealth] = useState<any>(null);

  useEffect(() => {
    loadSyncStatus();
  }, [podId]);

  const loadSyncStatus = async () => {
    try {
      setLoading(true);
      const [statuses, health] = await Promise.all([
        HatsModuleSyncService.getPodSyncStatus(podId),
        HatsModuleSyncService.getPodSyncHealth(podId),
      ]);

      setSyncStatus(statuses);
      setSyncHealth(health);
    } catch (error) {
      console.error('Failed to load sync status:', error);
      toast({
        title: 'Error Loading Status',
        description: 'Failed to load HATS module sync status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPod = async () => {
    if (!address) {
      toast({
        title: 'Wallet Required',
        description: 'Please connect your wallet to sync modules',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSyncing(true);
      const result = await HatsModuleSyncService.syncPodToModules(podId, {
        deployIfNotExists: true,
        forceUpdate: false,
        validateOnchain: true,
      });

      toast({
        title: 'Sync Completed',
        description: `Successfully synced ${result.summary.success} modules. ${result.summary.failed} failed.`,
        variant: result.summary.failed > 0 ? 'destructive' : 'default',
      });

      await loadSyncStatus();
      onSyncComplete?.();
    } catch (error) {
      console.error('Sync failed:', error);
      toast({
        title: 'Sync Failed',
        description:
          error instanceof Error ? error.message : 'Failed to sync modules',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleForceSyncPod = async () => {
    if (!address) return;

    try {
      setSyncing(true);
      const result = await HatsModuleSyncService.syncPodToModules(podId, {
        deployIfNotExists: true,
        forceUpdate: true,
        validateOnchain: true,
      });

      toast({
        title: 'Force Sync Completed',
        description: `Force synced ${result.summary.success} modules`,
      });

      await loadSyncStatus();
      onSyncComplete?.();
    } catch (error) {
      console.error('Force sync failed:', error);
      toast({
        title: 'Force Sync Failed',
        description:
          error instanceof Error ? error.message : 'Failed to force sync',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleCheckEligibility = async (
    moduleAddress: string,
    hatId: string,
  ) => {
    if (!address) return;

    try {
      const result = await HatsModuleDeploymentService.checkOnchainEligibility(
        moduleAddress,
        hatId,
        address,
      );

      toast({
        title: 'Eligibility Check',
        description: `You are ${result.eligible ? 'eligible' : 'not eligible'} for this role`,
        variant: result.eligible ? 'default' : 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Eligibility Check Failed',
        description: 'Failed to check onchain eligibility',
        variant: 'destructive',
      });
    }
  };

  const toggleModuleExpanded = (hatId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(hatId)) {
        next.delete(hatId);
      } else {
        next.add(hatId);
      }
      return next;
    });
  };

  const getStatusColor = (status: SyncStatus['status']) => {
    switch (status) {
      case 'synced':
        return 'border bg-[#D1E6DC]';
      case 'needs_update':
        return 'border bg-[#FAF4EC]';
      case 'error':
        return 'border bg-[#F5E6E6]';
      case 'pending':
        return 'border bg-[#E8F1EE]';
      case 'never_synced':
        return 'text-gray-600 border-gray-300 bg-gray-50';
      default:
        return 'text-gray-600 border-gray-300 bg-gray-50';
    }
  };

  const getStatusTextColor = (status: SyncStatus['status']) => {
    switch (status) {
      case 'synced':
        return '#3F7A5A';
      case 'needs_update':
        return '#C6933F';
      case 'error':
        return '#8B3A3A';
      case 'pending':
        return '#2F5D50';
      default:
        return undefined;
    }
  };

  const getStatusIcon = (status: SyncStatus['status']) => {
    switch (status) {
      case 'synced':
        return <CheckCircle className="h-4 w-4" style={{ color: '#3F7A5A' }} />;
      case 'needs_update':
        return <RefreshCw className="h-4 w-4" style={{ color: '#C6933F' }} />;
      case 'error':
        return <XCircle className="h-4 w-4" style={{ color: '#8B3A3A' }} />;
      case 'pending':
        return <Clock className="h-4 w-4" style={{ color: '#2F5D50' }} />;
      case 'never_synced':
        return <AlertTriangle className="h-4 w-4 text-gray-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading HATS module status...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with sync health */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6" style={{ color: '#2F5D50' }} />
              <div>
                <CardTitle>HATS Module Management</CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  Manage onchain eligibility modules for {podName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={loadSyncStatus}
                size="sm"
                variant="outline"
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>

              <Button onClick={handleSyncPod} size="sm" disabled={syncing}>
                {syncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Sync Modules
              </Button>

              <Button
                onClick={handleForceSyncPod}
                size="sm"
                variant="outline"
                disabled={syncing}
                style={{ color: '#C6933F', borderColor: '#E8D7B8' }}
                onMouseEnter={(e) =>
                  !syncing &&
                  (e.currentTarget.style.backgroundColor = '#FAF4EC')
                }
                onMouseLeave={(e) =>
                  !syncing && (e.currentTarget.style.backgroundColor = '')
                }
              >
                Force Sync
              </Button>
            </div>
          </div>
        </CardHeader>

        {syncHealth && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: '#2F5D50' }}
                >
                  {syncHealth.totalRoles}
                </div>
                <div className="text-xs text-gray-500">Total Roles</div>
              </div>
              <div className="text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: '#3F7A5A' }}
                >
                  {syncHealth.synced}
                </div>
                <div className="text-xs text-gray-500">Synced</div>
              </div>
              <div className="text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: '#C6933F' }}
                >
                  {syncHealth.needsUpdate}
                </div>
                <div className="text-xs text-gray-500">Need Update</div>
              </div>
              <div className="text-center">
                <div
                  className="text-2xl font-bold"
                  style={{ color: '#8B3A3A' }}
                >
                  {syncHealth.errors}
                </div>
                <div className="text-xs text-gray-500">Errors</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {syncHealth.neverSynced}
                </div>
                <div className="text-xs text-gray-500">Never Synced</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-sm mb-2">
                <span>Health Score</span>
                <span className="font-medium">
                  {syncHealth.healthPercentage}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${syncHealth.healthPercentage}%`,
                    backgroundColor:
                      syncHealth.healthPercentage >= 80
                        ? '#3F7A5A'
                        : syncHealth.healthPercentage >= 60
                          ? '#C6933F'
                          : '#8B3A3A',
                  }}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Module status list */}
      <div className="space-y-3">
        {syncStatus.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Roles Found
              </h3>
              <p className="text-gray-600">
                This pod doesn't have any roles with eligibility criteria yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          syncStatus.map((status) => (
            <Card key={status.hatId} className="transition-all duration-200">
              <CardContent className="p-0">
                {/* Main status row */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleModuleExpanded(status.hatId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedModules.has(status.hatId) ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}

                      {getStatusIcon(status.status)}

                      <div>
                        <div className="font-medium">
                          HAT ID: {status.hatId}
                        </div>
                        {status.lastSynced && (
                          <div className="text-xs text-gray-500">
                            Last synced: {status.lastSynced.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`${getStatusColor(status.status)} border`}
                        style={{ color: getStatusTextColor(status.status) }}
                      >
                        {status.status.replace('_', ' ')}
                      </Badge>

                      {status.moduleAddress && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(
                              `https://basescan.org/address/${status.moduleAddress}`,
                              '_blank',
                            );
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {expandedModules.has(status.hatId) && (
                  <div className="border-t bg-gray-50 p-4 space-y-4">
                    {status.error && (
                      <div
                        className="border p-3 rounded-lg"
                        style={{
                          backgroundColor: '#F5E6E6',
                          borderColor: '#D9B3B3',
                        }}
                      >
                        <div
                          className="flex items-center gap-2 mb-1"
                          style={{ color: '#8B3A3A' }}
                        >
                          <XCircle className="h-4 w-4" />
                          <span className="font-medium">Error</span>
                        </div>
                        <p className="text-sm" style={{ color: '#8B3A3A' }}>
                          {status.error}
                        </p>
                      </div>
                    )}

                    {status.moduleAddress && (
                      <div className="space-y-3">
                        <div>
                          <h4 className="font-medium mb-2">
                            Module Information
                          </h4>
                          <div className="bg-white border rounded p-3 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">
                                Contract Address:
                              </span>
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                {status.moduleAddress.slice(0, 10)}...
                                {status.moduleAddress.slice(-8)}
                              </code>
                            </div>
                            {status.criteriaHash && (
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">
                                  Criteria Hash:
                                </span>
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {status.criteriaHash.slice(0, 10)}...
                                </code>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleCheckEligibility(
                                status.moduleAddress!,
                                status.hatId,
                              )
                            }
                          >
                            <Settings className="h-3 w-3 mr-1" />
                            Check My Eligibility
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              window.open(
                                `https://basescan.org/address/${status.moduleAddress}`,
                                '_blank',
                              )
                            }
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View on Basescan
                          </Button>
                        </div>
                      </div>
                    )}

                    {!status.moduleAddress &&
                      status.status === 'never_synced' && (
                        <div
                          className="border p-3 rounded-lg"
                          style={{
                            backgroundColor: '#E8F1EE',
                            borderColor: '#B8D9CA',
                          }}
                        >
                          <div
                            className="flex items-center gap-2 mb-1"
                            style={{ color: '#2F5D50' }}
                          >
                            <AlertTriangle className="h-4 w-4" />
                            <span className="font-medium">
                              Module Not Deployed
                            </span>
                          </div>
                          <p className="text-sm" style={{ color: '#2F5D50' }}>
                            This role doesn't have a HATS module deployed yet.
                            Click "Sync Modules" to deploy.
                          </p>
                        </div>
                      )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Help section */}
      <Card style={{ borderColor: '#B8D9CA', backgroundColor: '#E8F1EE' }}>
        <CardHeader>
          <CardTitle className="text-sm" style={{ color: '#1F453A' }}>
            About HATS Modules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2" style={{ color: '#2F5D50' }}>
            <p>
              HATS modules enable onchain verification of eligibility criteria.
              When synced, your pod's eligibility rules are enforced at the
              smart contract level.
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>
                <strong>Synced:</strong> Module is deployed and up-to-date
              </li>
              <li>
                <strong>Needs Update:</strong> Criteria have changed, sync
                required
              </li>
              <li>
                <strong>Error:</strong> Sync failed, check error details
              </li>
              <li>
                <strong>Never Synced:</strong> Module not deployed yet
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

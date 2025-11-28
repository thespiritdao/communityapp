'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PodPageLayout } from '@/features/pods/components/PodPageLayout';
import { HatImageViewer } from '@/features/pods/components/HatImageViewer';
import { PodContractCreator } from '@/features/pods/components/PodContractCreator';
import { PodRegistrationManager } from '@/features/pods/components/PodRegistrationManager';
import ConsolidatedTreasuryDeployer from '@/features/pods/components/ConsolidatedTreasuryDeployerV2';
import PodTreasurySync from '@/features/pods/components/PodTreasurySync';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { useHatsModules } from '@/hooks/useHatsModules';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import {
  Code,
  Database,
  Image,
  Settings,
  Zap,
  TestTube,
  Shield,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Crown,
} from 'lucide-react';

export default function PodDevToolsPage() {
  const [activeModule, setActiveModule] = useState<string>('overview');

  // Hooks for development tools
  const {
    balances,
    refreshBalances,
    isLoading: tokenLoading,
  } = useTokenBalances();
  const {
    permissions,
    userRoles,
    userHats,
    isLoading: permissionsLoading,
    canAccessChat,
    canParticipateInGovernance,
    canCreateEvents,
    canViewTreasury,
    canManageMembers,
    isPodLeader,
    refreshPermissions,
  } = useHatPermissions();

  const {
    isInitialized: modulesInitialized,
    isInitializing: modulesInitializing,
    availableModules,
    error: modulesError,
  } = useHatsModules();

  const handlePodCreated = (podId: string) => {
    console.log('Pod created in contract:', podId);
  };

  const StatusIndicator = ({
    condition,
    label,
  }: { condition: boolean; label: string }) => (
    <div className="flex items-center gap-2">
      {condition ? (
        <CheckCircle className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500" />
      )}
      <span className={condition ? 'text-green-700' : 'text-red-700'}>
        {label}
      </span>
    </div>
  );

  return (
    <PodPageLayout
      title="Pod Development Tools"
      description="Comprehensive development and debugging tools for HATS Protocol integration"
      maxWidth="wide"
    >
      <div className="mb-6">
        <Badge
          variant="outline"
          className="bg-yellow-50 text-yellow-800 border-yellow-200"
        >
          <TestTube className="h-3 w-3 mr-1" />
          Development Environment Only
        </Badge>
      </div>

      <Tabs
        value={activeModule}
        onValueChange={setActiveModule}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-7 mb-6 h-auto p-2 gap-2">
          <TabsTrigger
            value="overview"
            className="flex items-center gap-2 py-3"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger
            value="permissions"
            className="flex items-center gap-2 py-3"
          >
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Permissions</span>
          </TabsTrigger>
          <TabsTrigger
            value="contract"
            className="flex items-center gap-2 py-3"
          >
            <Code className="h-4 w-4" />
            <span className="hidden sm:inline">Contracts</span>
          </TabsTrigger>
          <TabsTrigger
            value="treasury"
            className="flex items-center gap-2 py-3"
          >
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Treasury</span>
          </TabsTrigger>
          <TabsTrigger
            value="registration"
            className="flex items-center gap-2 py-3"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Registration</span>
          </TabsTrigger>
          <TabsTrigger value="images" className="flex items-center gap-2 py-3">
            <Image className="h-4 w-4" />
            <span className="hidden sm:inline">HAT Images</span>
          </TabsTrigger>
          <TabsTrigger value="debug" className="flex items-center gap-2 py-3">
            <TestTube className="h-4 w-4" />
            <span className="hidden sm:inline">Debug</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  HAT Permissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <StatusIndicator
                    condition={!permissionsLoading}
                    label="Service Ready"
                  />
                  <StatusIndicator
                    condition={canAccessChat}
                    label="Chat Access"
                  />
                  <StatusIndicator
                    condition={canParticipateInGovernance}
                    label="Governance"
                  />
                  <StatusIndicator condition={isPodLeader} label="Leadership" />
                </div>
                <div className="mt-3">
                  <Badge variant="outline">{userRoles.length} Roles</Badge>
                  <Badge variant="outline" className="ml-2">
                    {userHats.length} HATs
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  HATS Modules
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <StatusIndicator
                    condition={modulesInitialized && !modulesError}
                    label={
                      modulesInitializing ? 'Initializing...' : 'Service Ready'
                    }
                  />
                  <StatusIndicator
                    condition={availableModules.length > 0}
                    label="Modules Available"
                  />
                </div>
                <div className="mt-3">
                  <Badge variant="outline">
                    {availableModules.length} Modules
                  </Badge>
                </div>
                {modulesError && (
                  <div className="mt-2 text-xs text-red-600">
                    {modulesError}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Token Balances
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <StatusIndicator
                    condition={balances?.hasExecutivePod || false}
                    label="Executive Pod"
                  />
                  <StatusIndicator
                    condition={balances?.hasDevPod || false}
                    label="Dev Pod"
                  />
                  <StatusIndicator
                    condition={balances?.hasBountyHat || false}
                    label="Bounty Hat"
                  />
                </div>
                <div className="mt-3 text-xs text-gray-600">
                  System: {balances?.systemBalance || '0'} • Self:{' '}
                  {balances?.selfBalance || '0'}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Permissions Tab */}
        <TabsContent value="permissions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6" />
                HAT Permissions Analysis
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await Promise.all([
                      refreshBalances(),
                      refreshPermissions(),
                    ]);
                  }}
                  disabled={tokenLoading || permissionsLoading}
                >
                  {permissionsLoading ? (
                    <Clock className="h-4 w-4 animate-spin" />
                  ) : (
                    'Refresh'
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tokenLoading || permissionsLoading ? (
                <div className="text-center py-8">
                  <Clock className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p>Loading permissions...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* User Roles */}
                  <div>
                    <h3 className="font-semibold mb-3">
                      Your Roles ({userRoles.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {userRoles.length > 0 ? (
                        userRoles.map((role, index) => (
                          <div
                            key={index}
                            className="p-3 border rounded-lg bg-[#E8F1EE]"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {role.isLeaderRole ? (
                                <Crown className="h-4 w-4 text-yellow-500" />
                              ) : (
                                <Users className="h-4 w-4 text-blue-500" />
                              )}
                              <span className="font-medium">{role.name}</span>
                              {role.isLeaderRole && (
                                <Badge variant="outline" className="text-xs">
                                  Leader
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 font-mono">
                              HAT: {role.hatId.slice(0, 10)}...
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-2 text-center py-4 text-gray-500">
                          No HAT roles found
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Permissions Matrix */}
                  <div>
                    <h3 className="font-semibold mb-3">Permission Matrix</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <StatusIndicator
                        condition={canAccessChat}
                        label="Chat Access"
                      />
                      <StatusIndicator
                        condition={canParticipateInGovernance}
                        label="Governance Participation"
                      />
                      <StatusIndicator
                        condition={canCreateEvents}
                        label="Event Creation"
                      />
                      <StatusIndicator
                        condition={canViewTreasury}
                        label="Treasury Viewing"
                      />
                      <StatusIndicator
                        condition={canManageMembers}
                        label="Member Management"
                      />
                      <StatusIndicator
                        condition={isPodLeader}
                        label="Pod Leadership"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contract Tab */}
        <TabsContent value="contract" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-6 w-6" />
                Smart Contract Integration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-6">
                Create pod entries in the smart contract for treasury
                functionality.
              </p>
              <PodContractCreator onPodCreated={handlePodCreated} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Treasury Tab */}
        <TabsContent value="treasury" className="space-y-6">
          {/* Treasury Sync Tool */}
          <PodTreasurySync />

          {/* Treasury Deployment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-6 w-6" />
                Treasury Deployment & Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-6">
                Deploy and manage pod treasuries with practical, working
                solutions that leverage your existing HATS integration.
              </p>
              <ConsolidatedTreasuryDeployer />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Registration Tab */}
        <TabsContent value="registration" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-6 w-6" />
                Pod Registration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-6">
                Register existing HATS-based pods for full treasury
                functionality.
              </p>
              <PodRegistrationManager />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Images Tab */}
        <TabsContent value="images" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-6 w-6" />
                HAT Image URIs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-6">
                Fetch real image URIs from deployed HATS for pod proposal
                creation.
              </p>
              <HatImageViewer />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PodPageLayout>
  );
}
